@echo off
if "%1"=="" (
  echo Uzycie: remove-key-port.bat 12345
  exit /b 1
)
set KEY=%1
echo [ADMIN] Usuwam portproxy dla localhost:%KEY%
netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=%KEY%
