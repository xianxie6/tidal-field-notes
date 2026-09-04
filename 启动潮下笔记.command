#!/bin/zsh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

if curl -fsS http://localhost:5173/ >/dev/null 2>&1; then
  open http://localhost:5173/
  exit 0
fi

if [[ ! -d node_modules ]]; then
  npm install
fi

npm run dev &
SERVER_PID=$!

for attempt in {1..40}; do
  if curl -fsS http://localhost:5173/ >/dev/null 2>&1; then
    open http://localhost:5173/
    wait "$SERVER_PID"
    exit $?
  fi
  sleep 0.25
done

echo "启动超时。请确认 5173 端口没有被其他程序占用。"
kill "$SERVER_PID" 2>/dev/null || true
exit 1
