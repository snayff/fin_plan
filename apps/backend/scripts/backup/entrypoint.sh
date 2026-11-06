#!/usr/bin/env bash
#
# entrypoint.sh — Scheduler loop for the finplan `backup` compose service.
#
# The production compose stack has no cron daemon, so this runs a simple
# sleep-loop scheduler: run one backup immediately (so a fresh deploy has a
# recovery point right away), then sleep BACKUP_INTERVAL_SECONDS and repeat.
#
# Trade-off vs. cron: a sleep-loop does not align runs to wall-clock time and
# a container restart resets the clock (the next run happens INTERVAL after the
# restart, not at a fixed hour). For a single small database this is acceptable;
# if precise scheduling is required, disable the loop and drive backup.sh from
# an external scheduler (host cron / Coolify scheduled task) instead — see
# docs/3. architecture/system/backup-recovery.md.
#
# Environment:
#   BACKUP_INTERVAL_SECONDS   Seconds between runs (default: 86400 = 24h).
#   RUN_ONCE                  If "yes", run a single backup and exit (for
#                             external schedulers / manual on-demand runs).
#   ...plus all backup.sh env (DATABASE_URL, BACKUP_DIR, RETENTION_DAYS, etc.)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"

log() {
  printf '%s [scheduler] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

# Run one backup; never let a single failure kill the whole loop.
run_backup() {
  if bash "${SCRIPT_DIR}/backup.sh"; then
    log "backup run succeeded"
  else
    log "backup run FAILED (see errors above); will retry next cycle"
  fi
}

if [ "${RUN_ONCE:-}" = "yes" ]; then
  log "RUN_ONCE=yes — performing a single backup and exiting"
  # In one-shot mode, propagate the real exit code so schedulers see failures.
  exec bash "${SCRIPT_DIR}/backup.sh"
fi

log "starting scheduler loop; interval=${INTERVAL}s"
while true; do
  run_backup
  log "sleeping ${INTERVAL}s until next backup"
  sleep "$INTERVAL"
done
