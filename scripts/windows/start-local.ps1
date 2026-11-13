# MFin OS - local dev launcher (Windows PowerShell)
# Usage (from repo root):  powershell -ExecutionPolicy Bypass -File scripts\windows\start-local.ps1
#   or double-click start-local.cmd in the repo root.
#   -Ci   run the full check suite (pnpm run ci) instead of starting the dev server:
#         powershell -ExecutionPolicy Bypass -File scripts\windows\start-local.ps1 -Ci
#         or: start-local.cmd -Ci
# Mode is controlled by apps\web\.env.local (AUTH_MODE=mock by default).
param([switch]$Ci, [switch]$Production)
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found. Install Node 22 LTS first:  winget install OpenJS.NodeJS.LTS" -ForegroundColor Red
  exit 1
}
$major = [int]((node -v).TrimStart('v').Split('.')[0])
if ($major -lt 22) { Write-Host "Node $(node -v) is too old; need >= 22." -ForegroundColor Red; exit 1 }

# Use pnpm through corepack without "corepack enable" (that needs admin rights
# to write into C:\Program Files\nodejs). 
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
# registry.npmjs.org is very slow from here; use the npmmirror registry for both
# corepack (pnpm itself) and dependency install. Lockfile integrity hashes are
# still verified. Set $env:MFIN_REGISTRY to override (e.g. https://registry.npmjs.org).
$registry = if ($env:MFIN_REGISTRY) { $env:MFIN_REGISTRY } else { "https://registry.npmmirror.com" }
$env:COREPACK_NPM_REGISTRY = $registry
$env:npm_config_registry = $registry
$env:pnpm_config_registry = $registry
Write-Host "Registry: $registry" -ForegroundColor DarkGray
function pn { corepack pnpm @args; if ($LASTEXITCODE -ne 0) { throw "pnpm $args failed ($LASTEXITCODE)" } }
Write-Host "pnpm version: $(corepack pnpm -v)" -ForegroundColor Cyan

# Always run: a no-op when node_modules is already complete, and it repairs a
# partial install left by an interrupted earlier run.
Write-Host "Installing / verifying dependencies..." -ForegroundColor Cyan
pn install --frozen-lockfile --registry=$registry

if ($Ci) {
  Write-Host "Running full checks (pnpm run ci)..." -ForegroundColor Cyan
  pn run ci
  Write-Host "All checks passed." -ForegroundColor Green
  exit 0
}

# No AUTH_MODE line (the real Supabase setup) must not crash: Select-String then returns $null.
$modeMatch = Select-String -Path "apps\web\.env.local" -Pattern '^AUTH_MODE=(.*)$' -ErrorAction SilentlyContinue | Select-Object -First 1
$mode = if ($modeMatch) { $modeMatch.Matches[0].Groups[1].Value } else { $null }
if (-not $mode) { $mode = "supabase (real account)" }
if ($Production) {
  if ($mode -eq "mock") { throw "Production mode requires real Supabase configuration; AUTH_MODE=mock is development only." }
  Write-Host "Building the app once for daily use (no on-demand page compilation)..." -ForegroundColor Cyan
  pn run build
  Write-Host "Starting production server on http://localhost:3000" -ForegroundColor Green
  Start-Job { Start-Sleep 3; Start-Process "http://localhost:3000" } | Out-Null
  pn --dir apps/web start
  exit 0
}
Write-Host "Starting dev server on http://localhost:3000  [AUTH_MODE: $mode]" -ForegroundColor Green
Start-Job { Start-Sleep 8; Start-Process "http://localhost:3000" } | Out-Null
pn run dev
