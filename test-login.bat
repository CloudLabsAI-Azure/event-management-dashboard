@echo off
REM Test script to verify admin login works (Windows)
echo 🔐 Testing admin login credentials...

echo 📡 Starting backend server...
cd /d "%~dp0"
start /b node backend/server.js

REM Wait for server to start
timeout /t 3 /nobreak > nul

echo 🧪 Testing login with admin/password...
powershell -Command "try { $response = Invoke-RestMethod -Uri 'http://localhost:4000/api/login' -Method POST -ContentType 'application/json' -Body '{\"username\":\"admin\",\"password\":\"password\"}'; Write-Host 'Login response:' $response; if ($response.token) { Write-Host '✅ Admin login successful!' } else { Write-Host '❌ Admin login failed!' } } catch { Write-Host '❌ Login test failed:' $_.Exception.Message }"

echo.
echo 🔍 Current backend/data.json status:
if exist backend\data.json (
    echo ✅ data.json exists
    echo Users in data.json:
    findstr /A /C:"users" backend\data.json
) else (
    echo ❌ data.json not found
)

REM Cleanup any running node processes
taskkill /f /im node.exe >nul 2>&1

pause