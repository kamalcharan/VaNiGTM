# ═══════════════════════════════════════════════════════════════════
# CREATE FEATURE BRANCH - Create branch in product repo
# VaNi Product Framework
# ═══════════════════════════════════════════════════════════════════
# Usage: .\scripts\create-feature-branch.ps1 -BranchName "feature/alert-skill"
# ═══════════════════════════════════════════════════════════════════

param(
    [Parameter(Mandatory=$true)]
    [string]$BranchName
)

$ROOT_DIR = Get-Location

function Write-Header($text) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
}

function Write-OK($text) { Write-Host "    [OK] $text" -ForegroundColor Green }
function Write-Err($text) { Write-Host "    [ERROR] $text" -ForegroundColor Red }

Write-Header "CREATE FEATURE BRANCH — $BranchName"

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host ""
    Write-Host "  WARNING: Uncommitted changes detected!" -ForegroundColor Yellow
    Write-Host $status -ForegroundColor Gray
    Write-Host ""
    $confirm = Read-Host "  Stash changes before branching? (y/N)"
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        git stash push -m "Auto-stash before $BranchName"
        Write-OK "Changes stashed"
    }
}

# Ensure we're on main and up to date
git checkout main 2>$null
git pull origin main 2>$null

# Create and switch to feature branch
git checkout -b $BranchName
if ($LASTEXITCODE -eq 0) {
    Write-OK "Branch created: $BranchName"
} else {
    Write-Err "Failed to create branch"
    exit 1
}

# Push branch to origin
git push -u origin $BranchName
if ($LASTEXITCODE -eq 0) {
    Write-OK "Branch pushed to origin"
} else {
    Write-Host "    Push with: git push -u origin $BranchName" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  You're now on: $BranchName" -ForegroundColor Green
Write-Host "  vani-base/ submodule stays on its current commit (unchanged)" -ForegroundColor Gray
Write-Host ""
Write-Host "  When done, merge back:" -ForegroundColor Gray
Write-Host "    git checkout main" -ForegroundColor White
Write-Host "    git merge $BranchName" -ForegroundColor White
Write-Host "    git push origin main" -ForegroundColor White
Write-Host "    git branch -d $BranchName" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to exit"
