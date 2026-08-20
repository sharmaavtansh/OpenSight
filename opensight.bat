@echo off
REM OpenSight - Home Edition
REM Double-click this file to start the app. Keep the window open while using it.

title OpenSight - Home Edition
cd /d "%~dp0"

echo.
echo   OpenSight - Home Edition
echo   ==========================
echo   Developed by Avtansh Sharma - built for the community, free to use.
echo.

REM Python 3.11 is the interpreter the dependencies were installed into.
py -3.11 --version >nul 2>&1
if errorlevel 1 (
  echo   ERROR: Python 3.11 was not found.
  echo   Install it, then run:  py -3.11 -m pip install -r requirements.txt
  echo.
  pause
  exit /b 1
)

py -3.11 -c "import fastapi, uvicorn" >nul 2>&1
if errorlevel 1 (
  echo   Installing Python dependencies...
  py -3.11 -m pip install -r requirements.txt
  echo.
)

if not exist "web\dist\index.html" (
  echo   The user interface has not been built yet.
  echo   Run this once:   cd web ^&^& npm install ^&^& npm run build
  echo.
  pause
  exit /b 1
)

echo   Starting on http://127.0.0.1:8420/
echo   A browser window will open shortly.
echo.
echo   Leave this window open. Press Ctrl+C here to stop the app.
echo.

py -3.11 run.py

echo.
echo   OpenSight has stopped.
pause
