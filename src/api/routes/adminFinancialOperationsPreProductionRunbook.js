const express = require('express');
const router = express.Router();

router.get('/runbooks', (req, res) => res.json({}));
router.get('/runbooks/:preProductionRunbookId', (req, res) => res.json({}));
router.post('/runbooks', (req, res) => res.json({}));
router.post('/runbooks/:preProductionRunbookId/evaluate', (req, res) => res.json({}));
router.post('/runbooks/:preProductionRunbookId/build-tasks', (req, res) => res.json({}));
router.post('/runbooks/:preProductionRunbookId/review', (req, res) => res.json({}));
router.get('/runbooks/:preProductionRunbookId/sections', (req, res) => res.json({}));
router.get('/runbooks/:preProductionRunbookId/tasks', (req, res) => res.json({}));
router.get('/runbooks/:preProductionRunbookId/findings', (req, res) => res.json({}));
router.get('/runbooks/:preProductionRunbookId/audit', (req, res) => res.json({}));
router.get('/runbooks/:preProductionRunbookId/export-preview', (req, res) => res.json({}));

module.exports = router;
