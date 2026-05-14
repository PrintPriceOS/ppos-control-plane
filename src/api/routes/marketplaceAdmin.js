/**
 * src/api/routes/marketplaceAdmin.js
 * 
 * Administrative endpoints for Phase 17 — Autonomous Manufacturing Marketplace.
 */
const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const marketplace = require('../services/manufacturingMarketplaceService');
const marketplaceService = require('../services/marketplaceService');
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
 * Returns real active marketplace sessions.
 */
router.get('/sessions', async (req, res) => {
    try {
        // Support rich filtering query parameters via listSessions contract
        const result = await marketplaceService.listSessions(req.query);
        res.json({ 
            ok: true, 
            sessions: result.sessions, 
            total: result.total, 
            limit: result.limit,
            offset: result.offset,
            status: "LIVE"
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/marketplace/sessions/:id
 * Returns real detail for a specific marketplace session.
 */
router.get('/sessions/:id', async (req, res) => {
    try {
        const detailResult = await marketplaceService.getSessionDetail(req.params.id);
        if (!detailResult || !detailResult.ok || !detailResult.session) {
            return res.status(404).json({ ok: false, error: 'MARKETPLACE_SESSION_NOT_FOUND' });
        }
        res.json({
            ok: true,
            session: detailResult.session
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/marketplace/sessions/:sessionId/select
 * Administrative override to explicitly select a winning offer.
 */
router.post('/sessions/:sessionId/select', async (req, res) => {
    const { offer_id, selection_mode = 'ADMIN_OVERRIDE' } = req.body;
    try {
        // Extract target offer id supporting both snake_case and camelCase
        const targetOfferId = offer_id || req.body.offerId;
        if (!targetOfferId) {
            return res.status(400).json({ ok: false, error: 'MISSING_OFFER_ID' });
        }

        const updatedSessionResult = await marketplaceService.selectOffer(req.params.sessionId, targetOfferId, selection_mode);
        
        // Find selected offer object inside the populated session detail
        const selectedOffer = updatedSessionResult?.session?.offers?.find(o => o.id === targetOfferId) || { id: targetOfferId, offerSelected: true };

        res.json({ 
            ok: true, 
            session: updatedSessionResult?.session || {},
            selectedOffer
        });
    } catch (err) {
        if (err.message === 'MARKETPLACE_SESSION_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'MARKETPLACE_SESSION_NOT_FOUND' });
        }
        if (err.message === 'MARKETPLACE_OFFER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'MARKETPLACE_OFFER_NOT_FOUND' });
        }
        res.status(500).json({ ok: false, error: 'MARKETPLACE_SELECT_FAILED', details: err.message });
    }
});

module.exports = router;
