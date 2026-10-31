/**
 * scripts/create-phase37-ready-invoice-fixture.js
 *
 * Seeding script to create a dedicated marketplace order fixture in
 * READY_TO_INVOICE state, ready for invoice and payment generation.
 *
 * Safeguards:
 *  - Dry-run by default.
 *  - Only performs database writes if BOTH process.env.PHASE37_ALLOW_FIXTURE_SEED === 'true'
 *    AND process.argv includes '--execute'.
 *  - Gracefully handles database connection failures (refused/unconfigured).
 */

'use strict';

const path = require('path');
require('dotenv').config();

// Try importing mysqlClient. Since it's a dry-run by default, we can log errors if required,
// but we only establish connection if we are writing.
let mysqlClient;
try {
    mysqlClient = require('../src/api/services/mysqlClient');
} catch (err) {
    console.error('Failed to load mysqlClient:', err.message);
}

// 1. Setup metadata & variables
const timestamp = Date.now();
const orderId = `ord_phase37_ready_${timestamp}`;
const interiorFileId = `fil_interior_${timestamp}`;
const coverFileId = `fil_cover_${timestamp}`;
const eventId = `evt_seed_${timestamp}`;
const evaluatedAt = new Date().toISOString();

const selectedOfferJson = {
    offerId: 'offer_synthetic',
    totalPrice: 2607.2429,
    currency: 'EUR'
};

const metadataJson = {
    pricing: {
        amount: 2607.2429,
        currency: 'EUR'
    },
    invoice_gate: {
        phase: '36.5',
        decision: 'READY_FOR_INVOICE',
        invoiceReady: true,
        blockers: [],
        warnings: [],
        recommendedAction: 'GENERATE_INVOICE',
        evaluatedAt,
        evaluatedBy: 'control-plane-seeder'
    }
};

const readinessJson = {
    ready: true,
    readyToInvoice: true,
    statusSuggestion: 'READY_TO_INVOICE',
    invoiceReady: true,
    invoiceGateDecision: 'READY_FOR_INVOICE',
    invoiceGateBlockers: []
};

const customerJson = {
    name: 'Phase 37.1 Customer',
    email: 'customer37@example.com'
};

// 2. Query definitions
const queries = [
    {
        table: 'marketplace_orders',
        sql: `INSERT INTO marketplace_orders (
            order_id, status, currency, estimated_price, book_spec_json, selected_offer_json, customer_json, readiness_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        params: [
            orderId,
            'READY_TO_INVOICE',
            'EUR',
            null, // estimated_price (null ensures resolveAmountAndCurrency checks selected_offer_json)
            JSON.stringify({ pages: 200, format: 'A5' }),
            JSON.stringify(selectedOfferJson),
            JSON.stringify(customerJson),
            JSON.stringify(readinessJson),
            JSON.stringify(metadataJson)
        ]
    },
    {
        table: 'marketplace_order_files (interior)',
        sql: `INSERT INTO marketplace_order_files (
            file_id, order_id, role, version, original_name, mime_type, size_bytes, checksum_sha256, storage_path, status, preflight_job_id, preflight_status, preflight_outcome_category, findings_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        params: [
            interiorFileId,
            orderId,
            'INTERIOR_PDF',
            1,
            'interior.pdf',
            'application/pdf',
            102400,
            'd2a2a0bc43f1141aa9d5bb00dcd20e0ffb050c25a38a7b0544f84c56e36d4052',
            '/tmp/fixtures/interior.pdf',
            'ACCEPTED',
            `job_int_synthetic_${timestamp}`,
            'COMPLETED',
            'COMPLETED',
            0
        ]
    },
    {
        table: 'marketplace_order_files (cover)',
        sql: `INSERT INTO marketplace_order_files (
            file_id, order_id, role, version, original_name, mime_type, size_bytes, checksum_sha256, storage_path, status, preflight_job_id, preflight_status, preflight_outcome_category, findings_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        params: [
            coverFileId,
            orderId,
            'COVER_PDF',
            1,
            'cover.pdf',
            'application/pdf',
            51200,
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            '/tmp/fixtures/cover.pdf',
            'ACCEPTED',
            `job_cov_synthetic_${timestamp}`,
            'COMPLETED',
            'COMPLETED',
            0
        ]
    },
    {
        table: 'marketplace_order_events',
        sql: `INSERT INTO marketplace_order_events (
            event_id, order_id, file_id, type, actor_type, actor_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        params: [
            eventId,
            orderId,
            null,
            'PHASE37_READY_FIXTURE_CREATED',
            'SYSTEM',
            'control-plane-seeder',
            JSON.stringify({
                message: 'Phase 37.1 READY_FOR_INVOICE order seeded successfully.',
                amount: 2607.2429,
                currency: 'EUR'
            })
        ]
    }
];

// 3. Execution logic
const allowWrite = process.env.PHASE37_ALLOW_FIXTURE_SEED === 'true';
const hasExecuteFlag = process.argv.includes('--execute');
const executeQuery = allowWrite && hasExecuteFlag;

async function run() {
    if (!executeQuery) {
        console.log('DRY_RUN_ONLY');
        console.log('No database writes performed.');
        console.log('\n--- TARGET CONFIGURATION ---');
        console.log(`Generated Order ID: ${orderId}`);
        console.log(`Generated Interior File ID: ${interiorFileId}`);
        console.log(`Generated Cover File ID: ${coverFileId}`);
        console.log(`Generated Event ID: ${eventId}`);
        console.log('\n--- TARGET SQL QUERIES & PAYLOADS ---');
        queries.forEach((q, idx) => {
            console.log(`\nQuery ${idx + 1} (${q.table}):`);
            console.log(`SQL: ${q.sql.replace(/\s+/g, ' ').trim()}`);
            console.log(`Params: ${JSON.stringify(q.params, null, 2)}`);
        });
        process.exit(0);
    }

    console.log(`Attempting to execute DB inserts for Order: ${orderId}...`);
    try {
        if (!mysqlClient) {
            throw new Error('mysqlClient is not loaded.');
        }

        // Run queries in sequence
        for (const q of queries) {
            console.log(`Executing insert into ${q.table}...`);
            await mysqlClient.query(q.sql, q.params);
        }

        console.log('\nSUCCESS');
        console.log(`Seeded Order ID: ${orderId}`);
        process.exit(0);
    } catch (err) {
        console.error('\nDATABASE_WRITE_FAILED');
        console.error(`Error: ${err.message}`);
        console.log('\n--- FALLING BACK TO DRY RUN LOGS ---');
        console.log(`Generated Order ID: ${orderId}`);
        queries.forEach((q, idx) => {
            console.log(`\nQuery ${idx + 1} (${q.table}):`);
            console.log(`SQL: ${q.sql.replace(/\s+/g, ' ').trim()}`);
            console.log(`Params: ${JSON.stringify(q.params, null, 2)}`);
        });
        process.exit(0);
    }
}

run();
