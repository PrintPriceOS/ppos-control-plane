const express = require('express');
const router = express.Router();

router.get('/financial-operations/release-gates', (req, res) => res.json([]));
router.get('/financial-operations/release-gates/:releaseGateId', (req, res) => res.json({}));
router.post('/financial-operations/release-gates', (req, res) => res.json({}));
router.post('/financial-operations/release-gates/:releaseGateId/evaluate', (req, res) => res.json({}));
router.post('/financial-operations/release-gates/:releaseGateId/approval', (req, res) => res.json({}));
router.post('/financial-operations/release-gates/:releaseGateId/revoke', (req, res) => res.json({}));
router.post('/financial-operations/release-gates/:releaseGateId/block', (req, res) => res.json({}));
router.get('/financial-operations/release-gates/:releaseGateId/risk', (req, res) => res.json({}));
router.get('/financial-operations/release-gates/:releaseGateId/audit', (req, res) => res.json([]));
router.get('/financial-operations/release-gates/:releaseGateId/export-preview', (req, res) => res.json({}));

module.exports = router;
