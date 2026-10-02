#!/usr/bin/env bash
# Idempotent dev-install: typecheck, register the extension in omp config, verify.
# Ensures this repo's absolute path is listed under the `extensions:` key in the omp
# agent config (unlike the Windows helper, which replaces the whole block, this only
# adds the entry if it is missing so other registered extensions are preserved).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# Normalize Windows backslashes (Git Bash) to forward slashes to match the config
# convention also produced by the PowerShell helper (e.g. `F:/aristotle`).
REPO_ROOT="${REPO_ROOT//\\//}"
CONFIG_PATH="${HOME}/.omp/agent/config.yml"

# 1. Build check
printf 'Build check (tsc --noEmit)...\n'
npx tsc --noEmit || { printf 'ERROR: typecheck failed\n' >&2; exit 1; }

if [[ ! -f "$CONFIG_PATH" ]]; then
    printf 'ERROR: %s not found\n' "$CONFIG_PATH" >&2
    exit 1
fi
if [[ ! -f "$REPO_ROOT/src/extension.ts" ]]; then
    printf 'ERROR: %s/src/extension.ts missing\n' "$REPO_ROOT" >&2
    exit 1
fi

# Exit 0 when REPO_ROOT is already a list item under a top-level `extensions:` key.
is_listed() {
    awk -v entry="$REPO_ROOT" '
        /^extensions[[:space:]]*:/ { in_ext = 1; next }
        in_ext && /^[^[:space:]]/ { in_ext = 0 }
        in_ext && /^[[:space:]]*-[[:space:]]/ {
            item = $0
            sub(/^[[:space:]]*-[[:space:]]*/, "", item)
            if (item == entry) found = 1
        }
        END { exit (found ? 0 : 1) }
    ' "$CONFIG_PATH"
}

if is_listed; then
    printf 'existing installation detected; already registered.\n'
else
    printf 'no existing installation detected; adding %s\n' "$REPO_ROOT"

    tmp="$(mktemp "${TMPDIR:-/tmp}/omp-config.XXXXXX")"
    trap 'rm -f "$tmp"' EXIT

    # Add the entry to an existing top-level extensions block, or append a new block.
    awk -v entry="$REPO_ROOT" '
        /^extensions[[:space:]]*:/ {
            saw_ext = 1
            print
            print "  - " entry
            next
        }
        { print }
        END {
            if (saw_ext == 0) {
                if (NR > 0) print ""
                print "extensions:"
                print "  - " entry
            }
        }
    ' "$CONFIG_PATH" > "$tmp"

    mv "$tmp" "$CONFIG_PATH"
    trap - EXIT
fi

# Verify
if ! is_listed; then
    printf 'ERROR: verification failed - entry not present after write\n' >&2
    exit 1
fi
printf 'verification passed\n'
exit 0