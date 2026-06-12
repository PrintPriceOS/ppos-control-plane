const express = require('express');
const router = express.Router();

router.get('/financial-operations/go-live-simulation/simulations', (req, res) => res.json([]));
router.get('/financial-operations/go-live-simulation/simulations/:goLiveSimulationId', (req, res) => res.json({}));
router.post('/financial-operations/go-live-simulation/simulations', (req, res) => res.json({}));
router.post('/financial-operations/go-live-simulation/simulations/:goLiveSimulationId/evaluate', (req, res) => res.json({}));
router.post('/financial-operations/go-live-simulation/simulations/:goLiveSimulationId/build-checklist', (req, res) => res.json({}));
router.post('/financial-operations/go-live-simulation/simulations/:goLiveSimulationId/review', (req, res) => res.json({}));

router.get('/financial-operations/go-live-simulation/simulations/:goLiveSimulationId/steps', (req, res) => res.json([]));
router.get('/financial-operations/go-live-simulation/simulations/:goLiveSimulationId/checklists', (req, res) => res.json([]));
router.get('/financial-operations/go-live-simulation/simulations/:goLiveSimulationId/findings', (req, res) => res.json([]));
router.get('/financial-operations/go-live-simulation/simulations/:goLiveSimulationId/audit', (req, res) => res.json([]));
router.get('/financial-operations/go-live-simulation/simulations/:goLiveSimulationId/export-preview', (req, res) => res.json({}));

module.exports = router;
