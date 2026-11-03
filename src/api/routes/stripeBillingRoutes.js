/**
 * src/api/routes/stripeBillingRoutes.js
 *
 * Phase 199B: Stripe Webhook & Hybrid Metered Billing Endpoints.
 * Mounted at `/api/billing/stripe` (e.g., `POST /api/billing/stripe/webhook`).
 */
'use strict';

const express = require('express');
const router = express.Router({ mergeParams: true });
const stripeBillingService = require('../services/stripeBillingService');

/**
 * POST /api/billing/stripe/webhook
 *
 * Verifies cryptographic `Stripe-Signature` (`t=...,v1=...`) over the raw request Buffer
 * and processes lifecycle events (`checkout.session.completed`, `invoice.payment_succeeded`,
 * `invoice.payment_failed`, `customer.subscription.deleted`).
 */
router.post('/webhook', async (req, res) => {
    try {
        const sigHeader = req.headers['stripe-signature'];
        const rawBody = req.rawBody || req.body;

        const event = stripeBillingService.constructWebhookEvent(rawBody, sigHeader);
        const result = await stripeBillingService.processWebhookEvent(event);

        return res.status(200).json({
            received: true,
            ok: true,
            ...result
        });
    } catch (err) {
        return res.status(err.statusCode || 400).json({
            received: false,
            ok: false,
            error: err.message,
            code: err.code || 'WEBHOOK_VERIFICATION_FAILED'
        });
    }
});

module.exports = router;

