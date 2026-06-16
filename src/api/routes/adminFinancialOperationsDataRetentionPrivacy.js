const express = require('express');
const router = express.Router();

router.get('/data-retention-privacy/policies', (req, res) => res.json([]));
router.get('/data-retention-privacy/policies/:retentionPolicyId', (req, res) => res.json({}));
router.post('/data-retention-privacy/policies', (req, res) => res.json({}));
router.post('/data-retention-privacy/policies/:retentionPolicyId/review', (req, res) => res.json({}));
router.post('/data-retention-privacy/policies/:retentionPolicyId/approve', (req, res) => res.json({}));
router.post('/data-retention-privacy/policies/:retentionPolicyId/revoke', (req, res) => res.json({}));

router.get('/data-retention-privacy/reviews', (req, res) => res.json([]));
router.get('/data-retention-privacy/reviews/:retentionReviewId', (req, res) => res.json({}));
router.post('/data-retention-privacy/reviews', (req, res) => res.json({}));
router.post('/data-retention-privacy/reviews/:retentionReviewId/simulate', (req, res) => res.json({}));

router.get('/data-retention-privacy/privacy-requests', (req, res) => res.json([]));
router.get('/data-retention-privacy/privacy-requests/:privacyRequestReviewId', (req, res) => res.json({}));
router.post('/data-retention-privacy/privacy-requests', (req, res) => res.json({}));
router.post('/data-retention-privacy/privacy-requests/:privacyRequestReviewId/evaluate', (req, res) => res.json({}));

router.get('/data-retention-privacy/findings', (req, res) => res.json([]));
router.get('/data-retention-privacy/audit', (req, res) => res.json([]));
router.get('/data-retention-privacy/export-preview', (req, res) => res.json({}));

module.exports = router;
