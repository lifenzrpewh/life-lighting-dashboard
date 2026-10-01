@echo off
rem Bring this checkout up to date and rebuild the app. Run it by hand, on a
rem weekday, with the kiosk closed: never before a service.

setlocal
cd /d "%~dp0..\.."

git pull --ff-only
if errorlevel 1 (
  echo git pull failed. Nothing has changed; the old build still runs.
  pause
  exit /b 1
)
call npm ci
if errorlevel 1 (
  echo npm ci failed. Run it again, or ask for help before Sunday.
  pause
  exit /b 1
)
call npm run build:app
if errorlevel 1 (
  echo The build failed, so there is no app build now. Fix it before Sunday.
  pause
  exit /b 1
)
echo Up to date and built. Start the dashboard with kiosk.cmd, or log out and in.
pause
