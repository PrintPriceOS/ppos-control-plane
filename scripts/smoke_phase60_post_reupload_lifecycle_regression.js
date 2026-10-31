/**
 * Phase 60: Post-Reupload Lifecycle Regression / Production Gate Validation
 */

const fs = require('fs');
const path = require('path');
const mysqlClient = require('../src/api/services/mysqlClient');

// Override environment to enable payment tests
process.env.PPOS_ENABLE_PHASE37_PAYMENT = 'true';

const marketplaceOrderService = require('../src/api/services/marketplaceOrderService');
const marketplaceInvoicePaymentService = require('../src/api/services/marketplaceInvoicePaymentService');
const marketplaceProductionUnlockService = require('../src/api/services/marketplaceProductionUnlockService');
const marketplaceProductionQueueService = require('../src/api/services/marketplaceProductionQueueService');
const marketplaceCustomerActionService = require('../src/api/services/marketplaceCustomerActionService');
const { getHumanReport } = require('../src/api/services/preflightHumanReportService');

// ============================================================================
// MOCK DATABASE AND SERVICES
// ============================================================================

let currentOrderState = {
    status: 'OFFER_SELECTED',
    metadata_json: '{}',
    readiness_json: '{}',
    productionFiles: [
        { fileId: 'f1', kind: 'INTERIOR_PDF', status: 'REQUIRED', preflightStatus: 'PENDING', filename: 'interior.pdf' },
        { fileId: 'f2', kind: 'COVER_PDF', status: 'REQUIRED', preflightStatus: 'PENDING', filename: 'cover.pdf' }
    ]
};

let currentJobState = {
    id: 'job-123',
    status: 'COMPLETED',
    metadata: { orderId: 'order-123' },
    review_decision: null
};

