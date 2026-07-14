$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$python = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
$log = Join-Path $PSScriptRoot "data\run_daily.log"

New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot "data") | Out-Null

"[$(Get-Date -Format o)] discover starting" | Add-Content $log
& $python -m jobagent discover *>> $log

"[$(Get-Date -Format o)] score starting" | Add-Content $log
& $python -m jobagent score *>> $log

"[$(Get-Date -Format o)] done" | Add-Content $log
