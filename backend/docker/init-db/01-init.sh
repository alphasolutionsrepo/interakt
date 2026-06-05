#!/bin/bash
# Runs once on first Postgres boot (mounted at /docker-entrypoint-initdb.d).
# Creates the two databases and enables pgvector in each. Re-running uses
# IF NOT EXISTS so volume reuse stays idempotent.
set -e

create_db_if_missing() {
  local db="$1"
  if psql -U "$POSTGRES_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
    echo "Database '${db}' already exists"
  else
    echo "Creating database '${db}'"
    psql -U "$POSTGRES_USER" -c "CREATE DATABASE \"${db}\""
  fi
  psql -U "$POSTGRES_USER" -d "${db}" -c "CREATE EXTENSION IF NOT EXISTS vector"
}

create_db_if_missing interakt
create_db_if_missing interakt_analytics
