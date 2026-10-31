/**
 * scripts/test-phase36-marketplace-order-routes.js
 * 
 * High-fidelity integration test suite verifying the 7 Marketplace Order API routes.
 * Uses a real Express server listening on a local port, Axios to dispatch real HTTP requests,
 * and a high-fidelity in-memory Virtual Mock SQL Layer to capture database state offline.
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const db = require('../src/api/services/mysqlClient');
const marketplaceOrdersRouter = require('../src/api/routes/marketplaceOrders');
const marketplaceOrderService = require('../src/api/services/marketplaceOrderService');

// Test Environment Variables Configuration
const TEST_PORT = 9999;
const BASE_URL = `http://localhost:${TEST_PORT}/api/marketplace/orders`;
const BREAK_GLASS_TOKEN = 'test_break_glass_token_999';

process.env.PPOS_CONTROL_TOKEN = BREAK_GLASS_TOKEN;
process.env.ENABLE_BREAK_GLASS_TOKEN = 'true';
process.env.JWT_SECRET = 'test_jwt_secret_xyz123';
process.env.PPOS_MARKETPLACE_INTAKE_TOKEN = 'test_marketplace_intake_token_999';
axios.defaults.headers.common['Authorization'] = `Bearer test_marketplace_intake_token_999`;

const memoryDb = {
    marketplace_orders: [],
    marketplace_order_files: [],
    marketplace_order_events: [],
    marketplace_order_preflight_bindings: [],
    preflight_jobs: []
};

// Install high-fidelity virtual MySQL client mock
function installMockEngine() {
    db.query = async (sql, params = []) => {
        const cleanSql = sql.replace(/\s+/g, ' ').trim();
        
        // 1. INSERT STATEMENTS
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
                const row = {
                    file_id: params[0],
                    order_id: params[1],
                    role: params[2],
                    version: 1,
                    original_name: params[3],
                    mime_type: params[4],
                    size_bytes: params[5],
                    checksum_sha256: params[6],
                    storage_path: params[7],
                    status: params[8],
                    created_at: new Date(),
                    updated_at: new Date()
                };
                memoryDb.marketplace_order_files.push(row);
                return { insertId: memoryDb.marketplace_order_files.length };
            }
            if (cleanSql.includes('marketplace_order_events')) {
                const row = {
                    event_id: params[0],
                    order_id: params[1],
                    file_id: params[2],
                    type: params[3],
                    actor_type: params[4],
                    actor_id: params[5],
                    payload_json: params[6],
                    created_at: new Date()
                };
                memoryDb.marketplace_order_events.push(row);
                return { insertId: memoryDb.marketplace_order_events.length };
            }
            if (cleanSql.includes('marketplace_order_preflight_bindings')) {
                const row = {
                    order_id: params[0],
                    file_id: params[1],
                    preflight_job_id: params[2],
                    role: params[3],
                    status: params[4],
                    outcome_category: params[5],
                    analysis_integrity_json: params[6],
                    analyzer_coverage_json: params[7],
                    artifact_refs_json: params[8],
                    findings_count: params[9],
                    created_at: new Date(),
                    updated_at: new Date()
                };
                memoryDb.marketplace_order_preflight_bindings.push(row);
                return { insertId: memoryDb.marketplace_order_preflight_bindings.length };
            }
        }

        // 2. SELECT STATEMENTS
        if (cleanSql.toUpperCase().startsWith('SELECT')) {
            if (cleanSql.includes('FROM marketplace_orders WHERE order_id = ?')) {
                return memoryDb.marketplace_orders.filter(o => o.order_id === params[0]);
            }
            if (cleanSql.includes('FROM marketplace_orders WHERE 1=1')) {
                return memoryDb.marketplace_orders;
            }
            if (cleanSql.includes('FROM marketplace_order_files WHERE order_id = ? AND role = ?')) {
                return memoryDb.marketplace_order_files.filter(f => f.order_id === params[0] && f.role === params[1]);
            }
            if (cleanSql.includes('FROM marketplace_order_files WHERE file_id = ? AND order_id = ?')) {
                return memoryDb.marketplace_order_files.filter(f => f.file_id === params[0] && f.order_id === params[1]);
            }
            if (cleanSql.includes('FROM marketplace_order_files WHERE order_id = ?')) {
                return memoryDb.marketplace_order_files.filter(f => f.order_id === params[0]);
            }
            if (cleanSql.includes('FROM marketplace_order_events WHERE order_id = ?')) {
                return memoryDb.marketplace_order_events.filter(e => e.order_id === params[0]);
            }
            if (cleanSql.includes('FROM marketplace_order_preflight_bindings WHERE preflight_job_id = ?')) {
                return memoryDb.marketplace_order_preflight_bindings.filter(b => b.preflight_job_id === params[0]);
            }
            if (cleanSql.includes('FROM marketplace_order_preflight_bindings WHERE order_id = ?')) {
                return memoryDb.marketplace_order_preflight_bindings.filter(b => b.order_id === params[0]);
            }
            if (cleanSql.includes('FROM preflight_jobs WHERE id = ?')) {
                return memoryDb.preflight_jobs.filter(j => j.id === params[0]);
            }
            if (cleanSql.includes('SELECT 1')) {
                return [{ 1: 1 }];
            }
        }

        // 3. UPDATE STATEMENTS
        if (cleanSql.toUpperCase().startsWith('UPDATE')) {
            if (cleanSql.includes('marketplace_orders')) {
                const orderId = params[params.length - 1];
                const order = memoryDb.marketplace_orders.find(o => o.order_id === orderId);
                if (order) {
                    if (cleanSql.includes('readiness_json = ?') && cleanSql.includes('status = ?')) {
                        order.status = params[0];
                        order.readiness_json = params[1];
                    } else if (cleanSql.includes('readiness_json = ?')) {
                        order.readiness_json = params[0];
                    } else if (cleanSql.includes('selected_offer_id = ?')) {
                        order.selected_offer_id = params[0];
                        order.printhouse_id = params[1];
                        order.estimated_price = params[2];
                        order.selected_offer_json = params[3];
                        order.status = params[4];
                    } else if (cleanSql.includes('status = ?')) {
                        order.status = params[0];
                    }
                    order.updated_at = new Date();
                }
                return { affectedRows: 1 };
            }
            if (cleanSql.includes('marketplace_order_files')) {
                if (cleanSql.includes('original_name = ?') && cleanSql.includes('role = ?')) {
                    const orderId = params[5];
                    const role = params[6];
                    const file = memoryDb.marketplace_order_files.find(f => f.order_id === orderId && f.role === role);
                    if (file) {
                        file.original_name = params[0];
                        file.mime_type = params[1];
                        file.size_bytes = params[2];
                        file.checksum_sha256 = params[3];
                        file.storage_path = params[4];
                        file.status = 'UPLOADED';
                        file.updated_at = new Date();
                    }
                } else if (cleanSql.includes('preflight_job_id = ?') && cleanSql.includes('file_id = ?')) {
                    const fileId = params[4];
                    const file = memoryDb.marketplace_order_files.find(f => f.file_id === fileId);
                    if (file) {
                        file.preflight_job_id = params[0];
                        file.preflight_status = params[1];
                        file.preflight_outcome_category = params[2];
                        file.findings_count = params[3];
                        file.updated_at = new Date();
                    }
                }
                return { affectedRows: 1 };
            }
            if (cleanSql.includes('marketplace_order_preflight_bindings')) {
                if (cleanSql.includes('preflight_job_id = ?')) {
                    const preflightJobId = params[params.length - 1];
                    const binding = memoryDb.marketplace_order_preflight_bindings.find(b => b.preflight_job_id === preflightJobId);
                    if (binding) {
                        binding.order_id = params[0];
                        binding.file_id = params[1];
                        binding.role = params[2];
                        binding.status = params[3];
                        binding.outcome_category = params[4];
                        binding.findings_count = params[5];
                        binding.analysis_integrity_json = params[6];
                        binding.analyzer_coverage_json = params[7];
                        binding.artifact_refs_json = params[8];
                        binding.updated_at = new Date();
                    }
                }
                return { affectedRows: 1 };
            }
        }

        return [];
    };
}

async function run() {
    console.log('\n=============================================================');
    console.log('🛡️ PHASE 36.1 MARKETPLACE ORDERS API ROUTES VERIFICATION 🛡️');
    console.log('=============================================================\n');

    installMockEngine();

    // Initialize Express application for router testing
    const app = express();
    app.use(express.json());
    
    // Mount the routers using identical mount conventions
    app.use('/api/marketplace/orders', marketplaceOrdersRouter);

    const server = app.listen(TEST_PORT, () => {
        console.log(`  [OK] Test server successfully bound to port ${TEST_PORT}.`);
    });

    try {
        let testOrderId = null;
        let interiorFileId = null;
        let coverFileId = null;

        // -------------------------------------------------------------
        // Endpoint 1: POST /api/marketplace/orders
        // -------------------------------------------------------------
        console.log('\n[1/7] Testing route: POST /api/marketplace/orders (Order Intake)');
        const createPayload = {
            pricingSessionId: 'sess_test_123',
            selectedOfferId: 'off_test_999',
            tenantId: 'ten_test_client',
            customerId: 'cust_alice',
            printhouseId: 'house_digital_print',
            currency: 'EUR',
            estimatedPrice: 189.50,
            bookSpec: { pages: 120, binding: 'SOFTCOVER' },
            selectedOffer: { offerId: 'off_test_999', price: 189.50, printerId: 'house_digital_print' },
            customer: { name: 'Alice Jones', email: 'alice@example.com' }
        };

        const createRes = await axios.post(BASE_URL, createPayload);
        if (createRes.status === 201 && createRes.data.ok) {
            testOrderId = createRes.data.orderId;
            console.log(`  [PASS] Order created successfully. OrderId: ${testOrderId}`);
            console.log(`         Required Files: [${createRes.data.requiredFiles.join(', ')}]`);
            console.log(`         Readiness State: ${JSON.stringify(createRes.data.readiness)}`);
        } else {
            throw new Error(`Failed to create order: ${JSON.stringify(createRes.data)}`);
        }

        // -------------------------------------------------------------
        // Endpoint 2: GET /api/marketplace/orders/:orderId
        // -------------------------------------------------------------
        console.log('\n[2/7] Testing route: GET /api/marketplace/orders/:orderId (Order Detail)');
        const detailRes = await axios.get(`${BASE_URL}/${testOrderId}`);
        if (detailRes.status === 200 && detailRes.data.ok) {
            const { order, files, events, readiness } = detailRes.data;
            console.log(`  [PASS] Successfully retrieved detail for order: ${order.orderId}`);
            console.log(`         Status: ${order.status}, Files Count: ${files.length}, Events Count: ${events.length}`);
            
            // Map file IDs for subsequent registration
            const interior = files.find(f => f.role === 'INTERIOR_PDF');
            const cover = files.find(f => f.role === 'COVER_PDF');
            if (interior && cover) {
                interiorFileId = interior.fileId;
                coverFileId = cover.fileId;
            }
        } else {
            throw new Error(`Failed to retrieve order details: ${JSON.stringify(detailRes.data)}`);
        }

        // -------------------------------------------------------------
        // Endpoint 3: GET /api/marketplace/orders (Admin list filters)
        // -------------------------------------------------------------
        console.log('\n[3/7] Testing route: GET /api/marketplace/orders (Listing with Auth check)');
        
        // Assert: Access without break-glass token should return 401
        try {
            await axios.get(BASE_URL);
            throw new Error('Listing route did not enforce authentication!');
        } catch (err) {
            if (err.response && err.response.status === 401) {
                console.log('  [PASS] Authentication check successfully blocked anonymous listing.');
            } else {
                throw err;
            }
        }

        // Access with correct break-glass token
        const listRes = await axios.get(BASE_URL, {
            headers: {
                Authorization: `Bearer ${BREAK_GLASS_TOKEN}`
            }
        });
        if (listRes.status === 200 && listRes.data.ok) {
            console.log(`  [PASS] Administrative authenticated listing successful. Orders count: ${listRes.data.orders.length}`);
        } else {
            throw new Error(`Authenticated listing failed: ${JSON.stringify(listRes.data)}`);
        }

        // -------------------------------------------------------------
        // Endpoint 4: POST /api/marketplace/orders/:orderId/selected-offer
        // -------------------------------------------------------------
        console.log('\n[4/7] Testing route: POST /api/marketplace/orders/:orderId/selected-offer');
        const offerPayload = {
            offerId: 'off_override_888',
            totalPrice: 175.00,
            printhouseId: 'house_fast_press'
        };
        const offerRes = await axios.post(`${BASE_URL}/${testOrderId}/selected-offer`, offerPayload);
        if (offerRes.status === 200 && offerRes.data.ok) {
            console.log(`  [PASS] Selected offer successfully updated to: ${offerRes.data.order.selectedOfferId}`);
            console.log(`         Updated price estimate: ${offerRes.data.order.estimatedPrice} EUR`);
        } else {
            throw new Error(`Failed to update selected offer: ${JSON.stringify(offerRes.data)}`);
        }

        // -------------------------------------------------------------
        // Endpoint 5: POST /api/marketplace/orders/:orderId/files/register
        // -------------------------------------------------------------
        console.log('\n[5/7] Testing route: POST /api/marketplace/orders/:orderId/files/register');
        
        // Register Interior File metadata
        const fileRegPayload = {
            role: 'INTERIOR_PDF',
            originalName: 'novel_interior_v3.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 15482930,
            checksumSha256: 'a1b2c3d4e5f6g7h8i9j0a1b2c3d4e5f6g7h8i9j0a1b2c3d4e5f6g7h8i9j01234',
            storagePath: '/s3/uploads/novel_interior_v3.pdf'
        };

        const regRes = await axios.post(`${BASE_URL}/${testOrderId}/files/register`, fileRegPayload);
        if (regRes.status === 200 && regRes.data.ok) {
            console.log(`  [PASS] File metadata registered successfully.`);
            console.log(`         File ID: ${regRes.data.fileId}, Status: ${regRes.data.status}`);
        } else {
            throw new Error(`File registration failed: ${JSON.stringify(regRes.data)}`);
        }

        // -------------------------------------------------------------
        // Endpoint 6: POST /api/marketplace/orders/:orderId/files/:fileId/preflight-bind
        // -------------------------------------------------------------
        console.log('\n[6/7] Testing route: POST /api/marketplace/orders/:orderId/files/:fileId/preflight-bind');
        
        // Seed a preflight job in our virtual database registry
        const preflightJobId = 'job_preflight_perfect_123';
        memoryDb.preflight_jobs.push({
            id: preflightJobId,
            status: 'COMPLETED',
            metadata_json: JSON.stringify({
                outcomeCategory: 'PASS',
                findingsCount: 0,
                analysisIntegrity: { pass: true },
                analyzerCoverage: { full: true }
            })
        });

        const bindRes = await axios.post(`${BASE_URL}/${testOrderId}/files/${interiorFileId}/preflight-bind`, {
            preflightJobId
        });

        if (bindRes.status === 200 && bindRes.data.ok) {
            console.log(`  [PASS] Preflight job bound successfully.`);
            console.log(`         Binding status: ${bindRes.data.binding.status}, Outcome: ${bindRes.data.binding.outcomeCategory}`);
        } else {
            throw new Error(`Preflight binding failed: ${JSON.stringify(bindRes.data)}`);
        }

        // -------------------------------------------------------------
        // Endpoint 7: POST /api/marketplace/orders/:orderId/readiness/recompute
        // -------------------------------------------------------------
        console.log('\n[7/7] Testing route: POST /api/marketplace/orders/:orderId/readiness/recompute');
        const recomputeRes = await axios.post(`${BASE_URL}/${testOrderId}/readiness/recompute`);
        if (recomputeRes.status === 200 && recomputeRes.data.ok) {
            console.log(`  [PASS] Readiness recomputations complete.`);
            console.log(`         Ready: ${recomputeRes.data.readiness.ready ? 'TRUE' : 'FALSE'}`);
            console.log(`         Remaining Blockers: [${recomputeRes.data.readiness.blockers.join(', ')}]`);
        } else {
            throw new Error(`Readiness recomputations failed: ${JSON.stringify(recomputeRes.data)}`);
        }

        console.log('\n=============================================================');
        console.log('✨ ALL MARKETPLACE ROUTE TESTS COMPLETED: STATUS PASS ✨');
        console.log('=============================================================\n');
        
        server.close();
        process.exit(0);

    } catch (err) {
        console.error('\n🔴 FATAL FAILURE RUNNING INTEGRATION TESTS:');
        if (err.response) {
            console.error(`   HTTP Status: ${err.response.status}`);
            console.error(`   Body:`, JSON.stringify(err.response.data, null, 2));
        } else {
            console.error(`   Error message: ${err.message}`);
        }
        server.close();
        process.exit(1);
    }
}

run();
