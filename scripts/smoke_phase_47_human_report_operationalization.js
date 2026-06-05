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
                recommended_next_action: {
                    primary_artifact_type: 'review_pdf',
                    primary_artifact_filename: 'fixed.pdf'
                },
                fix_summary: {
                    production_certified: false,
                    review_required: true
                }
            }
        };
    };

    let originalQuery;
    let lastSnapshotId = 'hrs_mock';

    try {
        originalQuery = db.query;

        db.query = async (sql, params) => {
            if (sql.includes('INSERT INTO control_plane_preflight_human_reports')) {
                lastSnapshotId = params[0];
                
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
                    report_json: '{}'
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
        const tokenRes = await humanReportSnapshotService.createShareToken(jobId, snapshotId, context);
        if (!tokenRes.ok) throw new Error('Failed to create share token');
        const token = tokenRes.token;
        console.log(`Share token generated: ${token.substring(0, 10)}...`);

        console.log(`4. Testing validateShareToken...`);
        const validateRes = await humanReportSnapshotService.validateShareToken(token);
        if (!validateRes.ok) throw new Error('Failed to validate share token');
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
