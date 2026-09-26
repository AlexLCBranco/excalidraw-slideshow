@echo off
rem Opens the slideshow in your browser. Keep this window open while you use it;
rem closing it stops the slideshow.
title Excalidraw Slideshow
cd /d "%~dp0"

rem Already running? Just open another browser tab.
netstat -ano | findstr /c:":5181 " | findstr LISTENING >nul && (
  start "" http://localhost:5181
  exit /b 0
)

if not exist node_modules (
  echo First run: installing, this takes a minute...
  call npm install || goto :failed
)

rem Rebuild every launch (about 2 seconds), so you always get the latest code.
call npm run build || goto :failed
call npx vite preview --open
exit /b 0

:failed
echo.
echo Something went wrong. Copy the text above into Claude.
pause
exit /b 1
