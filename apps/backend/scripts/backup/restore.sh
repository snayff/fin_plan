#!/usr/bin/env bash
#
# restore.sh — Restore a finplan PostgreSQL dump produced by backup.sh.
#
# DESTRUCTIVE. Uses `pg_restore --clean --if-exists`, which DROPs and recreates
# every object in the target database before reloading it. There is no undo.
# A confirmation env flag is required to proceed.
#
# Usage:
#   RESTORE_CONFIRM=yes DATABASE_URL=postgres://user:pass@host:5432/db \
#     ./restore.sh /backups/finplan-finplan-20260705T010203Z.dump
#
#   RESTORE_CONFIRM=yes PGHOST=postgres PGUSER=finplan PGDATABASE=finplan \
#     ./restore.sh /path/to/dump.dump
#
# Environment:
#   RESTORE_CONFIRM   MUST equal "yes" or the script refuses to run.
#   DATABASE_URL      Full libpq URI (preferred; decomposed like backup.sh).
#   PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE   Standard libpq vars (fallback).
#   RESTORE_JOBS      Parallel restore workers (default: 1). Custom-format only.
#
# Exit codes: 0 success, non-zero on any failure (set -euo pipefail).

set -euo pipefail

log() {
  printf '%s [restore] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
  printf '%s [restore] ERROR: %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
  exit 1
}

# --- Args & guard ----------------------------------------------------------
DUMP_FILE="${1:-}"
[ -n "$DUMP_FILE" ] || fail "usage: RESTORE_CONFIRM=yes ./restore.sh <dump-file>"
[ -f "$DUMP_FILE" ] || fail "dump file not found: $DUMP_FILE"
[ -s "$DUMP_FILE" ] || fail "dump file is empty: $DUMP_FILE"

if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  fail "refusing to restore: set RESTORE_CONFIRM=yes to confirm this DESTRUCTIVE operation"
fi

RESTORE_JOBS="${RESTORE_JOBS:-1}"

# --- Resolve connection info (same logic as backup.sh) ---------------------
if [ -n "${DATABASE_URL:-}" ]; then
  _url="${DATABASE_URL#*://}"
  _creds="${_url%%@*}"
  _hostpart="${_url#*@}"
  _user="${_creds%%:*}"
  if [ "$_creds" = "$_user" ]; then
    _pass=""
  else
    _pass="${_creds#*:}"
  fi
  _hostpart="${_hostpart%%\?*}"
  _hostport="${_hostpart%%/*}"
  _db="${_hostpart#*/}"
  _host="${_hostport%%:*}"
  if [ "$_hostport" = "$_host" ]; then
    _port="5432"
  else
    _port="${_hostport#*:}"
  fi
  export PGHOST="${_host}"
  export PGPORT="${_port}"
  export PGUSER="${_user}"
  [ -n "$_pass" ] && export PGPASSWORD="$_pass"
  export PGDATABASE="${_db}"
else
  export PGHOST="${PGHOST:-postgres}"
  export PGPORT="${PGPORT:-5432}"
  export PGUSER="${PGUSER:-finplan}"
  export PGDATABASE="${PGDATABASE:-finplan}"
fi

command -v pg_restore >/dev/null 2>&1 || fail "pg_restore not found on PATH"

log "target database: ${PGDATABASE} on ${PGHOST}:${PGPORT} as ${PGUSER}"
log "source dump:     ${DUMP_FILE}"
log "WARNING: existing objects in '${PGDATABASE}' will be dropped and recreated"

# --- Restore ---------------------------------------------------------------
# --clean --if-exists : drop existing objects first (idempotent re-restore).
# --no-owner --no-privileges : match backup.sh; restore as the connecting role.
# --exit-on-error : stop at the first failure so we surface a non-zero code.
# -j : parallel workers (custom-format dumps support this).
if pg_restore \
    --clean --if-exists \
    --no-owner --no-privileges \
    --exit-on-error \
    -j "$RESTORE_JOBS" \
    -d "$PGDATABASE" \
    "$DUMP_FILE"; then
  log "restore completed OK"
else
  fail "pg_restore failed — database may be in a partial state; investigate before use"
fi
