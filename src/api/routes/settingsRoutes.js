'use strict';

/**
 * src/api/routes/settingsRoutes.js
 *
 * PHASE-15B: Printhouse Financial Configuration, Stripe Connect & B2B Banking REST Routes
 *
 * Exposes:
 * - GET  /api/settings/payments
 * - PUT  /api/settings/payments
 * - POST /api/settings/payments/stripe/test-connection
 */

const express = require('express');
const router = express.Router();
const printhousePaymentSettingsService = require('../services/printhousePaymentSettingsService');
const { requireAdmin } = require('../middleware/auth');

function resolveAuthAndTenant(req, res, next) {
    const applyCheck = () => {
        const user = req.user || req.auth || {};
        const role = String(user.role || req.headers['x-user-role'] || '').toUpperCase();
        const allowedRoles = new Set([
            'PRINTHOUSE_ADMIN',
            'PRINTHOUSE_OPERATOR',
            'TENANT_ADMIN',
            'OPS_ADMIN',
            'ADMIN',
            'SUPER_ADMIN'
        ]);

        if (!role || !allowedRoles.has(role)) {
            return res.status(403).json({
                ok: false,
                error: 'FORBIDDEN: PRINTHOUSE_ADMIN or SUPER_ADMIN role is required to manage payment settings.'
            });
        }

        const authTenantId = user.tenantId || user.tenant_id || req.headers['x-tenant-id'] || 'tenant-demo-local';
        const requestedTenantId = req.query?.tenantId || req.body?.tenantId;

        if (
            requestedTenantId &&
            String(requestedTenantId) !== String(authTenantId) &&
            role !== 'SUPER_ADMIN'
        ) {
            return res.status(403).json({
                ok: false,
                error: 'FORBIDDEN_TENANT_MISMATCH: Cross-tenant payment settings access is prohibited.'
            });
        }

        req.resolvedTenantId = role === 'SUPER_ADMIN' && requestedTenantId ? String(requestedTenantId) : String(authTenantId);
        req.resolvedActor = {
            userId: user.id || user.userId || 'admin',
            email: user.email || 'admin@printprice.pro',
            role,
            printhouseId: user.printhouseId || user.printhouse_id || null
        };
        next();
    };

    if (!req.user && !req.headers['x-user-role']) {
        return requireAdmin(req, res, applyCheck);
    }
    return applyCheck();
}

/**
 * GET /api/settings/payments
 * Returns the tenant's payment settings with masked secrets and IBAN.
 */
router.get('/payments', resolveAuthAndTenant, async (req, res) => {
    try {
        const settings = await printhousePaymentSettingsService.getPaymentSettings(req.resolvedTenantId);
        return res.json({
            ok: true,
            settings
        });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            ok: false,
            error: err.message || 'FAILED_TO_LOAD_PAYMENT_SETTINGS'
        });
    }
});

/**
 * PUT /api/settings/payments
 * Validates, encrypts at rest, and saves the tenant's payment settings.
 */
router.put('/payments', resolveAuthAndTenant, async (req, res) => {
    try {
        const settings = await printhousePaymentSettingsService.savePaymentSettings(
            req.resolvedTenantId,
            req.body || {},
            req.resolvedActor
        );
        return res.json({
            ok: true,
            settings
        });
    } catch (err) {
        return res.status(err.statusCode || 400).json({
            ok: false,
            code: err.code || 'VALIDATION_ERROR',
            error: err.message || 'FAILED_TO_SAVE_PAYMENT_SETTINGS'
        });
    }
});

/**
 * POST /api/settings/payments/stripe/test-connection
 * Verifies Stripe credentials live against Stripe SDK / Connect API.
 */
router.post('/payments/stripe/test-connection', resolveAuthAndTenant, async (req, res) => {
    try {
        const result = await printhousePaymentSettingsService.testStripeConnection(
            req.resolvedTenantId,
            req.body || {}
        );
        return res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
        return res.status(500).json({
            ok: false,
            status: 'ERROR',
            error: err.message || 'STRIPE_CONNECTION_TEST_FAILED'
        });
    }
});

module.exports = router;

