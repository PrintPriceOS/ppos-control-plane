/**
 * src/api/routes/marketplaceDiscoveryRoutes.js
 * 
 * Phase 192C Marketplace Discovery & Candidate Matching API Endpoints.
 * Mounted at /api/marketplace
 * 
 * Endpoints:
 *   GET  /printhouses              - List discoverable Printhouse nodes
 *   GET  /printhouses/:printhouseId - Get public discoverable node profile
 *   POST /match                    - Execute candidate matching engine
 */
const express = require('express');
const router = express.Router();
const discoveryService = require('../services/marketplaceDiscoveryService');
const matchingService = require('../services/marketplaceMatchingService');

// GET /api/marketplace/printhouses
router.get('/printhouses', async (req, res) => {
    try {
        const nodes = await discoveryService.listDiscoverableNodes();
        res.json({
            success: true,
            count: nodes.length,
            printhouses: nodes
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            success: false,
            error: err.message
        });
    }
});

// GET /api/marketplace/printhouses/:printhouseId
router.get('/printhouses/:printhouseId', async (req, res) => {
    try {
        const { printhouseId } = req.params;
        const node = await discoveryService.getDiscoverableNodeDetail(printhouseId);
        res.json({
            success: true,
            printhouse: node
        });
    } catch (err) {
        res.status(err.statusCode || 404).json({
            success: false,
            error: err.message,
            code: err.code || 'DISCOVERY_NODE_NOT_FOUND'
        });
    }
});

// POST /api/marketplace/match
router.post('/match', async (req, res) => {
    try {
        const result = await matchingService.matchCandidates(req.body || {});
        res.json({
            success: true,
            matchResult: result
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            success: false,
            error: err.message
        });
    }
});

module.exports = router;
