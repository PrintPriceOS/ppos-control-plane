const express = require('express');
const router = express.Router();

// Programs
router.get('/financial-operations/pilot/programs', (req, res) => res.json([]));
router.get('/financial-operations/pilot/programs/:pilotProgramId', (req, res) => res.json({}));
router.post('/financial-operations/pilot/programs', (req, res) => res.json({}));
router.post('/financial-operations/pilot/programs/:pilotProgramId/review', (req, res) => res.json({}));
router.post('/financial-operations/pilot/programs/:pilotProgramId/activate', (req, res) => res.json({}));
router.post('/financial-operations/pilot/programs/:pilotProgramId/suspend', (req, res) => res.json({}));
router.post('/financial-operations/pilot/programs/:pilotProgramId/close', (req, res) => res.json({}));

// Runs
router.get('/financial-operations/pilot/runs', (req, res) => res.json([]));
router.get('/financial-operations/pilot/runs/:pilotRunId', (req, res) => res.json({}));
router.post('/financial-operations/pilot/runs', (req, res) => res.json({}));
router.post('/financial-operations/pilot/runs/:pilotRunId/dry-run', (req, res) => res.json({}));
router.get('/financial-operations/pilot/runs/:pilotRunId/monitoring', (req, res) => res.json({}));
router.get('/financial-operations/pilot/runs/:pilotRunId/audit', (req, res) => res.json([]));
router.get('/financial-operations/pilot/runs/:pilotRunId/export-preview', (req, res) => res.json({}));

module.exports = router;
