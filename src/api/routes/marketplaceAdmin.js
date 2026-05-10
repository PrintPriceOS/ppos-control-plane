/**
 * src/api/routes/marketplaceAdmin.js
 * 
 * Administrative endpoints for Phase 17 — Autonomous Manufacturing Marketplace.
 */
const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const marketplace = require('../services/manufacturingMarketplaceService');
const auction = require('../services/industrialAuctionService');
const ledger = require('../services/federationTradeLedgerService');
const twin = require('../services/marketplaceDigitalTwinService');
const exchange = require('../services/capacityExchangeService');

/**
 * GET /api/admin/marketplace/health
 */
router.get('/health', async (req, res) => {
    try {
        const health = await marketplace.getMarketplaceHealth();
        res.json({ ok: true, health });
    } catch (err) {
        res.json({ ok: false, error: err.message, degraded: true });
    }
});

/**
 * GET /api/admin/marketplace/offers
 */
router.get('/offers', async (req, res) => {
    try {
        const offers = await db.query('SELECT * FROM marketplace_capacity_offers WHERE status = "ACTIVE" ORDER BY created_at DESC LIMIT 50');
        res.json({ ok: true, offers });
    } catch (err) {
        res.json({ ok: true, offers: [], degraded: true, error: err.message });
    }
});

/**
 * GET /api/admin/marketplace/auctions
 */
router.get('/auctions', async (req, res) => {
    try {
        const auctions = await db.query('SELECT * FROM marketplace_dispatch_auctions ORDER BY created_at DESC LIMIT 50');
        res.json({ ok: true, auctions });
    } catch (err) {
        res.json({ ok: true, auctions: [], degraded: true, error: err.message });
    }
});

/**
 * GET /api/admin/marketplace/ledger
 */
router.get('/ledger', async (req, res) => {
    try {
        const history = await ledger.getTradeHistory();
        res.json({ ok: true, history });
    } catch (err) {
        res.json({ ok: true, history: [], degraded: true, error: err.message });
    }
});

/**
 * GET /api/admin/marketplace/liquidity
 */
router.get('/liquidity', async (req, res) => {
    try {
        const liquidity = await twin.computeLiquidityIndex();
        res.json({ ok: true, liquidity });
    } catch (err) {
        res.json({ ok: true, liquidity: 0, degraded: true, error: err.message });
    }
});

/**
 * GET /api/admin/marketplace/economic-pressure
 */
router.get('/economic-pressure', async (req, res) => {
    try {
        const pressure = await twin.computeEconomicPressure();
        res.json({ ok: true, pressure });
    } catch (err) {
        res.json({ ok: true, pressure: 0, degraded: true, error: err.message });
    }
});

/**
 * GET /api/admin/marketplace/trade-history
 */
router.get('/trade-history', async (req, res) => {
    try {
        const history = await ledger.getTradeHistory();
        res.json({ ok: true, history });
    } catch (err) {
        res.json({ ok: true, history: [], degraded: true, error: err.message });
    }
});

/**
 * POST /api/admin/marketplace/rebalance
 */
router.post('/rebalance', async (req, res) => {
    try {
        // Mock rebalance trigger
        res.json({ ok: true, rebalanceExecuted: true });
    } catch (err) {
        res.json({ ok: false, error: err.message, degraded: true });
    }
});

/**
 * POST /api/admin/marketplace/auction
 */
router.post('/auction', async (req, res) => {
    try {
        const { dispatchId, auctionConfig } = req.body;
        const id = await auction.createAuction(dispatchId, auctionConfig || {});
        res.json({ ok: true, auctionId: id });
    } catch (err) {
        res.json({ ok: false, error: err.message, degraded: true });
    }
});

/**
 * POST /api/admin/marketplace/exchange
 */
router.post('/exchange', async (req, res) => {
    try {
        const { sourceId, targetId, capacityDef } = req.body;
        const id = await exchange.createExchangeReservation(sourceId, targetId, capacityDef || {});
        res.json({ ok: true, exchangeId: id });
    } catch (err) {
        res.json({ ok: false, error: err.message, degraded: true });
    }
});

/**
 * POST /api/admin/marketplace/snapshot
 */
router.post('/snapshot', async (req, res) => {
    try {
        const snapshot = await twin.generateMarketplaceSnapshot();
        res.json({ ok: true, snapshot });
    } catch (err) {
        res.json({ ok: false, error: err.message, degraded: true });
    }
});

module.exports = router;
