const express = require('express');
const router = express.Router();

router.get('/financial-operations/provider-event-reconciliation/runs', (req, res) => res.json([]));
router.get('/financial-operations/provider-event-reconciliation/runs/:eventReconciliationRunId', (req, res) => res.json({}));
router.post('/financial-operations/provider-event-reconciliation/runs', (req, res) => res.json({}));
router.post('/financial-operations/provider-event-reconciliation/runs/:eventReconciliationRunId/normalize', (req, res) => res.json({}));
router.post('/financial-operations/provider-event-reconciliation/runs/:eventReconciliationRunId/reconcile', (req, res) => res.json({}));
router.post('/financial-operations/provider-event-reconciliation/runs/:eventReconciliationRunId/review', (req, res) => res.json({}));
router.get('/financial-operations/provider-event-reconciliation/runs/:eventReconciliationRunId/events', (req, res) => res.json([]));
router.get('/financial-operations/provider-event-reconciliation/runs/:eventReconciliationRunId/matches', (req, res) => res.json([]));
router.get('/financial-operations/provider-event-reconciliation/runs/:eventReconciliationRunId/findings', (req, res) => res.json([]));
router.get('/financial-operations/provider-event-reconciliation/runs/:eventReconciliationRunId/audit', (req, res) => res.json([]));
router.get('/financial-operations/provider-event-reconciliation/runs/:eventReconciliationRunId/export-preview', (req, res) => res.json({}));

module.exports = router;
