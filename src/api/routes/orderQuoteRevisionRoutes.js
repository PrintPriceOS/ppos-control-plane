'use strict';

/**
 * src/api/routes/orderQuoteRevisionRoutes.js
 * 
 * PrintPrice OS — Phase 196G: Governed Order Quote Revision & Single-Use Token Routes (BUDGET-02C-01)
 *
 * Exposes:
 * 1. POST /api/marketplace/quote-revisions & /api/printhouse/quote-revisions (Issue revision by printhouse/operator)
 * 2. GET  /api/marketplace/quote-revisions/review/:token (Read-only customer review, safe against GET prefetching)
 * 3. POST /api/marketplace/quote-revisions/review/:token/respond (Governed customer acceptance/rejection)
 * 4. POST /api/marketplace/quote-revisions/:revisionId/revoke (Operator revocation)
 */

const express = require('express');
const router = express.Router();
const logger = require('../services/logger').child('order-quote-revision-routes');
const { OrderQuoteRevisionService } = require('../services/orderQuoteRevisionService');
const { resolveActorContext, requirePrinthouseScope } = require('../middleware/auth');

const nodemailer = (() => {
    try { return require('nodemailer'); } catch (_) { return null; }
})();

function createDefaultDeliveryProvider() {
    if (process.env.SMTP_HOST && nodemailer) {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === 'true',
            auth: process.env.SMTP_USER ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            } : undefined
        });
        return {
            async sendOtp({ recipient, otpCode, revisionId, deltaNet }) {
                const info = await transporter.sendMail({
                    from: process.env.SMTP_FROM || 'noreply@printprice.pro',
                    to: recipient,
                    subject: `PrintPrice OS — Verification Code for Quote Revision #${revisionId}`,
                    text: `Your one-time verification code is: ${otpCode}. Supplement: ${deltaNet} EUR.`
                });
                const isAccepted = Array.isArray(info.accepted) && info.accepted.includes(recipient);
                return {
                    ok: isAccepted,
                    accepted: isAccepted ? [recipient] : [],
                    rejected: !isAccepted ? [recipient] : [],
                    messageId: info.messageId || null,
                    status: isAccepted ? 'PROVIDER_ACCEPTED' : 'PROVIDER_REJECTED',
                    handset_receipt_proven: false
                };
            }
        };
    }
    if (process.env.NODE_ENV === 'test' || process.env.ENABLE_TEST_OTP_PROVIDER === 'true') {
        return {
            isTestAdapter: true,
            async sendOtp({ recipient, otpCode, revisionId }) {
                return {
                    ok: true,
                    accepted: [recipient],
                    messageId: `test_otp_msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
                    status: 'UNVERIFIED',
                    handset_receipt_proven: false
                };
            }
        };
    }
    return null;
}

const revisionService = new OrderQuoteRevisionService({
    deliveryProvider: createDefaultDeliveryProvider()
});

/**
 * Endpoint 1 Handler: Issue Governed Quote Revision
 */
async function handleCreateQuoteRevision(req, res) {
    const actor = resolveActorContext(req);
    const body = req.body || {};

    // SEC-C02 & SEC-C05: Tenant resolved strictly from trusted authenticated context, NEVER from client body
    const tenantId = actor.tenantId;
    if (!tenantId) {
        return res.status(403).json({
            ok: false,
            error: {
                code: 'TENANT_CONTEXT_REQUIRED',
                message: 'An authenticated tenant context is required to issue quote revisions'
            }
        });
    }

    const requestedTenantId = body.tenantId || body.tenant_id;
    if (requestedTenantId && requestedTenantId !== tenantId) {
        return res.status(403).json({
            ok: false,
            error: {
                code: 'FORBIDDEN_TENANT_MISMATCH',
                message: 'Cross-tenant quote revision issuance is strictly prohibited'
            }
        });
    }

    const externalOrderIntentId = body.externalOrderIntentId || body.external_order_intent_id || body.orderId || body.jobId;
    const canonicalOrderId = body.canonicalOrderId || body.canonical_order_id || null;
    const paperDecisionId = body.paperDecisionId || body.paper_decision_id;
    const recipientEmail = body.recipientEmail || body.recipient_email || null;
    const allowSupersede = body.allowSupersede === true || body.allow_supersede === true;

    // SEC-C02R: Strictly eliminate financial & technical authority from client body
    if (
        body.originalCalculation !== undefined ||
        body.original_calculation !== undefined ||
        body.targetMarginPct !== undefined ||
        body.target_margin_pct !== undefined ||
        body.alternativeVariant !== undefined ||
        body.alternative_variant !== undefined ||
        body.rates !== undefined ||
        body.tariffs !== undefined ||
        body.cost_override !== undefined
    ) {
        return res.status(400).json({
            ok: false,
            error: {
                code: 'FINANCIAL_AUTHORITY_VIOLATION',
                message: 'Economic calculations, variants, rates, and margins must be resolved strictly from authoritative systems of record, not request payload.'
            }
        });
    }

    try {
        const result = await revisionService.createQuoteRevision({
            tenantId,
            externalOrderIntentId,
            canonicalOrderId,
            paperDecisionId,
            recipientEmail,
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
}

/**
 * Endpoint 2 Handler: Read-Only Customer Review by Single-Use Token
 */
async function handleGetQuoteRevisionByToken(req, res) {
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
}

/**
 * Endpoint 3 Handler: Customer Acceptance or Rejection
 */
async function handleRespondToQuoteRevision(req, res) {
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
}

/**
 * Endpoint 4 Handler: Operator Revocation
 */
async function handleRevokeQuoteRevision(req, res) {
    const revisionId = req.params.revisionId;
    const actor = resolveActorContext(req);
    const body = req.body || {};

    // SEC-C02 & SEC-C05: Tenant resolved strictly from trusted authenticated context, NEVER from client body
    const tenantId = actor.tenantId;
    if (!tenantId) {
        return res.status(403).json({
            ok: false,
            error: {
                code: 'TENANT_CONTEXT_REQUIRED',
                message: 'An authenticated tenant context is required to revoke quote revisions'
            }
        });
    }

    const requestedTenantId = body.tenantId || body.tenant_id;
    if (requestedTenantId && requestedTenantId !== tenantId) {
        return res.status(403).json({
            ok: false,
            error: {
                code: 'FORBIDDEN_TENANT_MISMATCH',
                message: 'Cross-tenant quote revision revocation is strictly prohibited'
            }
        });
    }

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
}

// Support both standalone route path and subpath mount
router.post('/quote-revisions', requirePrinthouseScope(), handleCreateQuoteRevision);
router.post('/', requirePrinthouseScope(), handleCreateQuoteRevision);

router.get('/quote-revisions/review/:token', handleGetQuoteRevisionByToken);
router.get('/review/:token', handleGetQuoteRevisionByToken);

router.post('/quote-revisions/review/:token/respond', handleRespondToQuoteRevision);
router.post('/review/:token/respond', handleRespondToQuoteRevision);

router.post('/quote-revisions/:revisionId/revoke', requirePrinthouseScope(), handleRevokeQuoteRevision);
router.post('/:revisionId/revoke', requirePrinthouseScope(), handleRevokeQuoteRevision);

module.exports = router;
