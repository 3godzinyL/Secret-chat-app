@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Brak Node.js & pause & exit /b 1)
node --test tests\integration.test.js tests\security.test.js tests\vault.test.js
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (echo [OK] Wszystkie testy przeszly.) else (echo [BLAD] Testy nie powiodly sie.)
pause
exit /b %RESULT%
