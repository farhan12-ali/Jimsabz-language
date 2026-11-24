param([string]$Output = "docs/validation/windows-release.json")
$ErrorActionPreference = "Stop"
if ($env:OS -ne "Windows_NT") { throw "Run this check on Windows 10/11 x64 or a Windows x64 test runner." }
if (-not [Environment]::Is64BitOperatingSystem) { throw "The executable target requires Windows x64." }
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    $nodeCommand = Get-Command node -ErrorAction Stop
    $destination = [IO.Path]::GetFullPath((Join-Path $projectRoot $Output))
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    & $nodeCommand.Source scripts/validate-release.mjs --output $destination
    if ($LASTEXITCODE -ne 0) { throw "A Windows release test failed. Inspect $destination." }
    Write-Host "Windows executable checks completed. Report: $destination"
    Write-Host "Also check a 2D game, a 3D scene, audio, keyboard input and installation manually."
} finally { Pop-Location }
