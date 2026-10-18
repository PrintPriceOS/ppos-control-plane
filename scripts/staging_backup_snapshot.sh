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

HMAC_FILE="${FINAL_ENC_ARCHIVE}.hmac"

# 1. Verification of Encryption Key & Dedicated Authentication Key
if [ -z "${BACKUP_PASSPHRASE:-}" ] && [ -z "${BACKUP_PASSPHRASE_FILE:-}" ]; then
  echo "[FATAL] Neither BACKUP_PASSPHRASE nor BACKUP_PASSPHRASE_FILE is configured." >&2
  exit 1
fi

ENC_PASS=""
if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -f "$BACKUP_PASSPHRASE_FILE" ]; then
  ENC_PASS=$(cat "$BACKUP_PASSPHRASE_FILE" | tr -d '\r\n')
else
  ENC_PASS="${BACKUP_PASSPHRASE:-}"
fi

# Dedicated independent HMAC authentication key (must be provided separately; silent derivation fallback strictly prohibited)
AUTH_KEY="${BACKUP_HMAC_KEY:-}"
if [ -z "$AUTH_KEY" ] && [ -n "${BACKUP_HMAC_KEY_FILE:-}" ] && [ -f "$BACKUP_HMAC_KEY_FILE" ]; then
  AUTH_KEY=$(cat "$BACKUP_HMAC_KEY_FILE" | tr -d '\r\n')
fi
if [ -z "$AUTH_KEY" ]; then
  echo "[FATAL] BACKUP_HMAC_KEY or BACKUP_HMAC_KEY_FILE is mandatory. Fallback key derivation from passphrase is forbidden for cryptographic independence." >&2
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
    rm -f "$FINAL_ENC_ARCHIVE" "$SHA_FILE" "$HMAC_FILE"
  fi
  exit $exit_code
}
trap cleanup EXIT INT TERM

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
# Passphrase provided securely via stdin/env to openssl
printf "%s" "$ENC_PASS" | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
  -in "${TMP_DIR}/dump.sql.gz" \
  -out "${TMP_DIR}/final.enc" \
  -pass stdin

rm -f "${TMP_DIR}/dump.sql.gz"

echo "[4/4] Computing HMAC-SHA256 authenticity tag and SHA-256 integrity digest..."
mv "${TMP_DIR}/final.enc" "$FINAL_ENC_ARCHIVE"
chmod 600 "$FINAL_ENC_ARCHIVE"

# 1. SHA-256 integrity manifest
sha256sum "$FINAL_ENC_ARCHIVE" > "$SHA_FILE"
chmod 600 "$SHA_FILE"

# 2. Cryptographic Authenticity: HMAC-SHA256 with dedicated authentication key
# Executed via node backupHmacUtil.js to avoid exposing HMAC secret in command-line arguments (ps aux)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HMAC_TAG=$(BACKUP_HMAC_KEY="$AUTH_KEY" node "${SCRIPT_DIR}/lib/backupHmacUtil.js" compute "$FINAL_ENC_ARCHIVE")
if [ -z "$HMAC_TAG" ] || [ ${#HMAC_TAG} -ne 64 ]; then
  echo "[FATAL] Failed to compute valid HMAC-SHA256 tag." >&2
  exit 1
fi
echo "$HMAC_TAG" > "$HMAC_FILE"
chmod 600 "$HMAC_FILE"

echo "✓ Authenticated Encrypted Snapshot created: ${FINAL_ENC_ARCHIVE}"
echo "✓ Integrity Digest: $(cat "$SHA_FILE")"
echo "✓ Authenticity HMAC Tag: ${HMAC_TAG}"

# 5. Staging Storage & Snapshot Retention Enforcement (FIFO max 3 snapshots + 500MB storage ceiling)
MAX_SNAPSHOTS="${STAGING_BACKUP_RETENTION_COUNT:-3}"
MAX_STORAGE_MB="${STAGING_BACKUP_MAX_MB:-500}"

echo "[Retention] Enforcing retention limit (max ${MAX_SNAPSHOTS} snapshots, max ${MAX_STORAGE_MB} MB storage)..."

# Count current snapshots for this database pattern
mapfile -t EXISTING_SNAPSHOTS < <(ls -t "${BACKUP_DIR}/${DB_NAME}"_*.sql.gz.enc 2>/dev/null || true)
TOTAL_SNAPSHOTS="${#EXISTING_SNAPSHOTS[@]}"

if [ "$TOTAL_SNAPSHOTS" -gt "$MAX_SNAPSHOTS" ]; then
  EXCESS=$((TOTAL_SNAPSHOTS - MAX_SNAPSHOTS))
  echo "Pruning ${EXCESS} older snapshot(s)..."
  for (( i=MAX_SNAPSHOTS; i<TOTAL_SNAPSHOTS; i++ )); do
    OLD_ARCHIVE="${EXISTING_SNAPSHOTS[$i]}"
    echo "  Removing expired archive: ${OLD_ARCHIVE}"
    rm -f "${OLD_ARCHIVE}" "${OLD_ARCHIVE}.sha256" "${OLD_ARCHIVE}.hmac"
  done
fi

# Quota verification
CURRENT_DIR_KB=$(du -sk "$BACKUP_DIR" 2>/dev/null | awk '{print $1}')
CURRENT_DIR_MB=$((CURRENT_DIR_KB / 1024))
if [ "$CURRENT_DIR_MB" -gt "$MAX_STORAGE_MB" ]; then
  echo "[WARNING] Backup directory usage (${CURRENT_DIR_MB} MB) exceeds configured limit (${MAX_STORAGE_MB} MB)." >&2
fi
echo "✓ Retention enforced: $(ls "${BACKUP_DIR}/${DB_NAME}"_*.sql.gz.enc 2>/dev/null | wc -l) snapshot(s) retained (${CURRENT_DIR_MB} MB total)."
