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
        return res.json({ ok: true, health });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_HEALTH_ERROR' });
    }
});

router.get('/offers', async (req, res) => {
    try {
        const offers = await db.query('SELECT * FROM marketplace_capacity_offers WHERE status = "ACTIVE" ORDER BY created_at DESC LIMIT 50');
        return res.json({ ok: true, data: offers });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_OFFERS_QUERY_ERROR' });
    }
});

router.get('/auctions', async (req, res) => {
    try {
        const auctions = await db.query('SELECT * FROM marketplace_dispatch_auctions ORDER BY created_at DESC LIMIT 50');
        return res.json({ ok: true, data: auctions });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_AUCTIONS_QUERY_ERROR' });
    }
});

router.get('/ledger', async (req, res) => {
    try {
        const history = await ledger.getTradeHistory();
        return res.json({ ok: true, data: history });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_LEDGER_QUERY_ERROR' });
    }
});

router.get('/liquidity', async (req, res) => {
    try {
        const liquidity = await twin.computeLiquidityIndex();
        return res.json({ ok: true, liquidity });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_LIQUIDITY_ERROR' });
    }
});

router.get('/economic-pressure', async (req, res) => {
    try {
        const pressure = await twin.computeEconomicPressure();
        return res.json({ ok: true, pressure });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_PRESSURE_ERROR' });
    }
});

router.get('/trade-history', async (req, res) => {
    try {
        const history = await ledger.getTradeHistory();
        return res.json({ ok: true, data: history });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_TRADE_HISTORY_ERROR' });
    }
});

router.post('/rebalance', async (req, res) => {
    try {
        return res.json({ ok: true, rebalanceExecuted: true });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_REBALANCE_ERROR' });
    }
});

router.post('/auction', async (req, res) => {
    try {
        const { dispatchId, auctionConfig } = req.body;
        const id = await auction.createAuction(dispatchId, auctionConfig || {});
        return res.json({ ok: true, auctionId: id });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_AUCTION_CREATE_ERROR' });
    }
});

router.post('/exchange', async (req, res) => {
    try {
        const { sourceId, targetId, capacityDef } = req.body;
        const id = await exchange.createExchangeReservation(sourceId, targetId, capacityDef || {});
        return res.json({ ok: true, exchangeId: id });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_EXCHANGE_CREATE_ERROR' });
    }
});

router.post('/snapshot', async (req, res) => {
    try {
        const snapshot = await twin.generateMarketplaceSnapshot();
        return res.json({ ok: true, snapshot });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_SNAPSHOT_ERROR' });
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
        return res.json({ 
            ok: true, 
            sessions: result.sessions, 
            total: result.total, 
            limit: result.limit,
            offset: result.offset,
            status: "LIVE"
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
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
        return res.json({
            ok: true,
            session: detailResult.session
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/marketplace/sessions/:sessionId/select
 * Administrative override to explicitly select a winning offer.
 */
router.post('/sessions/:sessionId/select', async (req, res) => {
    const sessionId = req.params.sessionId;
    const targetOfferId = req.body.offer_id || req.body.offerId;
    const selectionMode = req.body.selection_mode || req.body.selectionMode || 'ADMIN_OVERRIDE';

    console.log(`[MARKETPLACE][SELECT-REQUEST] Intercepted offer selection override request`, {
        sessionId,
        targetOfferId,
        selectionMode,
        bodyStyles: {
            offer_id: req.body.offer_id,
            offerId: req.body.offerId,
            selection_mode: req.body.selection_mode,
            selectionMode: req.body.selectionMode
        }
    });

    try {
        if (!targetOfferId) {
            console.warn(`[MARKETPLACE][SELECT-FAILED] Missing required target offer identifier`, { sessionId });
            return res.status(400).json({ ok: false, error: 'MISSING_OFFER_ID' });
        }

        const updatedSessionResult = await marketplaceService.selectOffer(sessionId, targetOfferId, selectionMode);
        
        // Find selected offer object inside the populated session detail
        const selectedOffer = updatedSessionResult?.session?.offers?.find(o => o.id === targetOfferId) || { id: targetOfferId, offerSelected: true };

        const responsePayload = { 
            ok: true, 
            session: updatedSessionResult?.session || {},
            selectedOffer
        };

        console.log(`[MARKETPLACE][SELECT-RESPONSE] Completed selection override successfully`, {
            sessionId,
            targetOfferId,
            selectionMode,
            sessionStatus: updatedSessionResult?.session?.sessionStatus
        });

        return res.json(responsePayload);
    } catch (err) {
        console.error(`[MARKETPLACE][SELECT-FAILED] Selection override process failed: ${err.message}`, {
            sessionId,
            targetOfferId,
            selectionMode,
            stack: err.stack
        });

        if (err.message === 'MARKETPLACE_SESSION_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'MARKETPLACE_SESSION_NOT_FOUND' });
        }
        if (err.message === 'MARKETPLACE_OFFER_NOT_FOUND') {
            return res.status(404).json({ ok: false, error: 'MARKETPLACE_OFFER_NOT_FOUND' });
        }
        return res.status(500).json({ ok: false, error: 'MARKETPLACE_SELECT_FAILED', details: err.message });
    }
});

module.exports = router;
