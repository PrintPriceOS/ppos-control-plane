const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const builderSvc = require('../services/cohortInterventionSimulationReviewBuilderService').serviceInstance || require('../services/cohortInterventionSimulationReviewBuilderService');
const evaluatorSvc = require('../services/cohortInterventionSimulationReviewEvaluatorService').serviceInstance || require('../services/cohortInterventionSimulationReviewEvaluatorService');
const decisionSvc = require('../services/cohortInterventionSimulationReviewDecisionService').serviceInstance || require('../services/cohortInterventionSimulationReviewDecisionService');
const evidenceSvc = require('../services/cohortInterventionSimulationReviewEvidencePackService').serviceInstance || require('../services/cohortInterventionSimulationReviewEvidencePackService');
const auditSvc = require('../services/cohortInterventionSimulationReviewAuditService').serviceInstance || require('../services/cohortInterventionSimulationReviewAuditService');

// Exigent admin verification middleware
router.use((req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
});

router.get('/reviews', async (req, res) => {
  try {
    const list = await builderSvc.getReviews();
    res.json({ ok: true, reviews: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/reviews/:reviewId', async (req, res) => {
  try {
    const review = await builderSvc.getReview(req.params.reviewId);
    if (!review) return res.status(404).json({ ok: false, error: 'Review not found' });
    const findings = await evaluatorSvc.getFindings(req.params.reviewId);
    const decision = await decisionSvc.getDecision(req.params.reviewId);
    const evidence = await evidenceSvc.getEvidence(req.params.reviewId);
    const auditLogs = await auditSvc.getAuditEvents(req.params.reviewId);
    res.json({ ok: true, review, findings, decision, evidence, auditLogs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/reviews/from-simulation/:simulationId', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await builderSvc.createReview(req.params.simulationId, actorId);
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/reviews/:reviewId/evaluate', async (req, res) => {
  try {
    const { overrides } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await evaluatorSvc.evaluateReview(req.params.reviewId, actorId, overrides);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/reviews/:reviewId/decision', async (req, res) => {
  try {
    const { decision, rationale } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await decisionSvc.recordDecision(req.params.reviewId, decision, rationale, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/reviews/:reviewId/finalize', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    // Finalize first builds the final evidence pack automatically
    await evidenceSvc.buildEvidencePack(req.params.reviewId, actorId);
    const result = await decisionSvc.finalizeReview(req.params.reviewId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/reviews/:reviewId/request-resimulation', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await decisionSvc.requestResimulation(req.params.reviewId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/reviews/:reviewId/escalate', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await decisionSvc.escalateReview(req.params.reviewId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/reviews/:reviewId/block', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await decisionSvc.blockReview(req.params.reviewId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/reviews/:reviewId/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await decisionSvc.rejectReview(req.params.reviewId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/reviews/:reviewId/supersede', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await decisionSvc.supersedeReview(req.params.reviewId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/reviews/:reviewId/evidence-pack', async (req, res) => {
  try {
    const evidence = await evidenceSvc.getEvidence(req.params.reviewId);
    if (!evidence) {
      // Auto build if not built yet (draft)
      const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
      const result = await evidenceSvc.buildEvidencePack(req.params.reviewId, actorId);
      const freshlyBuilt = await evidenceSvc.getEvidence(req.params.reviewId);
      return res.json({ ok: true, evidence: freshlyBuilt });
    }
    res.json({ ok: true, evidence });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/simulations/:simulationId/review-summary', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let review = null;
    if (!isProdLike) {
      review = Array.from(builderSvc._mockState.reviews.values()).find(r => r.source_simulation_id === req.params.simulationId);
    } else {
      const list = await db.query('SELECT * FROM controlled_beta_cohort_intervention_sim_reviews WHERE source_simulation_id = ? LIMIT 1', [req.params.simulationId]);
      if (list.length > 0) review = list[0];
    }
    res.json({ ok: true, review });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/cohorts/:cohortId/high-risk-simulation-review-history', async (req, res) => {
  try {
    const history = await builderSvc.getReviewsForCohort(req.params.cohortId);
    res.json({ ok: true, history });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
