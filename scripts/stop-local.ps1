# ============================================================================
# TennisAI — stop the local stack.
#
# Shuts down in reverse order (web -> API -> Postgres) so the database is the
# last thing to go and closes with a clean checkpoint. Your accounts and data
# are on disk in the data directory; stopping never deletes anything.
# ============================================================================

param(
  [string]$PgBin   = $(if ($env:TENNISAI_PGBIN)  { $env:TENNISAI_PGBIN }  else { "D:\SQL\bin" }),
  [string]$DataDir = $(if ($env:TENNISAI_PGDATA) { $env:TENNISAI_PGDATA } else { "D:\SQL\data\tennisai" }),
  [int]$PgPort     = 55432,
  [int]$ApiPort    = 4000,
  [int]$WebPort    = 5180,
  # Leave Postgres running (handy when you only want to restart the app code).
  [switch]$KeepDatabase
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot

function Info($m) { Write-Host "  $m" }
function Ok($m)   { Write-Host "  OK  $m" -ForegroundColor Green }

Write-Host ""
Write-Host "TennisAI - stopping local stack" -ForegroundColor Cyan

# Kill the node processes by the port they hold, but only after confirming the
# command line points at THIS project — never stop an unrelated node server
# that happens to be on the same port.
function Stop-ByPort([int]$Port, [string]$Label) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) { Info "$Label - not running"; return }
  foreach ($procId in ($conns.OwningProcess | Sort-Object -Unique)) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    if ($proc.CommandLine -and $proc.CommandLine -like "*$Root*") {
      Stop-Process -Id $procId -Force -Confirm:$false -ErrorAction SilentlyContinue
      Ok "$Label stopped (pid $procId)"
    } else {
      Info "$Label - pid $procId on port $Port is NOT this project, left alone"
    }
  }
}

Stop-ByPort $WebPort "web  (vite)"
Stop-ByPort $ApiPort "api  (express)"

if ($KeepDatabase) {
  Info "database - left running (-KeepDatabase)"
} else {
  $pgCtl = Join-Path $PgBin "pg_ctl.exe"
  if ((Test-Path $pgCtl) -and (Test-Path (Join-Path $DataDir "PG_VERSION"))) {
    # -m fast rolls back open transactions and checkpoints; it does not lose
    # committed data.
    & $pgCtl -D $DataDir -m fast stop 2>&1 | Out-Null
    if (Get-NetTCPConnection -LocalPort $PgPort -State Listen -ErrorAction SilentlyContinue) {
      Info "database - still listening on $PgPort (another cluster?)"
    } else {
      Ok "database stopped (data kept at $DataDir)"
    }
  } else {
    Info "database - no cluster found at $DataDir"
  }
}

Write-Host ""
Write-Host "  Stopped. Run Start-TennisAI.bat to bring it back - accounts are preserved." -ForegroundColor DarkGray
Write-Host ""
