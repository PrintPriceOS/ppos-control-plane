/**
 * src/api/routes/materialsAdmin.js
 * 
 * Canonical backend API routes for Materials & Paper Catalog.
 * Handles inventory retrieval, node matching, reservation locks, and dynamic lifecycle events.
 */
const express = require('express');
const router = express.Router();
const materialService = require('../services/materialAvailabilityService');

/**
 * GET /api/admin/materials
 * Retrieves all catalog materials with predictive availability scoring.
 */
router.get('/', async (req, res) => {
    try {
        const rows = await materialService.getAllMaterials();
        if (rows && rows.source_status) {
            return res.json(rows);
        }
        res.json({ ok: true, data: rows });
    } catch (err) {
        console.error('[MATERIALS-API] Failed to fetch catalog:', err);
        res.status(500).json({ ok: false, error: err.message, code: 'MATERIALS_FETCH_ERROR' });
    }
});

/**
 * GET /api/admin/materials/node/:nodeId
 * Retrieves material catalog dedicated to a target physical printing machine/node.
 */
router.get('/node/:nodeId', async (req, res) => {
    const { nodeId } = req.params;
    try {
        // Recompute forecasts first to provide fresh predictive state
        await materialService.forecastDepletion(nodeId);
        const rows = await materialService.getInventory(nodeId);
        res.json({ ok: true, data: rows });
    } catch (err) {
        console.error(`[MATERIALS-API] Failed to fetch inventory for node [${nodeId}]:`, err);
        res.status(500).json({ ok: false, error: err.message, code: 'NODE_MATERIALS_FETCH_ERROR' });
    }
});

/**
 * GET /api/admin/materials/:id
 * Retrieves granular state metrics for a solitary material unit.
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const mat = await materialService.getMaterialById(id);
        if (!mat) {
            return res.status(404).json({ ok: false, error: 'Material specification not found', code: 'MATERIAL_NOT_FOUND' });
        }
        res.json({ ok: true, data: mat });
    } catch (err) {
        console.error(`[MATERIALS-API] Failed to fetch unit [${id}]:`, err);
        res.status(500).json({ ok: false, error: err.message, code: 'MATERIAL_DETAIL_ERROR' });
    }
});

/**
 * POST /api/admin/materials/reserve
 * Locks capacity units for active manufacturing dispatches. Fails loud if out of bounds.
 */
router.post('/reserve', async (req, res) => {
    const { dispatch_id, node_id, specs } = req.body;
    if (!node_id || !specs) {
        return res.status(400).json({ ok: false, error: 'Missing parameters: node_id and specs are mandatory', code: 'INVALID_RESERVATION_PAYLOAD' });
    }

    try {
        const result = await materialService.reserveMaterials(dispatch_id || 'manual-override', node_id, specs);
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[MATERIALS-API] Reservation lock failed loud:', err.message);
        res.status(409).json({ ok: false, error: err.message, code: 'MATERIAL_RESERVATION_FAILED' });
    }
});

/**
 * POST /api/admin/materials/release
 * Frees previously held inventory resources back to general operational pools.
 */
router.post('/release', async (req, res) => {
    const { dispatch_id, node_id, specs } = req.body;
    if (!node_id || !specs) {
        return res.status(400).json({ ok: false, error: 'Missing parameters: node_id and specs are mandatory', code: 'INVALID_RELEASE_PAYLOAD' });
    }

    try {
        const result = await materialService.releaseMaterials(dispatch_id || 'manual-override', node_id, specs);
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[MATERIALS-API] Material inventory release failed:', err.message);
        res.status(500).json({ ok: false, error: err.message, code: 'MATERIAL_RELEASE_ERROR' });
    }
});

module.exports = router;
