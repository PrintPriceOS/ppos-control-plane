const express = require('express');
const router = express.Router();

router.get('/provider-settlement-files/runs', (req, res) => res.json([]));
router.get('/provider-settlement-files/runs/:settlementFileRunId', (req, res) => res.json({}));
router.post('/provider-settlement-files/runs', (req, res) => res.json({}));
router.post('/provider-settlement-files/runs/:settlementFileRunId/parse', (req, res) => res.json({}));
router.post('/provider-settlement-files/runs/:settlementFileRunId/reconcile', (req, res) => res.json({}));
router.post('/provider-settlement-files/runs/:settlementFileRunId/review', (req, res) => res.json({}));
router.get('/provider-settlement-files/runs/:settlementFileRunId/rows', (req, res) => res.json([]));
router.get('/provider-settlement-files/runs/:settlementFileRunId/matches', (req, res) => res.json([]));
router.get('/provider-settlement-files/runs/:settlementFileRunId/findings', (req, res) => res.json([]));
router.get('/provider-settlement-files/runs/:settlementFileRunId/audit', (req, res) => res.json([]));
router.get('/provider-settlement-files/runs/:settlementFileRunId/export-preview', (req, res) => res.json({}));

module.exports = router;
