@echo off
set PORT=3000
cd /d %~dp0\..\..\server
echo Starting Umbra v8 on http://localhost:%PORT%
node index.js
