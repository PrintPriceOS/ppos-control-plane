const express = require('express');
const router = express.Router();

// Programs
router.get('/pilot/programs', (req, res) => res.json([]));
router.get('/pilot/programs/:pilotProgramId', (req, res) => res.json({}));
router.post('/pilot/programs', (req, res) => res.json({}));
router.post('/pilot/programs/:pilotProgramId/review', (req, res) => res.json({}));
router.post('/pilot/programs/:pilotProgramId/activate', (req, res) => res.json({}));
router.post('/pilot/programs/:pilotProgramId/suspend', (req, res) => res.json({}));
router.post('/pilot/programs/:pilotProgramId/close', (req, res) => res.json({}));

// Runs
router.get('/pilot/runs', (req, res) => res.json([]));
router.get('/pilot/runs/:pilotRunId', (req, res) => res.json({}));
router.post('/pilot/runs', (req, res) => res.json({}));
router.post('/pilot/runs/:pilotRunId/dry-run', (req, res) => res.json({}));
router.get('/pilot/runs/:pilotRunId/monitoring', (req, res) => res.json({}));
router.get('/pilot/runs/:pilotRunId/audit', (req, res) => res.json([]));
router.get('/pilot/runs/:pilotRunId/export-preview', (req, res) => res.json({}));

module.exports = router;
