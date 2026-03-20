@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem '%~dp0' -Recurse | Unblock-File"

set "TARGET_EXE="
for %%F in ("%~dp0mailark-*.exe") do (
  set "TARGET_EXE=%%~fF"
  goto :launch
)

echo mailark installer exe was not found in %~dp0
exit /b 1

:launch
start "" "%TARGET_EXE%"
