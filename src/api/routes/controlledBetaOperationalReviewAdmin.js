'use strict';

const express = require('express');
const router = express.Router();
const ControlledBetaOperationalReviewService = require('../services/controlledBetaOperationalReviewService');

// Middleware to ensure admin only
router.use((req, res, next) => {
  req.admin = true; // Simulated admin gate for the prototype
  next();
});

const getSvc = () => new ControlledBetaOperationalReviewService();

router.get('/readiness', async (req, res) => {
  try {
    const data = await getSvc().evaluateOperationalReviewReadiness(req.query.activationId);
    res.json({ ok: data.ok, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/review/create', async (req, res) => {
  try {
    const data = await getSvc().createOperationalReview(req.body);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/review/ingest-inputs', async (req, res) => {
  try {
    const data = await getSvc().ingestRuntimeObservationInputs(req.body.reviewId, req.body.activationId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/review/evaluate-exit-criteria', async (req, res) => {
  try {
    const data = await getSvc().evaluateExitCriteria(req.body.reviewId, req.body.activationId);
    res.json({ ok: data.ok, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/review/score', async (req, res) => {
  try {
    const data = await getSvc().calculateOperationalReviewScore(req.query.reviewId, req.query.activationId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/review/expansion-recommendation', async (req, res) => {
  try {
    const data = await getSvc().buildExpansionRecommendation(req.query.reviewId, req.query.activationId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/finding', async (req, res) => {
  try {
    const data = await getSvc().recordOperationalReviewFinding(req.body.reviewId, req.body.activationId, req.body.payload);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/finding/resolve', async (req, res) => {
  try {
    const data = await getSvc().resolveOperationalReviewFinding(req.body.findingId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/decision/draft', async (req, res) => {
  try {
    const data = await getSvc().createExitDecisionDraft(req.body.reviewId, req.body.activationId, req.body.type);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/decision/submit', async (req, res) => {
  try {
    const data = await getSvc().submitExitDecisionForApproval(req.body.decisionId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/decision/approve', async (req, res) => {
  try {
    const data = await getSvc().approveExitDecision(req.body.decisionId, req.body.approvedBy);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/decision/reject', async (req, res) => {
  try {
    const data = await getSvc().rejectExitDecision(req.body.decisionId, req.body.rejectedBy, req.body.reason);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/decision/block-expansion', async (req, res) => {
  try {
    const data = await getSvc().blockExpansion(req.body.reviewId, req.body.activationId, req.body.reason);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/decision/recommend-remediation', async (req, res) => {
  try {
    const data = await getSvc().recommendRemediation(req.body.reviewId, req.body.activationId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/evidence-pack', async (req, res) => {
  try {
    const data = await getSvc().buildOperationalReviewEvidencePack(req.query.reviewId, req.query.activationId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/audit-timeline', async (req, res) => {
  try {
    const data = await getSvc().getOperationalReviewAuditTimeline(req.query.reviewId);
    res.json({ ok: true, timeline: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/dashboard-state', async (req, res) => {
  try {
    const data = await getSvc().getOperationalReviewDashboardState(req.query.reviewId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
