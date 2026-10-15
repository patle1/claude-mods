#!/bin/bash
# Installs this kit in a Claude Code cloud session: the mods into
# /root/claude-mods, the savvy-flow skill and the savvy agents into ~/.claude.
# CLAUDE_MODS_TOKEN is only needed for a private fork. Never fails the
# session: on an error it says so and exits 0.
set -u

REPO="${CLAUDE_MODS_REPO:-patle1/claude-mods}"
REF="${CLAUDE_MODS_REF:-main}"
BASE="${CLAUDE_MODS_BASE:-https://raw.githubusercontent.com/$REPO/$REF}"
DEST="${CLAUDE_MODS_DIR:-/root/claude-mods}"
CONFIG="${HOME:-/root}/.claude"

fetch() {
  if [ -n "${CLAUDE_MODS_TOKEN:-}" ]; then
    curl -fsSL --retry 3 -H "Authorization: Bearer $CLAUDE_MODS_TOKEN" "$BASE/$1" -o "$2"
  else
    curl -fsSL --retry 3 "$BASE/$1" -o "$2"
  fi
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

if ! fetch FILES "$tmp/FILES"; then
  echo "claude-mods: could not read $BASE/FILES" >&2
  exit 0
fi

while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in /* | *..*) continue ;; esac
  mkdir -p "$tmp/kit/$(dirname "$f")"
  if ! fetch "$f" "$tmp/kit/$f"; then
    echo "claude-mods: could not download $f; nothing installed" >&2
    exit 0
  fi
done < "$tmp/FILES"

rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
mv "$tmp/kit" "$DEST"

mkdir -p "$CONFIG/skills" "$CONFIG/agents"
cp -R "$DEST/skills/." "$CONFIG/skills/"
cp "$DEST"/agents/*.md "$CONFIG/agents/"

echo "claude-mods: installed $(wc -l < "$tmp/FILES") files from $REPO@$REF into $DEST"
exit 0
