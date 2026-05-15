/**
 * src/api/routes/adminAssets.js
 * 
 * Administrative routes for Production Asset Management.
 */
const express = require('express');
const router = express.Router();
const ingestionService = require('../services/productionFileIngestionService');
const validationService = require('../services/productionFileValidationService');
const db = require('../services/mysqlClient');

/**
 * Trigger batch ingestion for pending remote assets.
 * POST /api/admin/assets/ingest
 */
router.post('/ingest', async (req, res) => {
    try {
        const processedCount = await ingestionService.processPendingIngestions();
        res.json({
            ok: true,
            message: `Ingestion cycle completed. Processed ${processedCount} assets.`,
            count: processedCount
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * Trigger immediate ingestion for a specific file.
 * POST /api/admin/assets/files/:fileId/ingest
 */
router.post('/files/:fileId/ingest', async (req, res) => {
    const { fileId } = req.params;
    
    try {
        const { rows: [file] } = await db.query('SELECT * FROM production_files WHERE id = ?', [fileId]);
        if (!file) return res.status(404).json({ ok: false, error: 'File not found' });
        
        if (file.source_type !== 'DOWNLOAD_URL') {
            return res.status(400).json({ ok: false, error: 'Only DOWNLOAD_URL assets can be ingested via this service.' });
        }

        await ingestionService.ingestFile(file);
        res.json({ ok: true, message: 'Ingestion completed successfully.' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * Get file status and forensic events.
 * GET /api/admin/assets/files/:fileId
 */
router.get('/files/:fileId', async (req, res) => {
    const { fileId } = req.params;

    try {
        const { rows: [file] } = await db.query('SELECT * FROM production_files WHERE id = ?', [fileId]);
        if (!file) return res.status(404).json({ ok: false, error: 'File not found' });

        const events = await db.query(`
            SELECT * FROM production_file_events 
            WHERE production_file_id = ? 
            ORDER BY created_at DESC
        `, [fileId]);

        res.json({
            ok: true,
            file,
            events
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * Trigger validation orchestration for an order's assets.
 * POST /api/admin/assets/orders/:orderRef/validate
 */
router.post('/orders/:order_ref/validate', async (req, res) => {
    const { order_ref } = req.params;

    try {
        const result = await validationService.validateOrderAssets(order_ref);
        if (!result.ok) {
            return res.status(422).json({ ok: false, message: result.message, results: result.results });
        }
        res.json({ ok: true, message: 'Order assets validated and promoted successfully.', results: result.results });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
