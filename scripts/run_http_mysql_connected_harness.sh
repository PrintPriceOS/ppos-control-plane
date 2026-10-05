#!/usr/bin/env bash
# scripts/run_http_mysql_connected_harness.sh
# Short launcher for connected HTTP/MySQL 8 harness execution on server / Plesk.

set -e

# Resolve script directory and project root relative to script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Resolve test environment file from script directory hierarchy
ENV_FILE="$SCRIPT_DIR/../mysql-test.env"
if [ ! -f "$ENV_FILE" ]; then
    ENV_FILE="$PROJECT_DIR/mysql-test.env"
fi
if [ ! -f "$ENV_FILE" ]; then
    ENV_FILE="$(cd "$SCRIPT_DIR/../../" && pwd)/mysql-test.env"
fi

if [ -f "$ENV_FILE" ]; then
    echo "[LAUNCHER] Sourcing test environment from $ENV_FILE..."
    set -a
    source "$ENV_FILE"
    set +a
else
    echo "[LAUNCHER] Warning: mysql-test.env not found. Relying on current process environment."
fi

export TEST_MYSQL_HOST="${TEST_MYSQL_HOST:-127.0.0.1}"
export TEST_MYSQL_PORT="${TEST_MYSQL_PORT:-3306}"
export TEST_MYSQL_DATABASE="${TEST_MYSQL_DATABASE:-pposrcmdw0qdtest}"
export TEST_MYSQL_USER="${TEST_MYSQL_USER:-ppos_rc_mdw0qd}"

echo "[LAUNCHER] Target MySQL DB: ${TEST_MYSQL_USER}@${TEST_MYSQL_HOST}:${TEST_MYSQL_PORT}/${TEST_MYSQL_DATABASE}"

cd "$PROJECT_DIR"
node scripts/test_http_mysql_connected_harness.js
