@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0\..\.."
echo.
echo ==========================================================
echo   UMBRA 2.0   ^|   Private Communication Workspace
 echo ==========================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [BLAD] Nie znaleziono Node.js. Zainstaluj Node.js 20 lub nowszy.
  pause
  exit /b 1
)
if not exist "server\node_modules\fastify" (
  echo [INFO] Instalowanie zaleznosci serwera...
  pushd server
  call npm install
  if errorlevel 1 (popd & echo [BLAD] Instalacja nie powiodla sie. & pause & exit /b 1)
  popd
)
echo Wybierz sposob uruchomienia:
echo.
echo [1] LOCAL    - tylko ten komputer, 127.0.0.1:3000
 echo [2] NGROK    - serwer lokalny + publiczny tunel HTTPS
 echo.
choice /c 12 /n /m "Twoj wybor [1/2]: "
if errorlevel 2 goto ngrok
:local
start "Umbra - Server" /D "%CD%\server" cmd /k node index.js
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:3000
 echo.
echo Uruchomiono tryb LOCAL. Panel admina: http://127.0.0.1:3000/panel
 echo Zamknij okno serwera, aby zakonczyc dzialanie.
pause
exit /b 0
:ngrok
where ngrok >nul 2>nul
if errorlevel 1 (
  echo.
  echo [BLAD] Ngrok nie jest zainstalowany lub nie jest w PATH.
  echo Pobierz: https://ngrok.com/download
  echo Skonfiguruj authtoken: ngrok config add-authtoken TWOJ_TOKEN
  echo.
  pause
  exit /b 1
)
start "Umbra - Server" /D "%CD%\server" cmd /k node index.js
timeout /t 3 /nobreak >nul
start "Umbra - ngrok HTTPS" cmd /k "ngrok http 3000"
start "" http://127.0.0.1:3000
 echo.
echo NGROK wlaczony. Publiczny adres HTTPS znajdziesz w oknie ngrok.
echo Kazdy link z panelu admina skopiowany przez publiczny URL uzyje tej domeny.
echo.
pause
exit /b 0
