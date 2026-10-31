const express = require('express');
const router = express.Router();
const humanReportSnapshotService = require('../services/preflightHumanReportSnapshotService');

// --- GET /api/public/preflight/human-report/:token ---
router.get('/human-report/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const result = await humanReportSnapshotService.validateShareToken(token);

        if (!result.ok) {
            return res.status(result.statusCode || 400).json(result);
        }

        console.log('[PUBLIC-PREFLIGHT][HUMAN-REPORT][RETURNING_SANITIZED_RESULT]', {
            job_id: result.job_id,
            snapshot_id: result.snapshot_id,
            outcome: result.report?.outcome,
            artifact_count: result.report?.artifact_recommendations?.length || 0
        });

        return res.json(result);
    } catch (err) {
        return res.status(500).json({ ok: false, error: { message: err.message } });
    }
});

module.exports = router;
