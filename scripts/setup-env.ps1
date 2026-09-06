# Idempotent environment setup: Strawberry Perl + cpanm + Marpa::R2.
# Safe to run repeatedly; skips steps already satisfied.
$ErrorActionPreference = "Continue"

# Strawberry Perl lacks C.UTF-8; force C locale to silence perl's stderr warnings.
$env:LC_ALL = "C"
$env:LANG = "C"
$env:LC_CTYPE = "C"

function Fail([string]$msg) {
    Write-Host "ERROR: $msg" -ForegroundColor Red
    exit 1
}

$perlBinDir = "C:\Strawberry\perl\bin"
$perl = Join-Path $perlBinDir "perl.exe"

# 1. Strawberry Perl
if (-not (Test-Path $perl)) {
    Write-Host "Strawberry Perl not found at $perl. Installing via winget (may prompt for admin)..."
    winget install --id StrawberryPerl.StrawberryPerl -e --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { Fail "winget install failed (exit $LASTEXITCODE). May require admin rights." }
} else {
    Write-Host "Strawberry Perl found at $perl"
}
if (-not (Test-Path $perl)) { Fail "Strawberry Perl still not found at $perl after install." }

# Ensure Strawberry's perl and gcc are first on PATH for the build toolchain.
$env:Path = "$perlBinDir;C:\Strawberry\c\bin;$env:Path"

Write-Host "Perl version:"
& $perl --version | Select-Object -First 2 | ForEach-Object { Write-Host $_ }

# 2. cpanm (invoke the bundled fatpacked perl scripts directly, bypassing .bat wrappers
#    whose bare `perl` would otherwise resolve to a non-Strawberry perl on PATH).
$cpanmScript = Join-Path $perlBinDir "cpanm"
$cpanScript  = Join-Path $perlBinDir "cpan"
if (-not (Test-Path $cpanmScript)) {
    if (-not (Test-Path $cpanScript)) { Fail "cpan script not found at $cpanScript" }
    Write-Host "cpanm not found. Installing App::cpanminus..."
    & $perl $cpanScript App::cpanminus
    if ($LASTEXITCODE -ne 0) { Fail "cpan App::cpanminus failed (exit $LASTEXITCODE)" }
}
if (-not (Test-Path $cpanmScript)) { Fail "cpanm still not found at $cpanmScript" }

# 3. Marpa::R2
& $perl -MMarpa::R2 -e 'print qq(OK $Marpa::R2::VERSION\n)' 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Marpa::R2 already installed."
} else {
    Write-Host "Installing Marpa::R2 via cpanm (compiles libmarpa; several minutes)..."
    & $perl $cpanmScript --notest Marpa::R2
    if ($LASTEXITCODE -ne 0) { Fail "cpanm Marpa::R2 failed (exit $LASTEXITCODE)" }
}

# 4. Verification
$out = & $perl -MMarpa::R2 -e 'print qq(OK $Marpa::R2::VERSION\n)'
if ($LASTEXITCODE -ne 0) { Fail "Marpa::R2 verification failed" }
Write-Host "VERIFICATION PASSED: $out" -ForegroundColor Green
exit 0
