# Self-elevation check
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Re-running script with Administrator permissions to write Start Menu shortcuts..." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$WshShell = New-Object -ComObject WScript.Shell
$WorkspacePath = "d:\code\personal_projects\recall"
$IcoPath = "$WorkspacePath\public\recall.ico"
$SrcJpg = "$WorkspacePath\public\recall-logo.jpg"
$OpenAppVbs = "$WorkspacePath\scripts\open-app.vbs"
$LauncherVbs = "$WorkspacePath\scripts\launcher.vbs"

# 1. Ensure the ICO exists. If not, generate it from the JPG.
if (-not (Test-Path $IcoPath)) {
    Write-Host "Generating recall.ico from recall-logo.jpg..." -ForegroundColor Cyan
    Add-Type -AssemblyName System.Drawing
    $bmp = [System.Drawing.Bitmap]::FromFile($SrcJpg)
    $hIcon = $bmp.GetHicon()
    [System.Drawing.Icon]::FromHandle($hIcon).Save([System.IO.File]::OpenWrite($icoPath))
    $bmp.Dispose()
    Write-Host "Icon generated successfully at $icoPath" -ForegroundColor Green
}

# 2. Create Start Menu Programs Shortcut (Launches the borderless App via open-app.vbs)
$StartMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Recall.lnk"
Write-Host "Creating Start Menu Shortcut at $StartMenuPath..." -ForegroundColor Cyan
$Shortcut = $WshShell.CreateShortcut($StartMenuPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$OpenAppVbs`""
$Shortcut.IconLocation = $icoPath
$Shortcut.Description = "Recall Spaced Repetition System"
$Shortcut.WorkingDirectory = $WorkspacePath
$Shortcut.Save()
Write-Host "Start Menu Shortcut created successfully!" -ForegroundColor Green

# 3. Create Windows Startup Folder Shortcut (Runs server silently at logon via launcher.vbs)
$StartupPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\RecallServer.lnk"
Write-Host "Creating Auto-Startup Shortcut at $StartupPath..." -ForegroundColor Cyan
$StartupShortcut = $WshShell.CreateShortcut($StartupPath)
$StartupShortcut.TargetPath = "wscript.exe"
$StartupShortcut.Arguments = "`"$LauncherVbs`""
$StartupShortcut.Description = "Recall Background Server Daemon"
$StartupShortcut.WorkingDirectory = $WorkspacePath
# Use a generic windows script icon for background daemon or leave default
$StartupShortcut.Save()
Write-Host "Background Startup Daemon configured successfully!" -ForegroundColor Green

Write-Host "Setup Completed! You can now find 'Recall' in your Start Menu and it will run silently at login." -ForegroundColor Green
Read-Host "Press Enter to exit"
