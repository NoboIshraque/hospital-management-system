# =====================================================================
# Run the UHID server as a Windows background task (checklist I9).
#
# Registers two tasks in Windows Task Scheduler:
#   "UHID server"         starts the site when the machine starts, as SYSTEM,
#                         and starts it again within a minute if it stops;
#   "UHID nightly backup" runs npm run db:backup every night at 02:00.
#
# Run it ONCE, in an ADMINISTRATOR PowerShell (it changes system settings):
#   cd E:\hospital-management-system\server
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tasks.ps1
#
# Remove them again with:
#   Unregister-ScheduledTask -TaskName "UHID server" -Confirm:$false
#   Unregister-ScheduledTask -TaskName "UHID nightly backup" -Confirm:$false
#
# Why Task Scheduler and not a "real" Windows service: Node is not a service
# program, and turning it into one needs an extra tool (NSSM, node-windows).
# Task Scheduler is built into Windows, can run at start-up with no one
# signed in, and restarts a task that fails — which is what a service is for.
# On Linux the same job is a systemd unit; docs/operations.md has one.
# =====================================================================

$ErrorActionPreference = 'Stop'
$server = Split-Path -Parent $PSScriptRoot          # ...\server
$node   = (Get-Command node.exe).Source
$npm    = Join-Path (Split-Path -Parent $node) 'npm.cmd'

if (-not (Test-Path (Join-Path $server '.env'))) { throw "No .env in $server. Set the server up first." }

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 `
            -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$system   = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

# The site. NODE_ENV=production: it refuses to start while root's MySQL
# password is in .env (move it to .env.admin first; docs/operations.md).
$site = New-ScheduledTaskAction -Execute 'cmd.exe' -WorkingDirectory $server `
        -Argument "/c set NODE_ENV=production&& set REQUEST_LOG=file&& `"$node`" app.js >> ..\logs\server.log 2>&1"
Register-ScheduledTask -TaskName 'UHID server' -Action $site -Principal $system -Settings $settings `
  -Trigger (New-ScheduledTaskTrigger -AtStartup) -Description 'UHID hospital management system: the web server.' -Force | Out-Null

# The nightly backup (reads root's login from .env.admin).
$bk = New-ScheduledTaskAction -Execute 'cmd.exe' -WorkingDirectory $server `
      -Argument "/c `"$npm`" run db:backup >> ..\logs\backup.log 2>&1"
Register-ScheduledTask -TaskName 'UHID nightly backup' -Action $bk -Principal $system `
  -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) `
  -Trigger (New-ScheduledTaskTrigger -Daily -At 2am) -Description 'UHID: nightly database backup to ..\backups' -Force | Out-Null

Start-ScheduledTask -TaskName 'UHID server'
Write-Host "Registered 'UHID server' (started now, and at every boot) and 'UHID nightly backup' (02:00)."
Write-Host "Check it:  Invoke-RestMethod http://localhost:3000/api/health"
