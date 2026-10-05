@echo off
:: ─────────────────────────────────────────────────────────────────────────────
:: File Chat App — Cài tự khởi động cùng Windows (Task Scheduler)
:: Chạy với quyền Administrator
:: ─────────────────────────────────────────────────────────────────────────────
setlocal
cd /d "%~dp0"

:: ── Kiểm tra quyền Admin ──────────────────────────────────────────────────────
net session >nul 2>&1
if errorlevel 1 (
    echo [LOI] Can chay voi quyen Administrator.
    echo Click chuot phai vao file nay -^> "Run as administrator"
    pause
    exit /b 1
)

set TASK_NAME=FileChatApp
set START_BAT=%~dp0start.bat

:: ── Tạo VBScript để chạy ẩn cửa sổ ──────────────────────────────────────────
set VBS=%~dp0run-hidden.vbs
echo Set oShell = CreateObject("WScript.Shell") > "%VBS%"
echo oShell.Run """" ^& "%START_BAT%" ^& """", 0, False >> "%VBS%"

:: ── Xoá task cũ nếu có ───────────────────────────────────────────────────────
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: ── Đăng ký Task Scheduler ────────────────────────────────────────────────────
:: Trigger: khi bất kỳ user nào đăng nhập
:: Action: chạy VBScript (ẩn cửa sổ)
:: Delay: 10 giây sau khi logon (chờ network sẵn sàng)
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "wscript.exe \"%VBS%\"" ^
  /sc onlogon ^
  /delay 0000:10 ^
  /rl HIGHEST ^
  /f

if errorlevel 1 (
    echo [LOI] Khong the tao Task Scheduler.
    pause
    exit /b 1
)

echo.
echo [OK] Da dang ky tu khoi dong thanh cong!
echo     Task name : %TASK_NAME%
echo     Script    : %VBS%
echo     Trigger   : Moi lan dang nhap Windows (delay 10 giay)
echo.
echo De kiem tra: mo "Task Scheduler" -^> tim "%TASK_NAME%"
echo De go cai  : chay uninstall-autostart.bat
echo.

:: ── Hỏi có muốn chạy ngay không ─────────────────────────────────────────────
set /p RUN_NOW=Chay server ngay bay gio? (Y/N): 
if /i "%RUN_NOW%"=="Y" (
    start "" wscript.exe "%VBS%"
    echo [OK] Server dang khoi dong o nen...
    timeout /t 3 /nobreak >nul
    start https://localhost:3580
)

echo.
pause
