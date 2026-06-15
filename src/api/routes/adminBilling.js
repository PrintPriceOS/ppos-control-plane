/**
 * src/api/routes/adminBilling.js
 *
 * Stripe Billing Router — PrintPrice OS Control Plane.
 * Phase Paywall Hardened v2 — Webhook Hardening Sweep.
 *
 * Endpoints:
 *   POST /api/admin/billing/create-checkout-session  — Create Stripe Checkout
 *   POST /api/admin/billing/create-portal-session    — Customer portal
 *   GET  /api/admin/billing/status                   — Subscription status
 *   POST /api/admin/billing/webhook                  — Stripe webhooks (raw body)
 *
 * ── RAW BODY CONTRACT ────────────────────────────────────────────────────────
 * The /webhook route depends on receiving the raw Buffer, NOT a parsed JS object.
 * This is guaranteed by server.js registering:
 *
 *   fastify.use('/api/admin/billing/webhook', express.raw({ type: 'application/json' }))
 *
 * …BEFORE the global express.json() middleware.  The express.raw() call here
 * inside the router is a safety-net for any test harness that mounts this router
 * standalone, but the real guard lives in server.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { resolveActorContext } = require('../middleware/auth');
const db = require('../services/mysqlClient');

// ─────────────────────────────────────────────────────────────────────────────
// Stripe SDK — lazy singleton with fail-fast key guard
// ─────────────────────────────────────────────────────────────────────────────

let _stripe = null;

function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_KEY_MISSING');
    if (!_stripe) {
        _stripe = require('stripe')(key, {
            apiVersion: '2024-06-20',
            appInfo: { name: 'PrintPriceOS-ControlPlane', version: '2.0.0' },
        });
    }
    return _stripe;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan catalog — maps planId → Stripe Price ID (env-driven)
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_CATALOG = {
    plan_starter:    process.env.STRIPE_PRICE_STARTER    || null,
    plan_growth:     process.env.STRIPE_PRICE_GROWTH     || null,
    plan_enterprise: process.env.STRIPE_PRICE_ENTERPRISE || null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(err => {
            console.error('[BILLING-ROUTE-ERROR]', err.message);
            if (err.message === 'STRIPE_KEY_MISSING') {
                return res.status(503).json({
                    ok: false,
                    error: 'STRIPE_UNAVAILABLE',
                    message: 'El servicio de pagos no está configurado. Contacta a support@printprice.pro',
                });
            }
            res.status(500).json({ ok: false, error: err.message });
        });
    };
}

/** Derive internal plan_type from a Stripe planId string */
function getPlanType(planId) {
    if (!planId) return 'starter';
    if (planId.includes('enterprise')) return 'enterprise';
    if (planId.includes('growth'))     return 'growth';
    return 'starter';
}

/** Derive internal plan_type by matching against configured Stripe Price IDs */
function getPlanTypeFromPriceId(priceId) {
    if (!priceId) return 'starter';
    if (process.env.STRIPE_PRICE_ENTERPRISE && priceId === process.env.STRIPE_PRICE_ENTERPRISE) return 'enterprise';
    if (process.env.STRIPE_PRICE_GROWTH     && priceId === process.env.STRIPE_PRICE_GROWTH)     return 'growth';
    return 'starter';
}

/**
 * Map a Stripe subscription status string to our internal billing_status ENUM.
 * ENUM: 'active' | 'past_due' | 'canceled' | 'suspended' | 'trialing'
 */
