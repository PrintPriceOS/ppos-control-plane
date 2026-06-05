const db = require('./mysqlClient');
const logger = require('./logger').child('review-approval-service');
const snapshotService = require('./preflightHumanReportSnapshotService');
const humanReportService = require('./preflightHumanReportService');
const controlPlaneNotificationService = require('./controlPlaneNotificationService');

function generateId(prefix = 'rev') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

class PreflightReviewApprovalService {

    /**
     * Records an operator's decision for a specific snapshot, superseding previous decisions.
     */
    async createDecision(jobId, snapshotId, decision, reason, approvedArtifactType, context) {
        logger.info({ event: 'CREATE_DECISION_STARTED', jobId, snapshotId, decision });

        const tenantId = context?.tenantId || 'ppos-production';
        const operatorId = context?.userId || 'SYSTEM';
        const operatorEmail = context?.email || null;

        // Valid decisions: APPROVED_FOR_PRODUCTION, REJECTED_REQUIRES_REUPLOAD, APPROVED_WITH_WARNINGS
        const validDecisions = ['APPROVED_FOR_PRODUCTION', 'REJECTED_REQUIRES_REUPLOAD', 'APPROVED_WITH_WARNINGS'];
        if (!validDecisions.includes(decision)) {
            throw new Error(`Invalid decision: ${decision}`);
        }

        // 1. Verify Snapshot exists
        const snapshotRows = await db.query(`
            SELECT report_json FROM control_plane_preflight_human_reports
            WHERE tenant_id = ? AND job_id = ? AND id = ?
        `, [tenantId, jobId, snapshotId]);

        if (!snapshotRows || snapshotRows.length === 0) {
            throw new Error('SNAPSHOT_NOT_FOUND');
        }

        let report;
        try {
            report = typeof snapshotRows[0].report_json === 'string' 
                ? JSON.parse(snapshotRows[0].report_json) 
                : snapshotRows[0].report_json;
        } catch(e) {
            report = {};
        }

        const reportOutcome = report.outcome || 'UNKNOWN';
        let approvedFilename = null;
        let approvedDownloadId = null;

        if (approvedArtifactType && report.artifact_recommendations && report.artifact_recommendations[approvedArtifactType]) {
            approvedFilename = report.artifact_recommendations[approvedArtifactType].filename;
            // Get download token if applicable, or keep null
            approvedDownloadId = null; // Can be filled if we store tokens
        }

        // 2. Supersede old active decisions
        await db.query(`
            UPDATE control_plane_preflight_review_approvals
            SET superseded_at = NOW(), decision_status = 'SUPERSEDED'
            WHERE tenant_id = ? AND job_id = ? AND decision_status = 'ACTIVE'
        `, [tenantId, jobId]);

        // 3. Insert new decision
        const reviewId = generateId('rev');
        
        await db.query(`
            INSERT INTO control_plane_preflight_review_approvals (
                id, tenant_id, job_id, snapshot_id, decision, decision_status,
                operator_id, operator_email, reason, approved_artifact_type,
                approved_artifact_download_id, approved_artifact_filename, report_outcome,
                created_at
            ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            reviewId, tenantId, jobId, snapshotId, decision, 
            operatorId, operatorEmail, reason, approvedArtifactType,
            approvedDownloadId, approvedFilename, reportOutcome
        ]);

        logger.info({ event: 'CREATE_DECISION_SUCCESS', jobId, reviewId, decision });

        // Generate Notification
        try {
            await controlPlaneNotificationService.createNotification({
                tenantId,
                type: 'PREFLIGHT_REVIEW_DECISION',
                title: `Preflight Review Decision: ${decision}`,
                message: `Operator ${operatorEmail || operatorId} made a decision: ${decision}. Reason: ${reason || 'None provided'}`,
                severity: decision.startsWith('APPROVED') ? 'success' : 'warning',
                entityType: 'PREFLIGHT_JOB',
                entityId: jobId
            });
        } catch (notifErr) {
            logger.warn({ event: 'NOTIFICATION_FAILED', error: notifErr.message });
        }

        return {
            ok: true,
            review_id: reviewId,
            decision
        };
    }

    /**
     * Gets the latest active decision for a job.
     */
    async getLatestDecision(jobId, context) {
        const tenantId = context?.tenantId || 'ppos-production';

        const rows = await db.query(`
            SELECT * FROM control_plane_preflight_review_approvals
            WHERE tenant_id = ? AND job_id = ? AND decision_status = 'ACTIVE'
            ORDER BY created_at DESC LIMIT 1
        `, [tenantId, jobId]);

        if (!rows || rows.length === 0) {
            return { ok: false, error: 'NOT_FOUND', message: 'No active review decision found.' };
        }

        return {
            ok: true,
            decision: rows[0]
        };
    }
}

module.exports = new PreflightReviewApprovalService();
