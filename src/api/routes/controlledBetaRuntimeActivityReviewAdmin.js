const express = require('express');
const router = express.Router();
const decisionService = require('../services/runtimeActivityReviewDecisionService').serviceInstance || require('../services/runtimeActivityReviewDecisionService');
const aggregator = require('../services/runtimeActivityReviewAggregatorService').serviceInstance || require('../services/runtimeActivityReviewAggregatorService');
const evidenceService = require('../services/runtimeActivityReviewEvidencePackService').serviceInstance || require('../services/runtimeActivityReviewEvidencePackService');
const auditService = require('../services/runtimeActivityReviewAuditService').serviceInstance || require('../services/runtimeActivityReviewAuditService');
const db = require('../services/mysqlClient');

// Exigent admin verification middleware
router.use((req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
});

router.get('/reviews', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let list = [];
    if (!isProdLike) {
      list = Array.from(decisionService._mockState.reviews.values());
    } else {
      list = await db.query("SELECT * FROM controlled_beta_runtime_activity_reviews ORDER BY created_at DESC");
    }
    res.json({ ok: true, reviews: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/reviews/:reviewId', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let review = null;
    let decision = null;
    let findings = [];

    if (!isProdLike) {
      review = decisionService._mockState.reviews.get(req.params.reviewId);
      decision = decisionService._mockState.decisions.get(req.params.reviewId);
      findings = decisionService._mockState.findings.get(req.params.reviewId) || [];
    } else {
      const reviews = await db.query("SELECT * FROM controlled_beta_runtime_activity_reviews WHERE review_id = ?", [req.params.reviewId]);
      if (reviews.length > 0) review = reviews[0];
      const decisions = await db.query("SELECT * FROM controlled_beta_runtime_activity_review_decisions WHERE review_id = ?", [req.params.reviewId]);
      if (decisions.length > 0) decision = decisions[0];
      findings = await db.query("SELECT * FROM controlled_beta_runtime_activity_review_findings WHERE review_id = ?", [req.params.reviewId]);
    }

    if (!review) return res.status(404).json({ ok: false, error: 'Review not found' });

    res.json({ ok: true, review, decision, findings });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/reviews', async (req, res) => {
  try {
    const { tenantId, cohortId, windowStart, windowEnd } = req.body;
    if (!tenantId || !cohortId || !windowStart || !windowEnd) {
      return res.status(400).json({ ok: false, error: 'Missing required parameters' });
    }
    const result = await decisionService.createReview(tenantId, cohortId, windowStart, windowEnd);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/reviews/:reviewId/evaluate', async (req, res) => {
  try {
    const result = await decisionService.evaluateReview(req.params.reviewId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/reviews/:reviewId/finalize', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await decisionService.finalizeReview(req.params.reviewId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/reviews/:reviewId/supersede', async (req, res) => {
  try {
    const { supersededByReviewId, reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await decisionService.supersedeReview(req.params.reviewId, supersededByReviewId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/reviews/:reviewId/evidence-pack', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let record = null;
    if (!isProdLike) {
      record = evidenceService._mockState.evidence.get(req.params.reviewId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_runtime_activity_review_evidence WHERE review_id = ?", [req.params.reviewId]);
      if (list.length > 0) record = list[0];
    }
    if (!record) return res.status(404).json({ ok: false, error: 'Evidence pack not found' });
    res.json({ ok: true, evidencePack: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/cohorts/:cohortId/health-summary', async (req, res) => {
  try {
    const tenantId = req.query.tenantId || 'tenant_default';
    const start = req.query.start || new Date(Date.now() - 86400000 * 7);
    const end = req.query.end || new Date();
    const result = await aggregator.aggregateCohortObservations(tenantId, req.params.cohortId, start, end);
    res.json({ ok: true, summary: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
module.exports.serviceInstance = decisionService;
