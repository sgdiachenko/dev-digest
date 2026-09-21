#!/usr/bin/env bash
#
# Guard the hand-copied @devdigest/shared contracts.
#
#   ./scripts/check-shared-sync.sh          # verify; exit 1 on drift
#   ./scripts/check-shared-sync.sh --fix    # copy server → client, then verify
#
# `@devdigest/shared` is not a package — it is hand-copied into
# server/src/vendor/shared and client/src/vendor/shared (see AGENTS.md). Nothing
# in the toolchain notices when the two fall out of step, so this script does.
#
# Scope: `contracts/` ONLY. The server's `adapters.ts` holds adapter ports
# (GitHubClient, GitClient, LLMProvider) — server-only detail the web client
# never calls, deliberately not mirrored. Wire DTOs belong in contracts/.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SERVER_DIR="server/src/vendor/shared/contracts"
CLIENT_DIR="client/src/vendor/shared/contracts"

FIX=0
for arg in "$@"; do
  case "$arg" in
    --fix) FIX=1 ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

for d in "$SERVER_DIR" "$CLIENT_DIR"; do
  [ -d "$d" ] || { echo "✗ missing directory: $d" >&2; exit 2; }
done

if [ "$FIX" = "1" ]; then
  cp "$SERVER_DIR"/*.ts "$CLIENT_DIR"/
  echo "→ copied $SERVER_DIR/*.ts → $CLIENT_DIR/"
fi

# A client-only contract file is drift too: it means someone added a contract on
# the client that the server does not know about, so `diff -r` (both directions)
# is deliberate here rather than a one-way "server files exist in client" check.
if diff -r "$SERVER_DIR" "$CLIENT_DIR" >/tmp/shared-sync-diff.$$ 2>&1; then
  rm -f /tmp/shared-sync-diff.$$
  echo "✓ @devdigest/shared contracts are in sync"
  exit 0
fi

echo "✗ @devdigest/shared contracts have drifted:" >&2
echo >&2
sed 's/^/    /' /tmp/shared-sync-diff.$$ >&2
rm -f /tmp/shared-sync-diff.$$
echo >&2
echo "Both copies must be edited together. To adopt the server's version:" >&2
echo "    ./scripts/check-shared-sync.sh --fix" >&2
exit 1
