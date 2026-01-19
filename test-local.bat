@echo off
echo ========================================
echo Starting Backend Server...
echo ========================================
start "Backend Server" cmd /k "cd /d %~dp0 && npm run start"

timeout /t 3 /nobreak > nul

echo.
echo ========================================
echo Starting Frontend Dev Server...
echo ========================================
start "Frontend Dev" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ========================================
echo Waiting for servers to start...
echo ========================================
timeout /t 5 /nobreak > nul

echo.
echo ========================================
echo SERVERS STARTED!
echo ========================================
echo Backend:  http://localhost:4000
echo Frontend: http://localhost:5173
echo.
echo Login credentials to bypass SSO:
echo Email:    admin@events.com
echo Password: password
echo.
echo To use simple login instead of SSO:
echo Navigate to: http://localhost:5173/login
echo ========================================
pause
