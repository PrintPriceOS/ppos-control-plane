'use strict';

/**
 * src/api/routes/storageRoutes.js
 *
 * Storage Lifecycle & Quota Management Routes for PrintPrice OS.
 * Exposes:
 * - GET /api/storage/quota
 * - DELETE /api/storage/jobs/:jobId/pdf
 * - POST /api/storage/purge-retention-assets
 */

const express = require('express');
const router = express.Router();
const { resolveActorContext } = require('../middleware/auth');
const {
    getTenantStorageQuota,
    purgeJobPdfBinary,
    batchPurgeRetentionAssets
} = require('../services/storage/storageLifecycleService');

/**
 * GET /api/storage/quota
 */
router.get('/quota', async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const tenantId = context.tenantId || 'tenant-default';
        const quota = await getTenantStorageQuota(tenantId);
        return res.status(200).json({
            ok: true,
            tenantId,
            ...quota
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * DELETE /api/storage/jobs/:jobId/pdf
 */
router.delete('/jobs/:jobId/pdf', async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const tenantId = context.tenantId || 'tenant-default';
        const { jobId } = req.params;

        if (!jobId) {
            return res.status(400).json({
                ok: false,
                error: 'JOB_ID_REQUIRED: jobId is required in URL parameters.'
            });
        }

        const outcome = await purgeJobPdfBinary(jobId, tenantId, context);
        return res.status(200).json(outcome);
    } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/storage/purge-retention-assets
 */
router.post('/purge-retention-assets', async (req, res) => {
    try {
        const context = resolveActorContext(req);
        const tenantId = context.tenantId || 'tenant-default';
        const { jobId } = req.body || {};

        if (jobId) {
            const outcome = await purgeJobPdfBinary(jobId, tenantId, context);
            return res.status(200).json(outcome);
        }

        const batchOutcome = await batchPurgeRetentionAssets(tenantId, context);
        return res.status(200).json(batchOutcome);
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;

