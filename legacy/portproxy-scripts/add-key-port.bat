@echo off
if "%1"=="" (
  echo Uzycie: add-key-port.bat 12345
  exit /b 1
)
set KEY=%1
echo [ADMIN] Tworze portproxy z localhost:%KEY% -> 127.0.0.1:3000
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=%KEY% connectaddress=127.0.0.1 connectport=3000
echo Gotowe. Wejdz: http://localhost:%KEY%  lub  http://localhost/%KEY%
