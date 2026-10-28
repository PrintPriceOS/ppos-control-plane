'use strict';

/**
 * src/api/routes/spineRoutes.js
 *
 * PrintPrice OS — Phase 197B (SPINE-03): Protected & Versioned Spine Calculation API Routes
 *
 * Mounted at: /api/v1/spine
 * Exposes:
 * - POST /api/v1/spine/calculate
 * - GET  /api/v1/spine/profiles
 * - GET  /api/v1/spine/calculations/:id
 *
 * Security & Governance Guarantees:
 * - Enforces authentication via requireAdmin (JWT, service token, or break-glass).
 * - Enforces strict tenant isolation: tenantId is resolved from the authenticated actor context,
 *   rejecting any cross-tenant spoofing in request body or query parameters with HTTP 403.
 * - Rejects prototype pollution and enforces input bounds.
 * - Supports Idempotency-Key header for snapshot persistence.
 */

const express = require('express');
const router = express.Router();
const { requireAdmin, resolveActorContext } = require('../middleware/auth');
const {
    SpineCalculationService,
    SpineCalculationError
} = require('../services/spine/spineCalculationService');

const spineService = new SpineCalculationService();

router.use(requireAdmin);

function resolveTrustedTenant(req, res) {
    const actor = resolveActorContext(req);
    const tenantId = actor.tenantId || (req.user && req.user.tenantId) || null;
    if (!tenantId) {
        res.status(403).json({
            ok: false,
            error: {
                code: 'TENANT_CONTEXT_REQUIRED',
                message: 'An authenticated tenant context is required to access Spine Calculation APIs.'
            }
        });
        return null;
    }

    const bodyTenant = req.body && (req.body.tenantId || req.body.tenant_id);
    const queryTenant = req.query && (req.query.tenantId || req.query.tenant_id);
    const headerTenant = req.headers['x-tenant-id'];

    if (
        (bodyTenant && bodyTenant !== tenantId) ||
        (queryTenant && queryTenant !== tenantId) ||
        (headerTenant && headerTenant !== tenantId)
    ) {
        res.status(403).json({
            ok: false,
            error: {
                code: 'FORBIDDEN_TENANT_MISMATCH',
                message: 'Cross-tenant access or tenant spoofing is strictly prohibited.'
            }
        });
        return null;
    }

    return { actor, tenantId };
}

/**
 * GET /api/v1/spine/profiles
 * Returns versioned binding profiles available to the authenticated tenant/printhouse.
 */
router.get('/profiles', async (req, res) => {
    const ctx = resolveTrustedTenant(req, res);
    if (!ctx) return;

    try {
        const includeExperimental = req.query.includeExperimental === 'true';
        const printhouseId = req.query.printhouseId || ctx.actor.printhouseId || null;

        const profiles = await spineService.listProfiles({
            tenantId: ctx.tenantId,
            printhouseId,
            includeExperimental
        });

        return res.status(200).json({
            ok: true,
            data: {
                tenantId: ctx.tenantId,
                printhouseId,
                profiles
            }
        });
    } catch (err) {
        const status = err instanceof SpineCalculationError ? err.statusCode : 500;
        return res.status(status).json({
            ok: false,
            error: {
                code: err.code || 'INTERNAL_SPINE_PROFILE_ERROR',
                message: err.message
            }
        });
    }
});

/**
 * POST /api/v1/spine/calculate
 * Calculates deterministic block thickness, spine width, and cover geometry.
 * Optionally persists an immutable snapshot when persistSnapshot=true or externalOrderIntentId is supplied.
 */
router.post('/calculate', async (req, res) => {
    const ctx = resolveTrustedTenant(req, res);
    if (!ctx) return;

    const body = req.body || {};
    const idempotencyKey = req.headers['idempotency-key'] || body.idempotencyKey || null;
    const persistSnapshot = Boolean(
        body.persistSnapshot === true ||
        body.externalOrderIntentId ||
        body.canonicalOrderId ||
        idempotencyKey
    );

    try {
        const result = await spineService.calculateSpine({
            tenantId: ctx.tenantId,
            printhouseId: ctx.actor.printhouseId || body.printhouseId || null,
            actorId: ctx.actor.userId || 'system',
            idempotencyKey,
            persistSnapshot,
            externalOrderIntentId: body.externalOrderIntentId || null,
            canonicalOrderId: body.canonicalOrderId || null,
            paperDecisionId: body.paperDecisionId || null,
            quoteRevisionId: body.quoteRevisionId || null,
            payload: body
        });

        const statusCode = persistSnapshot && !result.idempotentReplay ? 201 : 200;
        return res.status(statusCode).json({
            ok: true,
            data: result
        });
    } catch (err) {
        const status = err instanceof SpineCalculationError ? err.statusCode : 500;
        return res.status(status).json({
            ok: false,
            error: {
                code: err.code || 'SPINE_CALCULATION_FAILED',
                message: err.message,
                details: err.details || null
            }
        });
    }
});

/**
 * GET /api/v1/spine/calculations/:id
 * Retrieves an immutable spine calculation snapshot by ID with strict tenant isolation.
 */
router.get('/calculations/:id', async (req, res) => {
    const ctx = resolveTrustedTenant(req, res);
    if (!ctx) return;

    try {
        const snapshot = await spineService.getCalculationById({
            tenantId: ctx.tenantId,
            calculationId: req.params.id
        });

        return res.status(200).json({
            ok: true,
            data: snapshot
        });
    } catch (err) {
        const status = err instanceof SpineCalculationError ? err.statusCode : 500;
        return res.status(status).json({
            ok: false,
            error: {
                code: err.code || 'SPINE_SNAPSHOT_FETCH_FAILED',
                message: err.message
            }
        });
    }
});

/**
 * POST /api/v1/spine/calculations/:id/verify-release
 * Enforces SPINE-05 Gate 5: verifies whether a persisted spine calculation snapshot
 * meets all physical caliper and profile certification requirements for manufacturing release.
 */
router.post('/calculations/:id/verify-release', async (req, res) => {
    const ctx = resolveTrustedTenant(req, res);
    if (!ctx) return;

    try {
        const body = req.body || {};
        const releaseStatus = await spineService.verifySnapshotForManufacturingRelease({
            tenantId: ctx.tenantId,
            calculationId: req.params.id,
            expectedOrderIntentId: body.externalOrderIntentId || body.canonicalOrderId || null
        });

        return res.status(200).json({
            ok: true,
            data: releaseStatus
        });
    } catch (err) {
        const status = err instanceof SpineCalculationError ? err.statusCode : 500;
        return res.status(status).json({
            ok: false,
            error: {
                code: err.code || 'SPINE_RELEASE_VERIFICATION_FAILED',
                message: err.message,
                details: err.details || null
            }
        });
    }
});

module.exports = router;
