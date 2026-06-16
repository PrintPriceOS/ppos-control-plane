const express = require('express');
const router = express.Router();

router.get('/release-gates', (req, res) => res.json([]));
router.get('/release-gates/:releaseGateId', (req, res) => res.json({}));
router.post('/release-gates', (req, res) => res.json({}));
router.post('/release-gates/:releaseGateId/evaluate', (req, res) => res.json({}));
router.post('/release-gates/:releaseGateId/approval', (req, res) => res.json({}));
router.post('/release-gates/:releaseGateId/revoke', (req, res) => res.json({}));
router.post('/release-gates/:releaseGateId/block', (req, res) => res.json({}));
router.get('/release-gates/:releaseGateId/risk', (req, res) => res.json({}));
router.get('/release-gates/:releaseGateId/audit', (req, res) => res.json([]));
router.get('/release-gates/:releaseGateId/export-preview', (req, res) => res.json({}));

module.exports = router;
