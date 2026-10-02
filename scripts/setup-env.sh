#!/usr/bin/env bash
# Idempotent environment setup: perl + App::cpanminus + Marpa::R2.
# Safe to run repeatedly; skips steps already satisfied.
#
# Honors MARP_PERL to select a specific perl interpreter (default: `perl` on PATH).
# Unlike the Windows helper (scripts/setup-env.ps1), this does NOT install Perl for
# you — it detects a missing Perl/toolchain and prints distro-specific instructions.
set -euo pipefail

# Stable locale to silence Perl's "Setting locale failed" warnings on minimal systems.
export LC_ALL=C
export LANG=C
export LC_CTYPE=C

PERL="${MARP_PERL:-perl}"

fail() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

print_install_hint() {
    case "$(uname -s 2>/dev/null)" in
        Darwin)
            printf '  macOS:           brew install perl\n' >&2
            ;;
        *)
            printf '  Debian/Ubuntu:   sudo apt update && sudo apt install perl gcc make\n' >&2
            printf '  RHEL/Fedora:     sudo dnf install perl gcc make\n' >&2
            printf '  Arch:            sudo pacman -S perl gcc make\n' >&2
            ;;
    esac
}

# Locate a Perl tool script (cpanm / cpan). Prefers a command on PATH, falls back to
# common local-install dirs, and strips Windows `.bat`/`.cmd` wrappers (Git Bash) in
# favour of the extension-less Perl script that sits alongside them.
find_perltool() {
    local name="$1" c d
    c="$(command -v "$name" 2>/dev/null || true)"
    c="${c//\\//}"
    case "$c" in
        *.bat|*.cmd) c="${c%.*}" ;;
    esac
    if [[ -n "$c" && -f "$c" ]]; then
        printf '%s\n' "$c"
        return 0
    fi
    for d in "$HOME/perl5/bin" "$HOME/bin" "$HOME/.cpanm/bin" "/usr/local/bin" "/opt/homebrew/bin"; do
        if [[ -x "$d/$name" ]]; then
            printf '%s\n' "$d/$name"
            return 0
        fi
    done
    return 1
}

# ---- 1. Perl ---------------------------------------------------------------
if ! command -v "$PERL" >/dev/null 2>&1; then
    if [[ -n "${MARP_PERL:-}" ]]; then
        fail "MARP_PERL is set to '$MARP_PERL' but no such interpreter was found on PATH."
    fi
    printf 'perl not found on PATH.\n' >&2
    printf 'Install Perl and a C toolchain (needed to compile Marpa::R2) with your package\n' >&2
    printf 'manager, then re-run this script. For example:\n' >&2
    print_install_hint
    exit 1
fi
printf 'Using perl: %s\n' "$PERL"
"$PERL" -v 2>&1 | sed -n '1,2p' || true

# ---- 2. cpanm (App::cpanminus) ---------------------------------------------
CPANM_SCRIPT="$(find_perltool cpanm || true)"
if [[ -z "$CPANM_SCRIPT" ]]; then
    CPAN_SCRIPT="$(find_perltool cpan || true)"
    [[ -n "$CPAN_SCRIPT" ]] || fail "Neither cpanm nor cpan found. Reinstall Perl (which ships cpan) and retry."
    printf 'cpanm not found. Installing App::cpanminus via cpan...\n'
    "$PERL" "$CPAN_SCRIPT" App::cpanminus \
        || fail "cpan App::cpanminus failed. Retry with: sudo cpan App::cpanminus"
    CPANM_SCRIPT="$(find_perltool cpanm || true)"
    [[ -n "$CPANM_SCRIPT" ]] || fail "cpanm still not found after install. Add its bin dir (~/perl5/bin) to PATH and retry."
fi
printf 'Using cpanm: %s\n' "$CPANM_SCRIPT"

# ---- 3. Marpa::R2 ----------------------------------------------------------
if "$PERL" -MMarpa::R2 -e 'print "OK $Marpa::R2::VERSION\n"' >/dev/null 2>&1; then
    printf 'Marpa::R2 already installed.\n'
else
    printf 'Installing Marpa::R2 via cpanm (compiles libmarpa; several minutes)...\n'
    "$PERL" "$CPANM_SCRIPT" --notest Marpa::R2 \
        || fail "cpanm Marpa::R2 failed. Ensure a C toolchain (gcc + make) is installed (see hint above) and retry."
fi

# ---- 4. Verification --------------------------------------------------------
out="$("$PERL" -MMarpa::R2 -e 'print "OK $Marpa::R2::VERSION\n"' 2>&1)" \
    || fail "Marpa::R2 verification failed: $out"
printf 'VERIFICATION PASSED: %s\n' "$out"
exit 0