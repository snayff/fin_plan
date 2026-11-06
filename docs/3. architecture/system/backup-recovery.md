# Backup & Recovery

## Overview

finplan runs a single PostgreSQL 16 database. This runbook covers the repo-side
backup and restore capability (RES-1): what is captured, where it lives, how to
run an on-demand backup, and the exact step-by-step restore procedure.

The capability is intentionally simple and self-contained: a `pg_dump`-based
backup script, a guarded `pg_restore` restore script, and a lightweight
Docker Compose service that runs the backup on a schedule. No application code
or external SaaS is involved.

**Source files:**

- `apps/backend/scripts/backup/backup.sh` — takes the dump, prunes old dumps
- `apps/backend/scripts/backup/restore.sh` — restores a dump (destructive, guarded)
- `apps/backend/scripts/backup/entrypoint.sh` — scheduler loop for the compose service
- `docker-compose.yml` → `backup` service + `finplan_backups` volume

---

## What is backed up, and where

- **What:** the entire application database, as a single **custom-format**
  (`pg_dump -Fc -Z9`) archive. Custom format is compressed and restorable with
  `pg_restore` (supports selective/parallel restore). Dumps are taken
  `--no-owner --no-privileges` so they are portable across roles and hosts.
- **Where:** the named Docker volume **`finplan_backups`**, mounted at
  `/backups` inside the `backup` container. Files are named
  `finplan-<db>-<UTC-timestamp>.dump`, e.g.
  `finplan-finplan-20260705T182535Z.dump`.
- **Not backed up here:** uploaded files/blobs (finplan stores none at present),
  and the database _server_ config. This is a logical dump, not a physical/PITR
  backup — there is no continuous WAL archiving.

---

## Retention

- Controlled by `RETENTION_DAYS` (default **7**). After each successful dump,
  `backup.sh` deletes `finplan-*.dump` files in the backup dir older than N days
  (`find -mtime +N`). Set `RETENTION_DAYS=0` to keep everything (no pruning).
- Override per-deploy via the `BACKUP_RETENTION_DAYS` env var consumed by the
  compose service.
- Retention only prunes files matching the `finplan-*.dump` pattern, so
  hand-copied or externally-managed files in the volume are never touched.

---

## The scheduled backup service

The `backup` service in `docker-compose.yml`:

- Uses `postgres:16-alpine` purely for the `pg_dump`/`pg_restore` client tools.
- **Exposes no ports** and opens no listener.
- `depends_on: migrate` so it starts after the schema is in place.
- Mounts the `finplan_backups` named volume at `/backups` and the repo's
  backup scripts read-only at `/opt/backup`.
- Reads the app's `DATABASE_URL`; `backup.sh` decomposes it into `PG*` vars.
- Runs `entrypoint.sh`, which takes **one backup immediately on start** (so a
  fresh deploy has a recovery point right away), then loops:
  `backup → sleep BACKUP_INTERVAL_SECONDS (default 86400 = 24h) → repeat`.

### Scheduler trade-off (sleep-loop vs. cron)

The production stack has no cron daemon, so the service uses a **sleep-loop**.
This is deliberately simple but has caveats:

- Runs are **not aligned to wall-clock time**. A container restart resets the
  timer — the next backup happens INTERVAL _after_ the restart, not at a fixed
  hour.
- If the container is down at the moment a backup would fire, that run is missed.

For a single small database and a 24h cadence this is acceptable. If precise
scheduling is needed, disable the loop and drive `backup.sh` externally (host
cron or a Coolify scheduled task) with `RUN_ONCE=yes` — see below.

---

## Running an on-demand backup

**Against the running compose stack** (production/prod-like host):

```bash
# One-shot run inside the already-running backup container:
docker compose -f docker-compose.yml exec \
  -e RUN_ONCE=yes backup bash /opt/backup/entrypoint.sh

# List the dumps in the volume:
docker compose -f docker-compose.yml exec backup ls -lh /backups
```

**Ad hoc, without the service** (e.g. from any host with the repo + a reachable DB):

```bash
DATABASE_URL="postgres://user:pass@host:5432/finplan" \
BACKUP_DIR="$PWD/backups" RETENTION_DAYS=0 \
  bash apps/backend/scripts/backup/backup.sh
```

`backup.sh` writes to a `.partial` file and atomically renames on success, and
fails (non-zero exit) if the dump is empty — so a half-written file is never
mistaken for a good backup.

---

## Copying a dump off the volume

Dumps live in the `finplan_backups` Docker volume. To pull one to the host:

