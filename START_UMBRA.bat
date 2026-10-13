@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title UMBRA 3.0 - SERVER + APPLICATION
color 0D
cls
echo.
echo  ==============================================================
echo           U M B R A   3 . 0    //    PRIVATE NETWORK
 echo  ==============================================================
echo.
echo       [1] LOCAL - serwer i aplikacja na tym komputerze
 echo       [2] NGROK - serwer, aplikacja i publiczny link HTTPS
 echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [BLAD] Zainstaluj Node.js 20+ : https://nodejs.org/
  pause
  exit /b 1
)
if not exist "server\node_modules\fastify\package.json" (
  echo [INFO] Instalowanie zaleznosci...
  pushd "server"
  call npm ci --omit=dev
  if errorlevel 1 (popd & echo [BLAD] npm ci nie udalo sie. & pause & exit /b 1)
  popd
)
choice /c 12 /n /m " Wybierz tryb [1/2]: "
if errorlevel 2 goto tunnel
:local
node "scripts\launch.mjs" local
set "EXITCODE=%ERRORLEVEL%"
goto end
:tunnel
node "scripts\launch.mjs" ngrok
set "EXITCODE=%ERRORLEVEL%"
:end
echo.
echo [UMBRA] Zamknieto. Kod wyjscia: %EXITCODE%
pause
exit /b %EXITCODE%
