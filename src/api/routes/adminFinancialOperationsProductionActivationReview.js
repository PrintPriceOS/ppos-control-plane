const express = require('express');
const router = express.Router();

router.get('/financial-operations/production-activation-review/reviews', (req, res) => res.json([]));
router.get('/financial-operations/production-activation-review/reviews/:activationReviewId', (req, res) => res.json({}));
router.post('/financial-operations/production-activation-review/reviews', (req, res) => res.json({}));
router.post('/financial-operations/production-activation-review/reviews/:activationReviewId/evaluate', (req, res) => res.json({}));
router.post('/financial-operations/production-activation-review/reviews/:activationReviewId/go-no-go', (req, res) => res.json({}));
router.get('/financial-operations/production-activation-review/reviews/:activationReviewId/checks', (req, res) => res.json([]));
router.get('/financial-operations/production-activation-review/reviews/:activationReviewId/findings', (req, res) => res.json([]));
router.get('/financial-operations/production-activation-review/reviews/:activationReviewId/evidence-pack', (req, res) => res.json({}));
router.get('/financial-operations/production-activation-review/reviews/:activationReviewId/audit', (req, res) => res.json([]));
router.get('/financial-operations/production-activation-review/reviews/:activationReviewId/export-preview', (req, res) => res.json({}));

module.exports = router;
