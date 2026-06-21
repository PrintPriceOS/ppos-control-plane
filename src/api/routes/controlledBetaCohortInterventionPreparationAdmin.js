const express = require('express');
const router = express.Router();
const builderService = require('../services/cohortInterventionPreparationBuilderService').serviceInstance || require('../services/cohortInterventionPreparationBuilderService');
const reviewService = require('../services/cohortInterventionPreparationReviewService').serviceInstance || require('../services/cohortInterventionPreparationReviewService');
const evidenceService = require('../services/cohortInterventionPreparationEvidencePackService').serviceInstance || require('../services/cohortInterventionPreparationEvidencePackService');
const db = require('../services/mysqlClient');

// Exigent admin verification middleware
router.use((req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
});

router.get('/preparations', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let list = [];
    if (!isProdLike) {
      list = Array.from(builderService._mockState.preparations.values());
    } else {
      list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_preparations ORDER BY created_at DESC");
    }
    res.json({ ok: true, preparations: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/preparations/:preparationId', async (req, res) => {
  try {
    const prep = await reviewService.getPreparation(req.params.preparationId);
    if (!prep) return res.status(404).json({ ok: false, error: 'Preparation not found' });
    const items = await reviewService.getChecklistItems(req.params.preparationId);
    res.json({ ok: true, preparation: prep, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/preparations/from-review/:reviewId', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await builderService.createPreparation(req.params.reviewId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/preparations/:preparationId/plan', async (req, res) => {
  try {
    const prep = await reviewService.getPreparation(req.params.preparationId);
    if (!prep) return res.status(404).json({ ok: false, error: 'Preparation not found' });
    const items = await reviewService.getChecklistItems(req.params.preparationId);
    res.json({ ok: true, preparation: prep, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/preparations/:preparationId/items/:itemId', async (req, res) => {
  try {
    const { itemStatus } = req.body;
    if (!itemStatus) return res.status(400).json({ ok: false, error: 'Missing itemStatus' });
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await reviewService.updateChecklistItemStatus(req.params.preparationId, req.params.itemId, itemStatus, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/preparations/:preparationId/approve', async (req, res) => {
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ ok: false, error: 'Missing role' });
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await reviewService.approveRole(req.params.preparationId, role, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/preparations/:preparationId/finalize', async (req, res) => {
  try {
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await reviewService.finalizePreparation(req.params.preparationId, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/preparations/:preparationId/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await reviewService.rejectPreparation(req.params.preparationId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/preparations/:preparationId/supersede', async (req, res) => {
  try {
    const { supersededByPreparationId, reason } = req.body;
    const actorId = req.user ? req.user.id || req.user.email || 'admin' : 'admin';
    const result = await reviewService.supersedePreparation(req.params.preparationId, supersededByPreparationId, reason, actorId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/preparations/:preparationId/evidence-pack', async (req, res) => {
  try {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let record = null;
    if (!isProdLike) {
      record = evidenceService._mockState.evidence.get(req.params.preparationId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_preparation_evidence WHERE preparation_id = ?", [req.params.preparationId]);
      if (list.length > 0) record = list[0];
    }
    if (!record) return res.status(404).json({ ok: false, error: 'Evidence pack not found' });
    res.json({ ok: true, evidencePack: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
module.exports.serviceInstance = reviewService;
