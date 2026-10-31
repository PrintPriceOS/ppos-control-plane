const express = require('express');
const router = express.Router();

router.get('/provider-sandbox/providers', (req, res) => res.json([]));
router.get('/provider-sandbox/providers/:providerSandboxId', (req, res) => res.json({}));
router.post('/provider-sandbox/providers', (req, res) => res.json({}));
router.post('/provider-sandbox/providers/:providerSandboxId/review', (req, res) => res.json({}));
router.post('/provider-sandbox/providers/:providerSandboxId/activate', (req, res) => res.json({}));
router.post('/provider-sandbox/providers/:providerSandboxId/suspend', (req, res) => res.json({}));
router.post('/provider-sandbox/providers/:providerSandboxId/revoke', (req, res) => res.json({}));
router.post('/provider-sandbox/providers/:providerSandboxId/close', (req, res) => res.json({}));

router.get('/provider-sandbox/tests', (req, res) => res.json([]));
router.get('/provider-sandbox/tests/:connectionTestId', (req, res) => res.json({}));
router.post('/provider-sandbox/tests', (req, res) => res.json({}));
router.post('/provider-sandbox/tests/:connectionTestId/mock', (req, res) => res.json({}));
router.post('/provider-sandbox/tests/:connectionTestId/stub', (req, res) => res.json({}));
router.post('/provider-sandbox/tests/:connectionTestId/dry-run', (req, res) => res.json({}));

router.get('/provider-sandbox/tests/:connectionTestId/guardrails', (req, res) => res.json({}));
router.get('/provider-sandbox/tests/:connectionTestId/audit', (req, res) => res.json([]));
router.get('/provider-sandbox/tests/:connectionTestId/export-preview', (req, res) => res.json({}));

module.exports = router;
