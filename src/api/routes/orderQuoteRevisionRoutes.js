'use strict';

/**
 * src/api/routes/orderQuoteRevisionRoutes.js
 * 
 * PrintPrice OS — Phase 196G: Governed Order Quote Revision & Single-Use Token Routes (BUDGET-02C-01)
 *
 * Exposes:
 * 1. POST /api/marketplace/quote-revisions (Issue revision by printhouse/operator)
 * 2. GET  /api/marketplace/quote-revisions/review/:token (Read-only customer review, safe against GET prefetching)
 * 3. POST /api/marketplace/quote-revisions/review/:token/respond (Governed customer acceptance/rejection)
 * 4. POST /api/marketplace/quote-revisions/:revisionId/revoke (Operator revocation)
 */

const express = require('express');
const router = express.Router();
const logger = require('../services/logger').child('order-quote-revision-routes');
const { OrderQuoteRevisionService } = require('../services/orderQuoteRevisionService');

const revisionService = new OrderQuoteRevisionService();

function resolveActorContext(req) {
    const user = req.user || {};
    return {
        userId: user.id || user.userId || user.sub || 'anonymous',
        role: user.role || 'GUEST',
        tenantId: user.tenant_id || user.tenantId || req.headers['x-tenant-id'] || null,
        printhouseId: user.printhouse_id || user.printhouseId || null,
        isSuperAdmin: user.role === 'SUPER_ADMIN' || user.role === 'SYSTEM_ADMIN',
        isAuthenticated: !!user.id || !!user.userId || !!user.sub
    };
}

/**
 * Endpoint 1: Issue Governed Quote Revision
 * POST /api/marketplace/quote-revisions
 */
router.post('/quote-revisions', async (req, res) => {
    const actor = resolveActorContext(req);
    const body = req.body || {};

    const tenantId = body.tenantId || body.tenant_id || actor.tenantId;
    const externalOrderIntentId = body.externalOrderIntentId || body.external_order_intent_id || body.orderId || body.jobId;
    const canonicalOrderId = body.canonicalOrderId || body.canonical_order_id || null;
    const paperDecisionId = body.paperDecisionId || body.paper_decision_id;
    const recipientEmail = body.recipientEmail || body.recipient_email;
    const originalCalculation = body.originalCalculation || body.original_calculation;
    const alternativeVariant = body.alternativeVariant || body.alternative_variant;
    const targetMarginPct = body.targetMarginPct !== undefined ? body.targetMarginPct : body.target_margin_pct;
    const taxResolutionContext = body.taxResolutionContext || body.tax_resolution_context || {};
    const printhouseConfig = body.printhouseConfig || body.printhouse_config || {};
    const allowSupersede = body.allowSupersede === true || body.allow_supersede === true;

    try {
        const result = await revisionService.createQuoteRevision({
            tenantId,
            externalOrderIntentId,
            canonicalOrderId,
            paperDecisionId,
            originalCalculation,
            alternativeVariant,
            targetMarginPct,
            taxResolutionContext,
            recipientEmail,
            printhouseConfig,
            actorContext: actor,
            allowSupersede
        });

        return res.status(201).json({
            ok: true,
            revision: result
        });
    } catch (err) {
        logger.error({
            event: 'CREATE_QUOTE_REVISION_FAILED',
            errorCode: err.code,
            message: err.message,
            tenantId,
            externalOrderIntentId
        });

        const statusCode = err.statusCode || 400;
        return res.status(statusCode).json({
            ok: false,
            error: {
                code: err.code || 'CREATE_QUOTE_REVISION_FAILED',
                message: err.message,
                details: err.details || null
            }
        });
    }
});

/**
 * Endpoint 2: Read-Only Customer Review by Single-Use Token
 * GET /api/marketplace/quote-revisions/review/:token
 * 
 * Strict Invariant: GET is completely read-only, does not consume token, immune to browser prefetching.
 */
router.get('/quote-revisions/review/:token', async (req, res) => {
    const rawToken = req.params.token;

    try {
        const review = await revisionService.getQuoteRevisionByToken({ rawToken });
        return res.status(200).json({
            ok: true,
            review
        });
    } catch (err) {
        logger.warn({
            event: 'REVIEW_QUOTE_REVISION_FAILED',
            errorCode: err.code,
            message: err.message
        });

        const statusCode = err.statusCode || 400;
        return res.status(statusCode).json({
            ok: false,
            error: {
                code: err.code || 'REVIEW_FAILED',
                message: err.message
            }
        });
    }
});

/**
 * Endpoint 3: Customer Acceptance or Rejection
 * POST /api/marketplace/quote-revisions/review/:token/respond
 */
router.post('/quote-revisions/review/:token/respond', async (req, res) => {
    const rawToken = req.params.token;
    const body = req.body || {};
    const decision = body.decision; // 'ACCEPT' | 'REJECT'
    const otpCode = body.otpCode || body.otp_code || null;
    const sessionToken = body.sessionToken || body.session_token || req.headers['x-session-token'] || null;
    const actor = resolveActorContext(req);
    const clientIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';

    try {
        const responseResult = await revisionService.respondToQuoteRevision({
            rawToken,
            decision,
            actorContext: actor,
            clientIp,
            userAgent,
            otpCode,
            sessionToken
        });

        return res.status(200).json({
            ok: true,
            result: responseResult
        });
    } catch (err) {
        logger.error({
            event: 'RESPOND_QUOTE_REVISION_FAILED',
            errorCode: err.code,
            message: err.message
        });

        const statusCode = err.statusCode || 400;
        return res.status(statusCode).json({
            ok: false,
            error: {
                code: err.code || 'RESPONSE_FAILED',
                message: err.message,
                details: err.details || null
            }
        });
    }
});

/**
 * Endpoint 4: Operator Revocation
 * POST /api/marketplace/quote-revisions/:revisionId/revoke
 */
router.post('/quote-revisions/:revisionId/revoke', async (req, res) => {
    const revisionId = req.params.revisionId;
    const actor = resolveActorContext(req);
    const body = req.body || {};
    const tenantId = body.tenantId || body.tenant_id || actor.tenantId;
    const reason = body.reason || 'Operator revocation';

    try {
        const result = await revisionService.revokeQuoteRevision({
            tenantId,
            revisionId,
            reason,
            actorContext: actor
        });

        return res.status(200).json({
            ok: true,
            revocation: result
        });
    } catch (err) {
        logger.error({
            event: 'REVOKE_QUOTE_REVISION_FAILED',
            revisionId,
            errorCode: err.code,
            message: err.message
        });

        const statusCode = err.statusCode || 400;
        return res.status(statusCode).json({
            ok: false,
            error: {
                code: err.code || 'REVOCATION_FAILED',
                message: err.message
            }
        });
    }
});

module.exports = router;
