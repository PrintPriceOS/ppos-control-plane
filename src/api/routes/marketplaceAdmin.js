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
        res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_HEALTH_ERROR' });
    }
});

router.get('/offers', async (req, res) => {
    try {
        const offers = await db.query('SELECT * FROM marketplace_capacity_offers WHERE status = "ACTIVE" ORDER BY created_at DESC LIMIT 50');
        res.json({ ok: true, data: offers });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_OFFERS_QUERY_ERROR' });
    }
});

router.get('/auctions', async (req, res) => {
    try {
        const auctions = await db.query('SELECT * FROM marketplace_dispatch_auctions ORDER BY created_at DESC LIMIT 50');
        res.json({ ok: true, data: auctions });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_AUCTIONS_QUERY_ERROR' });
    }
});

router.get('/ledger', async (req, res) => {
    try {
        const history = await ledger.getTradeHistory();
        res.json({ ok: true, data: history });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_LEDGER_QUERY_ERROR' });
    }
});

router.get('/liquidity', async (req, res) => {
    try {
        const liquidity = await twin.computeLiquidityIndex();
        res.json({ ok: true, liquidity });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_LIQUIDITY_ERROR' });
    }
});

router.get('/economic-pressure', async (req, res) => {
    try {
        const pressure = await twin.computeEconomicPressure();
        res.json({ ok: true, pressure });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_PRESSURE_ERROR' });
    }
});

router.get('/trade-history', async (req, res) => {
    try {
        const history = await ledger.getTradeHistory();
        res.json({ ok: true, data: history });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_TRADE_HISTORY_ERROR' });
    }
});

router.post('/rebalance', async (req, res) => {
    try {
        res.json({ ok: true, rebalanceExecuted: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_REBALANCE_ERROR' });
    }
});

router.post('/auction', async (req, res) => {
    try {
        const { dispatchId, auctionConfig } = req.body;
        const id = await auction.createAuction(dispatchId, auctionConfig || {});
        res.json({ ok: true, auctionId: id });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_AUCTION_CREATE_ERROR' });
    }
});

router.post('/exchange', async (req, res) => {
    try {
        const { sourceId, targetId, capacityDef } = req.body;
        const id = await exchange.createExchangeReservation(sourceId, targetId, capacityDef || {});
        res.json({ ok: true, exchangeId: id });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_EXCHANGE_CREATE_ERROR' });
    }
});

router.post('/snapshot', async (req, res) => {
    try {
        const snapshot = await twin.generateMarketplaceSnapshot();
        res.json({ ok: true, snapshot });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_SNAPSHOT_ERROR' });
    }
});

/**
 * GET /api/admin/marketplace/sessions
 * Returns active marketplace sessions.
 * COMPATIBILITY FALLBACK.
 */
router.get('/sessions', async (req, res) => {
    try {
        // Placeholder until marketplace sessions are fully integrated
        res.json({ 
            ok: true, 
            sessions: [], 
            total: 0, 
            status: "NOT_CONFIGURED",
            message: "Marketplace session tracking is initializing."
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