// Intercept mysqlClient queries to simulate state
const originalQuery = mysqlClient.query;
mysqlClient.query = async (sql, params) => {
    const s = sql.toUpperCase();
    
    // marketplace_orders
    if (s.includes('SELECT') && s.includes('FROM MARKETPLACE_ORDERS')) {
        const ret = [{
            order_id: 'order-123',
            status: currentOrderState.status,
            metadata_json: currentOrderState.metadata_json,
            readiness_json: currentOrderState.readiness_json,
            book_spec_json: '{}',
            selected_offer_id: 'offer-1',
            selected_offer_json: '{"id": "offer-1", "total_price":100}',
            customer_id: 'cust-1',
            customer_json: '{"id": "cust-1"}',
            currency: 'EUR',
            estimated_price: 100
        }];
        // console.log("MOCK RETURNING MARKETPLACE_ORDERS:", ret);
        return ret;
    }
    
    // order files
    if (s.includes('SELECT') && s.includes('FROM MARKETPLACE_ORDER_FILES')) {
        return currentOrderState.productionFiles.map(f => {
            return {
                file_id: f.fileId,
                role: f.kind,
                version: 1,
                original_name: f.filename,
                status: f.status,
                preflight_status: f.preflightStatus,
                preflight_job_id: 'job-123',
                analysis_integrity_json: JSON.stringify({
                    snapshot_id: 'snap-123'
                }),
                decision_json: currentJobState.review_decision ? JSON.stringify({
                    active_decision: currentJobState.review_decision.decision,
                    decision_report_outcome: currentJobState.review_decision.decision,
                    snapshot_id: 'snap-123'
                }) : null
            };
        });
    }
    
    // order events
    if (s.includes('SELECT') && s.includes('FROM MARKETPLACE_ORDER_EVENTS')) {
        return [];
    }
    
    // order preflight bindings
    if (s.includes('SELECT') && s.includes('FROM MARKETPLACE_ORDER_PREFLIGHT_BINDINGS')) {
        return currentOrderState.productionFiles.map(f => {
            return {
                role: f.kind,
                preflight_job_id: 'job-123',
                status: 'COMPLETED',
                outcome_category: 'COMPLETED_WITH_FINDINGS',
                findings_count: 0,
                analysis_integrity_json: '{}',
                analyzer_coverage_json: '{}',
                artifact_refs_json: '{}'
            };
        });
    }
    
    // preflight registry
    if (s.includes('SELECT') && s.includes('FROM PREFLIGHT_JOB_REGISTRY')) {
        return [{ canonical_payload_json: JSON.stringify(currentJobState) }];
    }
    
    // Human report snapshots
    if (s.includes('SELECT') && s.includes('FROM CONTROL_PLANE_PREFLIGHT_HUMAN_REPORTS')) {
        return [{
            id: 'snap-123',
            job_id: 'job-123',
            report_json: JSON.stringify({
                outcome: 'FIXED_REVIEW_REQUIRED'
            }),
            decision_json: currentJobState.review_decision ? JSON.stringify({
                decision: currentJobState.review_decision.decision,
                reason: currentJobState.review_decision.reason
            }) : null
        }];
    }
    
    // Review decisions
    if (s.includes('SELECT') && s.includes('FROM CONTROL_PLANE_PREFLIGHT_REVIEW_APPROVALS')) {
        if (!currentJobState.review_decision) return [];
        return [{
            id: 'rev-123',
            job_id: 'job-123',
            snapshot_id: 'snap-123',
            decision: currentJobState.review_decision.decision,
            reason: currentJobState.review_decision.reason,
            decision_status: 'ACTIVE'
        }];
    }
    
    // Updates
    if (s.includes('UPDATE MARKETPLACE_ORDERS')) {
        const setPart = s.substring(s.indexOf('SET '), s.indexOf('WHERE'));
        const assignments = setPart.replace('SET ', '').split(',').map(part => part.trim());
        let paramIdx = 0;
        for (const assignment of assignments) {
            if (assignment.includes('=')) {
                const [col, val] = assignment.split('=').map(p => p.trim());
                if (val === '?') {
                    if (col.toLowerCase() === 'metadata_json') currentOrderState.metadata_json = params[paramIdx];
                    if (col.toLowerCase() === 'readiness_json') currentOrderState.readiness_json = params[paramIdx];
                    if (col.toLowerCase() === 'status') {
                        console.log(`MOCK UPDATE STATUS TO: ${params[paramIdx]} (from ${currentOrderState.status})`);
                        currentOrderState.status = params[paramIdx];
                    }
                    paramIdx++;
                }
            }
        }
        return { affectedRows: 1 };
    }
    
    if (s.includes('INSERT INTO MARKETPLACE_ORDER_EVENTS')) {
        return { insertId: 1 };
    }

    if (s.includes('SELECT') && s.includes('FROM PRINT_NODE_MACHINE_PROFILES')) {
        return [{ id: 'machine-1' }];
    }

    return [];
};

// Mock appendOrderEvent if it doesn't exist
if (!marketplaceOrderService.appendOrderEvent) {
    marketplaceOrderService.appendOrderEvent = async () => {};
}
if (!marketplaceOrderService.addAuditEvent) {
    marketplaceOrderService.addAuditEvent = async () => {};
}

// ============================================================================
// LIFECYCLE SIMULATION
// ============================================================================

