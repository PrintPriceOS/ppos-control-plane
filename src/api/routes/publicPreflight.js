const express = require('express');
const router = express.Router();
const humanReportSnapshotService = require('../services/preflightHumanReportSnapshotService');

// --- GET /api/public/preflight/human-report/:token ---
router.get('/human-report/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const result = await humanReportSnapshotService.validateShareToken(token);
        if (!result.ok) {
            return res.status(401).json(result);
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: { message: err.message } });
    }
});

module.exports = router;
