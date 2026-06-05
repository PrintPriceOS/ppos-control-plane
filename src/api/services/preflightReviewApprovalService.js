const db = require('./mysqlClient');
const logger = require('./logger').child('review-approval-service');
const snapshotService = require('./preflightHumanReportSnapshotService');
const humanReportService = require('./preflightHumanReportService');
const controlPlaneNotificationService = require('./controlPlaneNotificationService');

function generateId(prefix = 'rev') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

class PreflightReviewApprovalService {

    unwrapStoredHumanReport(raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const report = parsed?.report || parsed || {};
        return { envelope: parsed || {}, report };
    }

    /**
     * Records an operator's decision for a specific snapshot, superseding previous decisions.
     */
    async createDecision(jobId, snapshotId, decision, reason, artifactData, context) {
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

        const snapshot = snapshotRows[0];
        const { report } = this.unwrapStoredHumanReport(snapshot.report_json);

        const reportOutcome = snapshot.outcome || report.outcome || 'UNKNOWN';

        const reviewRequired =
            snapshot.review_required === 1 ||
            snapshot.review_required === true ||
            report.findings_summary?.review_required === true ||
            report.fix_summary?.review_required === true ||
            reportOutcome === 'FIXED_REVIEW_REQUIRED';

        const finalReason = typeof reason === 'string' ? reason.trim() : '';

        if (decision === 'APPROVED_WITH_WARNINGS' && reviewRequired) {
            if (!finalReason) {
                const err = new Error('A reason is required when approving a review-required preflight report with warnings.');
                err.code = 'REVIEW_REASON_REQUIRED';
                throw err;
            }
        }
        if (decision === 'APPROVED_WITH_WARNINGS' && reportOutcome === 'FIXED_REVIEW_REQUIRED') {
            if (!finalReason) {
                const err = new Error('A reason is required when approving a review-required preflight report with warnings.');
                err.code = 'REVIEW_REASON_REQUIRED';
                throw err;
            }
        }
        if (['APPROVED_FOR_PRODUCTION', 'APPROVED_WITH_WARNINGS'].includes(decision)) {
            if (reportOutcome === 'BLOCKED') {
                const err = new Error('Cannot approve a BLOCKED preflight report.');
                err.code = 'REVIEW_DECISION_REJECTED';
                throw err;
            }
            if (reportOutcome === 'PROCESSING') {
                const err = new Error('Cannot approve a PROCESSING preflight report.');
                err.code = 'REVIEW_DECISION_REJECTED';
                throw err;
            }
            if (reportOutcome === 'UNKNOWN') {
                const err = new Error('Cannot approve a preflight report with UNKNOWN outcome.');
                err.code = 'REVIEW_DECISION_REJECTED';
                throw err;
            }
        }

        const approved_artifact_type = artifactData?.approved_artifact_type || null;
        let approvedFilename = artifactData?.approved_artifact_filename || null;
        let approvedDownloadId = artifactData?.approved_artifact_download_id || null;

        if (approved_artifact_type && (!approvedFilename || !approvedDownloadId)) {
            let matchedArtifact = null;
            if (report.artifact_recommendations) {
                if (Array.isArray(report.artifact_recommendations)) {
                    matchedArtifact = report.artifact_recommendations.find(a => a.type === approved_artifact_type || a.alias === approved_artifact_type);
                } else {
                    matchedArtifact = Object.values(report.artifact_recommendations).find(a => a.type === approved_artifact_type || a.alias === approved_artifact_type) || report.artifact_recommendations[approved_artifact_type];
                }
            }
            
            if (matchedArtifact) {
                if (!approvedFilename && matchedArtifact.filename) approvedFilename = matchedArtifact.filename;
                // Only use download_id if internal allowed. Keep simple: if it exists and we need it.
                if (!approvedDownloadId && matchedArtifact.download_id && !matchedArtifact.customer_visible) approvedDownloadId = matchedArtifact.download_id;
            } else if (approved_artifact_type === 'review_pdf' && reportOutcome === 'FIXED_REVIEW_REQUIRED' && report.recommended_next_action?.primary_artifact_type === 'review_pdf') {
                if (!approvedFilename && report.recommended_next_action.primary_artifact_filename) {
                    approvedFilename = report.recommended_next_action.primary_artifact_filename;
                }
            }
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
            operatorId, operatorEmail, finalReason, approved_artifact_type,
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