```bash
# Find the container id for the backup service:
cid=$(docker compose -f docker-compose.yml ps -q backup)
# Copy the desired dump out:
docker cp "$cid:/backups/finplan-finplan-20260705T182535Z.dump" ./
```

Store off-host copies of at least one recent dump — a volume on the same host
does **not** protect against host loss (see RPO/RTO and Coolify note below).

---

## Restore procedure (DESTRUCTIVE)

> Restore uses `pg_restore --clean --if-exists`, which **drops and recreates**
> every object in the target database. There is no undo. Take a fresh backup of
> the current (broken) state first if there's any chance you'll need it.

1. **Identify the dump** to restore (newest good one, unless doing point-in-past
   recovery):

   ```bash
   docker compose -f docker-compose.yml exec backup ls -lt /backups
   ```

2. **Quiesce writers.** Stop the backend so nothing writes mid-restore:

   ```bash
   docker compose -f docker-compose.yml stop backend
   ```

   (In Coolify, scale/stop the backend service via the dashboard.)

3. **Run the restore** from inside the backup container. The confirmation flag
   `RESTORE_CONFIRM=yes` is mandatory:

   ```bash
   docker compose -f docker-compose.yml exec \
     -e RESTORE_CONFIRM=yes backup \
     bash /opt/backup/restore.sh /backups/finplan-finplan-20260705T182535Z.dump
   ```

   The script decomposes `DATABASE_URL`, then runs
   `pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error`.
   It exits non-zero on any error and warns that the DB may be partial — do not
   bring the app back up on a failed restore; investigate first.

4. **Restart the backend** and verify:

   ```bash
   docker compose -f docker-compose.yml start backend
   ```

   Confirm the backend healthcheck goes healthy (it pings the DB) and spot-check
   the app.

**Ad hoc restore** (any host with the repo + reachable DB):

```bash
RESTORE_CONFIRM=yes \
DATABASE_URL="postgres://user:pass@host:5432/finplan" \
  bash apps/backend/scripts/backup/restore.sh /path/to/dump.dump
```

---

## Forward-only migrations → rollback = restore-from-backup

finplan migrations are **forward-only**. There are **no down/rollback
migrations**. A bad migration therefore **cannot** be reversed by "migrating
down".

**The rollback mechanism for a bad schema/data migration is: restore the
pre-migration backup.** Because the scheduled backup runs before app traffic and
the immediate-on-start backup gives a recovery point at deploy time, take an
**on-demand backup immediately before deploying any risky migration**, then use
the restore procedure above if the migration goes wrong. Note that restoring an
older dump also reverts the schema to that dump's migration state, so re-run
`prisma migrate deploy` afterwards if you intend to move forward again.

---

## RPO / RTO

- **RPO (Recovery Point Objective): up to 24 hours.** With the default
  `BACKUP_INTERVAL_SECONDS=86400`, at most ~24h of writes can be lost (data
  written since the last successful dump). Lower the interval or take an
  on-demand backup before risky changes to tighten this. This is a logical-dump
  scheme with **no** point-in-time recovery, so sub-daily RPO requires either a
  shorter interval or host-level WAL archiving (not provided here).
- **RTO (Recovery Time Objective): minutes for a small DB.** Restore time is
  dominated by `pg_restore` of a single compressed archive plus the manual
  stop/verify steps — expect single-digit minutes at current data volumes,
  growing with database size.

---

## Coolify / host-level snapshots (complementary)

If the Coolify host or its provider takes **volume/VM snapshots**, those are
**complementary** to this logical-dump scheme, not a replacement:

- Host snapshots protect against host/volume loss and can capture the whole
  server; the `finplan_backups` volume alone lives on the same host and does
  **not** survive host loss. Keep at least one dump copied off-host.
- Logical `pg_dump` archives are portable and restorable to a different
  Postgres version/host and support selective restore; raw volume snapshots are
  not portable in the same way.

**Repo cannot enforce (host/Coolify-side actions required):**

- Off-host replication of the `finplan_backups` volume (or scheduled
  `docker cp` + upload to object storage). The repo produces the dumps; shipping
  them off-host is an infra responsibility.
- Any host-level/VM snapshot policy and its retention.
- Verifying `DATABASE_URL` is present in the Coolify environment for the
  `backup` service (it reuses the same secret as `backend`/`migrate`).
- Periodic **restore drills** — a backup is only proven when a restore has been
  tested. Schedule a recurring test restore into a throwaway database.
