param(
    [string]$InnoCompiler = "",
    [string]$CertificateThumbprint = "",
    [string]$SignTool = "signtool.exe",
    [string]$TimestampUrl = "",
    [switch]$SkipWindowsTests
)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    if (-not $SkipWindowsTests) {
        & "$PSScriptRoot/test-windows-release.ps1"
        if ($LASTEXITCODE -ne 0) { throw "Windows verification failed." }
    }
    if (-not $InnoCompiler) {
        $candidates = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe")
        $InnoCompiler = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    }
    if (-not $InnoCompiler -or -not (Test-Path -LiteralPath $InnoCompiler)) { throw "Install Inno Setup or pass -InnoCompiler with the full ISCC.exe path." }
    & $InnoCompiler installer/Jimsabz-Studio.iss
    if ($LASTEXITCODE -ne 0) { throw "Installer compilation failed." }
    $installerPath = Join-Path $projectRoot "release/Jimsabz-Studio-0.19.0-Setup.exe"
    if ($CertificateThumbprint) {
        $signArgs = @("sign", "/sha1", $CertificateThumbprint, "/fd", "SHA256")
        if ($TimestampUrl) { $signArgs += @("/tr", $TimestampUrl, "/td", "SHA256") }
        & $SignTool @signArgs $installerPath
        if ($LASTEXITCODE -ne 0) { throw "Signing failed; the installer must not be described as signed." }
        & $SignTool verify /pa $installerPath
        if ($LASTEXITCODE -ne 0) { throw "Signature verification failed." }
    }
    $artifactHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
    "$artifactHash  $([IO.Path]::GetFileName($installerPath))" | Set-Content -Encoding ascii ($installerPath + ".sha256")
    Write-Host "Created: $installerPath"
    if (-not $CertificateThumbprint) { Write-Host "Signing: Not Run. Supply your certificate thumbprint when distributing signed releases." }
} finally { Pop-Location }
