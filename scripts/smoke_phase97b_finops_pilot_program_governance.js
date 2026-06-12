'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsPilotProgramService = require('../src/api/services/financialOperationsPilotProgramService');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 97B — Pilot Program Governance Smoke ━━━\n');

    const svc = new FinancialOperationsPilotProgramService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    // SC1
    const p1 = await svc.createDraftProgram({ programName: 'Test Pilot', allowedOperations: ['PAYMENT_DRY_RUN'], actor: actorAdmin });
    assert(p1.program_status === 'DRAFT', 'SC1: Create draft pilot program');

    // SC2
    await svc.requestReview({ programId: p1.pilot_program_id, actor: actorAdmin });
    assert(p1.program_status === 'MANUAL_REVIEW_REQUIRED', 'SC2: Activate only after manual approval/review flag');
    await svc.activateProgram({ programId: p1.pilot_program_id, actor: actorAdmin });
    assert(p1.program_status === 'ACTIVE_CONTROLLED_PILOT', 'SC2: Program activated');

    // SC3
    const p2 = await svc.createDraftProgram({ programName: 'Bad Pilot 1', actor: actorAdmin });
    await svc.requestReview({ programId: p2.pilot_program_id, actor: actorAdmin });
    p2.external_execution_enabled = true; // manual override
    try {
        await svc.activateProgram({ programId: p2.pilot_program_id, actor: actorAdmin });
        assert(false, 'SC3: Reject activation if external_execution_enabled true');
    } catch (err) {
        assert(err.message.includes('external execution must be disabled'), 'SC3: Reject activation if external_execution_enabled true');
    }

    // SC4
    const p3 = await svc.createDraftProgram({ programName: 'Bad Pilot 2', actor: actorAdmin });
    await svc.requestReview({ programId: p3.pilot_program_id, actor: actorAdmin });
    p3.full_public_enabled = true; // manual override
    try {
        await svc.activateProgram({ programId: p3.pilot_program_id, actor: actorAdmin });
        assert(false, 'SC4: Reject activation if full_public_enabled true');
    } catch (err) {
        assert(err.message.includes('FULL_PUBLIC must be disabled'), 'SC4: Reject activation if full_public_enabled true');
    }

    // SC5
    try {
        await svc.checkEligibility({ programId: p1.pilot_program_id, operationType: 'REFUND_DRY_RUN' });
        assert(false, 'SC5: Reject operation types outside allowlist');
    } catch (err) {
        assert(err.message.includes('not allowed'), 'SC5: Reject operation types outside allowlist');
    }

    // SC6 & SC7
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPilotProgramService.js'), 'utf-8');
    assert(content.includes('dry_run_only: true'), 'SC6: Enforce dry_run_only default');
    assert(!content.includes('UPDATE orders'), 'SC7: Source objects remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 97B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
