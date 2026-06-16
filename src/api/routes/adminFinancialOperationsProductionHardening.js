const express = require('express');
const router = express.Router();

router.get('/production-hardening/runs', (req, res) => res.json([]));
router.get('/production-hardening/runs/:hardeningRunId', (req, res) => res.json({}));
router.post('/production-hardening/runs', (req, res) => res.json({}));
router.post('/production-hardening/runs/:hardeningRunId/evaluate', (req, res) => res.json({}));
router.get('/production-hardening/runs/:hardeningRunId/checks', (req, res) => res.json([]));
router.get('/production-hardening/runs/:hardeningRunId/findings', (req, res) => res.json([]));
router.get('/production-hardening/runs/:hardeningRunId/audit', (req, res) => res.json([]));
router.get('/production-hardening/runs/:hardeningRunId/export-preview', (req, res) => res.json({}));

module.exports = router;
