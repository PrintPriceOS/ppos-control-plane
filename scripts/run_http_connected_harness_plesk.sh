#!/usr/bin/env bash
# ======================================================================
# Plesk Launcher for PPOS Control Plane Connected HTTP Harness
# Executable script for server environment validation (Node 20 + MySQL 8)
# ======================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== PPOS CONTROL PLANE: PLESK CONNECTED HTTP HARNESS LAUNCHER ==="
echo "Application Directory: ${APP_DIR}"

# Source server MySQL test environment credentials if present
MYSQL_TEST_ENV="${APP_DIR}/../mysql-test.env"
if [ -f "${MYSQL_TEST_ENV}" ]; then
    echo "Loading test environment credentials from ${MYSQL_TEST_ENV}..."
    set -a
    source "${MYSQL_TEST_ENV}"
    set +a
else
    echo "Notice: ${MYSQL_TEST_ENV} not found. Relying on process environment variables."
fi

# Fallback defaults for isolated server execution if TEST_ env vars are not set
export TEST_MYSQL_HOST="${TEST_MYSQL_HOST:-127.0.0.1}"
export TEST_MYSQL_PORT="${TEST_MYSQL_PORT:-3306}"
export TEST_MYSQL_USER="${TEST_MYSQL_USER:-ppos_rc_mdw0qd}"
export TEST_MYSQL_DATABASE="${TEST_MYSQL_DATABASE:-pposrcmdw0qdtest}"

echo "Target Isolated Test DB: ${TEST_MYSQL_USER}@${TEST_MYSQL_HOST}:${TEST_MYSQL_PORT}/${TEST_MYSQL_DATABASE}"

cd "${APP_DIR}"

if command -v node >/dev/null 2>&1; then
    echo "Node.js Version: $(node -v)"
    node scripts/test_http_connected_harness.js
else
    echo "Error: node command not found in PATH."
    exit 1
fi
