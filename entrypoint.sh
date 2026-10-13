#!/bin/sh
# Starts MediaHub as a normal (non-root) user. Set PUID and PGID to match the owner of your data folder.
set -e
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"
if [ "$(id -u)" = "0" ]; then
  chown "$PUID:$PGID" "$DATA_DIR" 2>/dev/null || true
  find "$DATA_DIR" -maxdepth 1 ! -user "$PUID" -exec chown "$PUID:$PGID" {} + 2>/dev/null || true
  exec su-exec "$PUID:$PGID" node /app/server.js
fi
exec node /app/server.js
