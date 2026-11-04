@echo off
setlocal
title Interview Copilot
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
  echo.
  echo PowerShell tapilmadi. Windows PowerShell lazimdir.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"

echo.
echo Server dayandi.
pause
