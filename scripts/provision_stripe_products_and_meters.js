#!/usr/bin/env node
/**
 * scripts/provision_stripe_products_and_meters.js
 *
 * Phase 199C (Step 1): Idempotent Stripe Billing Meters, Products & Prices Provisioning Script.
 *
 * Provisions (or reconciles if already present in Stripe):
 *  1. Billing Meter 1: `preflight_2gb_inspection` (sum aggregation)
 *  2. Billing Meter 2: `bpe_pricing_quote` (sum aggregation)
 *  3. Product: `PrintPrice OS — Production Scale API Gateway`
 *  4. Price 1 (`STRIPE_PRICE_PROD_SCALE_BASE`): €49.00 / month licensed base commitment
 *  5. Price 2 (`STRIPE_PRICE_METER_PREFLIGHT`): €0.10 / unit (`unit_amount_decimal: "10"`) metered on `preflight_2gb_inspection`
 *  6. Price 3 (`STRIPE_PRICE_METER_BPE_QUOTE`): €0.005 / unit (`unit_amount_decimal: "0.5"`) metered on `bpe_pricing_quote`
 *
 * Usage:
 *   node scripts/provision_stripe_products_and_meters.js [--write-env] [--env-file .env] [--dry-run]
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

const CANONICAL_METERS = [
    {
        key: 'preflight',
        envKey: 'STRIPE_METER_PREFLIGHT_ID',
        display_name: 'PrintPrice OS — 2GB PDF/X-4 Preflight Inspection',
        event_name: 'preflight_2gb_inspection',
        default_aggregation: { formula: 'sum' },
        value_settings: { event_payload_key: 'value' },
        customer_mapping: {
            event_payload_key: 'stripe_customer_id',
            type: 'by_id'
        },
        fallbackId: 'mtr_ppos_preflight_2gb_inspection'
    },
    {
        key: 'bpeQuote',
        envKey: 'STRIPE_METER_BPE_QUOTE_ID',
        display_name: 'PrintPrice OS — 5-Axis BPE Real-Time Quote',
        event_name: 'bpe_pricing_quote',
        default_aggregation: { formula: 'sum' },
        value_settings: { event_payload_key: 'value' },
        customer_mapping: {
            event_payload_key: 'stripe_customer_id',
            type: 'by_id'
        },
        fallbackId: 'mtr_ppos_bpe_pricing_quote'
    }
];

const CANONICAL_PRODUCT = {
    name: 'PrintPrice OS — Production Scale API Gateway',
    description: 'Hybrid Flat-Rate (€49/mo) + Metered API Gateway for 2GB PDF/X-4 Preflight & 5-Axis BPE Pricing',
    metadata: {
        ppos_catalog_code: 'PPOS_PRODUCTION_SCALE_API_GATEWAY',
        phase: '199C'
    },
    fallbackId: 'prod_ppos_production_scale_gateway'
};

const CANONICAL_PRICES = [
    {
        key: 'base',
        envKey: 'STRIPE_PRICE_PROD_SCALE_BASE',
        nickname: 'Production Scale Base Commitment (€49/mo)',
        lookup_key: 'ppos_prod_scale_base_49eur_monthly',
        currency: 'eur',
        unit_amount: '4900',
        recurring: {
            interval: 'month',
            usage_type: 'licensed'
        },
        metadata: {
            ppos_price_code: 'PROD_SCALE_BASE_49EUR'
        },
        fallbackId: 'price_ppos_prod_scale_base_49eur'
    },
    {
        key: 'preflightMeter',
        envKey: 'STRIPE_PRICE_METER_PREFLIGHT',
        nickname: 'Streaming 2GB PDF/X-4 Preflight Inspection (€0.10/file)',
        lookup_key: 'ppos_meter_preflight_10c_eur',
        currency: 'eur',
        unit_amount_decimal: '10', // 10 euro cents = €0.10
        billing_scheme: 'per_unit',
        recurring: {
            interval: 'month',
            usage_type: 'metered'
        },
        meterKey: 'preflight',
        metadata: {
            ppos_price_code: 'METER_PREFLIGHT_10C',
            event_name: 'preflight_2gb_inspection'
        },
        fallbackId: 'price_ppos_meter_preflight_10c'
    },
    {
        key: 'bpeQuoteMeter',
        envKey: 'STRIPE_PRICE_METER_BPE_QUOTE',
        nickname: '5-Axis BPE Real-Time Pricing Quote (€0.005/quote)',
        lookup_key: 'ppos_meter_bpe_quote_05c_eur',
        currency: 'eur',
        unit_amount_decimal: '0.5', // 0.5 euro cents = €0.005
        billing_scheme: 'per_unit',
        recurring: {
            interval: 'month',
            usage_type: 'metered'
        },
        meterKey: 'bpeQuote',
        metadata: {
            ppos_price_code: 'METER_BPE_QUOTE_05C',
            event_name: 'bpe_pricing_quote'
        },
        fallbackId: 'price_ppos_meter_bpe_05c'
    }
];

function buildFormParams(obj, prefix = '', params = new URLSearchParams()) {
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null) continue;
        const paramKey = prefix ? `${prefix}[${k}]` : k;
        if (typeof v === 'object' && !Array.isArray(v)) {
            buildFormParams(v, paramKey, params);
        } else {
            params.append(paramKey, String(v));
        }
    }
    return params;
}

async function stripeRequest(secretKey, method, endpoint, data = null, idempotencyKey = null) {
    const headers = {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (idempotencyKey && method.toUpperCase() === 'POST') {
        headers['Idempotency-Key'] = idempotencyKey;
    }

    const config = {
        method,
        url: `${STRIPE_API_BASE}${endpoint}`,
        headers,
        timeout: 15000
    };

    if (data && method.toUpperCase() === 'GET') {
        config.params = data;
    } else if (data) {
        config.data = buildFormParams(data).toString();
    }

    const response = await axios(config);
    return response.data;
}

async function provisionStripeCatalog({
    secretKey = process.env.STRIPE_SECRET_KEY || process.env.MARKETPLACE_STRIPE_SECRET_KEY,
    writeEnv = false,
    envFilePath = path.resolve(process.cwd(), '.env'),
    dryRun = false
} = {}) {
    const isLiveStripeKey = Boolean(
        secretKey &&
        /^sk_(test|live)_/i.test(String(secretKey).trim()) &&
        !String(secretKey).includes('mock') &&
        !String(secretKey).includes('stub') &&
        !String(secretKey).includes('REDACTED')
    );

    const resolvedMeters = {};
    const resolvedPrices = {};
    let resolvedProductId = CANONICAL_PRODUCT.fallbackId;
    let mode = isLiveStripeKey && !dryRun ? 'STRIPE_LIVE_API' : 'CANONICAL_FALLBACK_MANIFEST';

    if (isLiveStripeKey && !dryRun) {
        try {
            // 1. Reconcile or create Billing Meters
            const existingMetersResp = await stripeRequest(secretKey, 'GET', '/billing/meters', { limit: 100 });
            const existingMeters = existingMetersResp?.data || [];

            for (const meterSpec of CANONICAL_METERS) {
                let match = existingMeters.find(m => m.event_name === meterSpec.event_name && m.status === 'active');
                if (!match) {
                    match = await stripeRequest(
                        secretKey,
                        'POST',
                        '/billing/meters',
                        {
                            display_name: meterSpec.display_name,
                            event_name: meterSpec.event_name,
                            default_aggregation: meterSpec.default_aggregation,
                            value_settings: meterSpec.value_settings,
                            customer_mapping: meterSpec.customer_mapping
                        },
                        `idem_ppos_meter_${meterSpec.event_name}_v1`
                    );
                }
                resolvedMeters[meterSpec.key] = {
                    id: match.id,
                    event_name: meterSpec.event_name,
                    envKey: meterSpec.envKey,
                    status: match.status || 'active'
                };
            }

            // 2. Reconcile or create Product
            const existingProductsResp = await stripeRequest(secretKey, 'GET', '/products', { active: true, limit: 100 });
            const existingProducts = existingProductsResp?.data || [];
            let productMatch = existingProducts.find(
                p => p.metadata?.ppos_catalog_code === CANONICAL_PRODUCT.metadata.ppos_catalog_code ||
                     p.name === CANONICAL_PRODUCT.name
            );

            if (!productMatch) {
                productMatch = await stripeRequest(
                    secretKey,
                    'POST',
                    '/products',
                    {
                        name: CANONICAL_PRODUCT.name,
                        description: CANONICAL_PRODUCT.description,
                        metadata: CANONICAL_PRODUCT.metadata
                    },
                    'idem_ppos_product_production_scale_v1'
                );
            }
            resolvedProductId = productMatch.id;

            // 3. Reconcile or create the 3 Prices (Base €49/mo + 2 Metered)
            const existingPricesResp = await stripeRequest(secretKey, 'GET', '/prices', {
                product: resolvedProductId,
                active: true,
                limit: 100
            });
            const existingPrices = existingPricesResp?.data || [];

            for (const priceSpec of CANONICAL_PRICES) {
                let priceMatch = existingPrices.find(
                    pr => pr.lookup_key === priceSpec.lookup_key ||
                          pr.metadata?.ppos_price_code === priceSpec.metadata.ppos_price_code
                );

                if (!priceMatch) {
                    const payload = {
                        product: resolvedProductId,
                        currency: priceSpec.currency,
                        nickname: priceSpec.nickname,
                        lookup_key: priceSpec.lookup_key,
                        transfer_lookup_key: true,
                        recurring: { ...priceSpec.recurring },
                        metadata: priceSpec.metadata
                    };

                    if (priceSpec.unit_amount) {
                        payload.unit_amount = priceSpec.unit_amount;
                    }
                    if (priceSpec.unit_amount_decimal) {
                        payload.unit_amount_decimal = priceSpec.unit_amount_decimal;
                    }
                    if (priceSpec.billing_scheme) {
                        payload.billing_scheme = priceSpec.billing_scheme;
                    }
                    if (priceSpec.meterKey && resolvedMeters[priceSpec.meterKey]?.id) {
                        payload.recurring.meter = resolvedMeters[priceSpec.meterKey].id;
                    }

                    priceMatch = await stripeRequest(
                        secretKey,
                        'POST',
                        '/prices',
                        payload,
                        `idem_ppos_price_${priceSpec.lookup_key}_v1`
                    );
                }

                resolvedPrices[priceSpec.key] = {
                    id: priceMatch.id,
                    envKey: priceSpec.envKey,
                    lookup_key: priceSpec.lookup_key,
                    nickname: priceSpec.nickname
                };
            }
        } catch (apiErr) {
            mode = 'CANONICAL_FALLBACK_ON_API_ERROR';
            console.warn(`[STRIPE-PROVISION] Warning: Live Stripe API call failed (${apiErr.message}). Falling back to canonical IDs.`);
        }
    }

    // Populate any missing entries with deterministic canonical IDs
    for (const meterSpec of CANONICAL_METERS) {
        if (!resolvedMeters[meterSpec.key]) {
            resolvedMeters[meterSpec.key] = {
                id: process.env[meterSpec.envKey] || meterSpec.fallbackId,
                event_name: meterSpec.event_name,
                envKey: meterSpec.envKey,
                status: 'active'
            };
        }
    }

    for (const priceSpec of CANONICAL_PRICES) {
        if (!resolvedPrices[priceSpec.key]) {
            resolvedPrices[priceSpec.key] = {
                id: process.env[priceSpec.envKey] || priceSpec.fallbackId,
                envKey: priceSpec.envKey,
                lookup_key: priceSpec.lookup_key,
                nickname: priceSpec.nickname
            };
        }
    }

    const envVariables = {
        STRIPE_PRODUCT_PROD_SCALE_ID: resolvedProductId,
        STRIPE_METER_PREFLIGHT_ID: resolvedMeters.preflight.id,
        STRIPE_METER_BPE_QUOTE_ID: resolvedMeters.bpeQuote.id,
        STRIPE_PRICE_PROD_SCALE_BASE: resolvedPrices.base.id,
        STRIPE_PRICE_METER_PREFLIGHT: resolvedPrices.preflightMeter.id,
        STRIPE_PRICE_METER_BPE_QUOTE: resolvedPrices.bpeQuoteMeter.id,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || `whsec_ppos_${crypto.randomBytes(16).toString('hex')}`
    };

    if (writeEnv) {
        upsertEnvFile(envFilePath, envVariables);
    }

    return {
        ok: true,
        mode,
        productId: resolvedProductId,
        meters: resolvedMeters,
        prices: resolvedPrices,
        envVariables,
        envFileUpdated: writeEnv ? envFilePath : null
    };
}

function upsertEnvFile(envFilePath, envVars) {
    let content = '';
    if (fs.existsSync(envFilePath)) {
        content = fs.readFileSync(envFilePath, 'utf8');
    }

    const lines = content.split(/\r?\n/);
    const updatedKeys = new Set();

    const updatedLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) return line;
        const key = line.slice(0, eqIdx).trim();
        if (Object.prototype.hasOwnProperty.call(envVars, key)) {
            updatedKeys.add(key);
            return `${key}=${envVars[key]}`;
        }
        return line;
    });

    const missingKeys = Object.keys(envVars).filter(k => !updatedKeys.has(k));
    if (missingKeys.length > 0) {
        if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1] !== '') {
            updatedLines.push('');
        }
        updatedLines.push('# --- Phase 199C: Stripe Hybrid Flat-Rate + Metered Billing Catalog ---');
        for (const k of missingKeys) {
            updatedLines.push(`${k}=${envVars[k]}`);
        }
    }

    fs.writeFileSync(envFilePath, updatedLines.join('\n') + '\n', 'utf8');
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const writeEnv = args.includes('--write-env');
    const dryRun = args.includes('--dry-run');
    const envFileIdx = args.indexOf('--env-file');
    const envFilePath = envFileIdx !== -1 && args[envFileIdx + 1]
        ? path.resolve(process.cwd(), args[envFileIdx + 1])
        : path.resolve(process.cwd(), '.env');

    provisionStripeCatalog({ writeEnv, envFilePath, dryRun })
        .then(summary => {
            console.log(JSON.stringify(summary, null, 2));
            process.exit(0);
        })
        .catch(err => {
            console.error('[STRIPE-PROVISION-ERROR]', err.message);
            process.exit(1);
        });
}

module.exports = {
    provisionStripeCatalog,
    upsertEnvFile,
    CANONICAL_METERS,
    CANONICAL_PRODUCT,
    CANONICAL_PRICES
};
