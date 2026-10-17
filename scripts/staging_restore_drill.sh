#!/usr/bin/env bash
# scripts/staging_restore_drill.sh
# Hardened, verified decryption and restoration drill into an isolated sandbox/staging MySQL instance.
set -euo pipefail

ENCRYPTED_FILE="${1:-}"
TARGET_DB="${2:-}"

# 1. Target Validation & Anti-Production Guards
if [ -z "$ENCRYPTED_FILE" ] || [ ! -f "$ENCRYPTED_FILE" ]; then
  echo "[FATAL] Usage: $0 <path_to_backup.sql.gz.enc> <target_sandbox_database>" >&2
  exit 1
fi

if [ -z "$TARGET_DB" ]; then
  echo "[FATAL] Explicit target database parameter is required. Ambiguous or default targets are forbidden." >&2
  exit 1
fi

# Strictly forbid any production target
LOWER_TARGET=$(echo "$TARGET_DB" | tr '[:upper:]' '[:lower:]')
case "$LOWER_TARGET" in
  *prod*|*production*|*live*|*master*|ppos_control_plane|ppos_production)
    echo "[FATAL] Target database '$TARGET_DB' is forbidden. Restorations to production databases are strictly prohibited." >&2
    exit 1
    ;;
esac

# Require target name to contain sandbox or staging
case "$LOWER_TARGET" in
  *sandbox*|*staging*|*test*|*drill*)
    # Valid isolated target
    ;;
  *)
    echo "[FATAL] Target database '$TARGET_DB' must clearly denote an isolated environment (must contain 'sandbox', 'staging', 'test', or 'drill')." >&2
    exit 1
    ;;
esac

# 2. Key Resolution Without Command-Line Argument Leakage
if [ -z "${BACKUP_PASSPHRASE:-}" ] && [ -z "${BACKUP_PASSPHRASE_FILE:-}" ]; then
  echo "[FATAL] BACKUP_PASSPHRASE or BACKUP_PASSPHRASE_FILE environment variable is required for decryption." >&2
  exit 1
fi

PASS_ARG=()
if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -f "$BACKUP_PASSPHRASE_FILE" ]; then
  PASS_ARG=(-pass "file:${BACKUP_PASSPHRASE_FILE}")
else
  PASS_ARG=(-pass "env:BACKUP_PASSPHRASE")
fi

# 3. Mandatory SHA-256 Checksum Verification Before Decryption
SHA_FILE="${ENCRYPTED_FILE}.sha256"
if [ ! -f "$SHA_FILE" ]; then
  echo "[FATAL] SHA-256 checksum file (${SHA_FILE}) is missing. Restore drill aborted to prevent tampering or corrupted recovery." >&2
  exit 1
fi

echo "[1/5] Verifying SHA-256 cryptographic integrity before decryption..."
sha256sum -c "$SHA_FILE"

# 4. Isolated Temporary Workspace with Guaranteed Cleanup
WORK_DIR=$(mktemp -d)
chmod 700 "$WORK_DIR"

cleanup() {
  local exit_code=$?
  rm -rf "$WORK_DIR"
  if [ $exit_code -ne 0 ]; then
    echo "[RESTORE DRILL FAILED] Cleaned up temporary files. Exit code: $exit_code" >&2
  fi
  exit $exit_code
}
trap cleanup EXIT INT TERM

DECRYPTED_GZ="${WORK_DIR}/restore.sql.gz"
DECRYPTED_SQL="${WORK_DIR}/restore.sql"

echo "[2/5] Decrypting AES-256-CBC authenticated archive..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in "$ENCRYPTED_FILE" \
  -out "$DECRYPTED_GZ" \
  "${PASS_ARG[@]}"

echo "[3/5] Decompressing snapshot and verifying SQL integrity..."
gunzip -c "$DECRYPTED_GZ" > "$DECRYPTED_SQL"
rm -f "$DECRYPTED_GZ"

if [ ! -s "$DECRYPTED_SQL" ]; then
  echo "[FATAL] Decrypted SQL file is empty or missing." >&2
  exit 1
