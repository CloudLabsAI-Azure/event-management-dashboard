@echo off
REM Deployment preparation script for Azure App Service (Windows)
echo 🚀 Preparing for Azure deployment...

REM Clean previous builds
echo 🧹 Cleaning previous builds...
if exist dist rmdir /s /q dist
if exist node_modules rmdir /s /q node_modules

REM Install dependencies
echo 📦 Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ❌ npm install failed!
    exit /b 1
)

REM Build frontend
echo 🏗️ Building frontend...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ Frontend build failed!
    exit /b 1
)

REM Verify build output
if exist "dist\index.html" (
    echo ✅ Frontend build successful!
    echo 📁 Build output:
    dir dist
) else (
    echo ❌ Frontend build failed - no index.html found!
    exit /b 1
)

REM Create deployment info
echo 📋 Creating deployment info...
echo Deployment prepared at: %date% %time% > deployment-info.txt
echo Node version: >> deployment-info.txt
node --version >> deployment-info.txt
echo NPM version: >> deployment-info.txt
npm --version >> deployment-info.txt
echo Backend entry: backend/server.js >> deployment-info.txt
echo Frontend entry: dist/index.html >> deployment-info.txt

echo ✅ Deployment preparation complete!
echo 📄 Deployment info saved to deployment-info.txt
echo.
echo 🌐 Next steps:
echo 1. Commit and push your changes to trigger GitHub Actions
echo 2. Or manually deploy the current directory to Azure App Service
echo 3. Ensure Azure App Service has Node.js 20.x runtime
echo 4. Set startup command to: npm start

pause