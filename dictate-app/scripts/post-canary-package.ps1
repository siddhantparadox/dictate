$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = Split-Path -Parent $scriptDir
$iconPath = Join-Path (Split-Path -Parent $appRoot) "icon.ico"
$rceditPath = Join-Path $appRoot "node_modules\rcedit\bin\rcedit-x64.exe"
$buildRoot = Join-Path $appRoot "build\canary-win-x64"
$setupExe = Join-Path $buildRoot "dictate-Setup-canary.exe"
$payloadArchive = Join-Path $buildRoot "dictate-Setup-canary.tar.zst"
$payloadMetadata = Join-Path $buildRoot "dictate-Setup-canary.metadata.json"
$artifactZip = Join-Path $appRoot "artifacts\canary-win-x64-dictate-Setup-canary.zip"
$launcherCandidates = @(
	(Join-Path $buildRoot "dictate-canary\bin\launcher.exe"),
	(Join-Path $buildRoot "dictate-canary\bin\launcher")
)

if (-not (Test-Path $rceditPath)) {
	throw "rcedit binary not found at $rceditPath"
}

if (-not (Test-Path $iconPath)) {
	throw "Icon not found at $iconPath"
}

function Set-WindowsIcon {
	param(
		[string]$ExecutablePath
	)

	if (-not (Test-Path $ExecutablePath)) {
		return
	}

	& $rceditPath $ExecutablePath --set-icon $iconPath
	if ($LASTEXITCODE -ne 0) {
		throw "rcedit failed for $ExecutablePath"
	}
}

Set-WindowsIcon -ExecutablePath $setupExe
foreach ($launcherPath in $launcherCandidates) {
	if (Test-Path $launcherPath) {
		Set-WindowsIcon -ExecutablePath $launcherPath
		break
	}
}

if ((Test-Path $setupExe) -and (Test-Path $payloadArchive) -and (Test-Path $payloadMetadata)) {
	$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dictate-canary-package-" + [guid]::NewGuid().ToString("N"))
	$installerDir = Join-Path $tempRoot ".installer"

	New-Item -ItemType Directory -Force -Path $installerDir | Out-Null
	Copy-Item $setupExe (Join-Path $tempRoot "dictate-Setup-canary.exe") -Force
	Copy-Item $payloadArchive (Join-Path $installerDir "dictate-Setup-canary.tar.zst") -Force
	Copy-Item $payloadMetadata (Join-Path $installerDir "dictate-Setup-canary.metadata.json") -Force

	if (Test-Path $artifactZip) {
		Remove-Item $artifactZip -Force
	}

	Add-Type -AssemblyName System.IO.Compression.FileSystem
	$zip = [System.IO.Compression.ZipFile]::Open($artifactZip, [System.IO.Compression.ZipArchiveMode]::Create)
	try {
		$files = Get-ChildItem -Path $tempRoot -Recurse -File
		foreach ($file in $files) {
			$entryName = $file.FullName.Substring($tempRoot.Length + 1).Replace('\', '/')
			[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
				$zip,
				$file.FullName,
				$entryName,
				[System.IO.Compression.CompressionLevel]::Optimal
			) | Out-Null
		}
	}
	finally {
		$zip.Dispose()
		Remove-Item $tempRoot -Recurse -Force
	}
}
