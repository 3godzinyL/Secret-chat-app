@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where cmake >nul 2>nul || (echo Brak CMake. & pause & exit /b 1)
where node >nul 2>nul || (echo Brak Node.js. & pause & exit /b 1)
for /f "delims=" %%I in ('node -p "process.execPath"') do set "NODE_EXE=%%I"
for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"
if not exist "%NODE_DIR%node.lib" (echo Nie znaleziono node.lib w %NODE_DIR% & pause & exit /b 1)
if "%OPENSSL_ROOT_DIR%"=="" (echo Ustaw OPENSSL_ROOT_DIR na instalacje OpenSSL z naglowkami i bibliotekami. & pause & exit /b 1)
cmake -S . -B .cmake-build -A x64 -DNODE_INCLUDE_DIR="%NODE_DIR%include\node" -DNODE_IMPORT_LIBRARY="%NODE_DIR%node.lib" -DOPENSSL_ROOT_DIR="%OPENSSL_ROOT_DIR%"
if errorlevel 1 (pause & exit /b 1)
cmake --build .cmake-build --config Release
if errorlevel 1 (pause & exit /b 1)
if not exist build mkdir build
copy /y .cmake-build\Release\umbra_crypto.node build\umbra_crypto.node >nul
if errorlevel 1 (pause & exit /b 1)
echo Gotowe. C++ addon skompilowany.
pause
