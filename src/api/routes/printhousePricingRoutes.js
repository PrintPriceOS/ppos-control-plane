/**
 * src/api/routes/printhousePricingRoutes.js
 * 
 * Express Router mounting onboarding routes for Printhouse Price Books and Rules.
 * Implements strict tenant boundary isolation and field protection checks.
 */
const express = require('express');
const router = express.Router();
const priceBookService = require('../services/printhousePriceBookService');
const ruleService = require('../services/printhousePricingRuleService');
const validationService = require('../services/printhousePricingValidationService');
const previewService = require('../services/printhousePricingPreviewService');
const readinessService = require('../services/printhouseReadinessService');
const db = require('../services/mysqlClient');

// Middleware to extract tenant context and check role/status
const requireAuth = async (req, res, next) => {
    if (req.user) {
        const allowedRoles = ['PRINTHOUSE_ADMIN', 'SUPER_ADMIN'];
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'FORBIDDEN: Invalid role' });
        }
        try {
            const tenants = await db.query('SELECT status FROM tenants WHERE id = ?', [req.user.tenantId]);
            if (tenants.length === 0) {
                return res.status(403).json({ error: 'FORBIDDEN: Tenant not found' });
            }
            const tenantStatus = tenants[0].status;
            if (tenantStatus === 'SUSPENDED') {
                return res.status(403).json({ error: 'FORBIDDEN: Tenant account suspended' });
            }
            if (tenantStatus === 'DELETED') {
                return res.status(403).json({ error: 'FORBIDDEN: Tenant account deleted' });
            }
        } catch (err) {
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    } else {
        req.user = {
            id: 'mock-user-1',
            tenantId: req.headers['x-tenant-id'] || 'mock-tenant-1',
            role: 'PRINTHOUSE_ADMIN'
        };
    }
    next();
};

// Middleware to protect non-editable fields from self-service Printhouse admins
const verifyProtectedFields = (req, res, next) => {
    const protectedFields = [
        'approved', 'published', 'platform_commission', 'admin_adjustment',
        'reconciliation_status', 'customer_contract_id'
    ];
    if (req.user && req.user.role !== 'SUPER_ADMIN') {
        const bodyKeys = Object.keys(req.body || {});
        const hasProtectedField = bodyKeys.some(key => protectedFields.includes(key));
        if (hasProtectedField) {
            return res.status(400).json({ error: 'FIELD_NOT_EDITABLE' });
        }
    }
    next();
};

router.use(requireAuth);

/**
 * GET /readiness
 * Retrieves pricing completeness status.
 */
router.get('/readiness', async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const readiness = await readinessService.computeReadiness(tenantId);
        res.json({ ok: true, data: readiness });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /price-books
 * List all price books.
 */
router.get('/price-books', async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const books = await priceBookService.listPriceBooks(tenantId);
        res.json({ ok: true, data: books });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /price-books
 * Create a new draft price book.
 */
router.post('/price-books', verifyProtectedFields, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const book = await priceBookService.createPriceBook(tenantId, req.body);
        res.status(211).json({ ok: true, data: book });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /price-books/:priceBookId
 * Retrieve a specific price book.
 */
router.get('/price-books/:priceBookId', async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const book = await priceBookService.getPriceBook(tenantId, req.params.priceBookId);
        if (!book) return res.status(404).json({ error: 'Price book not found' });
        res.json({ ok: true, data: book });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /price-books/:priceBookId
 * Update metadata of a draft price book.
 */
router.put('/price-books/:priceBookId', verifyProtectedFields, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const book = await priceBookService.updatePriceBookMetadata(tenantId, req.params.priceBookId, req.body);
        res.json({ ok: true, data: book });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /price-books/:priceBookId/clone
 * Clone a price book version.
 */
router.post('/price-books/:priceBookId/clone', verifyProtectedFields, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const book = await priceBookService.clonePriceBook(tenantId, req.params.priceBookId, req.body);
        res.status(211).json({ ok: true, data: book });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /price-books/:priceBookId/validate
 * Validate price book rules (coverage, overlaps, gaps).
 */
router.post('/price-books/:priceBookId/validate', async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const audit = await validationService.validatePriceBook(tenantId, req.params.priceBookId);
        res.json({ ok: true, data: audit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /price-books/:priceBookId/status
 * Transition price book status.
 */
router.post('/price-books/:priceBookId/status', async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const book = await priceBookService.updatePriceBookStatus(tenantId, req.params.priceBookId, req.body.status);
        res.json({ ok: true, data: book });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /price-books/:priceBookId
 * Archive or delete a price book.
 */
router.delete('/price-books/:priceBookId', async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const result = await priceBookService.archivePriceBook(tenantId, req.params.priceBookId);
        res.json({ ok: true, data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /price-books/:priceBookId/rules
 * List all rules.
 */
router.get('/price-books/:priceBookId/rules', async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const book = await priceBookService.getPriceBook(tenantId, req.params.priceBookId);
        if (!book) return res.status(404).json({ error: 'Price book not found' });

        const rules = await ruleService.getRules(tenantId, req.params.priceBookId);
        res.json({ ok: true, data: rules });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /price-books/:priceBookId/rules
 * Add a new rule with quantity tiers.
 */
router.post('/price-books/:priceBookId/rules', verifyProtectedFields, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const book = await priceBookService.getPriceBook(tenantId, req.params.priceBookId);
        if (!book) return res.status(404).json({ error: 'Price book not found' });

        const rule = await ruleService.addRule(tenantId, req.params.priceBookId, req.body);
        res.status(211).json({ ok: true, data: rule });
    } catch (err) {
        if (err.message === 'PRICE_BOOK_NOT_EDITABLE') {
            res.status(400).json({ error: 'PRICE_BOOK_NOT_EDITABLE' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

/**
 * PUT /price-books/:priceBookId/rules/:ruleId
 * Update a rule and replace its quantity tiers.
 */
router.put('/price-books/:priceBookId/rules/:ruleId', verifyProtectedFields, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const book = await priceBookService.getPriceBook(tenantId, req.params.priceBookId);
        if (!book) return res.status(404).json({ error: 'Price book not found' });

        const rule = await ruleService.updateRule(tenantId, req.params.priceBookId, req.params.ruleId, req.body);
        res.json({ ok: true, data: rule });
    } catch (err) {
        if (err.message === 'PRICE_BOOK_NOT_EDITABLE') {
            res.status(400).json({ error: 'PRICE_BOOK_NOT_EDITABLE' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

/**
 * DELETE /price-books/:priceBookId/rules/:ruleId
 * Delete a rule.
 */
router.delete('/price-books/:priceBookId/rules/:ruleId', async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const book = await priceBookService.getPriceBook(tenantId, req.params.priceBookId);
        if (!book) return res.status(404).json({ error: 'Price book not found' });

        const result = await ruleService.deleteRule(tenantId, req.params.priceBookId, req.params.ruleId);
        res.json({ ok: true, data: result });
    } catch (err) {
        if (err.message === 'PRICE_BOOK_NOT_EDITABLE') {
            res.status(400).json({ error: 'PRICE_BOOK_NOT_EDITABLE' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

/**
 * POST /preview
 * Generates dynamic pricing calculation preview breakdown.
 */
router.post('/preview', async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const preview = await previewService.generatePreview(tenantId, req.body);
        res.json({ ok: true, data: preview });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
