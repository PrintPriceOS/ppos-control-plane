'use strict';

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
    console.log('\n━━━ Phase 81E — Live Partner Operations Console Smoke ━━━\n');

    // SC1
    const routePath = path.join(ROOT, 'src', 'api', 'routes', 'adminLiveOrders.js');
    assert(fs.existsSync(routePath), 'SC1: Admin routes exist');

    // SC2
    const uiPath = path.join(ROOT, 'src', 'ui', 'pages', 'live-orders', 'LiveOrderOperationsPage.tsx');
    assert(fs.existsSync(uiPath), 'SC2: UI components exist');

    // SC3
    const clientPath = path.join(ROOT, 'src', 'ui', 'api', 'liveOrdersClient.ts');
    assert(fs.existsSync(clientPath), 'SC3: UI client exists');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 81E Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
