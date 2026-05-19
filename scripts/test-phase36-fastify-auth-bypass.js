/**
 * scripts/test-phase36-fastify-auth-bypass.js
 * 
 * Verifies Fastify onRequest auth hook with:
 * 1. Correct X-Marketplace-Token -> Succeeds (Status 201)
 * 2. Missing Token -> Fails (Status 401: Bearer token required)
 * 3. Wrong Token -> Fails (Status 401: Invalid Marketplace Intake Token)
 */

require('dotenv').config();
const axios = require('axios');

// Mock mysqlClient globally before loading anything
const db = require('../src/api/services/mysqlClient');
const memoryDb = {
    marketplace_orders: [],
    marketplace_order_files: [],
    marketplace_order_events: [],
    marketplace_order_preflight_bindings: []
};

db.query = async (sql, params = []) => {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();
    if (cleanSql.toUpperCase().startsWith('INSERT INTO')) {
        if (cleanSql.includes('marketplace_orders')) {
            const row = {
                order_id: params[0],
                pricing_session_id: params[1],
                selected_offer_id: params[2],
                customer_id: params[3],
                tenant_id: params[4],
                printhouse_id: params[5],
                status: params[6],
                currency: params[7],
                estimated_price: params[8],
                book_spec_json: params[9],
                selected_offer_json: params[10],
                customer_json: params[11],
                readiness_json: params[12],
                metadata_json: params[13],
                created_at: new Date(),
                updated_at: new Date()
            };
            memoryDb.marketplace_orders.push(row);
            return { insertId: memoryDb.marketplace_orders.length };
        }
        if (cleanSql.includes('marketplace_order_files')) {
            return { insertId: 1 };
        }
        if (cleanSql.includes('marketplace_order_events')) {
            return { insertId: 1 };
        }
    }
    if (cleanSql.toUpperCase().startsWith('SELECT')) {
        if (cleanSql.includes('FROM marketplace_orders WHERE order_id = ?')) {
            return memoryDb.marketplace_orders.filter(o => o.order_id === params[0]);
        }
        if (cleanSql.includes('SELECT 1') || cleanSql.includes('information_schema')) {
            return [{ 1: 1 }];
        }
    }
    return [];
};

// Set test environment configuration
const TEST_PORT = 18081;
process.env.PORT = TEST_PORT.toString();
process.env.PPOS_CONTROL_PORT = TEST_PORT.toString();
process.env.PPOS_MARKETPLACE_INTAKE_TOKEN = 'mp_intake_test_token_12345';
process.env.JWT_SECRET = '85Kr/w0fiPkDHsisReEPBXhPVVJyVej5Fcy1dU3MvuQ=';

// Prevent actual PM2 operations or loop intervals
process.env.PPOS_CONTROL_MODE = 'ISOLATED';

console.log('  [TEST-SETUP] Mocking database layers completed.');

async function run() {
    console.log('\n=============================================================');
    console.log('🚀 FASTIFY ONREQUEST AUTH BYPASS SMOKE TEST 🚀');
    console.log('=============================================================\n');

    // Load server.js which boots up the Fastify application
    const serverInstance = require('../server');

    // Wait a brief moment for Fastify to bind
    await new Promise(resolve => setTimeout(resolve, 2000));

    const url = `http://localhost:${TEST_PORT}/api/marketplace/orders`;
    const orderPayload = {
        pricingSessionId: 'sess_test_999',
        selectedOfferId: 'off_test_999',
        tenantId: 'ten_test',
        customerId: 'cust_bob',
        printhouseId: 'house_digital',
        currency: 'USD',
        estimatedPrice: 250.00,
        bookSpec: { pages: 200, binding: 'HARDCOVER' },
        selectedOffer: { offerId: 'off_test_999', price: 250.00, printerId: 'house_digital' },
        customer: { name: 'Bob Smith', email: 'bob@example.com' }
    };

    let passCount = 0;
    let failCount = 0;

    // Test Case 1: POST /api/marketplace/orders with correct token
    try {
        console.log('[CASE 1] Sending POST /api/marketplace/orders with CORRECT X-Marketplace-Token...');
        const res = await axios.post(url, orderPayload, {
            headers: {
                'X-Marketplace-Token': 'mp_intake_test_token_12345'
            }
        });
        if (res.status === 201 && res.data.ok) {
            console.log('  [PASS] Successfully bypassed JWT & created order. Status: 201.');
            passCount++;
        } else {
            throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.data)}`);
        }
    } catch (err) {
        console.error('  [FAIL] Case 1 failed:', err.response ? err.response.data : err.message);
        failCount++;
    }

    // Test Case 2: POST /api/marketplace/orders with no token
    try {
        console.log('\n[CASE 2] Sending POST /api/marketplace/orders with NO token...');
        await axios.post(url, orderPayload);
        console.error('  [FAIL] Allowed order creation without any credentials!');
        failCount++;
    } catch (err) {
        if (err.response && err.response.status === 401 && err.response.data.error.includes('Bearer token required')) {
            console.log('  [PASS] Successfully blocked anonymous request. Response:', err.response.data);
            passCount++;
        } else {
            console.error('  [FAIL] Unexpected error:', err.response ? err.response.data : err.message);
            failCount++;
        }
    }

    // Test Case 3: POST /api/marketplace/orders with WRONG token
    try {
        console.log('\n[CASE 3] Sending POST /api/marketplace/orders with WRONG X-Marketplace-Token...');
        await axios.post(url, orderPayload, {
            headers: {
                'X-Marketplace-Token': 'wrong_marketplace_token_abc'
            }
        });
        console.error('  [FAIL] Allowed order creation with invalid token!');
        failCount++;
    } catch (err) {
        if (err.response && err.response.status === 401 && err.response.data.error.includes('Invalid Marketplace Intake Token')) {
            console.log('  [PASS] Successfully blocked invalid token request. Response:', err.response.data);
            passCount++;
        } else {
            console.error('  [FAIL] Unexpected error:', err.response ? err.response.data : err.message);
            failCount++;
        }
    }

    console.log('\n=============================================================');
    console.log(`📊 SMOKE TESTS COMPLETED. PASS: ${passCount}, FAIL: ${failCount}`);
    console.log('=============================================================\n');

    process.exit(failCount === 0 ? 0 : 1);
}

run().catch(err => {
    console.error('Fatal test execution error:', err);
    process.exit(1);
});
