'use strict';
/**
 * scripts/smoke_phase80e_controlled_live_production_ui.js
 *
 * Phase 80E — Controlled Live Production UI Smoke Test.
 */

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}${detail ? ` (${detail})` : ''}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 80E — Controlled Live Production UI Smoke ━━━\n');

    // 1. Files exist
    const routesPath = path.join(ROOT, 'src', 'api', 'routes', 'adminLiveProduction.js');
    const clientPath = path.join(ROOT, 'src', 'ui', 'api', 'liveProductionClient.ts');
    const pagePath = path.join(ROOT, 'src', 'ui', 'pages', 'live-production', 'ControlledLiveProductionPage.tsx');

    assert(fs.existsSync(routesPath), 'SC1: adminLiveProduction.js routes exist');
    assert(fs.existsSync(clientPath), 'SC2: liveProductionClient.ts exists');
    assert(fs.existsSync(pagePath), 'SC3: ControlledLiveProductionPage.tsx exists');

    // Read UI content
    const uiContent = fs.readFileSync(pagePath, 'utf-8');

    // 4. Banners
    assert(uiContent.includes('Monitoring mode only — LIVE production remains disabled unless explicitly approved'), 'SC4: "Monitoring mode only" banner exists in UI');
    assert(uiContent.includes('It does not certify "guaranteed delivery" or "production-ready" PDFs without explicit governance'), 'SC4: Warning about overclaiming exists in UI');

    // 5. Client integration check
    assert(uiContent.includes('LiveProductionClient.activate'), 'SC5: UI uses LiveProductionClient for activation');
    
    // Ensure no direct "live_production_enabled = true" mutation happens in the UI code directly
    assert(!uiContent.includes('live_production_enabled = true'), 'SC5: No direct LIVE state mutation inside the UI component');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 80E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
