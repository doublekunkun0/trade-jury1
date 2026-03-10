#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-4173}"
PID_FILE="$ROOT_DIR/.demo-server.pid"
LOG_FILE="$ROOT_DIR/.demo-server.log"

PROXY_HOST="$(scutil --proxy | awk '/HTTPSProxy/ {print $3; exit}')"
PROXY_PORT="$(scutil --proxy | awk '/HTTPSPort/ {print $3; exit}')"
USE_PROXY=0
ENV_ARGS=("PORT=$PORT")

if scutil --proxy | rg -q 'HTTPSEnable : 1'; then
  if [[ -n "${PROXY_HOST:-}" && -n "${PROXY_PORT:-}" ]]; then
    USE_PROXY=1
  fi
fi

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if kill -0 "$EXISTING_PID" >/dev/null 2>&1; then
    echo "Demo server is already running on port $PORT (PID $EXISTING_PID)."
    echo "URL: http://127.0.0.1:$PORT/index.html"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

cd "$ROOT_DIR"
if [[ "$USE_PROXY" -eq 1 ]]; then
  PROXY_URL="http://$PROXY_HOST:$PROXY_PORT"
  ENV_ARGS+=(
    "NODE_USE_ENV_PROXY=1"
    "HTTP_PROXY=$PROXY_URL"
    "HTTPS_PROXY=$PROXY_URL"
  )
fi
SERVER_PID="$(
  ROOT_DIR="$ROOT_DIR" LOG_FILE="$LOG_FILE" python3 - "${ENV_ARGS[@]}" <<'PY'
import os
import subprocess
import sys

root_dir = os.environ["ROOT_DIR"]
log_file = os.environ["LOG_FILE"]
env = os.environ.copy()

for item in sys.argv[1:]:
    key, value = item.split("=", 1)
    env[key] = value

with open(log_file, "ab", buffering=0) as stream:
    proc = subprocess.Popen(
        ["node", os.path.join(root_dir, "server.js")],
        stdin=subprocess.DEVNULL,
        stdout=stream,
        stderr=subprocess.STDOUT,
        cwd=root_dir,
        env=env,
        start_new_session=True,
    )

print(proc.pid)
PY
)"
echo "$SERVER_PID" >"$PID_FILE"

sleep 1

if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
  echo "Demo server started."
  echo "PID: $SERVER_PID"
  echo "URL: http://127.0.0.1:$PORT/index.html"
else
  echo "Failed to start demo server. Check $LOG_FILE" >&2
  exit 1
fi
