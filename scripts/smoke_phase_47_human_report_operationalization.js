const db = require('../src/api/services/mysqlClient');
const humanReportSnapshotService = require('../src/api/services/preflightHumanReportSnapshotService');
const reviewApprovalService = require('../src/api/services/preflightReviewApprovalService');

async function runSmokeTests() {
    console.log('--- PHASE 47 SMOKE TESTS START ---');

    // Mocks for humanReportService
    const humanReportService = require('../src/api/services/preflightHumanReportService');
    const originalGetHumanReport = humanReportService.getHumanReport;
    
    humanReportService.getHumanReport = async (jobId) => {
        return {
            ok: true,
            job_id: jobId,
            report: {
                outcome: 'FIXED_REVIEW_REQUIRED',
                severity: 'warning',
                summary_title: 'PDF fixed, review required before production',
                customer_summary: 'The PDF was corrected structurally, but it requires review before production.',
                recommended_next_action: {
                    primary_artifact_type: 'review_pdf',
                    primary_artifact_download_id: 'internal-id',
                    primary_artifact_filename: 'fixed.pdf'
                },
                fix_summary: {
                    production_certified: false,
                    review_required: true
                },
                artifact_recommendations: [
                    {
                        type: 'certified_pdf',
                        filename: 'certified.pdf',
                        customer_visible: false,
                        production_certified: false,
                        artifact_role: 'REVIEW_REQUIRED',
                        download_id: 'secret-certified'
                    },
                    {
                        type: 'fix_audit',
                        filename: 'fix_audit.json',
                        customer_visible: false,
                        artifact_role: 'FORENSIC_AUDIT',
                        download_id: 'secret-audit'
                    },
                    {
                        type: 'delta_report',
                        filename: 'delta_report.json',
                        customer_visible: false,
                        artifact_role: 'TECHNICAL_REPORT',
                        download_id: 'secret-delta'
                    },
                    {
                        type: 'fixed_pdf',
                        filename: 'fixed.pdf',
                        customer_visible: true,
                        is_customer_safe: false,
                        artifact_role: 'REVIEW_REQUIRED',
                        download_id: 'internal-fixed'
                    }
                ]
            }
        };
    };

    let originalQuery;
    let lastSnapshotId = 'hrs_mock';
    let lastReportJson = '{}';

    try {
        originalQuery = db.query;

        db.query = async (sql, params) => {
            if (sql.includes('INSERT INTO control_plane_preflight_human_reports')) {
                lastSnapshotId = params[0];
                lastReportJson = params[12]; // report_json is at index 12 in the INSERT query
                
                // Assert values
                if (params[4] !== 'FIXED_REVIEW_REQUIRED') throw new Error('Assertion failed: outcome is ' + params[4]);
                if (params[5] !== 'warning') throw new Error('Assertion failed: severity is null');
                if (params[7] !== 'review_pdf') throw new Error('Assertion failed: primary_artifact_type is ' + params[7]);
                if (params[9] !== 0) throw new Error('Assertion failed: production_certified is not false/0');
                if (params[10] !== 1) throw new Error('Assertion failed: review_required is not true/1');

                return [];
            }
            if (sql.includes('SELECT * FROM control_plane_preflight_human_reports') || sql.includes('SELECT report_json FROM control_plane_preflight_human_reports')) {
                return [{
                    id: lastSnapshotId,
                    job_id: params[1],
                    generated_at: new Date(),
                    generated_by: 'system',
                    report_json: lastReportJson
                }];
            }
            if (sql.includes('SELECT id FROM control_plane_preflight_human_reports')) {
                return [{ id: lastSnapshotId }];
            }
            if (sql.includes('SELECT * FROM control_plane_preflight_review_approvals')) {
                return [{
                    id: 'rev_mock',
                    decision: 'APPROVED_WITH_WARNINGS',
                    reason: 'Looks OK'
                }];
            }
            return [];
        };

        const jobId = 'smoke_job_' + Date.now();
        const tenantId = 'ppos-production';
        const context = { tenantId, userId: 'smoke_tester' };

        console.log(`1. Testing createSnapshot for job ${jobId}...`);
        const snapshotRes = await humanReportSnapshotService.createSnapshot(jobId, context);
        if (!snapshotRes.ok) throw new Error('Failed to create snapshot');
        const snapshotId = snapshotRes.snapshot_id;
        console.log(`Snapshot created: ${snapshotId}`);

        console.log(`2. Testing getLatestSnapshot...`);
        const getSnapshotRes = await humanReportSnapshotService.getLatestSnapshot(jobId, context);
        if (!getSnapshotRes.ok || getSnapshotRes.snapshot_id !== snapshotId) throw new Error('Failed to get latest snapshot');
        console.log('Got latest snapshot correctly.');

        console.log(`3. Testing createShareToken...`);
        
        // Mock route handler logic
        const mockRouteHandler = async (reqBody, mockLatestSnapshotId) => {
            const req = { body: reqBody, params: { jobId } };
            let response = null;
            let status = 200;
            const res = {
                status: (s) => { status = s; return res; },
                json: (j) => { response = j; }
            };
            
            try {
                const body = req.body || {};
                let sid = body.snapshotId || body.snapshot_id || null;

                if (!sid) {
                    if (mockLatestSnapshotId === 'FAIL') {
                        res.status(400).json({
                            ok: false,
                            error: {
                                code: "HUMAN_REPORT_SNAPSHOT_REQUIRED",
                                message: "A Human Report snapshot must be created before generating a share link."
                            }
                        });
                        return { status, response };
                    }
                    sid = mockLatestSnapshotId || snapshotId;
                }

                const payload = await humanReportSnapshotService.createShareToken(jobId, sid, context);
                res.json(payload);
            } catch (err) {
                res.status(500).json({ ok: false, error: { message: err.message } });
            }
            return { status, response };
        };

        // Case 1: body with snapshotId
        const case1 = await mockRouteHandler({ snapshotId });
        if (!case1.response.ok || !case1.response.share_url) throw new Error('Case 1 failed');
        if (!case1.response.token || !case1.response.expires_at || !case1.response.expires_in) throw new Error('Case 1 missing fields');

        // Case 2: body with snapshot_id
        const case2 = await mockRouteHandler({ snapshot_id: snapshotId });
        if (!case2.response.ok || !case2.response.share_url) throw new Error('Case 2 failed');

        // Case 3: empty body with latest snapshot available
        const case3 = await mockRouteHandler(undefined, snapshotId);
        if (!case3.response.ok || !case3.response.share_url) throw new Error('Case 3 failed');

        // Case 4: empty body with no latest snapshot
        const case4 = await mockRouteHandler(undefined, 'FAIL');
        if (case4.status !== 400 || case4.response.error.code !== 'HUMAN_REPORT_SNAPSHOT_REQUIRED') throw new Error('Case 4 failed');

        const token = case1.response.token;
        console.log(`Share token generated: ${token.substring(0, 10)}... and share_url: ${case1.response.share_url}`);

        console.log(`4. Testing validateShareToken...`);
        const validateRes = await humanReportSnapshotService.validateShareToken(token);
        if (!validateRes.ok) throw new Error('Failed to validate share token');
        
        const safeReport = validateRes.report;
        if (safeReport.outcome !== 'FIXED_REVIEW_REQUIRED') throw new Error('Assertion failed: validateShareToken outcome');
        if (safeReport.severity !== 'warning') throw new Error('Assertion failed: validateShareToken severity');
        if (!safeReport.customer_summary) throw new Error('Assertion failed: validateShareToken customer_summary');
        
        // Assert artifacts
        const artifacts = safeReport.artifact_recommendations || [];
        const types = Array.isArray(artifacts) ? artifacts.map(a => a.type) : Object.keys(artifacts);
        if (types.includes('certified_pdf')) throw new Error('Assertion failed: leaks certified_pdf');
        if (types.includes('fix_audit')) throw new Error('Assertion failed: leaks fix_audit');
        if (types.includes('delta_report')) throw new Error('Assertion failed: leaks delta_report');
        
        const hasSecretIds = JSON.stringify(safeReport).includes('secret-') || JSON.stringify(safeReport).includes('internal-');
        if (hasSecretIds) throw new Error('Assertion failed: internal download IDs leaked');

        if (!safeReport.recommended_next_action) throw new Error('Assertion failed: missing recommended_next_action');
        if (safeReport.recommended_next_action.primary_artifact_download_id) throw new Error('Assertion failed: primary_artifact_download_id leaked');

        console.log('Share token validated successfully. Sanitized report generated.');

        console.log(`5. Testing createDecision...`);
        const decisionRes = await reviewApprovalService.createDecision(jobId, snapshotId, 'APPROVED_WITH_WARNINGS', 'Looks OK', 'review_pdf', context);
        if (!decisionRes.ok) throw new Error('Failed to create decision');
        console.log(`Decision recorded: ${decisionRes.review_id}`);

        console.log(`6. Testing getLatestDecision...`);
        const getDecisionRes = await reviewApprovalService.getLatestDecision(jobId, context);
        if (!getDecisionRes.ok || getDecisionRes.decision.decision !== 'APPROVED_WITH_WARNINGS') throw new Error('Failed to get latest decision');
        console.log('Got latest decision correctly.');

        console.log('--- ALL SMOKE TESTS PASSED ---');
    } catch (err) {
        console.error('--- SMOKE TEST FAILED ---');
        console.error(err);
        process.exit(1);
    } finally {
        humanReportService.getHumanReport = originalGetHumanReport;
        db.query = originalQuery;
    }
}

runSmokeTests();