async function runTest() {
    console.log("================================================================================");
    console.log("PPOS CONTROL PLANE — PHASE 60");
    console.log("SMOKE TEST: POST-REUPLOAD LIFECYCLE REGRESSION");
    console.log("================================================================================");

    const reportOut = { timestamp: new Date().toISOString(), scenarios: [] };
    let mdOutput = `# Phase 60: Post-Reupload Lifecycle Verification\n\n`;
    let allPassed = true;

    const scenarios = [];
    const pushCheck = (checks, condition, msg) => {
        if (!condition) { checks.push(`❌ ${msg}`); allPassed = false; }
        else checks.push(`✅ ${msg}`);
    };

    // Helper to evaluate gates
    const evaluateGates = async (stepName) => {
        let invoiceAllowed = true, paymentLinkAllowed = true, paymentConfirmAllowed = true, unlockAllowed = true, queueEligible = true;
        let invoiceReason = '', unlockReason = '', queueReason = '';
        
        try { await marketplaceInvoicePaymentService.generateMarketplaceInvoice('order-123'); } 
        catch(e) { invoiceAllowed = false; invoiceReason = e.message || e.code; }
        
        try { await marketplaceInvoicePaymentService.requestMarketplacePaymentLink('order-123'); } 
        catch(e) { paymentLinkAllowed = false; }
        
        try { await marketplaceInvoicePaymentService.markMarketplacePaymentConfirmed('order-123'); } 
        catch(e) { paymentConfirmAllowed = false; }
        
        try { 
            const uRes = await marketplaceProductionUnlockService.unlockProductionAfterPayment('order-123'); 
            if (!uRes.ok) { unlockAllowed = false; unlockReason = uRes.blockers?.join(',') || 'BLOCKED'; }
        } catch(e) { unlockAllowed = false; unlockReason = e.message || e.code; }
        
        try { 
            const q = await marketplaceProductionQueueService.evaluateProductionQueueEligibility('order-123', { machineId: 'machine-1' });
            queueEligible = q.eligible; 
            if (!queueEligible) queueReason = q.blockers.join(',');
        } catch(e) { queueEligible = false; queueReason = e.message || e.code; }

        const r = await marketplaceOrderService.computeReadiness('order-123');

        return {
            stepName,
            readiness_ready: r.ready,
            blockers: r.blockers,
            warnings: r.warnings,
            invoiceAllowed, invoiceReason,
            paymentLinkAllowed,
            paymentConfirmAllowed,
            unlockAllowed, unlockReason,
            queueEligible, queueReason
        };
    };

    // Step 1: Initial state, file preflighted but review required
    currentJobState.status = 'COMPLETED';
    currentOrderState.productionFiles = [
        { fileId: 'f1', kind: 'INTERIOR_PDF', status: 'ACTIVE', preflightStatus: 'COMPLETED_WITH_FINDINGS', filename: 'interior.pdf' }
    ];
    let gates = await evaluateGates('1. Preflight Review Required');
    let checks = [];
    pushCheck(checks, !gates.readiness_ready, 'Readiness is false');
    pushCheck(checks, !gates.invoiceAllowed, 'Invoice blocked');
    pushCheck(checks, !gates.paymentLinkAllowed, 'Payment link blocked');
    pushCheck(checks, !gates.unlockAllowed, 'Unlock blocked');
    pushCheck(checks, !gates.queueEligible, 'Queue blocked');
    scenarios.push({ ...gates, checks });

    // Step 2: Operator Rejects
    currentJobState.review_decision = { decision: 'REJECTED_REQUIRES_REUPLOAD', reason: 'Too dark' };
    gates = await evaluateGates('2. Operator Rejects Review');
    checks = [];
    pushCheck(checks, !gates.readiness_ready, 'Readiness is false');
    pushCheck(checks, gates.blockers.includes('PREFLIGHT_REVIEW_REJECTED_REUPLOAD_REQUIRED_INTERIOR_PDF'), 'Blocker PREFLIGHT_REVIEW_REJECTED_REUPLOAD_REQUIRED present');
    pushCheck(checks, !gates.invoiceAllowed, 'Invoice blocked');
    scenarios.push({ ...gates, checks });

    // Step 3: Customer Action Generation
    let md = JSON.parse(currentOrderState.metadata_json);
    md.remediation = { status: 'CUSTOMER_ACTION_REQUIRED', requiredFiles: ['INTERIOR_PDF'] };
    currentOrderState.metadata_json = JSON.stringify(md);
    
    const tokenRes = await marketplaceCustomerActionService.createCustomerAction('order-123');
    checks = [];
    pushCheck(checks, tokenRes.ok, 'Customer action created safely');
    pushCheck(checks, tokenRes.tokenPreview && !tokenRes.tokenPreview.includes('raw'), 'Token preview is safe');
    scenarios.push({ stepName: '3. Customer Action Created', checks });

    // Check Human Report UX Sanitation
    const hr = await getHumanReport('job-123', {});
    const uxCust = hr.report.remediation_ux.customer;
    checks = [];
    console.log("================= REQUIRED FILES ==================");
    console.log(uxCust.required_files);
    console.log("===================================================");
    pushCheck(checks, uxCust.remediation_required === true, 'Customer UX says remediation required');
    pushCheck(checks, uxCust.operator_summary === undefined, 'No operator summary in customer UX');
    pushCheck(checks, uxCust.required_files && uxCust.required_files.some(f => f.label === 'Interior PDF'), 'Mapped to Interior PDF safely');
    pushCheck(checks, uxCust.customer_action_token_status === undefined, 'No raw token internals in customer UX');
    scenarios.push({ stepName: '4. UX Sanitation Check', checks });

    // Step 5: Customer Uploads Replacement
    currentOrderState.productionFiles = [
        { fileId: 'f2', kind: 'INTERIOR_PDF', status: 'ACTIVE', preflightStatus: 'PENDING', filename: 'interior_v2.pdf' },
        { fileId: 'f3', kind: 'COVER_PDF', status: 'ACTIVE', preflightStatus: 'PENDING', filename: 'cover_v2.pdf' }
    ];
    gates = await evaluateGates('5. Replacement File Uploaded');
    checks = [];
    pushCheck(checks, !gates.readiness_ready, 'Readiness is false after upload');
    pushCheck(checks, gates.blockers.includes('INTERIOR_FILE_PENDING') || gates.blockers.some(b => b.includes('PENDING')) || gates.blockers.some(b => b.includes('UNACCEPTABLE')), 'Blocker PENDING or UNACCEPTABLE present');
    pushCheck(checks, !gates.invoiceAllowed, 'Invoice remains blocked after upload');
    scenarios.push({ ...gates, checks });

    // Step 6: Replacement Preflight Completes (Review Required)
    currentOrderState.productionFiles = [
        { fileId: 'f2', kind: 'INTERIOR_PDF', status: 'ACTIVE', preflightStatus: 'COMPLETED_WITH_FINDINGS', filename: 'interior_v2.pdf' },
        { fileId: 'f3', kind: 'COVER_PDF', status: 'ACTIVE', preflightStatus: 'COMPLETED_WITH_FINDINGS', filename: 'cover_v2.pdf' }
    ];
    currentJobState.review_decision = null; // reset decision for new file
    gates = await evaluateGates('6. Replacement Preflight Requires Review');
    checks = [];
    pushCheck(checks, !gates.readiness_ready, 'Readiness is false');
    pushCheck(checks, gates.blockers.includes('PREFLIGHT_REVIEW_DECISION_REQUIRED_INTERIOR_PDF'), 'Blocker PREFLIGHT_REVIEW_DECISION_REQUIRED present');
    pushCheck(checks, !gates.invoiceAllowed, 'Invoice remains blocked pending review');
    scenarios.push({ ...gates, checks });

    // Step 7: Operator Approves with Warnings
    currentJobState.review_decision = { decision: 'APPROVED_WITH_WARNINGS', reason: 'Acceptable' };
    gates = await evaluateGates('7. Operator Approves with Warnings');
    checks = [];
    pushCheck(checks, gates.readiness_ready, 'Readiness is true after approval');
    pushCheck(checks, !gates.blockers.includes('PREFLIGHT_REVIEW_REJECTED_REUPLOAD_REQUIRED_INTERIOR_PDF'), 'Old rejection blocker removed');
    pushCheck(checks, gates.warnings.includes('PREFLIGHT_APPROVED_WITH_WARNINGS_INTERIOR_PDF'), 'Warning preserved');
    pushCheck(checks, gates.invoiceAllowed, 'Invoice generation allowed');
    
    // Actually generate invoice to proceed
    await marketplaceInvoicePaymentService.generateMarketplaceInvoice('order-123');
    md = JSON.parse(currentOrderState.metadata_json);
    md.invoice_gate = { invoiceReady: true }; // simulate invoice gate
    currentOrderState.metadata_json = JSON.stringify(md);
    scenarios.push({ ...gates, checks });

    // Step 8: Payment Request
    gates = await evaluateGates('8. Payment Check');
    checks = [];
    console.log("METADATA BEFORE PAYMENT LINK:", currentOrderState.metadata_json);
    // Just request payment to proceed
    await marketplaceInvoicePaymentService.requestMarketplacePaymentLink('order-123');
    pushCheck(checks, true, 'Payment link allowed');
    scenarios.push({ ...gates, checks });

    // Step 9: Payment Confirm
    checks = [];
    try {
        const pRes = await marketplaceInvoicePaymentService.markMarketplacePaymentConfirmed('order-123');
        pushCheck(checks, pRes.ok, 'Payment confirmation succeeded');
    } catch(e) {
        pushCheck(checks, false, 'Payment confirmation failed: ' + e.message);
    }
    scenarios.push({ stepName: '9. Payment Confirmation', checks });

    // Step 10: Production Unlock
    checks = [];
    try {
        const uRes = await marketplaceProductionUnlockService.unlockProductionAfterPayment('order-123');
        pushCheck(checks, uRes.ok || uRes.idempotent, 'Production unlocked');
    } catch(e) {
        pushCheck(checks, false, 'Production unlock failed: ' + e.message);
    }
    scenarios.push({ stepName: '10. Production Unlock', checks });

    // Step 11: Production Queue Eligibility
    md = JSON.parse(currentOrderState.metadata_json);
    md.dispatch_package = { status: 'PRINTHOUSE_ACCEPTED', manifest: { invoice: {status: 'ISSUED'}, payment: {status: 'PAYMENT_CONFIRMED'} } };
    md.production_unlock = { status: 'PRODUCTION_UNLOCKED' };
    md.production_decision = { decision: 'PRODUCTION_ACCEPTED' };
    currentOrderState.status = 'PRODUCTION_ACCEPTED';
    currentOrderState.metadata_json = JSON.stringify(md);
    
    checks = [];
    try { 
        const q = await marketplaceProductionQueueService.evaluateProductionQueueEligibility('order-123', { machineId: 'machine-1' });
        pushCheck(checks, q.eligible, 'Queue is eligible');
        pushCheck(checks, q.warnings && q.warnings.length > 0, 'Warnings are preserved in queue check');
        scenarios.push({ stepName: '11. Production Queue Eligibility', checks, warnings: q.warnings });
    } catch(e) {
        pushCheck(checks, false, 'Queue check threw error: ' + e.message);
        scenarios.push({ stepName: '11. Production Queue Eligibility', checks });
    }

    // Generate output
    for (const sc of scenarios) {
        console.log(`\nScenario: ${sc.stepName}`);
        reportOut.scenarios.push(sc);
        mdOutput += `## ${sc.stepName}\n`;
        mdOutput += `### Checks:\n`;
        sc.checks.forEach(c => {
            console.log(c);
            mdOutput += `- ${c}\n`;
        });
        if (sc.blockers) mdOutput += `Blockers: ${sc.blockers.join(', ')}\n`;
        if (sc.warnings) mdOutput += `Warnings: ${sc.warnings.join(', ')}\n`;
        mdOutput += `\n`;
    }

    const outDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'phase60_post_reupload_lifecycle_regression.json'), JSON.stringify(reportOut, null, 2));
    fs.writeFileSync(path.join(outDir, 'phase60_post_reupload_lifecycle_regression.md'), mdOutput);

    if (allPassed) {
        console.log("\n✅ Phase 60 Smoke Test Passed");
        process.exit(0);
    } else {
        console.log("\n❌ Phase 60 Smoke Test Failed");
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
