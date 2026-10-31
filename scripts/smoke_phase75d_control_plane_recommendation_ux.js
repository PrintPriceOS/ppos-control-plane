'use strict';
/**
 * Phase 75D Smoke Test — Control Plane Recommendation UX & Backend
 *
 * Validates:
 *  1. humanReportService extracts recommendation_governance.
 *  2. GET /jobs/:jobId/recommendations route handler returns correct recommendations.
 *  3. POST /jobs/:jobId/fix route handler blocks unsafe fixes when approve_unsafe is not true.
 *  4. POST /jobs/:jobId/fix route handler allows unsafe fixes when approve_unsafe is true.
 */

process.env.JWT_SECRET = 'dev-secret';
process.env.PPOS_CONTROL_PLANE_SESSION_SECRET = 'dev-session-secret';

const db = require('../src/api/services/mysqlClient');
const humanReportService = require('../src/api/services/preflightHumanReportService');
const adminPreflightJobsRouter = require('../src/api/routes/adminPreflightJobs');

let PASS = 0, FAIL = 0;
function assert(condition, label, detail) {
    if (!!condition) {
        console.log(`  ✅  ${label}`);
        PASS++;
    } else {
        console.error(`  ❌  ${label}${detail ? ': ' + detail : ''}`);
        FAIL++;
    }
}

async function runSmokeTests() {
    console.log('=== Running Phase 75D Smoke Tests (Fix Recommendation Layer) ===');

    const orderId = 'ord_test_75d';
    const jobId = 'job_test_75d';

    // Mock DB queries
    const originalQuery = db.query;
    db.query = async (sql, params) => {
        const sqlUpper = sql.toUpperCase();
        if (sqlUpper.includes('FROM PREFLIGHT_JOB_REGISTRY') || sqlUpper.includes('SELECT CANONICAL_PAYLOAD_JSON')) {
            return [
                {
                    canonical_payload_json: JSON.stringify({
                        job: {
                            id: jobId,
                            status: 'COMPLETED',
                            recommendation_governance: {
                                recommendation_signals: {
                                    fixability: 'COMPLETE',
                                    risk_level: 'HIGH',
                                    visual_sensitivity: 'HIGH',
                                    missing_tool: null,
                                    validator_required: true,
                                    operator_review_reason: 'Potentially destructive profile conversion required.'
                                },
                                recommended_next_actions: [
                                    { action_id: 'CONVERT_CMYK', label: 'Convert to CMYK', description: 'Convert color space safely.', severity: 'warning' }
                                ],
                                unsafe_auto_actions: ['CONVERT_CMYK'],
                                human_review_actions: ['MANUAL_VISUAL_INSPECTION']
                            }
                        }
                    })
                }
            ];
        }
        return [];
    };

    // 1. Validate service signal extraction
    try {
        const context = { tenantId: 'tenant-75d', Authorization: 'Bearer test-75d' };
        const reportResult = await humanReportService.getHumanReport(jobId, context);
        assert(reportResult.ok === true, 'Human report generation status');
        const report = reportResult.report;
        assert(report.recommendation_governance !== null, 'recommendation_governance exists');
        assert(report.recommendation_governance.recommendation_signals.risk_level === 'HIGH', 'Signal risk_level matched');
        assert(report.recommendation_governance.unsafe_auto_actions.includes('CONVERT_CMYK'), 'Unsafe auto action detected');
    } catch (err) {
        console.error('Service test failed:', err);
        FAIL++;
    }

    // 2. Locate route handlers from the router stack
    const recommendationsRoute = adminPreflightJobsRouter.stack.find(s => s.route && s.route.path === '/jobs/:jobId/recommendations');
    const recommendationsHandler = recommendationsRoute.route.stack[0].handle;

    const fixRoute = adminPreflightJobsRouter.stack.find(s => s.route && s.route.path.includes('/jobs/:jobId/actions/fix'));
    const fixHandler = fixRoute.route.stack[0].handle;

    // Mock preflightServiceClient and preflightContractGateway
    const gateway = require('../src/api/services/preflightContractGateway');
    const originalFixJob = gateway.fixJob;
    const originalGetJob = gateway.getJob;

    gateway.getJob = async () => ({
        id: jobId,
        status: 'COMPLETED',
        findings: ['RGB_COLOR_SPACE']
    });

    gateway.fixJob = async () => ({
        id: 'fix_job_123',
        status: 'PROCESSING'
    });

    try {
        // Test 2.1: GET /recommendations
        const mockReqGet = {
            params: { jobId },
            headers: {},
            query: {},
            actorContext: { userId: 'usr_operator', role: 'ADMIN', tenantId: 'tenant-75d', isSuperAdmin: true }
        };
        let responseStatus = 200;
        let responseJson = null;
        const mockResGet = {
            status: function(s) { responseStatus = s; return this; },
            json: function(j) { responseJson = j; return this; }
        };

        await recommendationsHandler(mockReqGet, mockResGet);
        assert(responseStatus === 200, 'GET recommendations handler returned 200');
        assert(responseJson.ok === true, 'GET recommendations handler returns ok: true');
        assert(responseJson.recommendation_governance.recommendation_signals.visual_sensitivity === 'HIGH', 'Recommendations returned visual sensitivity');

        // Test 2.2: POST /fix blocks when approve_unsafe is not true
        const mockReqPostFail = {
            params: { jobId },
            body: { fixes: ['CONVERT_CMYK'] },
            headers: {},
            query: {},
            actorContext: { userId: 'usr_operator', role: 'ADMIN', tenantId: 'tenant-75d', isSuperAdmin: true }
        };
        const mockResPostFail = {
            status: function(s) { responseStatus = s; return this; },
            json: function(j) { responseJson = j; return this; }
        };

        await fixHandler(mockReqPostFail, mockResPostFail);
        assert(responseStatus === 400, 'POST fix handler blocked with 400');
        assert(responseJson.ok === false, 'POST fix handler returned ok: false');
        assert(responseJson.error === 'UNSAFE_AUTO_ACTION_BLOCKED', 'Error code matches safety gate block');

        // Test 2.3: POST /fix succeeds when approve_unsafe is true
        const mockReqPostSuccess = {
            params: { jobId },
            body: { fixes: ['CONVERT_CMYK'], approve_unsafe: true },
            headers: {},
            query: {},
            actorContext: { userId: 'usr_operator', role: 'ADMIN', tenantId: 'tenant-75d', isSuperAdmin: true }
        };
        responseStatus = 200;
        const mockResPostSuccess = {
            status: function(s) { responseStatus = s; return this; },
            json: function(j) { responseJson = j; return this; }
        };

        await fixHandler(mockReqPostSuccess, mockResPostSuccess);
        assert(responseStatus === 200, 'POST fix handler allowed with 200');
        assert(responseJson.ok === true, 'POST fix handler returns ok: true');

    } catch (err) {
        console.error('API routes test failed:', err);
        FAIL++;
    } finally {
        db.query = originalQuery;
        gateway.fixJob = originalFixJob;
        gateway.getJob = originalGetJob;
    }

    console.log(`\n=== Smoke Tests Completed: Passed: ${PASS}, Failed: ${FAIL} ===`);
    if (FAIL > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runSmokeTests();
