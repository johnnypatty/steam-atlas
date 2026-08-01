$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Steam Atlas - Windows build check" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

function Require-Command {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$InstallHint
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "[missing] $Name" -ForegroundColor Red
        Write-Host "          $InstallHint" -ForegroundColor Yellow
        return $false
    }

    Write-Host "[ready]   $Name" -ForegroundColor Green
    return $true
}

$ready = $true
$ready = (Require-Command "node" "Install Node.js LTS: winget install OpenJS.NodeJS.LTS") -and $ready
$ready = (Require-Command "npm" "npm is included with Node.js LTS.") -and $ready
$ready = (Require-Command "rustc" "Install Rustup: winget install Rustlang.Rustup") -and $ready
$ready = (Require-Command "cargo" "Cargo is installed by Rustup. Restart the terminal after installing Rustup.") -and $ready

if (-not $ready) {
    Write-Host ""
    Write-Host "Install the missing prerequisites, restart PowerShell, and run this script again." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path "package.json")) {
    Write-Host "Run this script from the Steam Atlas project folder." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Installing JavaScript dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE."
}

Write-Host ""
Write-Host "Checking the web interface..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    throw "The web interface build failed with exit code $LASTEXITCODE."
}

Write-Host ""
Write-Host "Building the Windows application and NSIS installer..." -ForegroundColor Cyan
$buildStarted = Get-Date
npm run desktop:windows
$tauriExitCode = $LASTEXITCODE

$portableExe = "src-tauri\target\release\steam-atlas.exe"
$nsisDirectory = "src-tauri\target\release\bundle\nsis"
$portableFresh = $false
$nsisFiles = @()

if (Test-Path $portableExe) {
    $portableFresh = (Get-Item $portableExe).LastWriteTime -ge $buildStarted.AddSeconds(-3)
}
if (Test-Path $nsisDirectory) {
    $nsisFiles = @(Get-ChildItem $nsisDirectory -File -ErrorAction SilentlyContinue | Where-Object {
        $_.LastWriteTime -ge $buildStarted.AddSeconds(-3)
    })
}

Write-Host ""
if ($portableFresh) {
    Write-Host "[ready] Portable executable: $portableExe" -ForegroundColor Green
} elseif (Test-Path $portableExe) {
    Write-Host "[stale] Portable executable exists, but this build did not update it." -ForegroundColor Yellow
} else {
    Write-Host "[missing] Portable executable was not created." -ForegroundColor Red
}

if ($nsisFiles.Count -gt 0) {
    Write-Host "[ready] NSIS installer: $($nsisFiles[0].FullName)" -ForegroundColor Green
} elseif (Test-Path $nsisDirectory) {
    Write-Host "[stale] NSIS folder exists, but this build did not create an installer." -ForegroundColor Yellow
} else {
    Write-Host "[missing] NSIS installer was not created." -ForegroundColor Yellow
}

if ($tauriExitCode -ne 0) {
    Write-Host ""
    Write-Host "Tauri returned exit code $tauriExitCode." -ForegroundColor Red
    if ($portableFresh) {
        Write-Host "The portable application compiled, but installer packaging failed." -ForegroundColor Yellow
        Write-Host "If the error names github.com or 'no such host', check DNS/HTTPS access and retry." -ForegroundColor Yellow
    }
    exit $tauriExitCode
}

if (-not $portableFresh -or $nsisFiles.Count -eq 0) {
    Write-Host ""
    Write-Host "Tauri exited successfully, but fresh expected artifacts were not found." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Build complete." -ForegroundColor Green
