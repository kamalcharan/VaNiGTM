# ═══════════════════════════════════════════════════════════════════
# PULL SAFE - Pull all repos safely without unexpected updates
# VaNi Product Framework
# ═══════════════════════════════════════════════════════════════════
# Usage: .\scripts\pull-safe.ps1
# Usage: .\scripts\pull-safe.ps1 -UpdateSubmodule   # Also pull latest vani-base
# ═══════════════════════════════════════════════════════════════════

param(
    [switch]$UpdateSubmodule = $false
)

$ErrorActionPreference = "Continue"
$ROOT_DIR = Get-Location

function Write-Header($text) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
}

function Write-OK($text) { Write-Host "    [OK] $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "    [WARN] $text" -ForegroundColor Yellow }
function Write-Err($text) { Write-Host "    [ERROR] $text" -ForegroundColor Red }

Write-Header "PULL SAFE — VaNi Product"
Write-Host "  Root: $ROOT_DIR" -ForegroundColor Gray
Write-Host "  Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray

# Step 1: Check for uncommitted changes
Write-Host ""
Write-Host "  Step 1: Checking local state..." -ForegroundColor Yellow

$status = git status --porcelain
if ($status) {
    Write-Warn "You have uncommitted changes:"
    Write-Host $status -ForegroundColor Gray
    Write-Host ""
    $confirm = Read-Host "  Continue pull? Changes will NOT be lost but may cause merge conflicts (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "  Aborted." -ForegroundColor Red
        exit 0
    }
}

# Step 2: Pull product repo
Write-Host ""
Write-Host "  Step 2: Pulling product repo..." -ForegroundColor Yellow

git fetch origin main 2>$null
$behind = git rev-list --count "HEAD..origin/main" 2>$null
$ahead = git rev-list --count "origin/main..HEAD" 2>$null

if ([int]$behind -eq 0) {
    Write-OK "Already up to date"
} else {
    Write-Host "    $behind commit(s) to pull" -ForegroundColor Gray
    git pull origin main --no-rebase
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Pulled $behind commit(s)"
    } else {
        Write-Err "Pull failed — resolve conflicts manually"
        exit 1
    }
}

if ([int]$ahead -gt 0) {
    Write-Warn "You are $ahead commit(s) ahead of origin. Run push-main.ps1 when ready."
}

# Step 3: Submodule
Write-Host ""
Write-Host "  Step 3: Submodule (vani-base)..." -ForegroundColor Yellow

$subPath = Join-Path $ROOT_DIR "vani-base"
if (-not (Test-Path $subPath)) {
    Write-Warn "vani-base/ not found — initializing submodule"
    git submodule update --init --recursive
} else {
    # Restore submodule to tracked commit (safe default)
    git submodule update --init
    Write-OK "vani-base restored to tracked commit"

    if ($UpdateSubmodule) {
        Write-Host "    Pulling latest vani-base from origin..." -ForegroundColor Gray
        Push-Location $subPath
        git checkout main 2>$null
        git pull origin main
        Pop-Location

        $subChanged = git diff --name-only | Select-String "vani-base"
        if ($subChanged) {
            Write-Warn "vani-base updated to latest. Review changes before committing:"
            Write-Host "    git diff vani-base" -ForegroundColor Gray
            Write-Host "    git add vani-base && git commit -m 'Update VaNiBase'" -ForegroundColor Gray
        } else {
            Write-OK "vani-base already at latest"
        }
    } else {
        Write-Host "    To pull latest framework: .\scripts\pull-safe.ps1 -UpdateSubmodule" -ForegroundColor Gray
    }
}

# Step 4: Verify dependencies
Write-Host ""
Write-Host "  Step 4: Checking dependencies..." -ForegroundColor Yellow

if (-not (Test-Path (Join-Path $ROOT_DIR "node_modules"))) {
    Write-Warn "node_modules missing — run: npm run install:all"
} else {
    Write-OK "Dependencies present"
}

Write-Host ""
Write-Header "PULL COMPLETE"
Write-Host ""
Read-Host "Press Enter to exit"
