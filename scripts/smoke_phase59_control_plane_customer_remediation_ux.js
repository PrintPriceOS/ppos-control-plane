/**
 * Phase 59: Smoke test for Customer Remediation UX Service
 */

const fs = require('fs');
const path = require('path');
const { getHumanReport } = require('../src/api/services/preflightHumanReportService');
const marketplaceOrderService = require('../src/api/services/marketplaceOrderService');
const marketplaceCustomerActionService = require('../src/api/services/marketplaceCustomerActionService');

const MOCKED_ORDERS = {};
const MOCKED_READINESS = {};
const MOCKED_CUSTOMER_ACTIONS = {};

// Mock the services for the test
marketplaceOrderService.getOrder = async (orderId) => {
    return MOCKED_ORDERS[orderId] || null;
};
marketplaceOrderService.computeReadiness = async (orderId) => {
    return MOCKED_READINESS[orderId] || { blockers: [], warnings: [] };
};
marketplaceCustomerActionService.getCustomerAction = async (orderId) => {
    if (MOCKED_CUSTOMER_ACTIONS[orderId]) {
        return {
            ok: true,
            customerAction: MOCKED_CUSTOMER_ACTIONS[orderId],
            expired: MOCKED_CUSTOMER_ACTIONS[orderId].expired || false
        };
    }
    return { ok: true, customerAction: null, expired: false };
};

const MOCK_JOB = {
    id: 'job-123',
    status: 'COMPLETED',
    metadata: { orderId: 'order-1' }
};

const scenarios = [
    {
        name: "1. No Action Required (READY_TO_CONTINUE)",
        orderId: 'order-1',
        jobOverrides: { review_decision: { decision: 'APPROVED_FOR_PRODUCTION' } },
        readiness: { blockers: [], warnings: [] },
        customerAction: null,
        expectedState: 'READY_TO_CONTINUE',
        expectedInvoiceAllowed: true
    },
    {
        name: "2. Operator Rejects (REUPLOAD_REQUIRED)",
        orderId: 'order-2',
        jobOverrides: { review_decision: { decision: 'REJECTED_REQUIRES_REUPLOAD' } },
        readiness: { blockers: [], warnings: [] },
        customerAction: { requiredFiles: ['INTERIOR_PDF'] },
        expectedState: 'REUPLOAD_REQUIRED',
        expectedInvoiceAllowed: false
    },
    {
        name: "3. Waiting for upload, existing token",
        orderId: 'order-3',
        jobOverrides: {},
        readiness: { blockers: ['CUSTOMER_REUPLOAD_REQUIRED'], warnings: [] },
        customerAction: { requiredFiles: ['COVER_PDF'], tokenPreview: 'cat_abcdef' },
        expectedState: 'WAITING_FOR_UPLOAD',
        expectedInvoiceAllowed: false
    },
    {
        name: "4. Token Expired",
        orderId: 'order-4',
        jobOverrides: {},
        readiness: { blockers: ['CUSTOMER_REUPLOAD_REQUIRED'], warnings: [] },
        customerAction: { requiredFiles: ['COVER_PDF', 'INTERIOR_PDF'], expired: true },
        expectedState: 'WAITING_FOR_UPLOAD',
        expectedInvoiceAllowed: false
    },
    {
        name: "5. Uploaded, pending preflight",
        orderId: 'order-5',
        jobOverrides: {},
        readiness: { blockers: ['PREFLIGHT_REQUIRED_AFTER_REUPLOAD'], warnings: [] },
        customerAction: null,
        expectedState: 'PREFLIGHT_REQUIRED',
        expectedInvoiceAllowed: false
    },
    {
        name: "6. Approved with Warnings",
        orderId: 'order-6',
        jobOverrides: { review_decision: { decision: 'APPROVED_WITH_WARNINGS' } },
        readiness: { blockers: [], warnings: [] },
        customerAction: null,
        expectedState: 'APPROVED_WITH_WARNINGS',
        expectedInvoiceAllowed: true
    },
    {
        name: "7. Preflight Review Required",
        orderId: 'order-7',
        jobOverrides: { review_required: true },
        readiness: { blockers: ['PREFLIGHT_REVIEW_DECISION_REQUIRED'], warnings: [] },
        customerAction: null,
        expectedState: 'PREFLIGHT_REVIEW_REQUIRED',
        expectedInvoiceAllowed: false
    }
];

