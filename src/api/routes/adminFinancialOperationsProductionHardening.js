const express = require('express');
const router = express.Router();

router.get('/financial-operations/production-hardening/runs', (req, res) => res.json([]));
router.get('/financial-operations/production-hardening/runs/:hardeningRunId', (req, res) => res.json({}));
router.post('/financial-operations/production-hardening/runs', (req, res) => res.json({}));
router.post('/financial-operations/production-hardening/runs/:hardeningRunId/evaluate', (req, res) => res.json({}));
router.get('/financial-operations/production-hardening/runs/:hardeningRunId/checks', (req, res) => res.json([]));
router.get('/financial-operations/production-hardening/runs/:hardeningRunId/findings', (req, res) => res.json([]));
router.get('/financial-operations/production-hardening/runs/:hardeningRunId/audit', (req, res) => res.json([]));
router.get('/financial-operations/production-hardening/runs/:hardeningRunId/export-preview', (req, res) => res.json({}));

module.exports = router;
