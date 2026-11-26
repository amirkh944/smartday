@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 24+ is required. & exit /b 1)
where npm >nul 2>nul || (echo npm is required. & exit /b 1)
echo [1/3] Installing dependencies...
call npm install || exit /b 1
echo [2/3] Building Windows installer and portable app...
call npm run dist:win || exit /b 1
echo [3/3] Build completed. See the dist folder.
exit /b 0
