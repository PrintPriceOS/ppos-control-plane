const db = require('./mysqlClient');
const logger = require('./logger').child('human-report-snapshot');
const humanReportService = require('./preflightHumanReportService');
const jwt = require('jsonwebtoken');

function generateId(prefix = 'hrs') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

class PreflightHumanReportSnapshotService {
    
    /**
     * Generates a new human report and saves it as a snapshot in the database.
     * Supersedes any existing snapshots for this job.
     */
    async createSnapshot(jobId, context) {
        logger.info({ event: 'CREATE_SNAPSHOT_STARTED', jobId });
        
        const tenantId = context?.tenantId || 'ppos-production';
        const generatedBy = context?.userId || 'SYSTEM';

        // 1. Generate live report
        const report = await humanReportService.getHumanReport(jobId, context);
        if (!report.ok) {
            throw new Error(`Failed to generate human report: ${report.message || 'Unknown error'}`);
        }

        // 2. Supersede old snapshots
        await db.query(`
            UPDATE control_plane_preflight_human_reports
            SET superseded_at = NOW()
            WHERE tenant_id = ? AND job_id = ? AND superseded_at IS NULL
        `, [tenantId, jobId]);

        // 3. Insert new snapshot
        const snapshotId = generateId('hrs');
        const primaryArtifactType = report.primary_artifact_type || null;
        let primaryFilename = null;
        
        if (primaryArtifactType && report.artifact_recommendations && report.artifact_recommendations[primaryArtifactType]) {
            primaryFilename = report.artifact_recommendations[primaryArtifactType].filename;
        }

        const certifiedPdf = report.artifact_recommendations?.certified_pdf || {};
        const productionCertified = !!certifiedPdf.production_certified;
        const customerVisible = !!certifiedPdf.customer_visible;
        const reviewRequired = !!certifiedPdf.review_required || (report.outcome === 'FIXED_REVIEW_REQUIRED');

        await db.query(`
            INSERT INTO control_plane_preflight_human_reports (
                id, tenant_id, job_id, source_status, outcome, severity, summary_title, 
                primary_artifact_type, primary_artifact_filename, production_certified, 
                review_required, customer_visible, report_json, generated_by, generated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            snapshotId,
            tenantId,
            jobId,
            report.source_status || 'COMPLETED',
            report.outcome,
            report.severity || 'info',
            report.summary_title || '',
            primaryArtifactType,
            primaryFilename,
            productionCertified,
            reviewRequired,
            customerVisible,
            JSON.stringify(report),
            generatedBy
        ]);

        logger.info({ event: 'CREATE_SNAPSHOT_SUCCESS', jobId, snapshotId });

        return {
            ok: true,
            snapshot_id: snapshotId,
            job_id: jobId,
            report: report
        };
    }

    /**
     * Retrieves the latest active snapshot for a job.
     */
    async getLatestSnapshot(jobId, context) {
        const tenantId = context?.tenantId || 'ppos-production';
        
        const rows = await db.query(`
            SELECT * FROM control_plane_preflight_human_reports
            WHERE tenant_id = ? AND job_id = ? AND superseded_at IS NULL
            ORDER BY generated_at DESC LIMIT 1
        `, [tenantId, jobId]);

        if (!rows || rows.length === 0) {
            return { ok: false, error: 'NOT_FOUND', message: 'No active snapshot found.' };
        }

        const row = rows[0];
        let report;
        try {
            report = typeof row.report_json === 'string' ? JSON.parse(row.report_json) : row.report_json;
        } catch (err) {
            report = {};
        }

        return {
            ok: true,
            snapshot_id: row.id,
            job_id: row.job_id,
            generated_at: row.generated_at,
            generated_by: row.generated_by,
            report: report
        };
    }

    /**
     * Generates a secure share token (JWT) for a customer to view the report safely.
     */
    async createShareToken(jobId, snapshotId, context) {
        const tenantId = context?.tenantId || 'ppos-production';

        const rows = await db.query(`
            SELECT id FROM control_plane_preflight_human_reports
            WHERE tenant_id = ? AND job_id = ? AND id = ?
        `, [tenantId, jobId, snapshotId]);

        if (!rows || rows.length === 0) {
            throw new Error('SNAPSHOT_NOT_FOUND');
        }

        const payload = {
            jobId,
            snapshotId,
            tenantId,
            scope: 'HUMAN_REPORT_VIEW'
        };

        const secret = process.env.JWT_SECRET || 'dev-secret';
        const token = jwt.sign(payload, secret, { expiresIn: '7d' });

        logger.info({ event: 'SHARE_TOKEN_CREATED', jobId, snapshotId });

        return {
            ok: true,
            token,
            expires_in: '7 days'
        };
    }

    /**
     * Validates a share token and returns a filtered, customer-safe view of the snapshot.
     */
    async validateShareToken(token) {
        const secret = process.env.JWT_SECRET || 'dev-secret';
        let payload;
        
        try {
            payload = jwt.verify(token, secret);
        } catch (err) {
            return { ok: false, error: 'INVALID_TOKEN', message: err.message };
        }

        if (payload.scope !== 'HUMAN_REPORT_VIEW') {
            return { ok: false, error: 'INVALID_SCOPE', message: 'Token is not authorized for report viewing.' };
        }

        const { jobId, snapshotId, tenantId } = payload;

        const rows = await db.query(`
            SELECT * FROM control_plane_preflight_human_reports
            WHERE tenant_id = ? AND job_id = ? AND id = ?
        `, [tenantId, jobId, snapshotId]);

        if (!rows || rows.length === 0) {
            return { ok: false, error: 'SNAPSHOT_NOT_FOUND', message: 'The report snapshot no longer exists.' };
        }

        const row = rows[0];
        let report;
        try {
            report = typeof row.report_json === 'string' ? JSON.parse(row.report_json) : row.report_json;
        } catch (err) {
            report = {};
        }

        // Sanitize for customer: remove non-customer visible artifacts and internal trace details
        const safeReport = {
            ok: true,
            job_id: report.job_id,
            outcome: report.outcome,
            severity: report.severity,
            summary_title: report.summary_title,
            primary_artifact_type: report.primary_artifact_type,
            customer_summary: report.customer_summary || '',
            operator_summary: report.operator_summary || '', // Include as it explains fixes, but it's safe.
            fix_summary: report.fix_summary || {},
            artifact_recommendations: {}
        };

        if (report.artifact_recommendations) {
            for (const [key, artifact] of Object.entries(report.artifact_recommendations)) {
                if (artifact.customer_visible) {
                    safeReport.artifact_recommendations[key] = {
                        artifact_type: artifact.artifact_type,
                        filename: artifact.filename,
                        size_bytes: artifact.size_bytes,
                        role: artifact.role,
                        customer_visible: true
                    };
                }
            }
        }

        return {
            ok: true,
            snapshot: {
                id: row.id,
                job_id: row.job_id,
                generated_at: row.generated_at
            },
            report: safeReport
        };
    }
}

module.exports = new PreflightHumanReportSnapshotService();
