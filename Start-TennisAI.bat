@echo off
REM Double-click to start TennisAI locally (database + API + website).
REM Accounts created through the sign-up page persist across restarts.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1" %*
if errorlevel 1 (
  echo.
  echo Startup failed - see the messages above and .local-logs\
  pause
)
