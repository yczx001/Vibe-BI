@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title Vibe BI Dev

where dotnet >nul 2>nul
if errorlevel 1 (
  echo [Vibe BI] dotnet was not found. Install .NET SDK 10 first.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [Vibe BI] npm was not found. Install Node.js first.
  pause
  exit /b 1
)

echo [Vibe BI] Stopping stale backend processes...
taskkill /F /IM VibeBi.Api.exe /T >nul 2>nul
taskkill /F /IM VibeBi.Api /T >nul 2>nul

echo [Vibe BI] Building backend...
dotnet build "server\src\VibeBi.slnx"
if errorlevel 1 (
  echo [Vibe BI] Backend build failed. Startup aborted.
  pause
  exit /b 1
)

echo [Vibe BI] Starting desktop dev app...
cd /d "%~dp0packages\desktop"
call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo [Vibe BI] Startup failed with exit code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
