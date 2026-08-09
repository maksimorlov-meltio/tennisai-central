@echo off
REM Double-click to stop TennisAI locally. Your data is kept.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-local.ps1" %*
REM Brief pause so the window stays readable when double-clicked. `ping` rather
REM than `timeout`, which aborts with "Input redirection is not supported" when
REM this script is run non-interactively (CI, another script, a task runner).
ping -n 4 127.0.0.1 >nul
