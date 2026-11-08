# Scheduled database backup image.
#
# postgres:16-alpine is used purely for the pg_dump/pg_restore client tools —
# the container never starts a postgres server or opens a listener.
#
# The scripts are baked into the image rather than bind-mounted from the repo:
# Coolify builds from a clone inside its helper container, so a relative bind
# mount (./apps/backend/scripts/backup) resolves to an empty directory on the
# host and the container crash-loops with "entrypoint.sh: No such file".
FROM postgres:16-alpine

COPY backup.sh entrypoint.sh restore.sh /opt/backup/

# Strip CRLF in case the build context came from a Windows checkout, and make
# the scripts read-only + executable.
RUN sed -i 's/\r$//' /opt/backup/*.sh && chmod 0555 /opt/backup/*.sh

# Overriding ENTRYPOINT also clears the base image's CMD ("postgres").
ENTRYPOINT ["bash", "/opt/backup/entrypoint.sh"]
