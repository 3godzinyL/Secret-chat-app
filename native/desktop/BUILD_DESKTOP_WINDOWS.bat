@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where cl >nul 2>nul || (echo Brak Microsoft Visual C++ compiler. Uruchom z Developer Command Prompt dla Visual Studio 2022+ ^(Desktop development with C++^). & pause & exit /b 1)
if not exist build mkdir build
cl /nologo /std:c++20 /EHsc /O2 /DWIN32_LEAN_AND_MEAN /DUNICODE /D_UNICODE UmbraDesktop.cpp /link /SUBSYSTEM:WINDOWS /OUT:build\UmbraDesktop.exe user32.lib gdi32.lib shell32.lib
if errorlevel 1 (pause & exit /b 1)
echo Gotowe: native\desktop\build\UmbraDesktop.exe
pause