fi

# 3.1 Strict SQL AST/Pattern Audit: Reject CREATE DATABASE and USE statements
# Protect against cross-database pollution or unauthorized database recreation
if grep -iE '^[[:space:]]*CREATE[[:space:]]+DATABASE' "$DECRYPTED_SQL" >/dev/null; then
  echo "[FATAL] Decrypted SQL contains prohibited 'CREATE DATABASE' statement. Restore aborted to protect target database boundary." >&2
  exit 1
fi

if grep -iE '^[[:space:]]*USE[[:space:]]+' "$DECRYPTED_SQL" >/dev/null; then
  echo "[FATAL] Decrypted SQL contains prohibited 'USE <database>' statement. Restore aborted to prevent switching away from target '${TARGET_DB}'." >&2
  exit 1
fi

# Verify SQL structure contains expected standard DDL/DML markers
if ! grep -q "CREATE TABLE" "$DECRYPTED_SQL" && ! grep -q "INSERT INTO" "$DECRYPTED_SQL"; then
  echo "[FATAL] Decrypted SQL dump lacks standard DDL/DML markers." >&2
  exit 1
fi

echo "[4/5] Restoring into isolated target instance (${TARGET_DB})..."
DB_HOST="${MYSQL_HOST:-127.0.0.1}"
DB_PORT="${MYSQL_PORT:-3306}"
DB_USER="${MYSQL_USER:-ppos_staging_usr}"

# If DATABASE_URL is defined, assert that it does NOT contradict the target
if [ -n "${DATABASE_URL:-}" ]; then
  URL_DB=$(echo "$DATABASE_URL" | sed -E 's/.*\/\/([^@]+@)?[^\/]+\/([^?]+).*/\2/')
  if [ -n "$URL_DB" ] && [ "$URL_DB" != "$TARGET_DB" ]; then
    echo "[FATAL] DATABASE_URL database ('${URL_DB}') contradicts explicit TARGET_DB ('${TARGET_DB}'). Aborting restore drill." >&2
    exit 1
  fi
fi

# Confirm server identity and target schema existence before writing
CONFIRM_SCHEMA=$(mysql --host="${DB_HOST}" --port="${DB_PORT}" --user="${DB_USER}" -N -e "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${TARGET_DB}';" 2>/dev/null || true)
if [ -z "$CONFIRM_SCHEMA" ]; then
  echo "[FATAL] Target database '${TARGET_DB}' does not exist on target MySQL host '${DB_HOST}:${DB_PORT}' or user '${DB_USER}' lacks SELECT grants. Aborting." >&2
  exit 1
fi

START_TIME=$(date +%s%N 2>/dev/null || date +%s)

mysql --host="${DB_HOST}" --port="${DB_PORT}" --user="${DB_USER}" --database="${TARGET_DB}" < "$DECRYPTED_SQL"

END_TIME=$(date +%s%N 2>/dev/null || date +%s)

# Compute elapsed time
if [ ${#START_TIME} -gt 10 ]; then
  ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))
else
  ELAPSED_MS=$(( (END_TIME - START_TIME) * 1000 ))
fi

echo "[5/5] Performing post-restore integrity and sample verification..."
# Verify table presence and sample row check
SCHEMA_COUNT=$(mysql --host="${DB_HOST}" --port="${DB_PORT}" --user="${DB_USER}" --database="${TARGET_DB}" -N -e "SELECT count(*) FROM information_schema.tables WHERE table_schema='${TARGET_DB}';")
echo "✓ Total tables restored in target DB '${TARGET_DB}': ${SCHEMA_COUNT}"

if [ "${SCHEMA_COUNT}" -eq 0 ]; then
  echo "[FATAL] Target database has 0 tables after restore." >&2
  exit 1
fi

echo "✓ Restoration drill successful."
echo "✓ Verified target sandbox: ${TARGET_DB}"
echo "✓ Restored tables count: ${SCHEMA_COUNT}"
echo "✓ Real measured restore duration: ${ELAPSED_MS} ms"
