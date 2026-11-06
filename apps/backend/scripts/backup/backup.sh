#!/usr/bin/env bash
#
# backup.sh — Timestamped, compressed PostgreSQL backup for finplan.
#
# Produces a custom-format (`pg_dump -Fc`) dump so restores can be parallelised
# and selectively filtered. Reads connection info from the environment
# (DATABASE_URL takes precedence; otherwise standard PG* vars) and prunes dumps
# older than the retention window.
#
# Usage:
#   DATABASE_URL=postgres://user:pass@host:5432/db ./backup.sh
#   PGHOST=postgres PGUSER=finplan PGDATABASE=finplan ./backup.sh
#
# Environment:
#   DATABASE_URL      Full libpq connection URI (preferred). If set, its
#                     components override the PG* vars below.
#   PGHOST            DB host                 (default: postgres)
#   PGPORT            DB port                 (default: 5432)
#   PGUSER            DB user                 (default: finplan)
#   PGPASSWORD        DB password             (no default; required unless in URL)
#   PGDATABASE        DB name                 (default: finplan)
#   BACKUP_DIR        Output directory        (default: /backups)
#   RETENTION_DAYS    Prune dumps older than N days (default: 7; 0 = keep all)
#
# Exit codes: 0 success, non-zero on any failure (set -euo pipefail).

set -euo pipefail

# --- Config with defaults --------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

log() {
  # Timestamped structured log line to stdout.
  printf '%s [backup] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
  printf '%s [backup] ERROR: %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
  exit 1
}

# --- Resolve connection info ----------------------------------------------
# If DATABASE_URL is set, decompose it into PG* vars so pg_dump can consume it
# and so we can name the dump after the database. Supports the standard
# postgres[ql]://user:pass@host:port/dbname[?params] shape.
if [ -n "${DATABASE_URL:-}" ]; then
  # Strip scheme.
  _url="${DATABASE_URL#*://}"
  # Split credentials@hostpart.
  _creds="${_url%%@*}"
  _hostpart="${_url#*@}"
  # Credentials (may be user or user:pass).
  _user="${_creds%%:*}"
  if [ "$_creds" = "$_user" ]; then
    _pass=""
  else
    _pass="${_creds#*:}"
  fi
  # host:port/dbname?params — strip query string first.
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
  # PGPASSWORD, if set, is already exported by the caller/compose env.
fi

command -v pg_dump >/dev/null 2>&1 || fail "pg_dump not found on PATH"

# --- Prepare output --------------------------------------------------------
mkdir -p "$BACKUP_DIR" || fail "cannot create backup dir: $BACKUP_DIR"

TIMESTAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
DUMP_FILE="${BACKUP_DIR}/finplan-${PGDATABASE}-${TIMESTAMP}.dump"
TMP_FILE="${DUMP_FILE}.partial"

log "starting dump of '${PGDATABASE}' on ${PGHOST}:${PGPORT} as ${PGUSER}"

# --- Dump (write to .partial, then atomically rename) ----------------------
# -Fc  custom format (compressed, restorable with pg_restore)
# -Z9  maximum compression
# --no-owner / --no-privileges keep the dump portable across roles/hosts.
if pg_dump -Fc -Z 9 --no-owner --no-privileges -f "$TMP_FILE"; then
  mv -f "$TMP_FILE" "$DUMP_FILE"
else
  rm -f "$TMP_FILE"
  fail "pg_dump failed for database '${PGDATABASE}'"
fi

# Guard against a silent empty dump.
if [ ! -s "$DUMP_FILE" ]; then
  rm -f "$DUMP_FILE"
  fail "dump file is empty: $DUMP_FILE"
fi

DUMP_SIZE="$(wc -c < "$DUMP_FILE" | tr -d '[:space:]')"
log "dump complete: ${DUMP_FILE} (${DUMP_SIZE} bytes)"

# --- Retention prune -------------------------------------------------------
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  log "pruning dumps older than ${RETENTION_DAYS} day(s) in ${BACKUP_DIR}"
  # Only our own dump files are eligible; -mtime +N is strictly older than N days.
  _pruned=0
  while IFS= read -r -d '' _old; do
    rm -f "$_old" && log "pruned old dump: $_old"
    _pruned=$((_pruned + 1))
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'finplan-*.dump' -mtime "+${RETENTION_DAYS}" -print0)
  log "retention prune done (${_pruned} removed)"
else
  log "retention disabled (RETENTION_DAYS=${RETENTION_DAYS}); keeping all dumps"
fi

log "backup finished OK"
