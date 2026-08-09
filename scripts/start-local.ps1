# ============================================================================
# TennisAI — start the whole local stack (Postgres -> API -> web)
#
# Run this (or Start-TennisAI.bat) any time you want the site back up. Accounts
# you create through the sign-up page are stored in Postgres and survive every
# restart, because the data directory lives OUTSIDE the repo and outside any
# temp folder — see $DataDir below.
#
# Deliberately does NOT run the seed script: `prisma migrate deploy` is
# idempotent, but the seed upserts the four test accounts and would overwrite
# changes (e.g. a password you changed yourself). Seed manually if you ever
# need the demo data back:  cd server; npm run prisma:seed
# ============================================================================

param(
  # Postgres binaries (initdb/pg_ctl/psql). Override if you move your install.
  [string]$PgBin   = $(if ($env:TENNISAI_PGBIN)  { $env:TENNISAI_PGBIN }  else { "D:\SQL\bin" }),
  # The permanent home of the database files. Everything you sign up for lives here.
  [string]$DataDir = $(if ($env:TENNISAI_PGDATA) { $env:TENNISAI_PGDATA } else { "D:\SQL\data\tennisai" }),
  [int]$PgPort     = 55432,
  [int]$ApiPort    = 4000,
  [int]$WebPort    = 5180,
  # Skip launching a browser tab at the end.
  [switch]$NoBrowser
)

# "Continue", not "Stop": every step below shells out to a native tool (pg_ctl,
# pg_isready, npm), and in Windows PowerShell stderr output from a native command
# becomes a NativeCommandError that "Stop" escalates into a fatal abort — even
# for a harmless notice, or for a readiness probe that is *expected* to fail
# while the database is still starting. Each stage checks its own exit code.
$ErrorActionPreference = "Continue"
# Repo root = parent of this scripts/ folder, so the script works no matter what
# directory it is invoked from (double-clicked from Explorer, cwd is arbitrary).
$Root    = Split-Path -Parent $PSScriptRoot
$LogDir  = Join-Path $Root ".local-logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Info($m)  { Write-Host "  $m" }
function Ok($m)    { Write-Host "  OK  $m" -ForegroundColor Green }
function Fail($m)  { Write-Host "  !!  $m" -ForegroundColor Red }
function Step($m)  { Write-Host ""; Write-Host "== $m" -ForegroundColor Cyan }

