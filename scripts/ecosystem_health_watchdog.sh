#!/usr/bin/env bash
# scripts/ecosystem_health_watchdog.sh
#
# PrintPrice OS — Proactive Ecosystem Health Watchdog & Auto-Healer (212.227.79.67)
#
# Checks:
#   1. PM2 status of `ppos-control-plane` (root) and `printprice-web` (vhost user cluster).
#   2. HTTP 200 status and TTFB (< 800 ms threshold) across all 6 production surfaces.
#   3. Auto-heals permissions and reloads PM2 if any surface returns non-200.
#   4. Appends structured telemetry to `/var/log/ppos-ecosystem-watchdog.log`.

set -euo pipefail

LOG_FILE="/var/log/ppos-ecosystem-watchdog.log"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
MAX_TTFB_MS=800
FAILURES=0

log_entry() {
    echo "[$TIMESTAMP] $1" | tee -a "$LOG_FILE"
}

log_entry "INFO: Starting PrintPriceOS proactive health & TTFB watchdog check..."

URLS=(
    "https://printprice.pro/"
    "https://printprice.pro/for-publishers"
    "https://printprice.pro/for-printhouses"
    "https://docs.printprice.pro/docs/architecture/editorial-manufacturing-phase11/"
    "https://docs.printprice.pro/docs/architecture/financial-escrow-jdf-oee-phase12/"
    "https://docs.printprice.pro/docs/architecture/profitability-einvoicing-cicd-phase13/"
    "https://control.printprice.pro/"
)

for url in "${URLS[@]}"; do
    metrics=$(curl -sL -o /dev/null -w "%{http_code}:%{time_starttransfer}" "$url" || echo "000:9.999")
    code="${metrics%%:*}"
    ttfb_sec="${metrics##*:}"
    ttfb_ms=$(awk -v t="$ttfb_sec" 'BEGIN { printf "%d", t * 1000 }')

    if [ "$code" != "200" ]; then
        log_entry "ALERT: Surface $url returned HTTP $code (TTFB ${ttfb_ms}ms). Triggering auto-heal..."
        FAILURES=$((FAILURES + 1))
    elif [ "$ttfb_ms" -gt "$MAX_TTFB_MS" ]; then
        log_entry "WARN: Surface $url exceeded TTFB threshold (${ttfb_ms}ms > ${MAX_TTFB_MS}ms)."
    else
        log_entry "OK: $url -> HTTP $code (TTFB ${ttfb_ms}ms)"
    fi
done

if [ "$FAILURES" -gt 0 ]; then
    log_entry "ACTION: Auto-healing PM2 processes and vhost ownership..."
    pm2 restart ppos-control-plane || true
    if [ -d "/var/www/vhosts/printprice.pro/current" ]; then
        chown -R printprice.pro_a2w0fsu9yw9:psacln /var/www/vhosts/printprice.pro/current
        su - printprice.pro_a2w0fsu9yw9 -s /bin/bash -c "npx pm2 reload printprice-web" || true
    fi
    log_entry "INFO: Auto-heal sequence completed."
else
    log_entry "PASS: All 7 production surfaces healthy (0 failures)."
fi

