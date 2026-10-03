@echo off
rem Make Windows start the dashboard at login, for this Windows user.
rem
rem It writes a two-line .cmd into this user's Startup folder that calls
rem kiosk.cmd here, minimised. No shortcut, no registry, nothing else. To
rem undo it, delete "Paua.cmd" from that folder
rem (Win+R, shell:startup).

setlocal
set "HERE=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "ENTRY=%STARTUP%\Paua.cmd"

> "%ENTRY%" echo @echo off
>> "%ENTRY%" echo start "Paua" /min cmd /c "%HERE%kiosk.cmd"

echo Done. The dashboard will start when this user logs in:
echo   %ENTRY%
pause
