$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = Split-Path -Parent $scriptDir
$repoRoot = Split-Path -Parent $appRoot
$buildRoot = Join-Path $appRoot "build\canary-win-x64"
$resourcesDir = Join-Path $buildRoot "dictate-canary\Resources"
$metadataPath = Join-Path $resourcesDir "metadata.json"
$artifactDir = Join-Path $appRoot "artifacts"
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dictate-inno-stage-" + [guid]::NewGuid().ToString("N"))
$stagingArchiveDir = Join-Path $stagingRoot "payload"
$installerScript = Join-Path $appRoot "installer\windows\Dictate.iss"
$packageJsonPath = Join-Path $appRoot "package.json"
$iconPath = Join-Path $repoRoot "icon.ico"
$rceditPath = Join-Path $appRoot "node_modules\rcedit\bin\rcedit-x64.exe"

function Update-StagedViewEntrypoints {
	param(
		[string]$sourceAppDir
	)

	$viewsDir = Join-Path $sourceAppDir "Resources\app\views\mainview"
	$indexHtmlPath = Join-Path $viewsDir "index.html"
	$pillHtmlPath = Join-Path $viewsDir "pill.html"

	if (-not (Test-Path $indexHtmlPath)) {
		return
	}

	$indexHtml = Get-Content $indexHtmlPath -Raw
	if ($indexHtml -notmatch 'data-view="main"') {
		$indexHtml = $indexHtml.Replace('<html lang="en">', '<html lang="en" data-view="main">')
	}
	if ($indexHtml -match '<title>React \+ Tailwind \+ Vite</title>') {
		$indexHtml = $indexHtml.Replace(
			'<title>React + Tailwind + Vite</title>',
			'<title>Dictate</title>'
		)
	}
	Set-Content -Path $indexHtmlPath -Value $indexHtml

	if (-not (Test-Path $pillHtmlPath)) {
		$pillHtml = $indexHtml.Replace('data-view="main"', 'data-view="pill"')
		$pillHtml = $pillHtml.Replace('<title>Dictate</title>', '<title>Dictate Pill</title>')
		$pillBootstrap = @'
    <script>
      const url = new URL(window.location.href);
      if (!url.searchParams.has("view")) {
        url.searchParams.set("view", "pill");
        history.replaceState(null, "", url.toString());
      }
    </script>
'@
		$pillHtml = [regex]::Replace(
			$pillHtml,
			'<script type="module" crossorigin src="(?<src>/assets/[^"]+\.js)"></script>',
			{
				param($match)
				return $pillBootstrap + "`r`n" + '    <script type="module" crossorigin src="' + $match.Groups["src"].Value + '"></script>'
			},
			1
		)
		Set-Content -Path $pillHtmlPath -Value $pillHtml
	}
}

function Update-StagedMainProcessBundle {
	param(
		[string]$sourceAppDir
	)

	$bundlePath = Join-Path $sourceAppDir "Resources\app\bun\index.js"
	if (-not (Test-Path $bundlePath)) {
		return
	}

	$bundle = Get-Content $bundlePath -Raw
	$oldWithViewQuery = @'
function withViewQuery(url, view) {
  if (url.startsWith("views://")) {
    return `${url}#view=${view}`;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}view=${view}`;
}
'@
	$newWithViewQuery = @'
function withViewQuery(url, view) {
  if (url.startsWith("views://")) {
    return view === "main" ? "views://mainview/index.html" : "views://mainview/pill.html";
  }
  if (view === "main") {
    return url;
  }
  return new URL("/pill.html", url).toString();
}
'@

	if ($bundle.Contains($oldWithViewQuery)) {
		$bundle = $bundle.Replace($oldWithViewQuery, $newWithViewQuery)
		Set-Content -Path $bundlePath -Value $bundle
	}
}

function Resolve-InnoCompiler {
	$candidate = Get-Command ISCC.exe -ErrorAction SilentlyContinue
	if ($candidate) {
		return $candidate.Source
	}

	$knownPaths = @(
		"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
		"C:\Program Files\Inno Setup 6\ISCC.exe"
	)

	foreach ($path in $knownPaths) {
		if (Test-Path $path) {
			return $path
		}
	}

	throw "Inno Setup compiler (ISCC.exe) was not found. Install Inno Setup 6 or run the GitHub Actions release workflow."
}

if (-not (Test-Path $metadataPath)) {
	throw "Missing Electrobun metadata at $metadataPath. Run 'bun run build:canary' first."
}

if (-not (Test-Path $installerScript)) {
	throw "Missing Inno Setup script at $installerScript"
}

if (-not (Test-Path $iconPath)) {
	throw "Missing icon at $iconPath"
}

$metadata = Get-Content $metadataPath | ConvertFrom-Json
$hash = [string]$metadata.hash
if (-not $hash) {
	throw "Electrobun metadata does not contain a payload hash."
}

$archivePath = Join-Path $resourcesDir ($hash + ".tar.zst")
if (-not (Test-Path $archivePath)) {
	throw "Missing packaged app archive at $archivePath"
}

$packageJson = Get-Content $packageJsonPath | ConvertFrom-Json
$appVersion = [string]$packageJson.version
if (-not $appVersion) {
	throw "Could not resolve app version from $packageJsonPath"
}

New-Item -ItemType Directory -Force -Path $stagingArchiveDir | Out-Null
tar -xf $archivePath -C $stagingArchiveDir
if ($LASTEXITCODE -ne 0) {
	throw "Failed to extract Electrobun payload archive."
}

$sourceAppDir = Join-Path $stagingArchiveDir "dictate-canary"
if (-not (Test-Path $sourceAppDir)) {
	throw "Expected extracted app directory at $sourceAppDir"
}

Update-StagedViewEntrypoints -sourceAppDir $sourceAppDir
Update-StagedMainProcessBundle -sourceAppDir $sourceAppDir

$launcherPath = Join-Path $sourceAppDir "bin\launcher.exe"
if ((Test-Path $launcherPath) -and (Test-Path $rceditPath)) {
	& $rceditPath $launcherPath --set-icon $iconPath
	if ($LASTEXITCODE -ne 0) {
		throw "rcedit failed while stamping $launcherPath"
	}
}

$isccPath = Resolve-InnoCompiler
$outputBaseFilename = "canary-win-x64-dictate-Setup-canary"

& $isccPath `
	("/DMyAppVersion=$appVersion") `
	("/DSourceAppDir=$sourceAppDir") `
	("/DOutputDir=$artifactDir") `
	("/DOutputBaseFilename=$outputBaseFilename") `
	("/DRepoRoot=$repoRoot") `
	$installerScript

if ($LASTEXITCODE -ne 0) {
	throw "Inno Setup compilation failed."
}

$installerOutputPath = Join-Path $artifactDir ($outputBaseFilename + ".exe")
if (-not (Test-Path $installerOutputPath)) {
	throw "Expected installer output at $installerOutputPath"
}

Write-Host "Built Windows installer:"
Write-Host "  $installerOutputPath"

Remove-Item $stagingRoot -Recurse -Force
