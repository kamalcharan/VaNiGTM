# ═══════════════════════════════════════════════════════════════════
# MERGE CLAUDE BRANCH - Merge Claude Code work to main and push
# VaNi Product Framework
# ═══════════════════════════════════════════════════════════════════
# Usage: .\scripts\merge-claude-branch.ps1
# Usage: .\scripts\merge-claude-branch.ps1 -Branch "claude/implement-alert-skill-xyz"
# ═══════════════════════════════════════════════════════════════════

param(
    [string]$Branch = ""
)

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

Write-Header "MERGE CLAUDE CODE BRANCH"

# Fetch all branches
git fetch origin 2>$null

# Find Claude branches if not specified
if (-not $Branch) {
    Write-Host ""
    Write-Host "  Available Claude Code branches:" -ForegroundColor Yellow
    $claudeBranches = git branch -r | Select-String "claude/" | ForEach-Object { $_.ToString().Trim() }

    if ($claudeBranches.Count -eq 0) {
        Write-Host "    No Claude Code branches found." -ForegroundColor Gray
        Read-Host "Press Enter to exit"
        exit 0
    }

    $i = 1
    foreach ($b in $claudeBranches) {
        $lastCommit = git log -1 --format="%h %s" $b
        Write-Host "    $i. $b" -ForegroundColor White
        Write-Host "       $lastCommit" -ForegroundColor Gray
        $i++
    }

    Write-Host ""
    $selection = Read-Host "  Select branch number (or 'q' to quit)"
    if ($selection -eq 'q') { exit 0 }

    $idx = [int]$selection - 1
    if ($idx -lt 0 -or $idx -ge $claudeBranches.Count) {
        Write-Err "Invalid selection"
        exit 1
    }

    $Branch = $claudeBranches[$idx]
}

Write-Host ""
Write-Host "  Merging: $Branch → main" -ForegroundColor Yellow

# Show what's being merged
Write-Host ""
Write-Host "  Changes in this branch:" -ForegroundColor Gray
git log main..$Branch --oneline 2>$null
Write-Host ""

$confirm = Read-Host "  Proceed with merge? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "  Aborted." -ForegroundColor Red
    exit 0
}

# Checkout main
git checkout main 2>$null
git pull origin main 2>$null

# Merge
git merge $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Err "Merge conflict! Resolve manually, then:"
    Write-Host "    git add ." -ForegroundColor Gray
    Write-Host "    git commit" -ForegroundColor Gray
    Write-Host "    git push origin main" -ForegroundColor Gray
    Read-Host "Press Enter to exit"
    exit 1
}

Write-OK "Merged successfully"

# Push
git push origin main
if ($LASTEXITCODE -eq 0) {
    Write-OK "Pushed to main"
} else {
    Write-Err "Push failed"
    exit 1
}

# Offer to delete the branch
Write-Host ""
$delConfirm = Read-Host "  Delete the Claude branch? (y/N)"
if ($delConfirm -eq "y" -or $delConfirm -eq "Y") {
    git branch -d ($Branch -replace "origin/", "") 2>$null
    git push origin --delete ($Branch -replace "origin/", "") 2>$null
    Write-OK "Branch deleted"
}

Write-Host ""
Write-Header "MERGE COMPLETE"
Write-Host ""
Read-Host "Press Enter to exit"
