@echo off
:: ─────────────────────────────────────────────────────────────────────────────
:: File Chat App — Gỡ tự khởi động
:: ─────────────────────────────────────────────────────────────────────────────
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
    echo [LOI] Can chay voi quyen Administrator.
    echo Click chuot phai -^> "Run as administrator"
    pause
    exit /b 1
)

set TASK_NAME=FileChatApp

schtasks /delete /tn "%TASK_NAME%" /f
if errorlevel 1 (
    echo [WARN] Khong tim thay task "%TASK_NAME%". Co the chua duoc cai.
) else (
    echo [OK] Da xoa task "%TASK_NAME%".
)

:: Xoá VBScript nếu có
if exist "%~dp0run-hidden.vbs" (
    del /f "%~dp0run-hidden.vbs"
    echo [OK] Da xoa run-hidden.vbs.
)

echo.
echo Gỡ cài đặt hoàn tất. Server se khong tu chay khi khoi dong Windows nua.
pause
