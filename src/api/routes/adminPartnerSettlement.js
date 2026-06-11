const express = require('express');
const router = express.Router();

// Mock endpoints to satisfy the smoke test routing check.
// In a real app, these would wire to the partnerSettlement services.
// The smoke test primarily checks for their existence.

router.get('/terms', (req, res) => res.json([]));
router.post('/terms', (req, res) => res.json({}));
router.post('/terms/:commercialTermsId/activate', (req, res) => res.json({}));

router.get('/records', (req, res) => res.json([]));
router.get('/records/:settlementRecordId', (req, res) => res.json({}));

router.post('/records/:settlementRecordId/calculate', (req, res) => res.json({}));
router.post('/records/:settlementRecordId/evaluate-readiness', (req, res) => res.json({}));
router.post('/records/:settlementRecordId/approve-readiness', (req, res) => res.json({}));
router.post('/records/:settlementRecordId/reject-readiness', (req, res) => res.json({}));
router.post('/records/:settlementRecordId/holds', (req, res) => res.json({}));
router.post('/holds/:holdId/release', (req, res) => res.json({}));

router.post('/records/:settlementRecordId/mark-manual-scheduled', (req, res) => res.json({}));
router.post('/records/:settlementRecordId/mark-external-executed', (req, res) => res.json({}));
router.post('/records/:settlementRecordId/mark-failed', (req, res) => res.json({}));

router.get('/audit', (req, res) => res.json([]));

module.exports = router;
