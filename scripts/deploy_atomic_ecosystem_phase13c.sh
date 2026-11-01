#!/usr/bin/env bash
# scripts/deploy_atomic_ecosystem_phase13c.sh
#
# PrintPrice OS — Phase 13C: Atomic CI/CD & Health-Check Gate for 212.227.79.67
#
# Safely deploys and verifies:
#   1. Control Plane (`control.printprice.pro` -> `/opt/printprice-os/ppos-control-plane` + PM2 `ppos-control-plane`)
#   2. Corporative Web (`printprice.pro` -> `/var/www/vhosts/printprice.pro/current` + chown `printprice.pro_a2w0fsu9yw9:psacln` + PM2 cluster reload `printprice-web`)
#   3. Developer Docs (`docs.printprice.pro` -> HTTP 200 verification on Phase 11 & Phase 12 contracts)

set -euo pipefail

echo "=== [PHASE-13C] 1/3 Deploying Control Plane (control.printprice.pro) ==="
cd /opt/printprice-os/ppos-control-plane
git fetch origin main
git reset --hard origin/main
npm run build
cp -r dist/* /var/www/vhosts/printprice.pro/control.printprice.pro/httpdocs/
pm2 restart ppos-control-plane

echo "=== [PHASE-13C] 2/3 Synchronizing Corporative Cluster Ownership & PM2 (printprice.pro) ==="
if [ -d "/var/www/vhosts/printprice.pro/current" ]; then
    chown -R printprice.pro_a2w0fsu9yw9:psacln /var/www/vhosts/printprice.pro/current
    su - printprice.pro_a2w0fsu9yw9 -s /bin/bash -c "npx pm2 reload printprice-web"
fi

echo "=== [PHASE-13C] 3/3 Executing Live Ecosystem HTTP 200 Health Gate ==="
for url in \
    "https://printprice.pro/" \
    "https://printprice.pro/for-publishers" \
    "https://printprice.pro/for-printhouses" \
    "https://docs.printprice.pro/docs/architecture/editorial-manufacturing-phase11/" \
    "https://docs.printprice.pro/docs/architecture/financial-escrow-jdf-oee-phase12/" \
    "https://control.printprice.pro/"
do
    code=$(curl -sL -o /dev/null -w "%{http_code}" "$url")
    echo "  [GATE] $url -> HTTP $code"
    if [ "$code" != "200" ]; then
        echo "  [ERROR] Health gate failed on $url (expected 200, got $code)"
        exit 1
    fi
done

echo "=== [PHASE-13C] ALL ECOSYSTEM SURFACES VERIFIED HTTP 200 ==="
