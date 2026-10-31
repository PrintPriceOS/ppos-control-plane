const express = require('express');
const router = express.Router();

// Sandboxes
router.get('/partner-sandbox/sandboxes', (req, res) => res.json([]));
router.get('/partner-sandbox/sandboxes/:sandboxId', (req, res) => res.json({}));
router.post('/partner-sandbox/sandboxes', (req, res) => res.json({}));
router.post('/partner-sandbox/sandboxes/:sandboxId/review', (req, res) => res.json({}));
router.post('/partner-sandbox/sandboxes/:sandboxId/activate', (req, res) => res.json({}));
router.post('/partner-sandbox/sandboxes/:sandboxId/suspend', (req, res) => res.json({}));
router.post('/partner-sandbox/sandboxes/:sandboxId/revoke', (req, res) => res.json({}));
router.post('/partner-sandbox/sandboxes/:sandboxId/close', (req, res) => res.json({}));

// Sessions
router.get('/partner-sandbox/sessions', (req, res) => res.json([]));
router.post('/partner-sandbox/sessions', (req, res) => res.json({}));
router.post('/partner-sandbox/sessions/:sandboxSessionId/revoke', (req, res) => res.json({}));

// Runs
router.get('/partner-sandbox/runs', (req, res) => res.json([]));
router.get('/partner-sandbox/runs/:sandboxRunId', (req, res) => res.json({}));
router.post('/partner-sandbox/runs', (req, res) => res.json({}));
router.post('/partner-sandbox/runs/:sandboxRunId/mock-provider', (req, res) => res.json({}));
router.post('/partner-sandbox/runs/:sandboxRunId/dry-run', (req, res) => res.json({}));
router.get('/partner-sandbox/runs/:sandboxRunId/audit', (req, res) => res.json([]));
router.get('/partner-sandbox/runs/:sandboxRunId/export-preview', (req, res) => res.json({}));

module.exports = router;
