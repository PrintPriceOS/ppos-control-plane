const express = require('express');
const router = express.Router();
const artifactRegistry = require('../services/artifactRegistryService');
const { resolveActorContext } = require('../middleware/auth');
const db = require('../services/mysqlClient');

/**
 * GET /api/admin/artifacts
 * List artifacts with filters.
 */
router.get('/', async (req, res) => {
    const { tenantId, jobId, type } = req.query;
    const context = resolveActorContext(req);
    
    try {
        let query = 'SELECT * FROM preflight_artifacts WHERE deleted_at IS NULL';
        const params = [];

        // Scoping
        if (!context.isSuperAdmin) {
            query += ' AND tenant_id = ?';
            params.push(context.tenantId);
        } else if (tenantId) {
            query += ' AND tenant_id = ?';
            params.push(tenantId);
        }

        if (jobId) {
            query += ' AND job_id = ?';
            params.push(jobId);
        }
        if (type) {
            query += ' AND artifact_type = ?';
            params.push(type);
        }

        query += ' ORDER BY created_at DESC LIMIT 100';
        
        const rows = await db.query(query, params);
        res.json({ ok: true, artifacts: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/artifacts/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const artifact = await artifactRegistry.getArtifact(req.params.id);
        if (!artifact) return res.status(404).json({ ok: false, error: 'Not found' });
        res.json({ ok: true, artifact });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/artifacts/lineage/:jobId
 */
router.get('/lineage/:jobId', async (req, res) => {
    try {
        const lineage = await artifactRegistry.getJobLineage(req.params.jobId);
        res.json({ ok: true, lineage });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * DELETE /api/admin/artifacts/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        await artifactRegistry.softDelete(req.params.id, req.body.reason || 'Admin manual deletion');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
