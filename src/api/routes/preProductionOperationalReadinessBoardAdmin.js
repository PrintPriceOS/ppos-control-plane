'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const BoardService = require('../services/preProductionOperationalReadinessBoardService');

const svc = new BoardService();

router.use(express.json());
router.use(requireAdmin);

const SAFETY_MARKERS = {
  reviewOnly: true,
  productionActivationEnabled: false,
  fullPublicEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  externalSubmission: false,
  sourceMutation: false,
};

const SAFETY_MESSAGE =
  'This is a review-only board. No production activation, live provider connectivity, ' +
  'payment execution, refund execution, payout execution, external submission, ' +
  'or source record mutation will occur.';

function safeResponse(data) {
  return { ok: true, ...data, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
}

// GET /readiness
router.get('/readiness', async (req, res) => {
  try {
    const result = await svc.evaluateBoardReadiness({
      board_id: req.query.board_id || null,
      actor: req.query.actor || 'system',
    });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /create
router.post('/create', async (req, res) => {
  try {
    const result = await svc.createBoardReview(req.body || {});
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /department-review
router.post('/department-review', async (req, res) => {
  try {
    const result = await svc.submitDepartmentReview(req.body || {});
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /finding
router.post('/finding', async (req, res) => {
  try {
    const result = await svc.recordFinding(req.body || {});
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// POST /resolve-finding
router.post('/resolve-finding', async (req, res) => {
  try {
    const result = await svc.resolveFinding(req.body || {});
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// GET /audit-timeline
router.get('/audit-timeline', async (req, res) => {
  try {
    const boardId = req.query.board_id;
    if (!boardId) return res.status(400).json({ ok: false, error: 'board_id is required', safety: SAFETY_MARKERS });
    const result = await svc.getBoardAuditTimeline({ board_id: boardId });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

// GET /evidence-pack
router.get('/evidence-pack', async (req, res) => {
  try {
    const boardId = req.query.board_id;
    if (!boardId) return res.status(400).json({ ok: false, error: 'board_id is required', safety: SAFETY_MARKERS });
    const result = await svc.buildBoardEvidencePack({ board_id: boardId, actor: req.query.actor });
    res.json(safeResponse(result));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, safety: SAFETY_MARKERS });
  }
});

module.exports = router;
