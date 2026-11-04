#!/usr/bin/env bash
# ==============================================================================
# scripts/cron_purge_preflight_temp.sh
#
# PrintPrice OS — Storage Retention & Physical Disk Maintenance Cron Script
# Implements European business-day retention windows and weekend immunity.
#
# Schedule: Run daily at 04:00 UTC via /etc/cron.d/ppos-storage-retention
# ==============================================================================

set -euo pipefail

LOG_FILE="/var/log/ppos-preflight-purge.log"
TEMP_DIR="${PPOS_PREFLIGHT_TEMP_DIR:-/tmp/ppos-preflight-temp}"
DATE_NOW="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

log() {
    echo "[$DATE_NOW] [STORAGE-PURGE-CRON] $1" | tee -a "$LOG_FILE"
}

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# 1. Detect Day of the Week (1 = Monday, 6 = Saturday, 7 = Sunday)
DAY_OF_WEEK=$(date -u +%u)

# 2. Weekend Immunity: Pause purge execution on Saturday and Sunday
if [ "$DAY_OF_WEEK" -eq 6 ] || [ "$DAY_OF_WEEK" -eq 7 ]; then
    log "WEEKEND_SUSPENDED: Day $DAY_OF_WEEK is outside European business hours (Sat/Sun). Maintenance cycle paused to protect active customer orders."
    exit 0
fi

# 3. Dynamic Retention Window Calculation
# Monday (1): Requires at least 72 hours (4,320 minutes) to safeguard files uploaded on Friday afternoon.
# Tuesday-Friday (2-5): Standard 36 hours (2,160 minutes).
if [ "$DAY_OF_WEEK" -eq 1 ]; then
    RETENTION_MINUTES=4320
    log "POLICY_ACTIVE: Monday run detected. Applying extended 72-hour retention window ($RETENTION_MINUTES min) to protect Friday submissions."
else
    RETENTION_MINUTES=2160
    log "POLICY_ACTIVE: Midweek run (Day $DAY_OF_WEEK). Applying standard 36-hour retention window ($RETENTION_MINUTES min)."
fi

# 4. Check if temporary directory exists
if [ ! -d "$TEMP_DIR" ]; then
    log "DIR_NOT_FOUND: Temp directory $TEMP_DIR does not exist. Nothing to purge."
    exit 0
fi

# 5. Execute safe find and unlink of expired PDF binaries
log "PURGE_START: Scanning $TEMP_DIR for PDF files older than $RETENTION_MINUTES minutes..."

PURGED_COUNT=0
RECLAIMED_BYTES=0

# Loop through candidate PDF files older than RETENTION_MINUTES
while IFS= read -r -d '' file; do
    if [ -f "$file" ]; then
        FILE_SIZE=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0)
        rm -f "$file"
        PURGED_COUNT=$((PURGED_COUNT + 1))
        RECLAIMED_BYTES=$((RECLAIMED_BYTES + FILE_SIZE))
        log "UNLINKED: $file ($(( FILE_SIZE / 1024 )) KB)"
    fi
done < <(find "$TEMP_DIR" -type f -name "*.pdf" -mmin +"$RETENTION_MINUTES" -print0)

RECLAIMED_MB=$(echo "scale=2; $RECLAIMED_BYTES / 1048576" | bc 2>/dev/null || echo "$(( RECLAIMED_BYTES / 1048576 ))")

log "PURGE_COMPLETE: Successfully unlinked $PURGED_COUNT expired PDF asset(s). Reclaimed: ${RECLAIMED_MB} MB."

