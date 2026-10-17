#!/usr/bin/env bash
# scripts/staging_restore_drill.sh
# Decrypts, verifies, and restores a snapshot into an isolated target MySQL instance.
set -euo pipefail

ENCRYPTED_FILE="${1:-}"
TARGET_DB="${2:-ppos_control_sandbox}"
PASSPHRASE="${BACKUP_PASSPHRASE:-}"

if [ -z "$ENCRYPTED_FILE" ] || [ ! -f "$ENCRYPTED_FILE" ]; then
  echo "[FATAL] Usage: $0 <path_to_backup.sql.gz.enc> [target_database]"
  exit 1
fi

if [ -z "$PASSPHRASE" ]; then
  echo "[FATAL] BACKUP_PASSPHRASE environment variable is required for decryption."
  exit 1
fi

SHA_FILE="${ENCRYPTED_FILE}.sha256"
if [ -f "$SHA_FILE" ]; then
  echo "[1/4] Verifying SHA-256 integrity..."
  sha256sum -c "$SHA_FILE"
else
  echo "[WARN] No .sha256 file found, skipping checksum verification."
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

DECRYPTED_GZ="${WORK_DIR}/restore.sql.gz"
DECRYPTED_SQL="${WORK_DIR}/restore.sql"

echo "[2/4] Decrypting AES-256-CBC backup..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in "$ENCRYPTED_FILE" \
  -out "$DECRYPTED_GZ" \
  -pass "pass:${PASSPHRASE}"

echo "[3/4] Decompressing..."
gunzip -c "$DECRYPTED_GZ" > "$DECRYPTED_SQL"

echo "[4/4] Restoring into target instance (${TARGET_DB})..."
START_TIME=$(date +%s%N)

mysql --database="${TARGET_DB}" < "$DECRYPTED_SQL"

END_TIME=$(date +%s%N)
ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))

echo "✓ Restoration successful. Real restore duration: ${ELAPSED_MS} ms"
