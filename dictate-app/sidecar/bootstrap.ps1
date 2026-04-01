param(
	[string]$PythonExe = "python",
	[ValidateSet("cpu", "cuda", "both")]
	[string]$Runtime = "cpu"
)

$ErrorActionPreference = "Stop"

$requirementsPath = Join-Path $PSScriptRoot "requirements.txt"
$cpuTorchIndexUrl = "https://download.pytorch.org/whl/cpu"
$cudaTorchIndexUrl = "https://download.pytorch.org/whl/cu128"

function Write-DictateProgress {
	param(
		[double]$Percent,
		[string]$Message,
		[string]$Detail = ""
	)

	$normalized = [Math]::Max(0, [Math]::Min(100, $Percent)) / 100
	$payload = @{
		progress = [Math]::Round($normalized, 4)
		message = $Message
		detail = $Detail
	} | ConvertTo-Json -Compress
	Write-Output ("[dictate-progress]" + $payload)
}

function Initialize-SidecarEnv {
	param(
		[string]$VenvName,
		[string]$TorchIndexUrl,
		[bool]$ExpectCuda
	)

	$runtimeLabel = if ($ExpectCuda) { "Dictate GPU runtime" } else { "Dictate CPU runtime" }
	$venvPath = Join-Path $PSScriptRoot $VenvName
	$venvPython = Join-Path $venvPath "Scripts\python.exe"
	$needsTorchInstall = $true

	Write-DictateProgress -Percent 5 -Message "Preparing $runtimeLabel" -Detail "Checking local Python environment"

	if (Test-Path $venvPython) {
		$runtimeJson = & $venvPython -c "import importlib.util, json;
try:
 import torch
 print(json.dumps({'ok': True, 'cuda': bool(torch.cuda.is_available()), 'hf_xet': bool(importlib.util.find_spec('hf_xet'))}))
except Exception:
 print(json.dumps({'ok': False, 'cuda': False, 'hf_xet': False}))"
		if ($LASTEXITCODE -eq 0) {
			$runtime = $runtimeJson | ConvertFrom-Json
			$runtimeMatches = $runtime.ok -and $runtime.cuda -eq $ExpectCuda
			$hasXet = [bool]$runtime.hf_xet
			if ($runtimeMatches -and $hasXet) {
				Write-DictateProgress -Percent 100 -Message "$runtimeLabel is ready" -Detail "Existing environment already matches this machine"
				Write-Host "$VenvName already matches expected runtime and has hf_xet; skipping reinstall."
				return $venvPython
			}
			$needsTorchInstall = -not $runtimeMatches
		}
	}

	if (-not (Test-Path $venvPython)) {
		Write-DictateProgress -Percent 14 -Message "Creating $runtimeLabel" -Detail "Creating an isolated Python environment for Dictate"
		Write-Host "Creating sidecar virtual environment at $venvPath"
		& $PythonExe -m venv $venvPath
		$needsTorchInstall = $true
	} else {
		Write-DictateProgress -Percent 18 -Message "Refreshing $runtimeLabel" -Detail "Inspecting existing Dictate packages"
		Write-Host "Refreshing sidecar dependencies at $venvPath"
	}

	$venvPython = Join-Path $venvPath "Scripts\python.exe"
	Write-Host "Installing sidecar dependencies into $VenvName..."
	Write-DictateProgress -Percent 28 -Message "Upgrading packaging tools" -Detail "Updating pip inside Dictate's local environment"
	& $venvPython -m pip install --progress-bar off --upgrade pip
	Write-DictateProgress -Percent 48 -Message "Installing Dictate dependencies" -Detail "Installing Dictate's ASR runtime packages"
	& $venvPython -m pip install --progress-bar off --upgrade -r $requirementsPath
	if ($needsTorchInstall) {
		Write-DictateProgress -Percent 72 -Message "Installing GPU acceleration packages" -Detail "Installing the CUDA-enabled PyTorch runtime"
		& $venvPython -m pip install --progress-bar off --upgrade --index-url $TorchIndexUrl torch
	} else {
		Write-DictateProgress -Percent 78 -Message "Using existing GPU acceleration packages" -Detail "CUDA-enabled PyTorch is already available"
		Write-Host "$VenvName torch runtime already matches expected profile; skipping torch reinstall."
	}

	Write-DictateProgress -Percent 90 -Message "Validating $runtimeLabel" -Detail "Checking that Dictate can access your NVIDIA GPU"
	& $venvPython -c "import torch; print(f'torch={torch.__version__} cuda_built={torch.version.cuda} cuda_available={torch.cuda.is_available()}')"
	Write-DictateProgress -Percent 100 -Message "$runtimeLabel is ready" -Detail "Local NVIDIA models can now use your GPU"
	return $venvPython
}

$cpuPython = $null
$cudaPython = $null

switch ($Runtime) {
	"cpu" {
		$cpuPython = Initialize-SidecarEnv -VenvName ".venv-cpu" -TorchIndexUrl $cpuTorchIndexUrl -ExpectCuda $false
	}
	"cuda" {
		$cudaPython = Initialize-SidecarEnv -VenvName ".venv-cuda" -TorchIndexUrl $cudaTorchIndexUrl -ExpectCuda $true
	}
	"both" {
		$cpuPython = Initialize-SidecarEnv -VenvName ".venv-cpu" -TorchIndexUrl $cpuTorchIndexUrl -ExpectCuda $false
		$cudaPython = Initialize-SidecarEnv -VenvName ".venv-cuda" -TorchIndexUrl $cudaTorchIndexUrl -ExpectCuda $true
	}
}

Write-Host ""
Write-Host "Sidecar environment setup complete."
if ($cpuPython) {
	Write-Host "CPU runtime interpreter:"
	Write-Host "  $cpuPython"
}
if ($cudaPython) {
	Write-Host "CUDA runtime interpreter:"
	Write-Host "  $cudaPython"
}
Write-Host ""
Write-Host "Dictate runtime selection:"
Write-Host "  - App Settings -> ASR Acceleration -> Auto / CPU / CUDA"
Write-Host "Optional overrides:"
Write-Host "  - PYTHON_BIN      : force a specific interpreter for all modes"
Write-Host "  - PYTHON_BIN_CPU  : custom CPU interpreter"
Write-Host "  - PYTHON_BIN_CUDA : custom CUDA interpreter"

