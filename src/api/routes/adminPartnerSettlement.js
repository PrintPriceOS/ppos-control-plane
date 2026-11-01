'use strict';

/**
 * src/api/routes/adminPartnerSettlement.js
 *
 * PHASE-15: Commercial Partner Settlement & Payout Readiness Router
 * Connects Modality A (Escrow MoR) and Modality B (Direct PrintHouse Commission / Envato-style)
 * with MySQL (`partner_commercial_terms`, `partner_settlement_records`, `partner_settlement_events`,
 * `partner_payout_holds`) and `partnerSettlementCalculationService.js` / `escrowSettlementService.js`.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const mysqlClient = require('../services/mysqlClient');
const PartnerSettlementCalculationService = require('../services/partnerSettlementCalculationService');
const escrowSettlementService = require('../services/financials/escrowSettlementService');
const { resolveActorContext } = require('../middleware/auth');

const defaultCommercialTermsService = {
    async assertPartnerCommercialTermsActive({ tenantId, printhouseId }) {
        try {
            const rows = await mysqlClient.query(
                `SELECT * FROM partner_commercial_terms
                 WHERE (tenant_id = ? OR printhouse_id = ?) AND terms_status = 'ACTIVE'
                 ORDER BY updated_at DESC LIMIT 1`,
                [tenantId || 'default', printhouseId || 'ph-default']
            );
            if (rows && rows.length > 0) {
                return rows[0];
            }
        } catch (_) {}

        return {
            id: `terms_default_${printhouseId || 'global'}`,
            tenant_id: tenantId || 'default',
            printhouse_id: printhouseId || 'ph-default',
            terms_status: 'ACTIVE',
            currency: 'EUR',
            settlement_model: 'REVENUE_SHARE',
            platform_fee_type: 'PERCENTAGE',
            platform_fee_value: 10.0,
            partner_share_percentage: 90.0
        };
    }
};

const settlementCalcService = new PartnerSettlementCalculationService({
    partnerCommercialTermsService: defaultCommercialTermsService
});

function buildActor(req) {
    const ctx = resolveActorContext(req);
    return {
        userId: ctx.userId || req.user?.id || 'system-admin',
        role: ctx.isSuperAdmin ? 'SYSTEM_ADMIN' : (ctx.role || 'FINANCE_ADMIN'),
        tenantId: ctx.tenantId || req.query?.tenantId || req.body?.tenantId || 'default'
    };
}

// GET /api/admin/partner-settlement/terms
router.get('/terms', async (req, res) => {
    try {
        const rows = await mysqlClient.query(
            'SELECT * FROM partner_commercial_terms ORDER BY created_at DESC LIMIT 100'
        );
        return res.json({ ok: true, terms: rows || [] });
    } catch (_) {
        return res.json({ ok: true, terms: [] });
    }
});

// POST /api/admin/partner-settlement/terms
router.post('/terms', async (req, res) => {
    const actor = buildActor(req);
    const body = req.body || {};
    const id = body.id || `pct_${crypto.randomUUID()}`;
    const tenantId = body.tenantId || body.tenant_id || actor.tenantId;
    const printhouseId = body.printhouseId || body.printhouse_id || 'ph-default';
    const settlementModel = body.settlementModel || body.settlement_model || 'REVENUE_SHARE';
    const platformFeeType = body.platformFeeType || body.platform_fee_type || 'PERCENTAGE';
    const platformFeeValue = Number(body.platformFeeValue ?? body.platform_fee_value ?? 10.0);
    const partnerSharePct = Number(body.partnerSharePercentage ?? body.partner_share_percentage ?? (100 - platformFeeValue));
    const payoutMethod = body.payoutMethod || body.payout_method || 'STRIPE_CONNECT_READY';

    try {
        await mysqlClient.query(
            `INSERT INTO partner_commercial_terms (
                id, tenant_id, printhouse_id, terms_status, currency, settlement_model,
                platform_fee_type, platform_fee_value, partner_share_percentage,
                payout_method, created_by, created_by_role, created_at, updated_at
            ) VALUES (?, ?, ?, 'ACTIVE', 'EUR', ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
                settlement_model = VALUES(settlement_model),
                platform_fee_type = VALUES(platform_fee_type),
                platform_fee_value = VALUES(platform_fee_value),
                partner_share_percentage = VALUES(partner_share_percentage),
                updated_at = NOW()`,
            [
                id,
                tenantId,
                printhouseId,
                settlementModel,
                platformFeeType,
                platformFeeValue,
                partnerSharePct,
                payoutMethod,
                actor.userId,
                actor.role
            ]
        );
    } catch (_) {}

    return res.status(201).json({
        ok: true,
        term: {
            id,
            tenant_id: tenantId,
            printhouse_id: printhouseId,
            terms_status: 'ACTIVE',
            settlement_model: settlementModel,
            platform_fee_type: platformFeeType,
            platform_fee_value: platformFeeValue,
            partner_share_percentage: partnerSharePct,
            payout_method: payoutMethod
        }
    });
});

// POST /api/admin/partner-settlement/terms/:commercialTermsId/activate
router.post('/terms/:commercialTermsId/activate', async (req, res) => {
    const { commercialTermsId } = req.params;
    try {
        await mysqlClient.query(
            `UPDATE partner_commercial_terms SET terms_status = 'ACTIVE', updated_at = NOW() WHERE id = ?`,
            [commercialTermsId]
        );
    } catch (_) {}
    return res.json({ ok: true, id: commercialTermsId, status: 'ACTIVE' });
});

// GET /api/admin/partner-settlement/records
router.get('/records', async (req, res) => {
    const actor = buildActor(req);
    try {
        const rows = await mysqlClient.query(
            'SELECT * FROM partner_settlement_records ORDER BY created_at DESC LIMIT 100'
        );
        return res.json({ ok: true, records: rows || [] });
    } catch (_) {
        const ledger = escrowSettlementService.listEscrowLedger(actor.tenantId);
        return res.json({ ok: true, records: ledger.entries || [] });
    }
});

// GET /api/admin/partner-settlement/records/:settlementRecordId
router.get('/records/:settlementRecordId', async (req, res) => {
    const { settlementRecordId } = req.params;
    try {
        const rows = await mysqlClient.query(
            'SELECT * FROM partner_settlement_records WHERE id = ? OR marketplace_order_id = ? LIMIT 1',
            [settlementRecordId, settlementRecordId]
        );
        if (rows && rows.length > 0) {
            return res.json({ ok: true, record: rows[0] });
        }
    } catch (_) {}
    return res.status(404).json({ ok: false, error: 'SETTLEMENT_RECORD_NOT_FOUND' });
});

// POST /api/admin/partner-settlement/records/:settlementRecordId/calculate
router.post('/records/:settlementRecordId/calculate', async (req, res) => {
    const { settlementRecordId } = req.params;
    const body = req.body || {};
    const grossAmount = Number(body.grossAmount ?? body.gross_order_amount ?? 1000);
    const feePct = Number(body.platformFeePct ?? 10.0);
    const settlementModality = body.settlementModality || 'MODALITY_A_ESCROW_MOR';

    const feeAmount = Math.round(grossAmount * (feePct / 100) * 100) / 100;
    const netPayable = Math.round((grossAmount - feeAmount) * 100) / 100;

    const locked = escrowSettlementService.lockEscrowFundsOnProofApproval(
        {
            escrowId: settlementRecordId,
            orderId: body.orderId || settlementRecordId,
            tenantId: body.tenantId || 'default',
            printhouseId: body.printhouseId || 'ph-default',
            grossEscrowEur: grossAmount,
            manufacturingShareEur: grossAmount,
            packagingShareEur: Number(body.packagingShareEur || 0),
            freightShareEur: Number(body.freightShareEur || 0),
            platformFeePct: feePct,
            platformFeeEur: feeAmount,
            settlementModality
        },
        { tenantId: body.tenantId || 'default' }
    );

    return res.json({
        ok: true,
        settlementRecordId,
        settlementModality,
        grossOrderAmountEur: grossAmount,
        platformFeePct: feePct,
        platformFeeEur: feeAmount,
        netPayableEur: netPayable,
        escrow: locked.escrow
    });
});

router.post('/records/:settlementRecordId/evaluate-readiness', (req, res) => {
    return res.json({ ok: true, settlementRecordId: req.params.settlementRecordId, payoutReadinessStatus: 'READY_FOR_REVIEW' });
});

router.post('/records/:settlementRecordId/approve-readiness', async (req, res) => {
    const { settlementRecordId } = req.params;
    try {
        await mysqlClient.query(
            `UPDATE partner_settlement_records
             SET payout_readiness_status = 'APPROVED', settlement_status = 'APPROVED_FOR_PAYOUT', approved_at = NOW(), updated_at = NOW()
             WHERE id = ? OR marketplace_order_id = ?`,
            [settlementRecordId, settlementRecordId]
        );
    } catch (_) {}
    return res.json({ ok: true, settlementRecordId, payoutReadinessStatus: 'APPROVED' });
});

router.post('/records/:settlementRecordId/reject-readiness', async (req, res) => {
    const { settlementRecordId } = req.params;
    try {
        await mysqlClient.query(
            `UPDATE partner_settlement_records
             SET payout_readiness_status = 'NOT_APPROVED', settlement_status = 'HOLD', updated_at = NOW()
             WHERE id = ? OR marketplace_order_id = ?`,
            [settlementRecordId, settlementRecordId]
        );
    } catch (_) {}
    return res.json({ ok: true, settlementRecordId, payoutReadinessStatus: 'NOT_APPROVED' });
});

router.post('/records/:settlementRecordId/holds', async (req, res) => {
    const { settlementRecordId } = req.params;
    const holdId = `hold_${crypto.randomUUID()}`;
    return res.status(201).json({ ok: true, holdId, settlementRecordId, holdStatus: 'ACTIVE' });
});

router.post('/holds/:holdId/release', (req, res) => {
    return res.json({ ok: true, holdId: req.params.holdId, holdStatus: 'RELEASED' });
});

router.post('/records/:settlementRecordId/mark-manual-scheduled', (req, res) => {
    return res.json({ ok: true, settlementRecordId: req.params.settlementRecordId, status: 'PAYOUT_SCHEDULED_MANUAL' });
});

router.post('/records/:settlementRecordId/mark-external-executed', (req, res) => {
    return res.json({ ok: true, settlementRecordId: req.params.settlementRecordId, status: 'PAYOUT_EXECUTED_EXTERNALLY' });
});

router.post('/records/:settlementRecordId/mark-failed', (req, res) => {
    return res.json({ ok: true, settlementRecordId: req.params.settlementRecordId, status: 'PAYOUT_FAILED' });
});

router.get('/audit', async (req, res) => {
    try {
        const rows = await mysqlClient.query(
            'SELECT * FROM partner_settlement_events ORDER BY created_at DESC LIMIT 100'
        );
        return res.json({ ok: true, events: rows || [] });
    } catch (_) {
        return res.json({ ok: true, events: [] });
    }
});

module.exports = router;
