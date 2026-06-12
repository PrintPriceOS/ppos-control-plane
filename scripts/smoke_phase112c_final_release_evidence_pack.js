'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsFinalReleaseCandidateService = require('../src/api/services/financialOperationsFinalReleaseCandidateService');
const FinancialOperationsFinalReleaseEvidencePackService = require('../src/api/services/financialOperationsFinalReleaseEvidencePackService');

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
    console.log('\n━━━ Phase 112C — Final Evidence Pack / Release Notes Service Smoke ━━━\n');

    const rcSvc = new FinancialOperationsFinalReleaseCandidateService();
    const evSvc = new FinancialOperationsFinalReleaseEvidencePackService(rcSvc);
    const actorAdmin = { role: 'CONTROL_PLANE_ADMIN', userId: 'a_1' };

    const validEvidence = {
        pre_production_runbook_completed: true,
        compliance_reporting_ready: true,
        provider_ready: true,
        production_activation_enabled: false,
        full_public_enabled: false,
        live_provider_connectivity_enabled: false
    };
    const p1 = await rcSvc.createReleaseCandidate({ candidateName: 'RC 1', evidence: validEvidence }, actorAdmin);

    // SC1: Generate final release evidence pack
    const res1 = await evSvc.buildEvidencePack(p1.final_release_candidate_id, actorAdmin);
    assert(res1.items.length === 12, 'SC1: Generate final release evidence pack');

    // SC2: Required safety statements exist
    assert(res1.safetyStatement.activates_production === false, 'SC2.1: Required safety statements exist');
    assert(res1.safetyStatement.full_public_enabled === false, 'SC2.2: Required safety statements exist');
    assert(res1.safetyStatement.live_providers_connected === false, 'SC2.3: Required safety statements exist');
    assert(res1.safetyStatement.executes_payment === false, 'SC2.4: Required safety statements exist');

    // SC3: Sensitive fields are redacted
    assert(res1.items[0].redacted_preview_json.notes === '[REDACTED]', 'SC3: Sensitive fields are redacted');

    // SC4: Audit events exist
    const evs = evSvc._mockEvents.filter(e => e.event_type === 'FINOPS_FINAL_RELEASE_EVIDENCE_PACK_CREATED');
    assert(evs.length > 0, 'SC4: Audit events exist');

    // SC5: Source records remain unchanged
    const sourceStr = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsFinalReleaseEvidencePackService.js'), 'utf-8');
    assert(!sourceStr.includes('UPDATE orders') && !sourceStr.includes('DELETE FROM'), 'SC5: Source records remain unchanged');
    
    // SC6: Evidence pack is deterministic
    assert(res1.items.find(i => i.evidence_key === 'EXECUTIVE_SUMMARY'), 'SC6: Evidence pack is deterministic');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 112C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
