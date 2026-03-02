@echo off
REM ═══════════════════════════════════════════════════════
REM  InvToolkit — Launcher (Windows)
REM ═══════════════════════════════════════════════════════

cd /d "%~dp0"

echo.
echo ═══════════════════════════════════════════════════════
echo   InvToolkit — Investment Dashboard
echo ═══════════════════════════════════════════════════════
echo.

REM Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo X Python not found. Please install it from python.org
    echo   Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

REM Check/install dependencies
python -c "import flask" 2>nul
if %errorlevel% neq 0 (
    echo Installing dependencies...
    pip install -r requirements.txt
    echo.
)

echo Starting server on http://localhost:5050
echo Press Ctrl+C to stop
echo.

REM Open browser after delay
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:5050"

REM Start server
python server.py
