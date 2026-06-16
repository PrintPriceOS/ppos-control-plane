const express = require('express');
const router = express.Router();

router.get('/provider-failure-retry/runs', (req, res) => res.json([]));
router.get('/provider-failure-retry/runs/:failureRetryRunId', (req, res) => res.json({}));
router.post('/provider-failure-retry/runs', (req, res) => res.json({}));
router.post('/provider-failure-retry/runs/:failureRetryRunId/classify', (req, res) => res.json({}));
router.post('/provider-failure-retry/runs/:failureRetryRunId/simulate-retry', (req, res) => res.json({}));
router.post('/provider-failure-retry/runs/:failureRetryRunId/circuit-breaker-review', (req, res) => res.json({}));
router.get('/provider-failure-retry/runs/:failureRetryRunId/attempts', (req, res) => res.json([]));
router.get('/provider-failure-retry/runs/:failureRetryRunId/findings', (req, res) => res.json([]));
router.get('/provider-failure-retry/runs/:failureRetryRunId/audit', (req, res) => res.json([]));
router.get('/provider-failure-retry/runs/:failureRetryRunId/export-preview', (req, res) => res.json({}));

module.exports = router;
