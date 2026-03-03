param(
	[string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"

$venvPath = Join-Path $PSScriptRoot ".venv"
$requirementsPath = Join-Path $PSScriptRoot "requirements.txt"

Write-Host "Creating sidecar virtual environment at $venvPath"
& $PythonExe -m venv $venvPath

$venvPython = Join-Path $venvPath "Scripts\python.exe"
Write-Host "Installing latest stable sidecar dependencies..."
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install --upgrade -r $requirementsPath

Write-Host ""
Write-Host "Sidecar environment ready."
Write-Host "Dictate will auto-detect this interpreter:"
Write-Host "  $venvPython"
Write-Host "Optional override: set PYTHON_BIN to any Python executable."
