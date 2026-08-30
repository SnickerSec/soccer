#!/usr/bin/env bash
# Keep every installed copy of roster-polish identical.
# The project's .claude/skills copy is the single source of truth.
#
# Targets:
#   <repo>/.agents/skills/...   Antigravity
#   ~/.claude/skills/...        user-level Claude Code install, which SHADOWS the
#                               project copy — a stale one there silently
#                               overrides every edit made in the repo
#
#   sync-skill.sh           copy source -> every target that applies
#   sync-skill.sh --check   report drift, exit 1 if any (CI / pre-commit safe)
set -euo pipefail

SKILL_NAME="roster-polish"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
SRC="$REPO_ROOT/.claude/skills/$SKILL_NAME"

# The user-level copy is synced only when it already exists: creating one
# unbidden would put a project-specific skill in every other project.
TARGETS=("$REPO_ROOT/.agents/skills/$SKILL_NAME")
GLOBAL="$HOME/.claude/skills/$SKILL_NAME"
[[ -d "$GLOBAL" ]] && TARGETS+=("$GLOBAL")

if [[ ! -d "$SRC" ]]; then
    echo "❌ Source skill not found: $SRC" >&2
    exit 2
fi

pretty() { echo "${1/#$HOME/\~}"; }

if [[ "${1:-}" == "--check" ]]; then
    drift=0
    for dst in "${TARGETS[@]}"; do
        if [[ ! -d "$dst" ]]; then
            echo "❌ missing:  $(pretty "$dst")"; drift=1; continue
        fi
        if diff -r "$SRC" "$dst" >/dev/null 2>&1; then
            echo "✅ in sync:  $(pretty "$dst")"
        else
            echo "❌ DRIFTED:  $(pretty "$dst")"
            diff -rq "$SRC" "$dst" 2>&1 | sed 's/^/     /' || true
            drift=1
        fi
    done
    if (( drift )); then
        echo
        echo "Fix with: bash .claude/skills/$SKILL_NAME/scripts/sync-skill.sh"
        exit 1
    fi
    echo "All copies match the source of truth."
    exit 0
fi

for dst in "${TARGETS[@]}"; do
    mkdir -p "$dst"
    rm -rf "${dst:?}/"*
    cp -R "$SRC/." "$dst/"
    if diff -r "$SRC" "$dst" >/dev/null 2>&1; then
        echo "✅ synced:   $(pretty "$dst")"
    else
        echo "❌ sync failed to converge: $(pretty "$dst")" >&2
        exit 1
    fi
done
echo "Source of truth: .claude/skills/$SKILL_NAME"
