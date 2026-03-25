@echo off
setlocal

cd /d "%~dp0"
title Vibe BI Dev

where dotnet >nul 2>nul
if errorlevel 1 (
  echo [Vibe BI] 未找到 dotnet，请先安装 .NET SDK 10。
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [Vibe BI] 未找到 npm，请先安装 Node.js。
  pause
  exit /b 1
)

echo [Vibe BI] 正在停止旧的后端实例...
taskkill /F /IM VibeBi.Api.exe /T >nul 2>nul

echo [Vibe BI] 正在构建后端...
dotnet build server\src\VibeBi.slnx
if errorlevel 1 (
  echo [Vibe BI] 后端构建失败，已停止启动。
  pause
  exit /b 1
)

echo [Vibe BI] 正在启动桌面端...
cd /d "%~dp0packages\desktop"
npm run dev
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo [Vibe BI] 启动失败，退出码 %EXIT_CODE%。
  pause
)

exit /b %EXIT_CODE%
