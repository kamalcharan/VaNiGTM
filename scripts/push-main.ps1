# ═══════════════════════════════════════════════════════════════════
# PUSH MAIN - Push all changes to main branches (Release workflow)
# VaNi Product Framework — KI-Prime Edition
# ═══════════════════════════════════════════════════════════════════
# Usage: .\scripts\push-main.ps1
# Usage: .\scripts\push-main.ps1 -Message "feat: add alert-skill"
# Usage: .\scripts\push-main.ps1 -Force
# ═══════════════════════════════════════════════════════════════════

param(
    [string]$Message = "",
    [switch]$Force = $false
)

$ErrorActionPreference = "Continue"

# Auto-detect root from script location
$ROOT_DIR = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $ROOT_DIR ".gitmodules"))) {
    $ROOT_DIR = Get-Location
}

$submodules = @(
    @{ Name = "vani-base"; Branch = "main" }
)

$pushed = @()
$skipped = @()
$errors = @()

function Write-Header($text) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
}

function Write-Step($step, $text) {
    Write-Host ""
    Write-Host "  STEP $step : $text" -ForegroundColor Yellow
    Write-Host "  ───────────────────────────────────────────────────────────" -ForegroundColor DarkGray
}

function Write-OK($text) { Write-Host "    [OK] $text" -ForegroundColor Green }
function Write-Skip($text) { Write-Host "    [SKIP] $text" -ForegroundColor Gray; $script:skipped += $text }
function Write-Err($text) { Write-Host "    [ERROR] $text" -ForegroundColor Red; $script:errors += $text }

function Get-CommitMsg($repoName) {
    if ($Message) { return $Message }
    return "chore: update $repoName"
}

function Push-Repo($path, $name, $branch) {
    Push-Location $path

    $currentBranch = git branch --show-current
    if ($currentBranch -ne $branch) {
        Write-Host "    Switching from $currentBranch to $branch..." -ForegroundColor Gray
        git checkout $branch 2>$null
        if ($LASTEXITCODE -ne 0) { Write-Err "$name : Failed to checkout $branch"; Pop-Location; return $false }
    }

    git pull origin $branch 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Err "$name : Failed to pull $branch"; Pop-Location; return $false }

    $status = git status --porcelain
    if (-not $status) { Write-Skip "$name : No changes"; Pop-Location; return $true }

    git add .
    git commit -m (Get-CommitMsg $name)
    if ($LASTEXITCODE -ne 0) { Write-Err "$name : Failed to commit"; Pop-Location; return $false }

    git push origin $branch
    if ($LASTEXITCODE -ne 0) { Write-Err "$name : Failed to push"; Pop-Location; return $false }

    Write-OK "$name : Pushed to $branch"
    $script:pushed += $name
    Pop-Location
    return $true
}

# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

Set-Location $ROOT_DIR

Write-Header "PUSH TO MAIN — VaNi Release Workflow"
Write-Host "  Root: $ROOT_DIR" -ForegroundColor Gray
Write-Host "  Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray

# Safety checks
$localChanges = git status --porcelain
$hasLocal = $localChanges.Length -gt 0

git fetch origin main 2>$null
$behind = git rev-list --count "HEAD..origin/main" 2>$null
$isAhead = [int]$behind -gt 0

if ($hasLocal -and $isAhead -and -not $Force) {
    Write-Host ""
    Write-Host "  CONFLICT RISK: Local changes + remote is $behind commit(s) ahead" -ForegroundColor Red
    Write-Host "  Commit first, or use -Force to override." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Confirmation
Write-Host ""
$confirm = Read-Host "  Push to main? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") { Write-Host "  Aborted." -ForegroundColor Red; exit 0 }

# Step 1: Push submodule (vani-base)
Write-Step 1 "Checking submodule (vani-base)"

foreach ($sub in $submodules) {
    $subPath = Join-Path $ROOT_DIR $sub.Name
    if (-not (Test-Path $subPath)) { Write-Skip "$($sub.Name): not found"; continue }

    Push-Location $subPath
    $subStatus = git status --porcelain
    if ($subStatus) {
        Write-Host "    vani-base has uncommitted changes — push separately via VaNiBase repo" -ForegroundColor Yellow
    } else {
        Write-OK "vani-base: clean"
    }
    Pop-Location
}

# Step 2: Push product repo
Write-Step 2 "Pushing product repo"

Set-Location $ROOT_DIR
Push-Repo $ROOT_DIR (Split-Path $ROOT_DIR -Leaf) "main"

# Step 3: Update submodule reference
Write-Step 3 "Updating submodule reference"

$subChanged = git diff --name-only | Select-String "vani-base"
if ($subChanged) {
    git add vani-base
    git commit -m "chore: update vani-base submodule reference"
    git push origin main
    Write-OK "Submodule reference updated"
} else {
    Write-Skip "Submodule reference unchanged"
}

# Summary
Write-Header "PUSH COMPLETE"
if ($pushed.Count -gt 0) { Write-Host "  Pushed: $($pushed -join ', ')" -ForegroundColor Green }
if ($skipped.Count -gt 0) { Write-Host "  Skipped: $($skipped -join ', ')" -ForegroundColor Gray }
if ($errors.Count -gt 0) { Write-Host "  Errors: $($errors -join ', ')" -ForegroundColor Red }

Write-Host ""
Read-Host "Press Enter to exit"
