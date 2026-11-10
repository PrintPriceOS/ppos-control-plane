'use strict';
/**
 * Printhouse Annual Operating License (500 EUR/year, merchant origin Riga LV).
 * - createCheckoutSession: Stripe Checkout with automatic_tax + tax_id_collection.
 * - activateLicense: atomic MySQL transaction (license ACTIVE + unlock pending orders).
 */
const mysqlClient = require('./mysqlClient');

const LICENSE_KIND = 'PRINTHOUSE_LICENSE';

function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        const err = new Error('STRIPE_KEY_MISSING');
        err.statusCode = 503;
        throw err;
    }
    return require('stripe')(key, { apiVersion: '2024-06-20' });
}

async function resolvePrinthouse(printhouseId, tenantId) {
    const rows = await mysqlClient.query(
        'SELECT id, tenant_id, contact_email, subscription_status, stripe_customer_id FROM printhouses WHERE tenant_id = ? AND (? IS NULL OR id = ?) ORDER BY created_at ASC LIMIT 1',
        [tenantId, printhouseId || null, printhouseId || null]
    );
    return rows && rows[0] ? rows[0] : null;
}

async function createCheckoutSession({ printhouseId, tenantId, returnUrl }) {
    const ph = await resolvePrinthouse(printhouseId, tenantId);
    if (!ph) {
        const err = new Error('PRINTHOUSE_NOT_FOUND');
        err.statusCode = 404;
        throw err;
    }
    if (ph.subscription_status === 'ACTIVE') {
        const err = new Error('LICENSE_ALREADY_ACTIVE');
        err.statusCode = 409;
        throw err;
    }
    const base = String(returnUrl || 'https://control.printprice.pro/jobs').split('?')[0];
    const params = {
        mode: 'payment',
        client_reference_id: ph.id,
        line_items: [{
            quantity: 1,
            price_data: {
                currency: 'eur',
                unit_amount: 50000,
                tax_behavior: 'exclusive',
                product_data: { name: 'PrintPrice OS - Printhouse Annual Operating License' }
            }
        }],
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        billing_address_collection: 'required',
        metadata: { kind: LICENSE_KIND, printhouse_id: ph.id, tenant_id: ph.tenant_id },
        payment_intent_data: { metadata: { kind: LICENSE_KIND, printhouse_id: ph.id, tenant_id: ph.tenant_id } },
        success_url: `${base}?license=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}?license=cancelled`
    };
    if (ph.stripe_customer_id) {
        params.customer = ph.stripe_customer_id;
        params.customer_update = { address: 'auto', name: 'auto' };
    } else if (ph.contact_email) {
        params.customer_email = ph.contact_email;
    }
    const session = await getStripe().checkout.sessions.create(params);
    return { sessionId: session.id, url: session.url };
}

/** Atomic unlock after checkout.session.completed. Idempotent. */
async function activateLicense({ printhouseId, stripeCustomerId = null, stripeSubscriptionId = null }) {
    if (!printhouseId) throw new Error('printhouseId required');
    const conn = await mysqlClient.getConnection();
    try {
        await conn.beginTransaction();
        const [upd] = await conn.query(
            `UPDATE printhouses
                SET subscription_status = 'ACTIVE',
                    subscription_expires_at = DATE_ADD(NOW(), INTERVAL 1 YEAR),
                    stripe_customer_id = COALESCE(?, stripe_customer_id),
                    stripe_subscription_id = COALESCE(?, stripe_subscription_id),
                    updated_at = NOW()
              WHERE id = ?`,
            [stripeCustomerId, stripeSubscriptionId, printhouseId]
        );
        const [unlocked] = await conn.query(
            `UPDATE marketplace_orders
                SET dispatch_lock_reason = 'NONE', updated_at = NOW()
              WHERE (printhouse_id = ? OR tenant_id = ?) AND dispatch_lock_reason = 'AWAITING_PRINTHOUSE_LICENSE'`,
            [printhouseId, printhouseId]
        );
        await conn.commit();
        return { printhouseActivated: upd.affectedRows > 0, ordersUnlocked: unlocked.affectedRows };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function getLockedSummary(tenantId) {
    const rows = await mysqlClient.query(
        `SELECT COUNT(DISTINCT mo.order_id) AS cnt, COALESCE(SUM(COALESCE(mo.total_amount_eur, mo.estimated_price, 0)), 0) AS total
           FROM marketplace_orders mo
           JOIN printhouses p ON (p.id = mo.printhouse_id OR p.tenant_id = mo.printhouse_id OR p.tenant_id = mo.tenant_id)
          WHERE p.tenant_id = ? AND mo.dispatch_lock_reason = 'AWAITING_PRINTHOUSE_LICENSE'`,
        [tenantId]
    );
    const lockedRows = await mysqlClient.query(
        `SELECT mo.order_id AS id, COALESCE(mo.external_order_ref, mo.order_id) AS order_code, mo.status, COALESCE(mo.total_amount_eur, mo.estimated_price, 0) AS total_amount_eur, mo.currency, mo.created_at
           FROM marketplace_orders mo
           JOIN printhouses p ON (p.id = mo.printhouse_id OR p.tenant_id = mo.printhouse_id OR p.tenant_id = mo.tenant_id)
          WHERE p.tenant_id = ? AND mo.dispatch_lock_reason = 'AWAITING_PRINTHOUSE_LICENSE'
          ORDER BY mo.created_at DESC
          LIMIT 50`,
        [tenantId]
    );
    const ph = await resolvePrinthouse(null, tenantId);
    return {
        licenseActive: ph?.subscription_status === 'ACTIVE',
        count: Number(rows?.[0]?.cnt || 0),
        totalRevenueEur: Number(rows?.[0]?.total || 0),
        lockedOrders: (lockedRows || []).map(r => ({
            id: r.id,
            orderCode: r.order_code,
            status: r.status,
            amountEur: Number(r.total_amount_eur || 0),
            currency: r.currency || 'EUR',
            createdAt: r.created_at
        }))
    };
}

module.exports = { createCheckoutSession, activateLicense, getLockedSummary, LICENSE_KIND };
