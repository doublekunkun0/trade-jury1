#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$ROOT_DIR/.demo-server.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No demo server PID file found."
  exit 0
fi

SERVER_PID="$(cat "$PID_FILE")"

if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
  kill "$SERVER_PID"
  echo "Stopped demo server PID $SERVER_PID."
else
  echo "Process $SERVER_PID is not running."
fi

rm -f "$PID_FILE"
