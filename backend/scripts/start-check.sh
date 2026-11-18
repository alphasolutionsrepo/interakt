#!/usr/bin/env bash
# Starts the production build (`next start`) and checks that it comes up: the startup hook
# (src/instrumentation.ts) finishes — tracing and the search providers initialize — and the
# login page answers. Fails on a startup error, an early exit or a timeout, and prints the log.
#
# Run from backend/ after `npm run build`, with the environment the app needs (database URLs,
# AUTH_SECRET, SECRETS_ENCRYPTION_KEY) and migrated databases. CI runs it on every PR.
#
#   PORT                 port to start on (default 3100)
#   START_CHECK_TIMEOUT  seconds to wait (default 120)
set -euo pipefail

PORT="${PORT:-3100}"
TIMEOUT="${START_CHECK_TIMEOUT:-120}"
LOG="$(mktemp)"

npx next start -p "$PORT" >"$LOG" 2>&1 &
PID=$!
cleanup() {
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  rm -f "$LOG"
}
trap cleanup EXIT

# Lines that mean startup failed, even if the server goes on answering requests.
FAILED='Failed to prepare server|error occurred while loading instrumentation hook|Failed to initialize OpenTelemetry'

result=timeout
for ((i = 0; i < TIMEOUT; i++)); do
  if grep -qE "$FAILED" "$LOG"; then result=failed; break; fi
  if ! kill -0 "$PID" 2>/dev/null; then result=exited; break; fi
  if grep -q 'Search providers initialized' "$LOG" \
    && curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/login"; then
    # Give the rest of the startup hook a moment, then check again for a late failure.
    sleep 3
    if grep -qE "$FAILED" "$LOG"; then result=failed; else result=ok; fi
    break
  fi
  sleep 1
done

if [ "$result" = ok ]; then
  echo "The server started: the startup hook finished and /login answered."
  exit 0
fi

echo "::error::The server did not start cleanly (${result}). Log:"
cat "$LOG"
exit 1