async function run() {
    console.log("================================================================================");
    console.log("PPOS CONTROL PLANE — PHASE 59");
    console.log("SMOKE TEST: CUSTOMER REMEDIATION UX");
    console.log("================================================================================");

    let allPassed = true;
    const reportOut = {
        timestamp: new Date().toISOString(),
        scenarios: []
    };

    let mdOutput = `# Phase 59: Customer Remediation UX Service Verification\n\n`;

    for (const sc of scenarios) {
        console.log(`\nScenario: ${sc.name}`);
        MOCKED_ORDERS[sc.orderId] = { id: sc.orderId };
        MOCKED_READINESS[sc.orderId] = sc.readiness;
        MOCKED_CUSTOMER_ACTIONS[sc.orderId] = sc.customerAction;

        const job = { ...MOCK_JOB, ...sc.jobOverrides, metadata: { orderId: sc.orderId } };
        
        const res = await getHumanReport(job.id, { tenantId: 'test' }, job, []);
        const uxC = res.report.remediation_ux.customer;
        const uxO = res.report.remediation_ux.operator;

        let passed = true;
        const checks = [];

        // Check Expected State
        if (uxO.remediation_state !== sc.expectedState) {
            checks.push(`❌ Expected state ${sc.expectedState}, got ${uxO.remediation_state}`);
            passed = false;
        } else {
            checks.push(`✅ State matches: ${sc.expectedState}`);
        }

        // Check Readiness Effect
        if (uxO.readiness_effect.invoice_allowed !== sc.expectedInvoiceAllowed) {
            checks.push(`❌ Expected invoice_allowed ${sc.expectedInvoiceAllowed}, got ${uxO.readiness_effect.invoice_allowed}`);
            passed = false;
        } else {
            checks.push(`✅ Invoice allowed matches: ${sc.expectedInvoiceAllowed}`);
        }

        // Check Customer Sanitization
        const internalKeys = ['operator_summary', 'available_operator_actions', 'customer_action_token_status'];
        for (const k of internalKeys) {
            if (uxC[k] !== undefined) {
                checks.push(`❌ Customer object contains internal key ${k}`);
                passed = false;
            }
        }
        
        // Ensure no raw INTERIOR_PDF
        if (uxC.required_files && uxC.required_files.length > 0) {
            if (uxC.required_files.some(f => f.label === 'INTERIOR_PDF' || f.label === 'COVER_PDF')) {
                checks.push(`❌ Customer object contains raw required file code`);
                passed = false;
            }
        }

        checks.forEach(c => console.log(c));

        if (!passed) allPassed = false;

        reportOut.scenarios.push({
            name: sc.name,
            passed,
            checks,
            remediation_ux_operator: uxO,
            remediation_ux_customer: uxC
        });

        mdOutput += `## ${sc.name}\n`;
        mdOutput += `**Passed:** ${passed}\n\n`;
        mdOutput += `### Checks:\n`;
        checks.forEach(c => mdOutput += `- ${c}\n`);
        mdOutput += `\n### Operator UX JSON:\n\`\`\`json\n${JSON.stringify(uxO, null, 2)}\n\`\`\`\n\n`;
    }

    const outDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(path.join(outDir, 'phase59_control_plane_customer_remediation_ux.json'), JSON.stringify(reportOut, null, 2));
    fs.writeFileSync(path.join(outDir, 'phase59_control_plane_customer_remediation_ux.md'), mdOutput);

    if (allPassed) {
        console.log("\n✅ Phase 59 Smoke Test Passed");
        process.exit(0);
    } else {
        console.log("\n❌ Phase 59 Smoke Test Failed");
        process.exit(1);
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
