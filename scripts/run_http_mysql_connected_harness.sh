#!/usr/bin/env bash
# scripts/run_http_mysql_connected_harness.sh
# Short launcher for connected HTTP/MySQL 8 harness execution on server / Plesk.

set -e

ENV_FILE="../mysql-test.env"

if [ -f "$ENV_FILE" ]; then
    echo "[LAUNCHER] Loading isolated test environment from $ENV_FILE..."
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

export TEST_MYSQL_HOST="${TEST_MYSQL_HOST:-127.0.0.1}"
export TEST_MYSQL_PORT="${TEST_MYSQL_PORT:-3306}"
export TEST_MYSQL_DATABASE="${TEST_MYSQL_DATABASE:-pposrcmdw0qdtest}"
export TEST_MYSQL_USER="${TEST_MYSQL_USER:-ppos_rc_mdw0qd}"

echo "[LAUNCHER] Target MySQL DB: ${TEST_MYSQL_USER}@${TEST_MYSQL_HOST}:${TEST_MYSQL_PORT}/${TEST_MYSQL_DATABASE}"

node scripts/test_http_mysql_connected_harness.js
