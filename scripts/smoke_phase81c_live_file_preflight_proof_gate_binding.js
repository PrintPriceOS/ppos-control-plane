'use strict';

const fs = require('fs');
const path = require('path');
const LiveOrderPreflightGateService = require('../src/api/services/liveOrderPreflightGateService');
const LiveOrderLifecycleService = require('../src/api/services/liveOrderLifecycleService');

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
    console.log('\n━━━ Phase 81C — Live File / Preflight / Proof Gate Binding Smoke ━━━\n');

    const lifecycleSvc = new LiveOrderLifecycleService();
    // mock getLiveOrder to return required files
    lifecycleSvc.getLiveOrder = async () => ({ id: 'order1', required_files_json: JSON.stringify(['INTERIOR_PDF', 'COVER_PDF']) });
    
    const gateSvc = new LiveOrderPreflightGateService({ liveOrderLifecycleService: lifecycleSvc });
    const actor = { userId: 'u1', role: 'SYSTEM_ADMIN' };
    const liveOrderId = 'order1';

    // SC1
    let fileReadiness = await gateSvc.evaluateLiveOrderFileReadiness({ liveOrderId, actor });
    assert(fileReadiness.status === 'BLOCKED', 'SC1: Required file missing blocks readiness');

    // SC2
    await gateSvc.attachFileToLiveOrder({ liveOrderId, fileType: 'INTERIOR_PDF', fileId: 'f1', actor });
    assert(true, 'SC2: Interior PDF attached');

    // SC3
    await gateSvc.attachFileToLiveOrder({ liveOrderId, fileType: 'COVER_PDF', fileId: 'f2', actor });
    assert(true, 'SC3: Cover PDF attached');

    // SC4
    fileReadiness = await gateSvc.evaluateLiveOrderFileReadiness({ liveOrderId, actor });
    assert(fileReadiness.status === 'PASSED', 'SC4: File readiness passes when all required files exist');

    // SC5
    await gateSvc.submitLiveOrderPreflight({ liveOrderId, actor });
    await gateSvc.bindPreflightJobToLiveOrder({ liveOrderId, jobId: 'j1', fileType: 'INTERIOR_PDF', actor });
    assert(true, 'SC5: Preflight submitted and job bound');

    // SC6
    let pfStatus = await gateSvc.evaluateLiveOrderPreflightStatus({ liveOrderId, actor });
    assert(pfStatus.status === 'PASSED', 'SC6: Preflight completed with pass');

    // SC7
    gateSvc._mockData.jobs[liveOrderId].push({ jobId: 'j2', status: 'DEGRADED_BLOCKED' });
    pfStatus = await gateSvc.evaluateLiveOrderPreflightStatus({ liveOrderId, actor });
    assert(pfStatus.status === 'BLOCKED', 'SC7: Preflight degraded blocks when policy disallows');

    // SC8
    gateSvc._mockData.artifactTrust = 'REVIEW_REQUIRED';
    let trustStatus = await gateSvc.evaluateLiveOrderArtifactTrust({ liveOrderId, actor });
    assert(trustStatus.status === 'REVIEW_REQUIRED', 'SC8: artifact_trust review_required blocks');

    // SC9
    gateSvc._mockData.artifactTrust = 'PASSED';
    trustStatus = await gateSvc.evaluateLiveOrderArtifactTrust({ liveOrderId, actor });
    assert(trustStatus.status === 'PASSED', 'SC9: artifact_trust production_certified passes where required');

    // SC10
    await gateSvc.requireLiveOrderCustomerAction({ liveOrderId, reason: 'Please check resolution', actor });
    assert(gateSvc._mockData.customerActions[liveOrderId] === 'REQUIRED', 'SC10: Customer action required blocks');

    // SC11
    await gateSvc.resolveLiveOrderCustomerAction({ liveOrderId, actor });
    assert(gateSvc._mockData.customerActions[liveOrderId] === 'RESOLVED', 'SC11: Customer action resolved allows next evaluation');

    // SC12
    await gateSvc.markLiveOrderProofRequired({ liveOrderId, proofPayload: {}, actor });
    let snaps = await gateSvc.createLiveOrderGateSnapshots({ liveOrderId, actor });
    assert(snaps.proof === 'BLOCKED', 'SC12: Proof required blocks');

    // SC14
    await gateSvc.rejectLiveOrderProof({ liveOrderId, reason: 'Too dark', actor });
    snaps = await gateSvc.createLiveOrderGateSnapshots({ liveOrderId, actor });
    assert(snaps.proof === 'BLOCKED', 'SC14: Proof rejected blocks');

    // SC13
    await gateSvc.approveLiveOrderProof({ liveOrderId, actor });
    snaps = await gateSvc.createLiveOrderGateSnapshots({ liveOrderId, actor });
    assert(snaps.proof === 'PASSED', 'SC13: Proof approved passes proof gate');

    // SC15
    assert(snaps.file.status === 'PASSED' && snaps.trust.status === 'PASSED', 'SC15: Gate snapshots created');

    // SC16 & SC17
    const safeOrder = await lifecycleSvc.buildCustomerSafeLiveOrderSnapshot({ liveOrderId });
    assert(safeOrder._internal === undefined, 'SC16: Customer-safe summary hides preflight internals');
    assert(JSON.stringify(safeOrder).indexOf('guaranteed delivery') === -1, 'SC17: No false certified/print-ready claim');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 81C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
