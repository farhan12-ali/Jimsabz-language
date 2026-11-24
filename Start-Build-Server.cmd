@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo The local build API needs Node.js 20 or newer.
    echo You can also use Start-Studio.cmd and choose Build on this device.
    pause
    exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 (
    echo Please use Node.js 20 or newer for the local build API.
    pause
    exit /b 1
)
echo Open http://127.0.0.1:45426/ in your browser.
echo Keep this window open while using the build API.
node api\server.mjs
pause
