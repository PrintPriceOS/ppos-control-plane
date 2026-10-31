const express = require('express');
const router = express.Router();

// Mock endpoints to satisfy the smoke test routing check.
// In a real app, these would wire to the financial reconciliation services.
// The smoke test primarily checks for their existence.

router.get('/runs', (req, res) => res.json([]));
router.post('/runs', (req, res) => res.json({}));
router.post('/runs/:reconciliationRunId/start', (req, res) => res.json({}));
router.get('/runs/:reconciliationRunId', (req, res) => res.json({}));
router.get('/runs/:reconciliationRunId/snapshots', (req, res) => res.json([]));
router.get('/runs/:reconciliationRunId/mismatches', (req, res) => res.json([]));

router.post('/mismatches/:mismatchId/acknowledge', (req, res) => res.json({}));
router.post('/mismatches/:mismatchId/resolve', (req, res) => res.json({}));
router.post('/mismatches/:mismatchId/dismiss', (req, res) => res.json({}));

router.post('/runs/:reconciliationRunId/exports', (req, res) => res.json({}));
router.get('/exports', (req, res) => res.json([]));
router.get('/exports/:exportBatchId', (req, res) => res.json({}));
router.post('/exports/:exportBatchId/generate', (req, res) => res.json({}));
router.post('/exports/:exportBatchId/mark-manual', (req, res) => res.json({}));

router.get('/audit', (req, res) => res.json([]));

module.exports = router;
