#!/usr/bin/env bash
#
# Guard the hand-copied @devdigest/shared contracts.
#
#   ./scripts/check-shared-sync.sh          # verify; exit 1 on drift
#   ./scripts/check-shared-sync.sh --fix    # copy server → client/mcp-server, then verify
#
# `@devdigest/shared` is not a package — it is hand-copied into
# server/src/vendor/shared, client/src/vendor/shared, and (a subset of)
# mcp-server/src/vendor/shared (see AGENTS.md). Nothing in the toolchain
# notices when the copies fall out of step, so this script does.
#
# Scope: `contracts/` ONLY. The server's `adapters.ts` holds adapter ports
# (GitHubClient, GitClient, LLMProvider) — server-only detail neither the web
# client nor mcp-server ever calls, deliberately not mirrored. Wire DTOs
# belong in contracts/.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SERVER_DIR="server/src/vendor/shared/contracts"
CLIENT_DIR="client/src/vendor/shared/contracts"
MCP_DIR="mcp-server/src/vendor/shared/contracts"

FIX=0
for arg in "$@"; do
  case "$arg" in
    --fix) FIX=1 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

for d in "$SERVER_DIR" "$CLIENT_DIR" "$MCP_DIR"; do
  [ -d "$d" ] || { echo "✗ missing directory: $d" >&2; exit 2; }
done

if [ "$FIX" = "1" ]; then
  cp "$SERVER_DIR"/*.ts "$CLIENT_DIR"/
  echo "→ copied $SERVER_DIR/*.ts → $CLIENT_DIR/"
  # mcp-server only mirrors a subset (D6) — overwrite only the files it
  # already has, never add a file it doesn't mirror.
  for f in "$MCP_DIR"/*.ts; do
    base="$(basename "$f")"
    cp "$SERVER_DIR/$base" "$MCP_DIR/$base"
  done
  echo "→ copied mcp-server's mirrored subset from $SERVER_DIR/"
fi

STATUS=0

# A client-only contract file is drift too: it means someone added a contract on
# the client that the server does not know about, so `diff -r` (both directions)
# is deliberate here rather than a one-way "server files exist in client" check.
if diff -r "$SERVER_DIR" "$CLIENT_DIR" >/tmp/shared-sync-diff.$$ 2>&1; then
  rm -f /tmp/shared-sync-diff.$$
  echo "✓ @devdigest/shared contracts are in sync (client)"
else
  echo "✗ @devdigest/shared contracts have drifted (server ↔ client):" >&2
  echo >&2
  sed 's/^/    /' /tmp/shared-sync-diff.$$ >&2
  rm -f /tmp/shared-sync-diff.$$
  echo >&2
  STATUS=1
fi

# mcp-server mirrors only 6 files (D6) — one-way check: every file PRESENT in
# mcp-server must byte-match the server's version. A file the server has but
# mcp-server doesn't is NOT drift (mcp-server deliberately mirrors a subset).
MCP_DRIFT=0
for f in "$MCP_DIR"/*.ts; do
  base="$(basename "$f")"
  if [ ! -f "$SERVER_DIR/$base" ]; then
    echo "✗ $MCP_DIR/$base has no server counterpart at $SERVER_DIR/$base" >&2
    MCP_DRIFT=1
    continue
  fi
  if ! diff -u "$SERVER_DIR/$base" "$f" >/tmp/shared-sync-mcp-diff.$$ 2>&1; then
    echo "✗ $MCP_DIR/$base has drifted from $SERVER_DIR/$base:" >&2
    echo >&2
    sed 's/^/    /' /tmp/shared-sync-mcp-diff.$$ >&2
    rm -f /tmp/shared-sync-mcp-diff.$$
    echo >&2
    MCP_DRIFT=1
  fi
done

if [ "$MCP_DRIFT" = "0" ]; then
  echo "✓ @devdigest/shared contracts are in sync (mcp-server subset)"
else
  STATUS=1
fi

if [ "$STATUS" = "0" ]; then
  exit 0
fi

echo "Both/all copies must be edited together. To adopt the server's version:" >&2
echo "    ./scripts/check-shared-sync.sh --fix" >&2
exit 1