function Test-Port([int]$Port) {
  [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

Write-Host ""
Write-Host "TennisAI - starting local stack" -ForegroundColor Cyan
Write-Host "Database: $DataDir" -ForegroundColor DarkGray

# --- 1. Postgres -----------------------------------------------------------
Step "1/3  Postgres (port $PgPort)"
$pgCtl   = Join-Path $PgBin "pg_ctl.exe"
$pgReady = Join-Path $PgBin "pg_isready.exe"
if (-not (Test-Path $pgCtl)) { Fail "pg_ctl.exe not found in $PgBin. Pass -PgBin <path> or set TENNISAI_PGBIN."; exit 1 }
if (-not (Test-Path (Join-Path $DataDir "PG_VERSION"))) {
  Fail "No Postgres cluster at $DataDir."
  Info "Expected an existing data directory. Pass -DataDir <path> or set TENNISAI_PGDATA."
  exit 1
}

if (Test-Port $PgPort) {
  Ok "already running"
} else {
  # A hard shutdown (crash, reboot) can leave a stale pid file that blocks start.
  $pidFile = Join-Path $DataDir "postmaster.pid"
  if (Test-Path $pidFile) { Remove-Item $pidFile -Force -ErrorAction SilentlyContinue }

  # Start via Start-Process, NOT `& $pgCtl ... start`. Called directly, pg_ctl
  # hands its inherited stdout/stderr handles to the long-lived postgres child,
  # so PowerShell blocks forever waiting for a pipe that never closes — the
  # server comes up but the script hangs. Start-Process (no -Wait) detaches it;
  # the readiness poll below is what actually confirms the server is up.
  Start-Process -FilePath $pgCtl `
    -ArgumentList "-D", "`"$DataDir`"", "-o", "`"-p $PgPort`"", "-l", "`"$(Join-Path $LogDir 'postgres.log')`"", "start" `
    -WindowStyle Hidden | Out-Null
}

# Wait for it to genuinely ACCEPT CONNECTIONS, not merely to open the port —
# an early Prisma connect against a still-recovering server fails otherwise.
# pg_isready is the purpose-built probe: exit 0 only once the server will actually
# accept a connection, and it reports through its exit code instead of stderr.
$ready = $false
foreach ($i in 1..30) {
  cmd /c "`"$pgReady`" -h localhost -p $PgPort -U tennisai -d tennisai > nul 2>&1"
  if ($LASTEXITCODE -eq 0) { $ready = $true; Ok "accepting connections (${i}s)"; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { Fail "Postgres did not come up. See $LogDir\postgres.log"; exit 1 }

# --- 2. Migrations + API ---------------------------------------------------
Step "2/3  API (port $ApiPort)"
Push-Location (Join-Path $Root "server")
try {
  Info "applying any pending migrations..."
  # Run through cmd.exe and let IT do the redirection. Calling `npm ... 2>&1`
  # directly from PowerShell wraps every stderr line in a NativeCommandError —
  # Prisma prints a harmless boxed update notice on stderr, which would abort
  # the script under $ErrorActionPreference = "Stop" even though migrate
  # succeeded.
  $migrateLog = Join-Path $LogDir "migrate.log"
  cmd /c "npm run migrate:deploy > `"$migrateLog`" 2>&1"
  $migrateExit = $LASTEXITCODE
  Get-Content $migrateLog -ErrorAction SilentlyContinue |
    Select-String -Pattern "migrations found|No pending|Applying|following migration|Error:" |
    ForEach-Object { Info $_.Line.Trim() }
  if ($migrateExit -ne 0) { Fail "migrate deploy failed (exit $migrateExit) - not starting the API. See $migrateLog"; exit 1 }

  if (Test-Port $ApiPort) {
    Ok "already running"
  } else {
    # Own minimised window so it keeps running after this script exits.
    Start-Process -FilePath "cmd.exe" `
      -ArgumentList "/c", "npm start > `"$LogDir\api.log`" 2>&1" `
      -WorkingDirectory (Join-Path $Root "server") -WindowStyle Minimized | Out-Null
  }
} finally { Pop-Location }

$apiUp = $false
foreach ($i in 1..40) {
  try {
    $h = Invoke-RestMethod "http://localhost:$ApiPort/api/health" -TimeoutSec 2
    if ($h.ok) { $apiUp = $true; Ok "healthy (db: $($h.db)) (${i}s)"; break }
  } catch { }
  Start-Sleep -Seconds 1
}
if (-not $apiUp) { Fail "API did not become healthy. See $LogDir\api.log"; exit 1 }

# --- 3. Web (Vite) ---------------------------------------------------------
Step "3/3  Web (port $WebPort)"
if (Test-Port $WebPort) {
  Ok "already running"
} else {
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run dev > `"$LogDir\web.log`" 2>&1" `
    -WorkingDirectory $Root -WindowStyle Minimized | Out-Null
}

$webUp = $false
foreach ($i in 1..40) {
  try {
    if ((Invoke-WebRequest "http://localhost:$WebPort" -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200) {
      $webUp = $true; Ok "serving (${i}s)"; break
    }
  } catch { }
  Start-Sleep -Seconds 1
}
if (-not $webUp) { Fail "Vite did not start. See $LogDir\web.log"; exit 1 }

Write-Host ""
Write-Host "  Ready ->  http://localhost:$WebPort" -ForegroundColor Green
Write-Host ""
Write-Host "  Sign up at http://localhost:$WebPort/signup - your account is saved and" -ForegroundColor DarkGray
Write-Host "  will still be there next time you run this script." -ForegroundColor DarkGray
Write-Host "  Stop everything with Stop-TennisAI.bat.  Logs: $LogDir" -ForegroundColor DarkGray
Write-Host ""

if (-not $NoBrowser) { Start-Process "http://localhost:$WebPort" }
