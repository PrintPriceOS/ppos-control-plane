#!/usr/bin/env bash
# scripts/staging_backup_snapshot.sh
# Creates an authenticated, single-transaction, encrypted MySQL snapshot of staging database.
set -euo pipefail

BACKUP_DIR="${1:-/var/backups/ppos}"
DB_NAME="${MYSQL_DATABASE:-ppos_control_staging}"
DB_USER="${MYSQL_USER:-root}"
PASSPHRASE="${BACKUP_PASSPHRASE:-}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RAW_DUMP="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql"
COMPRESSED_FILE="${RAW_DUMP}.gz"
ENCRYPTED_FILE="${COMPRESSED_FILE}.enc"
SHA_FILE="${ENCRYPTED_FILE}.sha256"

if [ -z "$PASSPHRASE" ]; then
  echo "[FATAL] BACKUP_PASSPHRASE environment variable is required for encryption."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "[1/4] Dumping database: ${DB_NAME}..."
mysqldump \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  --databases "${DB_NAME}" > "$RAW_DUMP"

echo "[2/4] Compressing dump..."
gzip -9 "$RAW_DUMP"
# RAW_DUMP is removed and becomes RAW_DUMP.gz ($COMPRESSED_FILE)

echo "[3/4] Encrypting snapshot with AES-256-CBC..."
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
  -in "$COMPRESSED_FILE" \
  -out "$ENCRYPTED_FILE" \
  -pass "pass:${PASSPHRASE}"

rm -f "$COMPRESSED_FILE"
chmod 600 "$ENCRYPTED_FILE"

echo "[4/4] Generating SHA-256 checksum..."
sha256sum "$ENCRYPTED_FILE" > "$SHA_FILE"

echo "✓ Backup completed successfully: ${ENCRYPTED_FILE}"
echo "✓ Integrity verification hash: $(cat "$SHA_FILE")"
