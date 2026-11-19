#!/usr/bin/env bash
# Runs the production Docker image the way a deployment does: the migration command first,
# then the app (the image's default command). Checks that the startup hook finishes and the
# login page answers. Fails on a migration error, a startup error, an early exit or a timeout,
# and prints the container's log. CI runs it on every PR.
#
# Usage: scripts/image-start-check.sh <image>
# Needs the app's environment exported (POSTGRES_URL, ANALYTICS_POSTGRES_URL, AUTH_SECRET,
# NEXTAUTH_SECRET, SECRETS_ENCRYPTION_KEY, NEXTAUTH_URL, AUTH_TRUST_HOST) and migratable
# databases reachable from the host network.
#
#   PORT                 port the app listens on (default 3200)
#   START_CHECK_TIMEOUT  seconds to wait (default 120)
set -euo pipefail

IMAGE="${1:?usage: image-start-check.sh <image>}"
PORT="${PORT:-3200}"
TIMEOUT="${START_CHECK_TIMEOUT:-120}"
NAME="interakt-start-check-$$"

ENV_ARGS=()
for var in POSTGRES_URL ANALYTICS_POSTGRES_URL AUTH_SECRET NEXTAUTH_SECRET SECRETS_ENCRYPTION_KEY \
  NEXTAUTH_URL AUTH_TRUST_HOST ENABLE_OTEL; do
  [ -n "${!var:-}" ] && ENV_ARGS+=(-e "$var")
done
ENV_ARGS+=(-e "PORT=$PORT")

# The same command as a deployment's migration job (see the Dockerfile header).
echo "Migrating with the image..."
docker run --rm --network host "${ENV_ARGS[@]}" "$IMAGE" \
  sh -c 'node scripts/db-migrate.js apply && node scripts/db-migrate-analytics.js apply'

docker run -d --name "$NAME" --network host "${ENV_ARGS[@]}" "$IMAGE" >/dev/null
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Asks from inside the container (the image has node, not curl), so the check doesn't depend on
# how the host reaches the container's port.
login_answers() {
  docker exec "$NAME" node -e \
    "fetch('http://127.0.0.1:' + process.env.PORT + '/login').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
}

# Lines that mean startup failed, even if the server goes on answering requests.
FAILED='Failed to prepare server|error occurred while loading instrumentation hook|Failed to initialize OpenTelemetry'

result=timeout
for ((i = 0; i < TIMEOUT; i++)); do
  LOG="$(docker logs "$NAME" 2>&1)"
  if grep -qE "$FAILED" <<<"$LOG"; then result=failed; break; fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" != true ]; then result=exited; break; fi
  if grep -q 'Search providers initialized' <<<"$LOG" \
    && login_answers; then
    # Give the rest of the startup hook a moment, then check again for a late failure.
    sleep 3
    if docker logs "$NAME" 2>&1 | grep -qE "$FAILED"; then result=failed; else result=ok; fi
    break
  fi
  sleep 1
done

if [ "$result" = ok ]; then
  echo "The image started: migrations ran, the startup hook finished and /login answered."
  exit 0
fi

echo "::error::The image did not start cleanly (${result}). Log:"
docker logs "$NAME" 2>&1
exit 1
