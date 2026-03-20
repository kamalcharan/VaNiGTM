# ═══════════════════════════════════════════════════════════════════
# CREATE TAG - Smart Release Tagger
# VaNi Product Framework
# ═══════════════════════════════════════════════════════════════════
# Usage: .\scripts\create-tag.ps1
# Usage: .\scripts\create-tag.ps1 -Notes "First working demo"
# ═══════════════════════════════════════════════════════════════════

param(
    [string]$Notes = ""
)

$ROOT_DIR = Get-Location
$productName = Split-Path $ROOT_DIR -Leaf

function Write-Header($text) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
}

function Write-OK($text) { Write-Host "    [OK] $text" -ForegroundColor Green }

Write-Header "CREATE RELEASE TAG — $productName"

# Detect version
$pkgJson = Join-Path $ROOT_DIR "package.json"
$version = "0.0.0"
if (Test-Path $pkgJson) {
    $pkg = Get-Content $pkgJson | ConvertFrom-Json
    $version = $pkg.version
}

# Find existing tags with this version
$existingTags = git tag -l "v$version*" 2>$null
$patchNum = 0
if ($existingTags) {
    $nums = $existingTags | ForEach-Object {
        if ($_ -match "v$version\.(\d+)$") { [int]$Matches[1] }
        elseif ($_ -eq "v$version") { 0 }
    }
    $patchNum = ($nums | Measure-Object -Maximum).Maximum + 1
}

if ($patchNum -eq 0) {
    $tagName = "v$version"
} else {
    $tagName = "v$version.$patchNum"
}

Write-Host "  Version: $version" -ForegroundColor Gray
Write-Host "  Tag: $tagName" -ForegroundColor White

# Check clean state
$status = git status --porcelain
if ($status) {
    Write-Host ""
    Write-Host "  WARNING: Uncommitted changes! Commit first for a clean release." -ForegroundColor Yellow
    $confirm = Read-Host "  Tag anyway? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") { exit 0 }
}

# Gather info
$branch = git branch --show-current
$commit = git rev-parse --short HEAD
$subCommit = ""
$subPath = Join-Path $ROOT_DIR "vani-base"
if (Test-Path $subPath) {
    Push-Location $subPath
    $subCommit = git rev-parse --short HEAD
    Pop-Location
}

# Count skills and recipes
$skillCount = 0
$recipeCount = 0
$skillsDir = Join-Path $ROOT_DIR "skills"
$recipesDir = Join-Path $ROOT_DIR "recipes"
if (Test-Path $skillsDir) {
    $skillCount = (Get-ChildItem $skillsDir -Directory | Where-Object { Test-Path (Join-Path $_.FullName "SKILL.md") }).Count
}
if (Test-Path $recipesDir) {
    $recipeCount = (Get-ChildItem $recipesDir -Filter "*.json").Count
}

$tagMsg = @"
Release: $tagName
Product: $productName v$version
Branch: $branch
Commit: $commit
VaNiBase: $subCommit
Skills: $skillCount
Recipes: $recipeCount
Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
$( if ($Notes) { "Notes: $Notes" } )
"@

# Create tag
git tag -a $tagName -m $tagMsg
Write-OK "Tag created: $tagName"

# Push
git push origin $tagName
Write-OK "Tag pushed"

Write-Host ""
Write-Host "  Release: $tagName ($skillCount skills, $recipeCount recipes)" -ForegroundColor Green
Write-Host ""

Read-Host "Press Enter to exit"
