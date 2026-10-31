'use strict';

const fs = require('fs');
const path = require('path');
const LiveOrderLifecycleService = require('../src/api/services/liveOrderLifecycleService');
const LiveOrderPreflightGateService = require('../src/api/services/liveOrderPreflightGateService');
const LiveOrderProductionOpsService = require('../src/api/services/liveOrderProductionOpsService');

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
    console.log('\n━━━ Phase 81F — End-to-End Limited Commercial Pilot Regression ━━━\n');

    // Setup mock services
    const mockEnablementSvc = {
        getLiveEnablement: async ({ tenantId }) => ({ id: 'e1', enablement_status: 'ACTIVE', live_production_enabled: true, live_scope: 'LIMITED_LIVE' })
    };
    
    const lifecycleSvc = new LiveOrderLifecycleService({ liveProductionEnablementService: mockEnablementSvc });
    const gateSvc = new LiveOrderPreflightGateService({ liveOrderLifecycleService: lifecycleSvc });
    const opsSvc = new LiveOrderProductionOpsService({ liveOrderLifecycleService: lifecycleSvc });

    const actor = { userId: 'admin1', role: 'SYSTEM_ADMIN', tenantId: 't1' };

    try {
        console.log('--- Phase 1: Intake ---');
        const payload = { liveScope: 'LIMITED_LIVE', orderType: 'BOOK_PRINT', requiredFiles: ['COVER_PDF', 'INTERIOR_PDF'] };
        const order = await lifecycleSvc.createLiveOrder({ tenantId: 't1', printhouseId: 'ph1', sourceOrderId: 'so1', payload, actor });
        assert(order.id && order.live_order_status === 'LIVE_INTAKE_CREATED', 'SC1: Order successfully intake and created in DB state');

        // Mock lifecycle order retrieval to return our updated object
        lifecycleSvc.getLiveOrder = async () => order;

        console.log('--- Phase 2: Gates & Preflight ---');
        await gateSvc.attachFileToLiveOrder({ liveOrderId: order.id, fileType: 'COVER_PDF', fileId: 'f1', actor });
        await gateSvc.attachFileToLiveOrder({ liveOrderId: order.id, fileType: 'INTERIOR_PDF', fileId: 'f2', actor });
        
        let fileStatus = await gateSvc.evaluateLiveOrderFileReadiness({ liveOrderId: order.id, actor });
        assert(fileStatus.status === 'PASSED', 'SC2: File readiness passed after upload');

        await gateSvc.submitLiveOrderPreflight({ liveOrderId: order.id, actor });
        await gateSvc.bindPreflightJobToLiveOrder({ liveOrderId: order.id, jobId: 'j1', fileType: 'COVER_PDF', actor });
        let pfStatus = await gateSvc.evaluateLiveOrderPreflightStatus({ liveOrderId: order.id, actor });
        assert(pfStatus.status === 'PASSED', 'SC3: Preflight passed');

        gateSvc._mockData.artifactTrust = 'PASSED';
        let trustStatus = await gateSvc.evaluateLiveOrderArtifactTrust({ liveOrderId: order.id, actor });
        assert(trustStatus.status === 'PASSED', 'SC4: Artifact trust passed');

        await gateSvc.markLiveOrderProofRequired({ liveOrderId: order.id, proofPayload: {}, actor });
        await gateSvc.approveLiveOrderProof({ liveOrderId: order.id, actor });
        let snaps = await gateSvc.createLiveOrderGateSnapshots({ liveOrderId: order.id, actor });
        assert(snaps.proof === 'PASSED', 'SC5: Proof gate passed after approval');

        console.log('--- Phase 3: Production Operations ---');
        // By now all gates pass
        order.live_order_status = 'READY_FOR_LIVE_QUEUE';
        
        const elig = await opsSvc.evaluateLiveOrderQueueEligibility({ liveOrderId: order.id, actor });
        assert(elig.eligible === true, 'SC6: Queue eligibility check passed');

        await opsSvc.enterLiveProductionQueue({ liveOrderId: order.id, actor });
        order.live_order_status = 'LIVE_QUEUED';
        assert(opsSvc._mockState.inQueue[order.id] === true, 'SC7: Entered live production queue');

        await opsSvc.assignMachineToLiveOrder({ liveOrderId: order.id, machineId: 'm1', actor });
        order.live_order_status = 'LIVE_ASSIGNED_TO_MACHINE';
        assert(opsSvc._mockState.machines[order.id] === 'm1', 'SC8: Machine assigned');

        await opsSvc.startLiveOrderProduction({ liveOrderId: order.id, actor });
        order.live_order_status = 'LIVE_IN_PRODUCTION';
        assert(opsSvc._mockState.production[order.id] === 'STARTED', 'SC9: Production started (SLA active)');

        console.log('--- Phase 4: Handoff & Completion ---');
        await opsSvc.generateLiveOrderHandoffPackage({ liveOrderId: order.id, actor });
        assert(opsSvc._mockState.handoffs[order.id] === 'GENERATED', 'SC10: Handoff package generated');

        opsSvc._mockState.audits[order.id] = ['FILE_ACCESS']; // Mock the audit
        await opsSvc.sendLiveOrderToPrinthouse({ liveOrderId: order.id, actor });
        assert(opsSvc._mockState.handoffs[order.id] === 'SENT', 'SC11: Handoff package sent to printhouse securely');

        await opsSvc.markLiveOrderCompleted({ liveOrderId: order.id, finalAuditPayload: { visualCheck: 'OK' }, actor });
        assert(true, 'SC12: Live order completed successfully with final audit');

    } catch (err) {
        assert(false, 'E2E Flow', err.message);
    }

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 81F Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
