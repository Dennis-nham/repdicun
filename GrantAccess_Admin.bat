@echo off
echo Dang lay quyen so huu...
takeown /F "G:\backup\No.2 [exFAT]\Scanned Files" /R /D Y >nul 2>&1
echo Dang cap toan quyen...
icacls "G:\backup\No.2 [exFAT]\Scanned Files" /grant "Everyone:(OI)(CI)F" /T /C >nul 2>&1
icacls "G:\backup\No.2 [exFAT]\Scanned Files" /grant "BUILTIN\Users:(OI)(CI)F" /T /C >nul 2>&1
icacls "G:\backup\No.2 [exFAT]\Scanned Files" /grant "BUILTIN\Administrators:(OI)(CI)F" /T /C
echo.
echo XONG! Nhan phim bat ky de dong...
pause
