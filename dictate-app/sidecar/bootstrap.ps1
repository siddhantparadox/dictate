param(
	[string]$PythonExe = "python",
	[ValidateSet("cpu", "cuda", "both")]
	[string]$Runtime = "cpu"
)

$ErrorActionPreference = "Stop"

$requirementsPath = Join-Path $PSScriptRoot "requirements.txt"
$cpuTorchIndexUrl = "https://download.pytorch.org/whl/cpu"
$cudaTorchIndexUrl = "https://download.pytorch.org/whl/cu128"

function Initialize-SidecarEnv {
	param(
		[string]$VenvName,
		[string]$TorchIndexUrl,
		[bool]$ExpectCuda
	)

	$venvPath = Join-Path $PSScriptRoot $VenvName
	$venvPython = Join-Path $venvPath "Scripts\python.exe"
	$needsTorchInstall = $true

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
				Write-Host "$VenvName already matches expected runtime and has hf_xet; skipping reinstall."
				return $venvPython
			}
			$needsTorchInstall = -not $runtimeMatches
		}
	}

	if (-not (Test-Path $venvPython)) {
		Write-Host "Creating sidecar virtual environment at $venvPath"
		& $PythonExe -m venv $venvPath
		$needsTorchInstall = $true
	} else {
		Write-Host "Refreshing sidecar dependencies at $venvPath"
	}

	$venvPython = Join-Path $venvPath "Scripts\python.exe"
	Write-Host "Installing sidecar dependencies into $VenvName..."
	& $venvPython -m pip install --upgrade pip
	& $venvPython -m pip install --upgrade -r $requirementsPath
	if ($needsTorchInstall) {
		& $venvPython -m pip install --upgrade --index-url $TorchIndexUrl torch
	} else {
		Write-Host "$VenvName torch runtime already matches expected profile; skipping torch reinstall."
	}

	& $venvPython -c "import torch; print(f'torch={torch.__version__} cuda_built={torch.version.cuda} cuda_available={torch.cuda.is_available()}')"
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