function mapStripeStatus(stripeStatus) {
    switch (stripeStatus) {
        case 'active':    return 'active';
        case 'trialing':  return 'trialing';
        case 'past_due':  return 'past_due';
        case 'canceled':  return 'canceled';
        case 'unpaid':    return 'suspended';
        case 'paused':    return 'suspended';
        default:          return 'suspended';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/billing/create-checkout-session
//
// Hardening additions (v2):
//  - client_reference_id set to tenantId for reliable webhook reconciliation
//  - Explicit null check on priceId prevents sessions with undefined price
// ─────────────────────────────────────────────────────────────────────────────

router.post('/create-checkout-session', asyncHandler(async (req, res) => {
    const actor    = resolveActorContext(req);
    const { planId } = req.body || {};

    if (!planId || !PLAN_CATALOG.hasOwnProperty(planId)) {
        return res.status(400).json({
            ok: false,
            error: 'INVALID_PLAN',
            message: `Plan '${planId}' no reconocido. Opciones: ${Object.keys(PLAN_CATALOG).join(', ')}`,
        });
    }

    const priceId = PLAN_CATALOG[planId];
    if (!priceId) {
        return res.status(503).json({
            ok: false,
            error: 'PRICE_NOT_CONFIGURED',
            message: `El precio para '${planId}' no está configurado en el servidor. Contacta a soporte.`,
        });
    }

    const tenantId = actor?.tenantId || 'unknown';
    const stripe   = getStripe();
    const baseUrl  = process.env.APP_BASE_URL || 'http://localhost:8080';

    // Look up existing Stripe customer for this tenant to avoid duplicates
    let stripeCustomerId = null;
    try {
        const [row] = await db.query(
            'SELECT stripe_customer_id FROM tenant_subscriptions WHERE tenant_id = ? LIMIT 1',
            [tenantId]
        );
        stripeCustomerId = row?.stripe_customer_id || null;
    } catch {
        // Table may not exist yet — proceed without customer binding
    }

    const sessionParams = {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],

        // ── TENANT RECONCILIATION ──────────────────────────────────────────
        // client_reference_id is a first-class Stripe field that survives through
        // the webhook chain. We use it as the primary tenant identifier.
        // metadata.tenant_id is kept as a human-readable secondary reference.
        // ──────────────────────────────────────────────────────────────────
        client_reference_id: tenantId,
        metadata: {
            tenant_id:  tenantId,
            plan_id:    planId,
            actor_id:   actor?.userId || 'unknown',
        },

        success_url: `${baseUrl}/settings/billing?session_id={CHECKOUT_SESSION_ID}&status=success`,
        cancel_url:  `${baseUrl}/settings/billing?status=cancelled`,
        allow_promotion_codes: true,
    };

    if (stripeCustomerId) {
        sessionParams.customer = stripeCustomerId;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log('[BILLING][CHECKOUT-SESSION][CREATED]', {
        tenantId,
        planId,
        sessionId: session.id,
        hasCustomer: !!stripeCustomerId,
    });

    return res.status(200).json({
        ok: true,
        sessionId: session.id,
        url: session.url,
    });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/billing/create-portal-session
// ─────────────────────────────────────────────────────────────────────────────

router.post('/create-portal-session', asyncHandler(async (req, res) => {
    const actor     = resolveActorContext(req);
    const { returnUrl } = req.body || {};
    const tenantId  = actor?.tenantId;

    if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_CONTEXT_MISSING' });
    }

    const stripe = getStripe();

    const [row] = await db.query(
        'SELECT stripe_customer_id FROM tenant_subscriptions WHERE tenant_id = ? LIMIT 1',
        [tenantId]
    );

    if (!row?.stripe_customer_id) {
        return res.status(404).json({
            ok: false,
            error: 'NO_STRIPE_CUSTOMER',
            message: 'No existe una suscripción activa para este tenant.',
        });
    }

    const session = await stripe.billingPortal.sessions.create({
        customer:   row.stripe_customer_id,
        return_url: returnUrl || `${process.env.APP_BASE_URL || 'http://localhost:8080'}/settings/billing`,
    });

    return res.status(200).json({ ok: true, url: session.url });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/billing/status
// ─────────────────────────────────────────────────────────────────────────────

router.get('/status', asyncHandler(async (req, res) => {
    const actor    = resolveActorContext(req);
    const tenantId = req.query.tenantId || actor?.tenantId;

    if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_CONTEXT_MISSING' });
    }

    // Enforce tenant isolation — only the owning tenant or a super-admin may query
    if (!actor?.isSuperAdmin && actor?.role !== 'SUPER_ADMIN' && actor?.tenantId !== tenantId) {
        return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
    }

    try {
        const [row] = await db.query(
            `SELECT plan_type, billing_status, stripe_subscription_id,
                    current_period_end, features_json, ui_tokens_json
             FROM tenant_subscriptions
             WHERE tenant_id = ?
             LIMIT 1`,
            [tenantId]
        );

        if (!row) {
            return res.status(200).json({
                ok: true,
                subscription: { plan_type: 'starter', billing_status: 'active', features: [], ui_tokens: {} },
            });
        }

        let features  = [];
        let ui_tokens = {};
        try { features  = JSON.parse(row.features_json  || '[]'); } catch {}
        try { ui_tokens = JSON.parse(row.ui_tokens_json || '{}'); } catch {}

        return res.status(200).json({
            ok: true,
            subscription: {
                plan_type:               row.plan_type               || 'starter',
                billing_status:          row.billing_status          || 'active',
                stripe_subscription_id:  row.stripe_subscription_id  || null,
                current_period_end:      row.current_period_end      || null,
                features,
                ui_tokens,
            },
        });
    } catch (err) {
        console.warn('[BILLING][STATUS] Subscription table error, defaulting to starter:', err.message);
        return res.status(200).json({
            ok: true,
            subscription: { plan_type: 'starter', billing_status: 'active', features: [], ui_tokens: {} },
        });
    }
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/billing/webhook
//
// ── SECURITY CONTRACT ────────────────────────────────────────────────────────
// Raw body Buffer is guaranteed by server.js which registers:
//   fastify.use('/api/admin/billing/webhook', express.raw({ type: 'application/json' }))
// …BEFORE the global express.json(). The express.raw() below is a safety net.
//
// ── IDEMPOTENCY ──────────────────────────────────────────────────────────────
// Each Stripe event has a unique event.id. We check this against a DB table
// (stripe_webhook_events) before processing. If already seen → 200 immediately.
// This prevents double-charges / double-upgrades on Stripe retries.
//
// ── RESPONSE CONTRACT ────────────────────────────────────────────────────────
// Always return HTTP 200 after signature validation succeeds, even if our DB
// handler fails. Returning 4xx/5xx causes Stripe to retry, which can cause
// duplicate processing. Log failures instead of re-raising them.
// ─────────────────────────────────────────────────────────────────────────────

router.post(
    '/webhook',
    // Safety-net raw parser (primary guard is in server.js)
    express.raw({ type: 'application/json', limit: '2mb' }),
    asyncHandler(async (req, res) => {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        // ── 1. SIGNATURE VALIDATION ─────────────────────────────────────────
        if (!webhookSecret) {
            // In production this should be fatal. We warn loudly and reject
            // all webhook traffic rather than silently accept unverified events.
            console.error(
                '[BILLING][WEBHOOK][CRITICAL] STRIPE_WEBHOOK_SECRET is not set. ' +
                'Rejecting all webhook requests for security. Set STRIPE_WEBHOOK_SECRET in .env.'
            );
            return res.status(400).json({
                ok: false,
                error: 'WEBHOOK_SECRET_MISSING',
                message: 'Webhook secret not configured on the server.',
            });
        }

        const sig = req.headers['stripe-signature'];
        if (!sig) {
            console.warn('[BILLING][WEBHOOK] Request missing stripe-signature header — rejected.');
            return res.status(400).json({ ok: false, error: 'MISSING_SIGNATURE' });
        }

        // req.body must be a Buffer at this point (guaranteed by express.raw above)
        if (!Buffer.isBuffer(req.body)) {
            console.error(
                '[BILLING][WEBHOOK][CRITICAL] req.body is not a Buffer — body was pre-consumed by express.json(). ' +
                'Check middleware order in server.js. The express.raw() path-specific middleware ' +
                'must be registered BEFORE the global express.json().'
            );
            return res.status(400).json({
                ok: false,
                error: 'RAW_BODY_MISSING',
                message: 'Request body was pre-consumed. Signature verification cannot proceed.',
            });
        }

        let event;
        try {
            const stripe = getStripe();
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
            console.error('[BILLING][WEBHOOK][SIGNATURE-FAIL]', err.message, {
                sigHeader: sig?.slice(0, 40),
            });
            return res.status(400).json({ ok: false, error: 'INVALID_SIGNATURE', detail: err.message });
        }

        // ── 2. IDEMPOTENCY CHECK ────────────────────────────────────────────
        // Check if we already processed this event to handle Stripe retries safely.
        const alreadyProcessed = await checkEventIdempotency(event.id);
        if (alreadyProcessed) {
            console.log('[BILLING][WEBHOOK][IDEMPOTENT] Event already processed, skipping:', event.id, event.type);
            return res.status(200).json({ ok: true, received: true, idempotent: true });
        }

        console.log('[BILLING][WEBHOOK][RECEIVED]', {
            eventId:   event.id,
            eventType: event.type,
            liveMode:  event.livemode,
            created:   new Date(event.created * 1000).toISOString(),
        });

        // ── 3. EVENT PROCESSING ─────────────────────────────────────────────
        // Handle errors internally — NEVER propagate them as 5xx to Stripe.
        // A 5xx response would trigger Stripe retries, risking duplicate processing.
        let handlerError = null;
        try {
            await handleStripeEvent(event);
        } catch (err) {
            handlerError = err.message;
            console.error('[BILLING][WEBHOOK][HANDLER-ERROR]', {
                eventId:   event.id,
                eventType: event.type,
                error:     err.message,
            });
        }

        // ── 4. MARK AS PROCESSED (even on handler error, to prevent retry storms) ──
        await markEventProcessed(event.id, event.type, handlerError).catch(err =>
            console.warn('[BILLING][WEBHOOK] Could not persist idempotency record:', err.message)
        );

        // ── 5. ALWAYS RETURN 200 ────────────────────────────────────────────
        return res.status(200).json({ ok: true, received: true });
    })
);

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Event Router
//
// Handles the four lifecycle events that affect tenant access.
// Each case is independently try/catched so one failure doesn't mask others.
// ─────────────────────────────────────────────────────────────────────────────

async function handleStripeEvent(event) {
    const obj = event.data.object;

    switch (event.type) {

        // ── checkout.session.completed ──────────────────────────────────────
        // Fired when a customer completes payment in Checkout.
        // This is the canonical activation event — grant plan access here.
        //
        // Tenant resolution priority:
        //  1. client_reference_id  (reliable Stripe-native field, set by us)
        //  2. metadata.tenant_id   (legacy / fallback)
        case 'checkout.session.completed': {
            // Primary: use client_reference_id (set in create-checkout-session)
            // Fallback: metadata.tenant_id for sessions created before this hardening
            const tenantId = obj.client_reference_id || obj.metadata?.tenant_id;
            const planId   = obj.metadata?.plan_id;

            if (!tenantId) {
                console.error('[BILLING][WEBHOOK][checkout.session.completed] ' +
                    'Cannot resolve tenantId — neither client_reference_id nor metadata.tenant_id present. ' +
                    'Session:', obj.id);
                return;
            }

            const customerId     = obj.customer;
            const subscriptionId = obj.subscription;
            const planType       = getPlanType(planId);

            console.log('[BILLING][WEBHOOK][checkout.session.completed]', {
                tenantId,
                planType,
                subscriptionId,
                customerId,
                sessionId: obj.id,
            });

            await upsertTenantSubscription({
                tenantId,
                planType,
                billingStatus:         'active',
                stripeCustomerId:      customerId,
                stripeSubscriptionId:  subscriptionId,
            });

            // Attempt to enrich with subscription period data
            if (subscriptionId) {
                try {
                    const stripe = getStripe();
                    const sub = await stripe.subscriptions.retrieve(subscriptionId);
                    const periodEnd = sub.current_period_end
                        ? new Date(sub.current_period_end * 1000).toISOString().slice(0, 19).replace('T', ' ')
                        : null;
                    if (periodEnd) {
                        await db.query(
                            'UPDATE tenant_subscriptions SET current_period_end = ?, updated_at = NOW() WHERE tenant_id = ?',
                            [periodEnd, tenantId]
                        ).catch(err => console.warn('[BILLING][WEBHOOK] Period end update failed:', err.message));
                    }
                } catch (err) {
                    console.warn('[BILLING][WEBHOOK] Could not retrieve subscription for period enrichment:', err.message);
                }
            }

            console.log('[BILLING][WEBHOOK][ACTIVATED]', { tenantId, planType });
            break;
        }

        // ── customer.subscription.updated ──────────────────────────────────
        // Fired on plan changes (upgrade/downgrade), status changes (active → past_due),
        // and renewal cycles. Update plan_type AND billing_status here.
        case 'customer.subscription.updated': {
            const subscriptionId = obj.id;
            const customerId     = obj.customer;
            const stripeStatus   = obj.status;
            const billingStatus  = mapStripeStatus(stripeStatus);

            // Derive plan from the active price item
            const priceId  = obj.items?.data?.[0]?.price?.id;
            const planType = getPlanTypeFromPriceId(priceId);

            const currentPeriodEnd = obj.current_period_end
                ? new Date(obj.current_period_end * 1000).toISOString().slice(0, 19).replace('T', ' ')
                : null;

            // Resolve tenant from customer ID (set during checkout.session.completed)
            let tenantId = null;
            try {
                const [row] = await db.query(
                    'SELECT tenant_id FROM tenant_subscriptions WHERE stripe_customer_id = ? LIMIT 1',
                    [customerId]
                );
                tenantId = row?.tenant_id || null;
            } catch (err) {
                console.warn('[BILLING][WEBHOOK][subscription.updated] DB lookup failed:', err.message);
            }

            if (!tenantId) {
                console.warn('[BILLING][WEBHOOK][subscription.updated] No tenant found for customer:', customerId);
                break;
            }

            console.log('[BILLING][WEBHOOK][customer.subscription.updated]', {
                tenantId,
                planType,
                billingStatus,
                stripeStatus,
                subscriptionId,
            });

            await upsertTenantSubscription({
                tenantId,
                planType,
                billingStatus,
                stripeCustomerId:      customerId,
                stripeSubscriptionId:  subscriptionId,
                currentPeriodEnd,
            });
            break;
        }

        // ── customer.subscription.deleted ──────────────────────────────────
        // Fired when a subscription is permanently canceled (not just paused).
        // Downgrade to 'starter' and mark billing_status = 'canceled'.
        // We do NOT delete the row — we keep the audit trail.
        case 'customer.subscription.deleted': {
            const customerId     = obj.customer;
            const subscriptionId = obj.id;

            let tenantId = null;
            try {
                const [row] = await db.query(
                    'SELECT tenant_id FROM tenant_subscriptions WHERE stripe_customer_id = ? LIMIT 1',
                    [customerId]
                );
                tenantId = row?.tenant_id || null;
            } catch (err) {
                console.warn('[BILLING][WEBHOOK][subscription.deleted] DB lookup failed:', err.message);
            }

            console.log('[BILLING][WEBHOOK][customer.subscription.deleted]', {
                tenantId,
                customerId,
                subscriptionId,
            });

            try {
                await db.query(
                    `UPDATE tenant_subscriptions
                     SET plan_type = 'starter',
                         billing_status = 'canceled',
                         stripe_subscription_id = ?,
                         updated_at = NOW()
                     WHERE stripe_customer_id = ?`,
                    [subscriptionId, customerId]
                );
                console.log('[BILLING][WEBHOOK][CANCELED] Tenant downgraded to starter:', tenantId || customerId);
            } catch (err) {
                console.error('[BILLING][WEBHOOK][subscription.deleted] DB update failed:', err.message);
                throw err; // Re-throw so it's captured in handlerError above
            }
            break;
        }

        // ── invoice.payment_failed ──────────────────────────────────────────
        // Fired when a recurring invoice payment fails (e.g. card expired).
        // Mark billing_status = 'past_due' but keep plan_type — Stripe will
        // retry and send customer.subscription.updated if it recovers.
        case 'invoice.payment_failed': {
            const customerId     = obj.customer;
            const subscriptionId = obj.subscription;
            const attemptCount   = obj.attempt_count;

            console.warn('[BILLING][WEBHOOK][invoice.payment_failed]', {
                customerId,
                subscriptionId,
                attemptCount,
                amountDue: obj.amount_due,
                currency:  obj.currency,
            });

            try {
                await db.query(
                    `UPDATE tenant_subscriptions
                     SET billing_status = 'past_due', updated_at = NOW()
                     WHERE stripe_customer_id = ?`,
                    [customerId]
                );
            } catch (err) {
                console.error('[BILLING][WEBHOOK][payment_failed] DB update failed:', err.message);
                throw err;
            }
            break;
        }

        // ── invoice.paid ────────────────────────────────────────────────────
        // Fired when a recurring invoice is paid successfully (monthly renewals).
        // Reset any past_due status back to active.
        case 'invoice.paid': {
            const customerId = obj.customer;
            if (!customerId) break;

            const currentPeriodEnd = obj.lines?.data?.[0]?.period?.end
                ? new Date(obj.lines.data[0].period.end * 1000).toISOString().slice(0, 19).replace('T', ' ')
                : null;

            console.log('[BILLING][WEBHOOK][invoice.paid]', {
                customerId,
                amountPaid: obj.amount_paid,
                periodEnd:  currentPeriodEnd,
            });

            try {
                await db.query(
                    `UPDATE tenant_subscriptions
                     SET billing_status = 'active',
                         current_period_end = COALESCE(?, current_period_end),
                         updated_at = NOW()
                     WHERE stripe_customer_id = ?`,
                    [currentPeriodEnd, customerId]
                );
            } catch (err) {
                console.warn('[BILLING][WEBHOOK][invoice.paid] DB update failed:', err.message);
            }
            break;
        }

        default:
            // Unhandled event types — silently acknowledge as required by Stripe docs
            console.log('[BILLING][WEBHOOK][UNHANDLED]', event.type, event.id);
            break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency helpers — prevent duplicate processing on Stripe retries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if this event.id has already been successfully processed.
 * Gracefully returns false if the idempotency table doesn't exist yet.
 */
async function checkEventIdempotency(eventId) {
    try {
        const [row] = await db.query(
            'SELECT id FROM stripe_webhook_events WHERE event_id = ? LIMIT 1',
            [eventId]
        );
        return !!row;
    } catch {
        // Table not yet created — treat as not-seen (first run case)
        return false;
    }
}

/**
 * Persist the event ID as processed.
 * error is null on success, or the error message string if the handler threw.
 */
async function markEventProcessed(eventId, eventType, error = null) {
    try {
        await db.query(
            `INSERT IGNORE INTO stripe_webhook_events
                (event_id, event_type, processed_at, handler_error)
             VALUES (?, ?, NOW(), ?)`,
            [eventId, eventType, error || null]
        );
    } catch (err) {
        // Non-fatal — idempotency table may not exist yet
        console.warn('[BILLING][IDEMPOTENCY] Could not persist event record:', err.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helper — upsert tenant_subscriptions
// ─────────────────────────────────────────────────────────────────────────────

async function upsertTenantSubscription({
    tenantId,
    planType,
    billingStatus,
    stripeCustomerId,
    stripeSubscriptionId,
    currentPeriodEnd = null,
}) {
    if (!tenantId) {
        console.error('[BILLING][UPSERT] tenantId is required — skipping upsert.');
        return;
    }

    try {
        await db.query(
            `INSERT INTO tenant_subscriptions
                (tenant_id, plan_type, billing_status, stripe_customer_id,
                 stripe_subscription_id, current_period_end, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
                plan_type              = VALUES(plan_type),
                billing_status         = VALUES(billing_status),
                stripe_customer_id     = COALESCE(VALUES(stripe_customer_id), stripe_customer_id),
                stripe_subscription_id = COALESCE(VALUES(stripe_subscription_id), stripe_subscription_id),
                current_period_end     = COALESCE(VALUES(current_period_end), current_period_end),
                updated_at             = NOW()`,
            [tenantId, planType, billingStatus, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd]
        );
        console.log('[BILLING][UPSERT][OK]', { tenantId, planType, billingStatus });
    } catch (err) {
        // Log and re-throw — callers decide whether to swallow or propagate
        console.error('[BILLING][UPSERT][FAILED]', { tenantId, error: err.message });
        throw err;
    }
}

module.exports = router;
