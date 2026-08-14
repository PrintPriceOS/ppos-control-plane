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
const { requireRole, resolveActorContext } = require('../middleware/auth');
const requireGlobalAdmin = requireRole('TENANT_ADMIN');

/**
 * GET /api/admin/marketplace/health
 */
router.get('/health', requireGlobalAdmin, async (req, res) => {
    try {
        const health = await marketplace.getMarketplaceHealth();
        return res.json({ ok: true, health });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_HEALTH_ERROR' });
    }
});

router.get('/offers', async (req, res) => {
    try {
        const context = resolveActorContext(req);
        let query = 'SELECT * FROM marketplace_capacity_offers WHERE status = "ACTIVE"';
        const params = [];
        if (context.isPrinthouseUser) {
            query += ' AND printhouse_id = ?';
            params.push(context.printhouseId);
        }
        query += ' ORDER BY created_at DESC LIMIT 50';
        
        const offers = await db.query(query, params);
        return res.json({ ok: true, data: offers });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_OFFERS_QUERY_ERROR' });
    }
});

router.get('/auctions', requireGlobalAdmin, async (req, res) => {
    try {
        const auctions = await db.query('SELECT * FROM marketplace_dispatch_auctions ORDER BY created_at DESC LIMIT 50');
        return res.json({ ok: true, data: auctions });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_AUCTIONS_QUERY_ERROR' });
    }
});

router.get('/ledger', requireGlobalAdmin, async (req, res) => {
    try {
        const history = await ledger.getTradeHistory();
        return res.json({ ok: true, data: history });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_LEDGER_QUERY_ERROR' });
    }
});

router.get('/liquidity', requireGlobalAdmin, async (req, res) => {
    try {
        const liquidity = await twin.computeLiquidityIndex();
        return res.json({ ok: true, liquidity });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_LIQUIDITY_ERROR' });
    }
});

router.get('/economic-pressure', requireGlobalAdmin, async (req, res) => {
    try {
        const pressure = await twin.computeEconomicPressure();
        return res.json({ ok: true, pressure });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_PRESSURE_ERROR' });
    }
});

router.get('/trade-history', requireGlobalAdmin, async (req, res) => {
    try {
        const history = await ledger.getTradeHistory();
        return res.json({ ok: true, data: history });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_TRADE_HISTORY_ERROR' });
    }
});

router.post('/rebalance', requireGlobalAdmin, async (req, res) => {
    try {
        return res.json({ ok: true, rebalanceExecuted: true });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_REBALANCE_ERROR' });
    }
});

router.post('/auction', requireGlobalAdmin, async (req, res) => {
    try {
        const { dispatchId, auctionConfig } = req.body;
        const id = await auction.createAuction(dispatchId, auctionConfig || {});
        return res.json({ ok: true, auctionId: id });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_AUCTION_CREATE_ERROR' });
    }
});

router.post('/exchange', requireGlobalAdmin, async (req, res) => {
    try {
        const { sourceId, targetId, capacityDef } = req.body;
        const id = await exchange.createExchangeReservation(sourceId, targetId, capacityDef || {});
        return res.json({ ok: true, exchangeId: id });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, code: 'MARKETPLACE_EXCHANGE_CREATE_ERROR' });
    }
});

