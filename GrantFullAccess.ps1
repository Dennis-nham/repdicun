# GrantFullAccess.ps1 - Cap toan quyen cho thu muc Scanned Files
$targetPath = 'G:\backup\No.2 [exFAT]\Scanned Files'

Write-Host "`n=== Cap quyen so huu (takeown) ===" -ForegroundColor Cyan
takeown /F "$targetPath" /R /D Y 2>&1 | Out-Null
Write-Host "Hoan thanh takeown." -ForegroundColor Green

Write-Host "`n=== Cap toan quyen Everyone (icacls) ===" -ForegroundColor Cyan
icacls "$targetPath" /grant "Everyone:(OI)(CI)F" /T /C 2>&1 | Select-Object -Last 5
Write-Host "Hoan thanh icacls." -ForegroundColor Green

Write-Host "`n=== Cap quyen cho user hien tai ===" -ForegroundColor Cyan
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls "$targetPath" /grant "${currentUser}:(OI)(CI)F" /T /C 2>&1 | Select-Object -Last 3
Write-Host "Xong! User: $currentUser da co toan quyen." -ForegroundColor Green

pause
