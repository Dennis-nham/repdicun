@echo off
:: ─────────────────────────────────────────────────────────────────────────────
:: File Chat App — Dừng server
:: ─────────────────────────────────────────────────────────────────────────────
echo [OK] Dang dung File Chat App server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3579 " ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3580 " ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo [OK] Server da dung.
timeout /t 2 /nobreak >nul