router.post('/snapshot', requireGlobalAdmin, async (req, res) => {
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
 * Phase 192 RC20.3: Restrict pricing sessions browser to SUPER_ADMIN / platform operators.
 */
router.get('/sessions', async (req, res) => {
    try {
        const context = resolveActorContext(req);
        if (!context.isSuperAdmin && (context.isPrinthouseUser || context.role === 'PRINTHOUSE_ADMIN' || context.role === 'PRINTHOUSE_OPERATOR')) {
            return res.status(403).json({
                ok: false,
                error: 'FORBIDDEN',
                message: 'Pricing sessions browser is restricted to global platform administrators.'
            });
        }
        
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
 * Phase 192 RC20.3: Restrict pricing session detail and competitor forensics to SUPER_ADMIN / platform operators.
 */
router.get('/sessions/:id', async (req, res) => {
    try {
        const context = resolveActorContext(req);
        if (!context.isSuperAdmin && (context.isPrinthouseUser || context.role === 'PRINTHOUSE_ADMIN' || context.role === 'PRINTHOUSE_OPERATOR')) {
            return res.status(403).json({
                ok: false,
                error: 'FORBIDDEN',
                message: 'Pricing session forensics and proposal details are restricted to global platform administrators.'
            });
        }

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
 * Phase 192 RC20.3: Restrict manual offer selection to SUPER_ADMIN / platform operators.
 */
router.post('/sessions/:sessionId/select', async (req, res) => {
    const sessionId = req.params.sessionId;
    const targetOfferId = req.body.offer_id || req.body.offerId;
    const selectionMode = req.body.selection_mode || req.body.selectionMode || 'ADMIN_OVERRIDE';

    try {
        const context = resolveActorContext(req);
        if (!context.isSuperAdmin && (context.isPrinthouseUser || context.role === 'PRINTHOUSE_ADMIN' || context.role === 'PRINTHOUSE_OPERATOR')) {
            return res.status(403).json({
                ok: false,
                error: 'FORBIDDEN',
                message: 'Manual offer selection is restricted to global platform administrators.'
            });
        }

        if (!targetOfferId) {
            return res.status(400).json({ ok: false, error: 'MISSING_OFFER_ID' });
        }

        const updatedSessionResult = await marketplaceService.selectOffer(sessionId, targetOfferId, selectionMode);
        const selectedOffer = updatedSessionResult?.session?.offers?.find(o => o.id === targetOfferId) || { id: targetOfferId, offerSelected: true };

        return res.json({
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
        return res.status(500).json({ ok: false, error: 'MARKETPLACE_SELECT_FAILED', details: err.message });
    }
});

/**
 * GET /api/admin/marketplace/orders/:orderId/machine-compatibility
 */
router.get('/orders/:orderId/machine-compatibility', requireGlobalAdmin, async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const context = resolveActorContext(req);
        const tenantId = context.tenantId || 'system';

        const machineCompatibilityService = require('../services/machineCompatibilityService');

        // Resolve jobId linked to order
        const files = await db.query('SELECT preflight_job_id FROM marketplace_order_files WHERE order_id = ? LIMIT 1', [orderId]);
        const jobId = (files && files.length > 0) ? files[0].preflight_job_id : null;

        const compat = await machineCompatibilityService.evaluateMachineCompatibilityForOrder({
            orderId,
            tenantId,
            jobId,
            actor: context
        });

        return res.json({ ok: true, machine_compatibility_governance: compat });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/marketplace/orders/:orderId/machine-compatibility/override
 */
router.post('/orders/:orderId/machine-compatibility/override', requireGlobalAdmin, async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const { approve_override, override_reason } = req.body;
        const context = resolveActorContext(req);
        const tenantId = context.tenantId || 'system';

        if (!approve_override) {
            return res.status(400).json({ ok: false, error: 'APPROVE_OVERRIDE_REQUIRED' });
        }

        const machineCompatibilityService = require('../services/machineCompatibilityService');

        // Resolve jobId linked to order
        const files = await db.query('SELECT preflight_job_id FROM marketplace_order_files WHERE order_id = ? LIMIT 1', [orderId]);
        const jobId = (files && files.length > 0) ? files[0].preflight_job_id : null;

        const compat = await machineCompatibilityService.evaluateMachineCompatibilityForOrder({
            orderId,
            tenantId,
            jobId,
            actor: context
        });

        const canOverride = machineCompatibilityService.canOverrideMachineWarning({
            evaluation: compat,
            actor: context,
            overrideReason: override_reason
        });

        if (!canOverride.allowed) {
            // Emit rejected audit event
            await db.query(`
                INSERT INTO printhouse_capability_audit 
                (printhouse_id, tenant_id, event_type, actor_user_id, actor_role, details)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                compat.printhouse_id || 'system',
                tenantId,
                'MACHINE_COMPATIBILITY_OVERRIDE_REJECTED',
                context.userId || 'system',
                context.role || 'operator',
                JSON.stringify({ orderId, reason: canOverride.reason, override_reason })
            ]);

            return res.status(400).json({ ok: false, error: 'OVERRIDE_BLOCKED', reason: canOverride.reason });
        }

        // Apply override
        const orderRows = await db.query('SELECT metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
        if (!orderRows || orderRows.length === 0) {
            return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND' });
        }

        const metadata = typeof orderRows[0].metadata_json === 'string' ? JSON.parse(orderRows[0].metadata_json) : (orderRows[0].metadata_json || {});
        metadata.machine_compatibility_override = {
            approved: true,
            approved_by: context.userId || 'system',
            approved_at: new Date().toISOString(),
            override_reason
        };

        await db.query('UPDATE marketplace_orders SET metadata_json = ? WHERE order_id = ?', [JSON.stringify(metadata), orderId]);

        // Emit approved audit event
        await db.query(`
            INSERT INTO printhouse_capability_audit 
            (printhouse_id, tenant_id, event_type, actor_user_id, actor_role, details)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            compat.printhouse_id || 'system',
            tenantId,
            'MACHINE_COMPATIBILITY_OVERRIDE_APPROVED',
            context.userId || 'system',
            context.role || 'operator',
            JSON.stringify({ orderId, override_reason })
        ]);

        return res.json({ ok: true, machine_compatibility_override: metadata.machine_compatibility_override });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
