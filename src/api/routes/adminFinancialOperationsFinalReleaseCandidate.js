const express = require('express');
const router = express.Router();

router.get('/candidates', (req, res) => res.json({}));
router.get('/candidates/:finalReleaseCandidateId', (req, res) => res.json({}));
router.post('/candidates', (req, res) => res.json({}));
router.post('/candidates/:finalReleaseCandidateId/evaluate', (req, res) => res.json({}));
router.post('/candidates/:finalReleaseCandidateId/build-evidence-pack', (req, res) => res.json({}));
router.post('/candidates/:finalReleaseCandidateId/review', (req, res) => res.json({}));
router.get('/candidates/:finalReleaseCandidateId/checks', (req, res) => res.json({}));
router.get('/candidates/:finalReleaseCandidateId/evidence', (req, res) => res.json({}));
router.get('/candidates/:finalReleaseCandidateId/findings', (req, res) => res.json({}));
router.get('/candidates/:finalReleaseCandidateId/audit', (req, res) => res.json({}));
router.get('/candidates/:finalReleaseCandidateId/export-preview', (req, res) => res.json({}));

module.exports = router;
