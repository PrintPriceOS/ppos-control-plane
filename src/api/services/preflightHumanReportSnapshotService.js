const db = require('./mysqlClient');
const logger = require('./logger').child('human-report-snapshot');
const humanReportService = require('./preflightHumanReportService');
const jwt = require('jsonwebtoken');

function generateId(prefix = 'hrs') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

class PreflightHumanReportSnapshotService {
    
    normalizeHumanReportPayload(payload) {
        const report = payload?.report || payload;
        
        return {
            job_id: payload?.job_id || payload?.jobId || payload?.job?.id || report?.job_id,
            source_status: payload?.source_status || payload?.sourceStatus || report?.source_status || null,
            report,
            outcome: report?.outcome,
            severity: report?.severity,
            summary_title: report?.summary_title,
            primary_artifact_type: report?.recommended_next_action?.primary_artifact_type || report?.primary_artifact_type || null,
            primary_artifact_download_id: report?.recommended_next_action?.primary_artifact_download_id || null,
            primary_artifact_filename: report?.recommended_next_action?.primary_artifact_filename || null,
            production_certified: report?.fix_summary?.production_certified === true,
            review_required: report?.fix_summary?.review_required === true || report?.findings_summary?.review_required === true,
            customer_visible: Array.isArray(report?.artifact_recommendations)
                ? report.artifact_recommendations.some(a => a.customer_visible === true)
                : typeof report?.artifact_recommendations === 'object' && report?.artifact_recommendations !== null
                    ? Object.values(report.artifact_recommendations).some(a => a.customer_visible === true)
                    : false
        };
    }
    
    /**
     * Generates a new human report and saves it as a snapshot in the database.
     * Supersedes any existing snapshots for this job.
     */
    async createSnapshot(jobId, context) {
        logger.info({ event: 'CREATE_SNAPSHOT_STARTED', jobId });
        
        const tenantId = context?.tenantId || 'ppos-production';
        const generatedBy = context?.userId || 'SYSTEM';

        // 1. Generate live report
        const payload = await humanReportService.getHumanReport(jobId, context);
        if (!payload.ok) {
            throw new Error(`Failed to generate human report: ${payload.message || 'Unknown error'}`);
        }

        const normalized = this.normalizeHumanReportPayload(payload);

        if (!normalized.outcome) {
            throw new Error("Human Report snapshot requires report.outcome");
        }

        if (!normalized.severity) {
            throw new Error("Human Report snapshot requires report.severity");
        }

        // 2. Supersede old snapshots
        await db.query(`
            UPDATE control_plane_preflight_human_reports
            SET superseded_at = NOW()
            WHERE tenant_id = ? AND job_id = ? AND superseded_at IS NULL
        `, [tenantId, jobId]);

        // 3. Insert new snapshot
        const snapshotId = generateId('hrs');
        
        let primaryFilename = normalized.primary_artifact_filename;
        if (!primaryFilename && normalized.primary_artifact_type && normalized.report.artifact_recommendations) {
             const arts = normalized.report.artifact_recommendations;
             if (Array.isArray(arts)) {
                 const match = arts.find(a => a.artifact_type === normalized.primary_artifact_type);
                 if (match) primaryFilename = match.filename;
             } else if (arts[normalized.primary_artifact_type]) {
                 primaryFilename = arts[normalized.primary_artifact_type].filename;
             }
        }

        await db.query(`
            INSERT INTO control_plane_preflight_human_reports (
                id, tenant_id, job_id, source_status, outcome, severity, summary_title, 
                primary_artifact_type, primary_artifact_filename, production_certified, 
                review_required, customer_visible, report_json, generated_by, generated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            snapshotId,
            tenantId,
            normalized.job_id || jobId,
            normalized.source_status || 'COMPLETED',
            normalized.outcome,
            normalized.severity || 'info',
            normalized.summary_title || '',
            normalized.primary_artifact_type,
            primaryFilename,
            normalized.production_certified ? 1 : 0,
            normalized.review_required ? 1 : 0,
            normalized.customer_visible ? 1 : 0,
            JSON.stringify({
                ok: true,
                job_id: normalized.job_id || jobId,
                generated_at: new Date().toISOString(),
                source_status: normalized.source_status || 'COMPLETED',
                report: normalized.report
            }),
            generatedBy
        ]);

        logger.info({ event: 'CREATE_SNAPSHOT_SUCCESS', jobId, snapshotId });

        return {
            ok: true,
            snapshot_id: snapshotId,
            job_id: jobId,
            report: normalized.report
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

        const baseUrl = process.env.CONTROL_PLANE_PUBLIC_URL || process.env.PPOS_CONTROL_PUBLIC_URL || "https://control.printprice.pro";
        const share_url = `${baseUrl}/public/preflight/human-report/${token}`;
        const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        return {
            ok: true,
            token,
            share_url,
            expires_at,
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
