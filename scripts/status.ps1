# ═══════════════════════════════════════════════════════════════════
# STATUS - Quick status check across product + submodule
# VaNi Product Framework
# ═══════════════════════════════════════════════════════════════════
# Usage: .\scripts\status.ps1
# ═══════════════════════════════════════════════════════════════════

$ROOT_DIR = Get-Location
$productName = Split-Path $ROOT_DIR -Leaf

function Write-Header($text) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
}

Write-Header "STATUS — $productName"

# Product repo
Write-Host ""
Write-Host "  Product repo:" -ForegroundColor Yellow
$branch = git branch --show-current
$commit = git rev-parse --short HEAD
$status = git status --porcelain
$uncommitted = if ($status) { ($status -split "`n").Count } else { 0 }

Write-Host "    Branch: $branch" -ForegroundColor White
Write-Host "    Commit: $commit" -ForegroundColor Gray

git fetch origin main 2>$null
$behind = git rev-list --count "HEAD..origin/main" 2>$null
$ahead = git rev-list --count "origin/main..HEAD" 2>$null

if ([int]$behind -gt 0) { Write-Host "    Behind origin: $behind commit(s)" -ForegroundColor Yellow }
if ([int]$ahead -gt 0) { Write-Host "    Ahead of origin: $ahead commit(s)" -ForegroundColor Yellow }
if ($uncommitted -gt 0) { Write-Host "    Uncommitted: $uncommitted file(s)" -ForegroundColor Red }
if ($uncommitted -eq 0 -and [int]$behind -eq 0 -and [int]$ahead -eq 0) {
    Write-Host "    Clean and up to date" -ForegroundColor Green
}

# Submodule
$subPath = Join-Path $ROOT_DIR "vani-base"
if (Test-Path $subPath) {
    Write-Host ""
    Write-Host "  Submodule (vani-base):" -ForegroundColor Yellow
    Push-Location $subPath

    $subBranch = git branch --show-current
    $subCommit = git rev-parse --short HEAD
    $subStatus = git status --porcelain
    $subUncommitted = if ($subStatus) { ($subStatus -split "`n").Count } else { 0 }

    Write-Host "    Branch: $subBranch" -ForegroundColor White
    Write-Host "    Commit: $subCommit" -ForegroundColor Gray

    git fetch origin main 2>$null
    $subBehind = git rev-list --count "HEAD..origin/main" 2>$null

    if ([int]$subBehind -gt 0) {
        Write-Host "    Framework updates available: $subBehind commit(s)" -ForegroundColor Yellow
        Write-Host "    Pull with: .\scripts\pull-safe.ps1 -UpdateSubmodule" -ForegroundColor Gray
    } else {
        Write-Host "    Up to date with origin" -ForegroundColor Green
    }

    if ($subUncommitted -gt 0) {
        Write-Host "    WARNING: $subUncommitted uncommitted file(s) in submodule!" -ForegroundColor Red
    }

    Pop-Location
}

# Claude Code branches
Write-Host ""
Write-Host "  Claude Code branches:" -ForegroundColor Yellow
$claudeBranches = git branch -r 2>$null | Select-String "claude/"
if ($claudeBranches) {
    foreach ($b in $claudeBranches) {
        $bName = $b.ToString().Trim()
        $lastMsg = git log -1 --format="%h %s" $bName 2>$null
        Write-Host "    $bName" -ForegroundColor White
        Write-Host "      $lastMsg" -ForegroundColor Gray
    }
    Write-Host "    Merge with: .\scripts\merge-claude-branch.ps1" -ForegroundColor Gray
} else {
    Write-Host "    None" -ForegroundColor Gray
}

# Skills and recipes
$skillsDir = Join-Path $ROOT_DIR "skills"
$recipesDir = Join-Path $ROOT_DIR "recipes"
if (Test-Path $skillsDir) {
    Write-Host ""
    Write-Host "  Skills:" -ForegroundColor Yellow
    Get-ChildItem $skillsDir -Directory | ForEach-Object {
        $hasHandlers = Test-Path (Join-Path $_.FullName "functions")
        $icon = if ($hasHandlers) { "[OK]" } else { "[--]" }
        $color = if ($hasHandlers) { "Green" } else { "Gray" }
        Write-Host "    $icon $($_.Name)" -ForegroundColor $color
    }
}
if (Test-Path $recipesDir) {
    $recipeCount = (Get-ChildItem $recipesDir -Filter "*.json").Count
    Write-Host ""
    Write-Host "  Recipes: $recipeCount" -ForegroundColor Yellow
}

# Server check
Write-Host ""
Write-Host "  Server:" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "    API: Running (port 3001)" -ForegroundColor Green
} catch {
    Write-Host "    API: Not running" -ForegroundColor Gray
}
try {
    $null = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "    Shell: Running (port 3000)" -ForegroundColor Green
} catch {
    Write-Host "    Shell: Not running" -ForegroundColor Gray
}

Write-Host ""
Read-Host "Press Enter to exit"
