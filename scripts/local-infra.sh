#!/usr/bin/env bash
# Optional helper for the locally extracted verification runtime (not needed in Docker).
set -euo pipefail
task_root="$(cd "$(dirname "$0")/.." && pwd)"
task_runtime="$task_root/.local/runtime"
if [ ! -x "$task_runtime/usr/lib/postgresql/16/bin/pg_ctl" ]; then
  echo 'Local verification binaries are unavailable. Use Docker Compose or install PostgreSQL/Redis.'
  exit 1
fi
export LD_LIBRARY_PATH="$task_runtime/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
if ! "$task_runtime/usr/lib/postgresql/16/bin/pg_ctl" -D "$task_root/.local/pgdata" status >/dev/null 2>&1; then
  "$task_runtime/usr/lib/postgresql/16/bin/pg_ctl" -D "$task_root/.local/pgdata" -l "$task_root/.local/postgres.log" -o "-p 55432 -h 127.0.0.1 -k $task_root/.local" start
fi
if ! "$task_runtime/usr/bin/redis-cli" -h 127.0.0.1 -p 56379 ping >/dev/null 2>&1; then
  "$task_runtime/usr/bin/redis-server" --port 56379 --bind 127.0.0.1 --daemonize yes --dir "$task_root/.local" --logfile "$task_root/.local/redis.log"
fi
echo 'Local PostgreSQL (55432) and Redis (56379) are ready.'
