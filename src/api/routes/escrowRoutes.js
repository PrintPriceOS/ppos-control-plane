'use strict';

/**
 * src/api/routes/escrowRoutes.js
 *
 * PrintPrice OS — Phase 12A: Commercial Escrow & Split-Payout Settlement REST API
 *
 * Exposes:
 * - GET  /api/financials/escrow/ledger
 * - POST /api/financials/escrow/lock
 * - POST /api/financials/escrow/:orderId/settle-on-pod
 *
 * Protected by `requireLogisticsControlPlaneAuth` (multi-tenant isolation & RBAC).
 */

const {
    lockEscrowFundsOnProofApproval,
    settleEscrowOnSignedPod,
    listEscrowLedger
} = require('../services/financials/escrowSettlementService');
const {
    calculateExecutiveProfitabilitySummary,
    generateElectronicInvoiceXml
} = require('../services/financials/eInvoicingService');
const { requireFinanceRights } = require('../middleware/b2bOrgRbacMiddleware');

function requireLogisticsControlPlaneAuth(req, res, next) {
    const mktToken = req.headers && req.headers['x-marketplace-token'];
    const expectedToken = process.env.PPOS_MARKETPLACE_INTAKE_TOKEN || process.env.PPOS_CONTROL_TOKEN;
    const hasValidMktToken = Boolean(mktToken && expectedToken && mktToken === expectedToken);

    const role =
        (req.user && req.user.role) ||
        (req.headers && (req.headers['x-user-role'] || req.headers['x-ppos-role'])) ||
        (hasValidMktToken ? 'CUSTOMER' : null);

    const allowedRoles = new Set([
        'PRINTHOUSE_OPERATOR',
        'PRINTHOUSE_ADMIN',
        'TENANT_ADMIN',
        'OPS_ADMIN',
        'ADMIN',
        'SUPER_ADMIN',
        'OPERATOR',
        'PUBLISHER',
        'CUSTOMER',
        'AUTHOR',
        'SYSTEM'
    ]);

    if (!role || !allowedRoles.has(String(role).toUpperCase())) {
        return res.status(403).json({
            ok: false,
            error: 'FORBIDDEN: Valid Control Plane role is required to access Escrow & Settlement APIs.'
        });
    }

    const authTenantId = req.user && req.user.tenantId;
    const reqTenantId =
        (req.body && req.body.tenantId) ||
        (req.query && req.query.tenantId) ||
        (req.headers && req.headers['x-tenant-id']);

    if (
        authTenantId &&
        reqTenantId &&
        String(authTenantId) !== String(reqTenantId) &&
        String(role).toUpperCase() !== 'SUPER_ADMIN'
    ) {
        return res.status(403).json({
            ok: false,
            error: 'FORBIDDEN_TENANT_MISMATCH: Cross-tenant escrow access is prohibited.'
        });
    }

    if (typeof next === 'function') {
        next();
    }
}

function createFallbackRouter() {
    const stack = [];
    const middlewares = [];
    const addRoute = (method, path, ...handlers) => {
        stack.push({
            route: {
                path,
                methods: { [method]: true },
                stack: handlers.map(h => ({ handle: h }))
            }
        });
    };
    return {
        stack,
        middlewares,
        use(fn) {
            middlewares.push(fn);
        },
        get(path, ...handlers) {
            addRoute('get', path, ...handlers);
        },
        post(path, ...handlers) {
            addRoute('post', path, ...handlers);
        }
    };
}

function createEscrowRouter() {
    let router;
    try {
        const express = require('express');
        router = express.Router({ mergeParams: true });
    } catch (_) {
        router = createFallbackRouter();
    }

    router.use(requireLogisticsControlPlaneAuth);

    // GET /api/financials/escrow/ledger
    router.get('/ledger', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const ledger = listEscrowLedger(tenantId);
            return res.status(200).json(ledger);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // GET /api/financials/escrow/summary
    router.get('/summary', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const ledger = listEscrowLedger(tenantId);
            return res.status(200).json({
                ok: true,
                tenantId,
                data: {
                    currency: 'EUR',
                    custodiedEscrowEur: ledger.escrowLockedEur || 0,
                    releasedEscrowEur: ledger.releasedToPrinthousesEur || 0,
                    netPrinthousePayoutEur: ledger.netPrinthousePayoutEur || 0,
                    pendingPodCount: ledger.pendingPodCount || 0,
                    totalSettlements: (ledger.entries || []).length
                },
                ledger
            });
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/financials/escrow/lock
    router.post('/lock', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const result = lockEscrowFundsOnProofApproval(req.body || {}, { tenantId });
            return res.status(201).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // POST /api/financials/escrow/:orderId/settle-on-pod
    router.post('/:orderId/settle-on-pod', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.body && req.body.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const orderId = req.params && req.params.orderId;
            const result = settleEscrowOnSignedPod(
                { ...(req.body || {}), orderId },
                { tenantId }
            );
            return res.status(200).json(result);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // GET /api/financials/escrow/profitability
    router.get('/profitability', async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const summary = calculateExecutiveProfitabilitySummary(tenantId);
            return res.status(200).json(summary);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    // GET /api/financials/escrow/:orderId/e-invoice.xml
    router.get('/:orderId/e-invoice.xml', requireFinanceRights, async (req, res) => {
        try {
            const tenantId =
                (req.user && req.user.tenantId) ||
                (req.query && req.query.tenantId) ||
                (req.headers && req.headers['x-tenant-id']) ||
                'tenant-default';
            const orderId = req.params && req.params.orderId;
            const format = (req.query && req.query.format) || 'FACTURAE_3_2_2';
            const customerEmail =
                (req.headers && req.headers['x-customer-email']) ||
                (req.query && req.query.email) ||
                (req.user && req.user.email) ||
                null;
            const customerKey = customerEmail
                ? String(customerEmail).toLowerCase().trim()
                : null;
            const { syncEscrowLedgerFromMySQL } = require('../services/financials/escrowSettlementService');
            await syncEscrowLedgerFromMySQL(tenantId);
            let buyerFiscal = null;
            if (customerKey) {
                try {
                    const customerPortalRoutes = require('./customerPortalRoutes');
                    if (typeof customerPortalRoutes.loadCustomerProfileFromMySQL === 'function') {
                        buyerFiscal = await customerPortalRoutes.loadCustomerProfileFromMySQL(customerKey, customerEmail);
                    }
                } catch (_e) { /* ignore */ }
            }
            const invoice = generateElectronicInvoiceXml({
                orderId,
                format,
                tenantId,
                customerEmail,
                customerKey,
                buyerFiscal
            });
            if (req.query && req.query.raw === 'true' && typeof res.setHeader === 'function') {
                res.setHeader('Content-Type', 'application/xml; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}_${invoice.standard}.xml"`);
                return res.status(200).send(invoice.xml);
            }
            return res.status(200).json(invoice);
        } catch (err) {
            return res.status(err.statusCode || 400).json({
                ok: false,
                error: err.message
            });
        }
    });

    return router;
}

const defaultRouter = createEscrowRouter();
defaultRouter.createEscrowRouter = createEscrowRouter;
defaultRouter.requireLogisticsControlPlaneAuth = requireLogisticsControlPlaneAuth;

module.exports = defaultRouter;

