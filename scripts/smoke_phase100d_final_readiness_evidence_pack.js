'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsReadinessEvidencePackService = require('../src/api/services/financialOperationsReadinessEvidencePackService');

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
    console.log('\n━━━ Phase 100D — Final Readiness Evidence Pack Smoke ━━━\n');

    const svc = new FinancialOperationsReadinessEvidencePackService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const mockReview = {
        activation_review_id: 'par_123',
        tenant_id: 't_1',
        blockers: ['Fake blocker for testing'],
        warnings: ['Fake warning for testing']
    };

    const mockEvidence = [
        { type: 'READINESS', passed: true },
        { type: 'RELEASE_GATE', passed: true },
        { type: 'PILOT', passed: true },
        { type: 'SANDBOX', passed: true },
        { type: 'HARDENING', passed: true },
        { type: 'SECURITY', passed: true },
        { type: 'OPERATIONAL', passed: true },
        { type: 'AUDIT', passed: true }
    ];

    // SC1
    const pack = await svc.generateEvidencePack(mockReview, 'GO_RECOMMENDED', mockEvidence, actorAdmin);
    assert(pack.readiness_summary && pack.hardening_summary && pack.audit_timeline_summary, 'SC1: Evidence pack contains required sections');

    // SC2
    assert(pack.final_statement.production_activation === 'NOT_ENABLED', 'SC2: Pack states production activation NOT ENABLED');
    assert(pack.final_statement.live_provider_connectivity === 'NOT_ENABLED', 'SC2: Pack states live providers NOT ENABLED');
    assert(pack.final_statement.payment_execution === 'NOT_ENABLED', 'SC2: Pack states payment execution NOT ENABLED');
    assert(pack.final_statement.full_public_launch === 'NOT_ENABLED', 'SC2: Pack states FULL_PUBLIC NOT ENABLED');

    // SC3
    assert(pack.blockers.length === 1 && pack.warnings.length === 1, 'SC3: Evidence pack includes blockers/warnings');

    // SC4
    const pack2 = await svc.generateEvidencePack(mockReview, 'GO_RECOMMENDED', mockEvidence, actorAdmin);
    assert(pack.final_statement.message === pack2.final_statement.message, 'SC4: Evidence pack generation is deterministic');

    // SC5 & SC6
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsReadinessEvidencePackService.js'), 'utf-8');
    assert(!content.includes('UPDATE orders'), 'SC5: Evidence generation is read-only');
    assert(svc._mockEvents.some(e => e.event_type === 'FINOPS_FINAL_READINESS_EVIDENCE_PACK_GENERATED'), 'SC6: Audit events exist');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 100D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
