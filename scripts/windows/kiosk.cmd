@echo off
rem The booth's launcher. Runs the kiosk, and brings it back if it dies.
rem install-startup.cmd makes Windows run this at login.
rem
rem It runs the build already on disk and builds only when there is none, so a
rem Sunday boot never depends on a build working. update.cmd is what changes it.
rem
rem A crash restarts after 5 s. Quitting on purpose (Alt+F4) exits 0 and stays
rem quit, so the screen can always be got out of the way.
rem
rem The log is %APPDATA%\life-lighting-dashboard\kiosk.log, and the run before
rem it is kiosk.prev.log beside it.

setlocal
cd /d "%~dp0..\.."

set "DATA=%APPDATA%\life-lighting-dashboard"
if not exist "%DATA%" mkdir "%DATA%"
set "LOG=%DATA%\kiosk.log"

where node >nul 2>nul
if errorlevel 1 (
  echo Node 22 is not on PATH. See CLAUDE.md, Prerequisites.
  pause
  exit /b 1
)

rem `npm test` and `npm run build` clear dist, so the app build can be missing
rem from a checkout someone has worked in.
if exist "dist\src\main\kiosk.js" if exist "dist\renderer\index.html" goto run
echo No app build here. Building it, which takes a minute...
call npm run build:app > "%DATA%\build.log" 2>&1
if errorlevel 1 (
  echo The build failed. See %DATA%\build.log
  pause
  exit /b 1
)

:run
if exist "%LOG%" move /y "%LOG%" "%DATA%\kiosk.prev.log" >nul
echo The dashboard is running. Log: %LOG%
call "node_modules\.bin\electron.cmd" . > "%LOG%" 2>&1
rem Not `if errorlevel 1`: a Windows crash code such as 0xC0000005 is negative.
if not "%errorlevel%"=="0" (
  echo The dashboard stopped unexpectedly. Restarting in 5 s; close this window to stop it.
  rem By full path, and ping rather than timeout: a Git install that puts its
  rem Unix tools on PATH makes `timeout` GNU's, which refuses /t and skips the
  rem wait (seen 2026-10-03, run from Git Bash), and Windows' timeout.exe quits
  rem at once when there is no console to read. Six pings are five seconds.
  "%SystemRoot%\System32\ping.exe" -n 6 127.0.0.1 >nul
  goto run
)
exit /b 0
