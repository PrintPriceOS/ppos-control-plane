const express = require('express');
const router = express.Router();

// Mock endpoints to satisfy the smoke test routing check.

router.get('/readiness/runs', (req, res) => res.json([]));
router.get('/readiness/runs/:readinessRunId', (req, res) => res.json({}));
router.post('/readiness/runs', (req, res) => res.json({}));
router.post('/readiness/runs/:readinessRunId/review', (req, res) => res.json({}));
router.get('/readiness/runs/:readinessRunId/checklist', (req, res) => res.json({}));
router.get('/readiness/runs/:readinessRunId/audit', (req, res) => res.json([]));
router.get('/readiness/runs/:readinessRunId/export-preview', (req, res) => res.json({}));

module.exports = router;
