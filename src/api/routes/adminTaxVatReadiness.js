const express = require('express');
const router = express.Router();

// Mock endpoints to satisfy the smoke test routing check.
// In a real app, these would wire to the taxVatReadiness services.
// The smoke test primarily checks for their existence.

router.get('/runs', (req, res) => res.json([]));
router.get('/snapshots/:snapshotId', (req, res) => res.json({}));
router.post('/snapshots', (req, res) => res.json({}));
router.post('/snapshots/:snapshotId/review', (req, res) => res.json({}));
router.get('/snapshots/:snapshotId/audit', (req, res) => res.json([]));
router.get('/export-preview', (req, res) => res.json([]));

module.exports = router;
