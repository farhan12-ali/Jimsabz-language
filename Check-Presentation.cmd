@echo off
setlocal
pushd "%~dp0"
if not exist "build\jimsabz.exe" (
  echo Native runtime missing. Extract the entire ZIP before running this check.
  popd
  exit /b 1
)
if not exist "examples\presentation\07_marksheet.jimsabz" (
  echo Presentation examples missing. Extract the entire ZIP.
  popd
  exit /b 1
)
set "JIMSABZ_CHECK_OUTPUT=%TEMP%\Jimsabz-presentation-%RANDOM%-%RANDOM%"
mkdir "%JIMSABZ_CHECK_OUTPUT%" >nul 2>&1
set /a JIMSABZ_PASSED=0 >nul
set /a JIMSABZ_TOTAL=0 >nul
for %%F in ("examples\presentation\*.jimsabz") do call :check "%%~fF"
echo.
echo %JIMSABZ_PASSED%/%JIMSABZ_TOTAL% native presentation checks passed.
echo Output logs: %JIMSABZ_CHECK_OUTPUT%
set "JIMSABZ_RESULT=0"
if not "%JIMSABZ_PASSED%"=="%JIMSABZ_TOTAL%" set "JIMSABZ_RESULT=1"
if not "%JIMSABZ_TOTAL%"=="7" (
  echo Expected seven example programs. Extract the entire ZIP and try again.
  set "JIMSABZ_RESULT=1"
)
popd
if /I not "%~1"=="--no-pause" pause
exit /b %JIMSABZ_RESULT%

:check
set /a JIMSABZ_TOTAL+=1 >nul
"build\jimsabz.exe" run "%~1" <"%~dpn1.input.txt" >"%JIMSABZ_CHECK_OUTPUT%\%~n1.txt" 2>&1
if errorlevel 1 (
  echo FAIL %~n1 - runtime error. Inspect its output log.
  exit /b 0
)
fc /L /W "%JIMSABZ_CHECK_OUTPUT%\%~n1.txt" "%~dpn1.expected.txt" >"%JIMSABZ_CHECK_OUTPUT%\%~n1.diff.txt" 2>&1
if errorlevel 1 (
  echo FAIL %~n1 - output differs. Inspect its diff log.
) else (
  echo PASS %~n1
  set /a JIMSABZ_PASSED+=1 >nul
)
exit /b 0
