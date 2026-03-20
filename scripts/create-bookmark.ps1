# ═══════════════════════════════════════════════════════════════════
# CREATE BOOKMARK - Tag stable state across product + submodule
# VaNi Product Framework
# ═══════════════════════════════════════════════════════════════════
# Usage: .\scripts\create-bookmark.ps1
# Usage: .\scripts\create-bookmark.ps1 -Name "pre-alert-skill"
# ═══════════════════════════════════════════════════════════════════

param(
    [string]$Name = ""
)

$ROOT_DIR = Get-Location
$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$productName = Split-Path $ROOT_DIR -Leaf

if ($Name) {
    $tagName = "bookmark/$Name"
} else {
    $tagName = "bookmark/$timestamp"
}

function Write-Header($text) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
}

function Write-OK($text) { Write-Host "    [OK] $text" -ForegroundColor Green }
function Write-Err($text) { Write-Host "    [ERROR] $text" -ForegroundColor Red }

Write-Header "CREATE BOOKMARK — $productName"
Write-Host "  Tag: $tagName" -ForegroundColor Gray

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host ""
    Write-Host "  WARNING: You have uncommitted changes!" -ForegroundColor Yellow
    Write-Host $status -ForegroundColor Gray
    $confirm = Read-Host "  Bookmark anyway? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "  Aborted. Commit first." -ForegroundColor Red
        exit 0
    }
}

# Capture submodule state
$subPath = Join-Path $ROOT_DIR "vani-base"
$subCommit = ""
if (Test-Path $subPath) {
    Push-Location $subPath
    $subCommit = git rev-parse HEAD
    Pop-Location
}

# Build tag message
$currentCommit = git rev-parse HEAD
$branch = git branch --show-current
$msg = @"
Bookmark: $tagName
Product: $productName
Branch: $branch
Product commit: $currentCommit
VaNiBase commit: $subCommit
Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"@

# Create annotated tag
git tag -a $tagName -m $msg
if ($LASTEXITCODE -eq 0) {
    Write-OK "Tag created: $tagName"
} else {
    Write-Err "Failed to create tag"
    exit 1
}

# Push tag
git push origin $tagName 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-OK "Tag pushed to origin"
} else {
    Write-Host "    Tag created locally. Push with: git push origin $tagName" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  To restore this state later:" -ForegroundColor Gray
Write-Host "    git checkout $tagName" -ForegroundColor White
Write-Host "    git submodule update --init" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to exit"
