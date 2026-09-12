#!/bin/sh
set -e

# Litestream replication is opt-in: without LITESTREAM_BUCKET the container
# runs the server directly against local disk (docker run -v /data).
if [ -n "$LITESTREAM_BUCKET" ]; then
  export SHUKKA_DATA_DIR="${SHUKKA_DATA_DIR:-/data}"
  export SHUKKA_DB_PATH="${SHUKKA_DB_PATH:-$SHUKKA_DATA_DIR/shukka.db}"
  mkdir -p "$SHUKKA_DATA_DIR"
  litestream restore -config /etc/litestream.yml -if-db-not-exists -if-replica-exists "$SHUKKA_DB_PATH"
  exec litestream replicate -config /etc/litestream.yml -exec "node .output/server/index.mjs"
fi

exec node .output/server/index.mjs
