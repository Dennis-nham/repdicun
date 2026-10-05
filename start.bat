@echo off
:: ─────────────────────────────────────────────────────────────────────────────
:: File Chat App — Start Server
:: Chạy file này để khởi động server (HTTP :3579 + HTTPS :3580)
:: Tự động: cài npm packages nếu thiếu, tạo HTTPS cert nếu chưa có
:: ─────────────────────────────────────────────────────────────────────────────

setlocal
cd /d "%~dp0"

:: ── Kiểm tra Node.js ──────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [LOI] Node.js chua duoc cai dat.
    echo Tai tai: https://nodejs.org/
    pause
    exit /b 1
)

:: ── Cài npm packages nếu chưa có ─────────────────────────────────────────────
if not exist "node_modules\express\package.json" (
    echo [SETUP] Dang cai npm packages...
    call npm install --omit=dev
    if errorlevel 1 (
        echo [LOI] npm install that bai.
        pause
        exit /b 1
    )
)

:: ── Khởi động server ──────────────────────────────────────────────────────────
echo [OK] Khoi dong File Chat App...
node server.js
