#!/usr/bin/env bash
# scripts/staging_backup_snapshot.sh
# Hardened, authenticated single-transaction encrypted backup for staging persistence.
set -euo pipefail

BACKUP_DIR="${1:-/var/backups/ppos}"
DB_NAME="${MYSQL_DATABASE:-ppos_control_staging}"
DB_HOST="${MYSQL_HOST:-127.0.0.1}"
DB_PORT="${MYSQL_PORT:-3306}"
DB_USER="${MYSQL_USER:-ppos_staging_usr}"
DB_PASS="${MYSQL_PASSWORD:-}"
if [ -z "$DB_PASS" ] && [ -n "${MYSQL_PASSWORD_FILE:-}" ] && [ -f "$MYSQL_PASSWORD_FILE" ]; then
  DB_PASS=$(cat "$MYSQL_PASSWORD_FILE" | tr -d '\r\n')
fi
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_UUID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || openssl rand -hex 16)
DEST_BASE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}_${BACKUP_UUID}"
FINAL_ENC_ARCHIVE="${DEST_BASE}.sql.gz.enc"
SHA_FILE="${FINAL_ENC_ARCHIVE}.sha256"

# 1. Verification of Encryption Key
if [ -z "${BACKUP_PASSPHRASE:-}" ] && [ -z "${BACKUP_PASSPHRASE_FILE:-}" ]; then
  echo "[FATAL] Neither BACKUP_PASSPHRASE nor BACKUP_PASSPHRASE_FILE is configured." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if [ -f "$FINAL_ENC_ARCHIVE" ]; then
  echo "[FATAL] Destination archive ${FINAL_ENC_ARCHIVE} already exists. Overwrite strictly forbidden." >&2
  exit 1
fi

# 2. Secure Temporary Workspace with Guaranteed Cleanup
TMP_DIR=$(mktemp -d "${BACKUP_DIR}/.tmp_backup_XXXXXX")
chmod 700 "$TMP_DIR"
RAW_PIPE="${TMP_DIR}/dump.sql"

cleanup() {
  local exit_code=$?
  rm -rf "$TMP_DIR"
  if [ $exit_code -ne 0 ]; then
    echo "[BACKUP FAILED] Cleaned up temporary files. Exit code: $exit_code" >&2
    rm -f "$FINAL_ENC_ARCHIVE" "$SHA_FILE"
  fi
  exit $exit_code
}
trap cleanup EXIT INT TERM

PASS_ARG=()
if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -f "$BACKUP_PASSPHRASE_FILE" ]; then
  PASS_ARG=(-pass "file:${BACKUP_PASSPHRASE_FILE}")
else
  # Using env variable reference without leaking passphrase on command line args
  PASS_ARG=(-pass "env:BACKUP_PASSPHRASE")
fi

echo "[1/4] Dumping database '${DB_NAME}' via single-transaction stream..."
# Using pipefail to ensure any failure in mysqldump or gzip aborts the process
MYSQL_PWD="${DB_PASS}" mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  "${DB_NAME}" > "$RAW_PIPE"

echo "[2/4] Compressing snapshot..."
gzip -9 -c "$RAW_PIPE" > "${TMP_DIR}/dump.sql.gz"
rm -f "$RAW_PIPE"

echo "[3/4] Encrypting archive with OpenSSL AES-256-CBC (PBKDF2, 100,000 iterations)..."
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
  -in "${TMP_DIR}/dump.sql.gz" \
  -out "${TMP_DIR}/final.enc" \
  "${PASS_ARG[@]}"

rm -f "${TMP_DIR}/dump.sql.gz"

echo "[4/4] Finalizing immutable snapshot and cryptographic SHA-256..."
mv "${TMP_DIR}/final.enc" "$FINAL_ENC_ARCHIVE"
chmod 600 "$FINAL_ENC_ARCHIVE"

sha256sum "$FINAL_ENC_ARCHIVE" > "$SHA_FILE"
chmod 600 "$SHA_FILE"

echo "✓ Snapshot created: ${FINAL_ENC_ARCHIVE}"
echo "✓ Checksum: $(cat "$SHA_FILE")"
