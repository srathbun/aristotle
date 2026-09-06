# Idempotent dev-install: typecheck, register the extension in omp config, verify.
# Uses the `extensions:` config mechanism (documented in extension-loading.md) because
# `omp plugin link` requires Windows symlink privilege (Developer Mode) that may be absent.
$ErrorActionPreference = "Continue"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$pkg = Get-Content "package.json" | ConvertFrom-Json
$version = $pkg.version
$configPath = Join-Path $env:USERPROFILE ".omp\agent\config.yml"
$repoEntry = $repoRoot -replace '\\', '/'

# 1. Build check
Write-Host "Build check (tsc --noEmit)..."
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: typecheck failed" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $configPath)) { Write-Host "ERROR: $configPath not found" -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $repoRoot "src\extension.ts"))) {
    Write-Host "ERROR: src/extension.ts missing" -ForegroundColor Red; exit 1
}

$lines = New-Object System.Collections.Generic.List[string]
foreach ($l in (Get-Content $configPath)) { $lines.Add($l) }

$already = $false
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match [regex]::Escape($repoEntry)) { $already = $true; break }
}

if ($already) {
    Write-Host "existing installation detected"
    Write-Host "removing/replacing..."
} else {
    Write-Host "no existing installation detected"
}

# Strip any existing top-level extensions: block, then append a canonical one.
$keep = New-Object System.Collections.Generic.List[string]
$inExt = $false
foreach ($l in $lines) {
    if ($l -match '^extensions\s*:') { $inExt = $true; continue }
    if ($inExt -and $l -match '^\s+-\s+') { continue }
    if ($inExt -and $l -match '^\S') { $inExt = $false }
    $keep.Add($l)
}
if ($keep.Count -gt 0 -and $keep[$keep.Count - 1] -ne "") { $keep.Add("") }
$keep.Add("extensions:")
$keep.Add("  - $repoEntry")

[System.IO.File]::WriteAllLines($configPath, $keep.ToArray(), (New-Object System.Text.UTF8Encoding($false)))

# Verify
$final = Get-Content $configPath -Raw
if ($final -notmatch [regex]::Escape($repoEntry)) {
    Write-Host "ERROR: verification failed - entry not present after write" -ForegroundColor Red
    exit 1
}

Write-Host "installed version $version"
Write-Host "verification passed" -ForegroundColor Green
exit 0
