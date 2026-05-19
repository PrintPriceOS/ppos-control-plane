/**
 * scripts/test-phase36-preflight-bind.js
 * 
 * Verification test suite for Phase 36.4: Preflight Binding from Uploaded Marketplace Files.
 * Validates BPE physical file resolution, PDF header signature validation (%PDF),
 * preflight gateway submission, database registration, binding upsert, and readiness calculation.
 * Sets up a mock database engine if physical database is offline, and starts a temporary
 * Express server to verify the POST route via Axios.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');

const db = require('../src/api/services/mysqlClient');
const preflightContractGateway = require('../src/api/services/preflightContractGateway');
const adminMarketplaceOrdersRouter = require('../src/api/routes/adminMarketplaceOrders');
const service = require('../src/api/services/marketplacePreflightBindingService');

const TEST_PORT = 9991;
const BASE_URL = `http://localhost:${TEST_PORT}/api/admin/marketplace/orders`;
const BREAK_GLASS_TOKEN = 'test_break_glass_token_36_4';

process.env.PPOS_CONTROL_TOKEN = BREAK_GLASS_TOKEN;
process.env.ENABLE_BREAK_GLASS_TOKEN = 'true';
process.env.JWT_SECRET = 'test_jwt_secret_xyz123';

const memoryDb = {
    marketplace_orders: [],
    marketplace_order_files: [],
    marketplace_order_events: [],
    marketplace_order_preflight_bindings: [],
    preflight_job_registry: [],
    production_files: []
};

let isMockMode = false;

// Mock SQL Relational Engine
function installMockEngine() {
    isMockMode = true;
    db.query = async (sql, params = []) => {
        const cleanSql = sql.replace(/\s+/g, ' ').trim();
        
        // INSERT
        if (cleanSql.toUpperCase().startsWith('INSERT INTO')) {
            if (cleanSql.includes('marketplace_orders')) {
                const row = {
                    order_id: params[0],
                    tenant_id: params[4],
                    status: params[6],
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
            if (cleanSql.includes('preflight_job_registry')) {
                const row = {
                    job_id: params[0],
                    tenant_id: params[1],
                    printhouse_id: params[2],
                    operator_id: params[3],
                    status: params[4],
                    policy: params[5],
                    type: params[6],
                    progress: params[7],
                    file_size_bytes: params[8],
                    original_filename: params[9],
                    canonical_payload_json: params[10],
                    created_at: new Date(),
                    updated_at: new Date()
                };
                memoryDb.preflight_job_registry.push(row);
                return { insertId: memoryDb.preflight_job_registry.length };
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
            if (cleanSql.includes('marketplace_order_events')) {
                const row = {
                    order_id: params[0],
                    type: params[1],
                    payload_json: params[2],
                    created_at: new Date()
                };
                memoryDb.marketplace_order_events.push(row);
                return { insertId: memoryDb.marketplace_order_events.length };
            }
        }

        // SELECT
        if (cleanSql.toUpperCase().startsWith('SELECT')) {
            if (cleanSql.includes('FROM marketplace_orders WHERE order_id = ?')) {
                return memoryDb.marketplace_orders.filter(o => o.order_id === params[0]);
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
            if (cleanSql.includes('FROM marketplace_order_files WHERE file_id = ?')) {
                return memoryDb.marketplace_order_files.filter(f => f.file_id === params[0]);
            }
            if (cleanSql.includes('FROM production_files WHERE id = ?')) {
                return memoryDb.production_files.filter(p => p.id === params[0]);
            }
            if (cleanSql.includes('FROM preflight_job_registry WHERE job_id = ?')) {
                return memoryDb.preflight_job_registry.filter(j => j.job_id === params[0]);
            }
            if (cleanSql.includes('FROM marketplace_order_preflight_bindings WHERE preflight_job_id = ?')) {
                return memoryDb.marketplace_order_preflight_bindings.filter(b => b.preflight_job_id === params[0]);
            }
            if (cleanSql.includes('FROM preflight_jobs WHERE id = ?')) {
                return [];
            }
            if (cleanSql.includes('SELECT 1')) {
                return [{ 1: 1 }];
            }
        }

        // UPDATE
        if (cleanSql.toUpperCase().startsWith('UPDATE')) {
            if (cleanSql.includes('UPDATE marketplace_order_files SET metadata_json = ? WHERE file_id = ?')) {
                const file = memoryDb.marketplace_order_files.find(f => f.file_id === params[1]);
                if (file) file.metadata_json = params[0];
                return { affectedRows: 1 };
            }
            if (cleanSql.includes('UPDATE marketplace_order_files SET preflight_job_id = ?')) {
                const file = memoryDb.marketplace_order_files.find(f => f.file_id === params[5]);
                if (file) {
                    file.preflight_job_id = params[0];
                    file.preflight_status = params[1];
                    file.preflight_outcome_category = params[2];
                    file.findings_count = params[3];
                    file.status = params[4];
                }
                return { affectedRows: 1 };
            }
            if (cleanSql.includes('UPDATE marketplace_order_preflight_bindings SET')) {
                const binding = memoryDb.marketplace_order_preflight_bindings.find(b => b.preflight_job_id === params[9]);
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
                }
                return { affectedRows: 1 };
            }
            if (cleanSql.includes('UPDATE marketplace_orders SET')) {
                const orderId = params[params.length - 1];
                const order = memoryDb.marketplace_orders.find(o => o.order_id === orderId);
                if (order) {
                    if (cleanSql.includes('status = ?') && cleanSql.includes('readiness_json = ?')) {
                        order.status = params[0];
                        order.readiness_json = params[1];
                    } else if (cleanSql.includes('readiness_json = ?')) {
                        order.readiness_json = params[0];
                    }
                }
                return { affectedRows: 1 };
            }
        }

        return [];
    };
}

// Setup gateway mocks
function installGatewayMock() {
    preflightContractGateway.createJob = async (fileBuffer, originalFilename, context = {}) => {
        console.log(`    [MOCK GATEWAY] createJob triggered for '${originalFilename}'`);
        return {
            jobId: 'job_test_bind_999',
            status: 'COMPLETED',
            outcomeCategory: 'PASS',
            findingsCount: 0,
            analysisIntegrity: { pass: true },
            analyzerCoverage: { full: true },
            degraded: false
        };
    };
}

// Check database connection and decide mode
async function setupEnvironment() {
    try {
        await db.query('SELECT 1');
        console.log('  [OK] Database connection online. Running in physical DB mode.');
    } catch (err) {
        console.warn('⚠️  DATABASE CONNECTION OFFLINE. Enabling high-fidelity mock relational engine.');
        installMockEngine();
    }
    installGatewayMock();
}

async function runTests() {
    console.log('\n=============================================================');
    console.log('🛡️  PHASE 36.4 PREFLIGHT BINDING VERIFICATION TESTS 🛡️');
    console.log('=============================================================\n');

    await setupEnvironment();

    // 1. Create a temporary PDF file to act as the uploaded BPE file
    const scratchDir = path.resolve(__dirname, '../scratch');
    if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
    }
    const tempPdfPath = path.join(scratchDir, 'test_preflight_bind.pdf');
    fs.writeFileSync(tempPdfPath, '%PDF-1.4\n%EOF');
    console.log(`[+] Created test PDF file at: ${tempPdfPath}`);

    // Create another file that has invalid signature to test validation failure
    const invalidPdfPath = path.join(scratchDir, 'test_invalid_signature.pdf');
    fs.writeFileSync(invalidPdfPath, 'INVALID_SIGNATURE\n%EOF');
    console.log(`[+] Created invalid signature test file at: ${invalidPdfPath}`);

    // Seed test data in memory / database
    const orderId = `ord_test_bind_${Date.now()}`;
    const fileIdValid = `file_val_${Date.now()}`;
    const fileIdInvalid = `file_inv_${Date.now()}`;
    const fileIdMissing = `file_mis_${Date.now()}`;

    if (isMockMode) {
        // Seed order
        memoryDb.marketplace_orders.push({
            order_id: orderId,
            tenant_id: 'ten_customer_bind',
            status: 'DRAFT',
            created_at: new Date()
        });

        // Seed file slots
        memoryDb.marketplace_order_files.push(
            {
                file_id: fileIdValid,
                order_id: orderId,
                role: 'INTERIOR_PDF',
                original_name: 'valid_interior.pdf',
                storage_path: tempPdfPath,
                status: 'UPLOADED'
            },
            {
                file_id: fileIdInvalid,
                order_id: orderId,
                role: 'COVER_PDF',
                original_name: 'invalid_cover.pdf',
                storage_path: invalidPdfPath,
                status: 'UPLOADED'
            },
            {
                file_id: fileIdMissing,
                order_id: orderId,
                role: 'OTHER_PDF',
                original_name: 'missing.pdf',
                storage_path: '/some/nonexistent/path/missing.pdf',
                status: 'UPLOADED'
            }
        );
    } else {
        // Seed database
        await db.query(`
            INSERT INTO marketplace_orders (order_id, tenant_id, status)
            VALUES (?, ?, ?)
        `, [orderId, 'ten_customer_bind', 'DRAFT']);
        
        await db.query(`
            INSERT INTO marketplace_order_files (file_id, order_id, role, original_name, storage_path, status)
            VALUES 
            (?, ?, 'INTERIOR_PDF', 'valid_interior.pdf', ?, 'UPLOADED'),
            (?, ?, 'COVER_PDF', 'invalid_cover.pdf', ?, 'UPLOADED'),
            (?, ?, 'OTHER_PDF', 'missing.pdf', ?, 'UPLOADED')
        `, [
            fileIdValid, orderId, tempPdfPath,
            fileIdInvalid, orderId, invalidPdfPath,
            fileIdMissing, orderId, '/some/nonexistent/path/missing.pdf'
        ]);
    }

    // --- TEST 1: Service invocation direct check ---
    console.log('\n[1/3] Testing bindPreflightFromMarketplaceFiles service directly...');
    const serviceRes = await service.bindPreflightFromMarketplaceFiles(orderId, {
        policy: 'OFFSET_MODERN_COATED',
        operatorId: 'test-admin'
    });

    console.log('Service Execution Summary:');
    console.log(JSON.stringify(serviceRes, null, 2));

    // Assertions on service output
    const validResult = serviceRes.results.find(r => r.fileId === fileIdValid);
    const invalidResult = serviceRes.results.find(r => r.fileId === fileIdInvalid);
    const missingResult = serviceRes.results.find(r => r.fileId === fileIdMissing);

    if (validResult && validResult.resolved && validResult.error === null && validResult.preflightJobId === 'job_test_bind_999') {
        console.log('  [PASS] Valid PDF was correctly resolved and bound.');
    } else {
        console.error('  [FAIL] Valid PDF binding failed assertion!');
        process.exit(1);
    }

    if (invalidResult && !invalidResult.resolved && invalidResult.error === 'FILE_STORAGE_UNRESOLVED') {
        console.log('  [PASS] Invalid signature PDF correctly triggered FILE_STORAGE_UNRESOLVED.');
    } else {
        console.error('  [FAIL] Invalid signature PDF assertion failed!');
        process.exit(1);
    }

    if (missingResult && !missingResult.resolved && missingResult.error === 'FILE_STORAGE_UNRESOLVED') {
        console.log('  [PASS] Nonexistent file path correctly triggered FILE_STORAGE_UNRESOLVED.');
    } else {
        console.error('  [FAIL] Nonexistent file path assertion failed!');
        process.exit(1);
    }

    // --- TEST 2: Idempotency check ---
    console.log('\n[2/3] Testing service idempotency (second run)...');
    const serviceResSecond = await service.bindPreflightFromMarketplaceFiles(orderId, {
        policy: 'OFFSET_MODERN_COATED',
        operatorId: 'test-admin'
    });

    const validResultSecond = serviceResSecond.results.find(r => r.fileId === fileIdValid);
    if (validResultSecond && validResultSecond.skipped && validResultSecond.reason === 'already_bound') {
        console.log('  [PASS] Second run skipped already bound slot successfully.');
    } else {
        console.error('  [FAIL] Second run did not skip already bound slot!');
        process.exit(1);
    }

    // --- TEST 3: Express router routing endpoint test ---
    console.log('\n[3/3] Testing admin routes endpoint via local Express server...');
    const app = express();
    app.use(express.json());
    
    // Auth bypass middleware setup matching server.js for admin routes
    app.use((req, res, next) => {
        req.user = { id: 'test-admin-route', role: 'SUPER_ADMIN' };
        next();
    });

    app.use('/api/admin/marketplace/orders', adminMarketplaceOrdersRouter);

    const server = app.listen(TEST_PORT, async () => {
        console.log(`  [OK] Express router test server listening on port ${TEST_PORT}.`);
        
        try {
            // Re-seed or reset valid slot for route request
            if (isMockMode) {
                const file = memoryDb.marketplace_order_files.find(f => f.file_id === fileIdValid);
                if (file) {
                    file.preflight_job_id = null;
                    file.preflight_status = null;
                    file.preflight_outcome_category = null;
                    file.status = 'UPLOADED';
                }
            } else {
                await db.query(`
                    UPDATE marketplace_order_files 
                    SET preflight_job_id = NULL, preflight_status = NULL, preflight_outcome_category = NULL, status = 'UPLOADED'
                    WHERE file_id = ?
                `, [fileIdValid]);
            }

            console.log(`[+] Sending POST to route: ${BASE_URL}/${orderId}/preflight/bind`);
            const response = await axios.post(`${BASE_URL}/${orderId}/preflight/bind`, {
                policy: 'OFFSET_MODERN_COATED'
            }, {
                headers: {
                    Authorization: `Bearer ${BREAK_GLASS_TOKEN}`
                }
            });

            console.log('HTTP Status:', response.status);
            console.log('HTTP Response Body:');
            console.log(JSON.stringify(response.data, null, 2));

            if (response.status === 200 && response.data.ok === true) {
                const resValid = response.data.results.find(r => r.fileId === fileIdValid);
                if (resValid && resValid.resolved && resValid.preflightJobId === 'job_test_bind_999') {
                    console.log('  [PASS] HTTP endpoint route verification passed successfully!');
                } else {
                    throw new Error('Valid PDF was not resolved correctly via HTTP router endpoint');
                }
            } else {
                throw new Error(`HTTP response failed validation check: status=${response.status}`);
            }

            // Cleanup
            fs.unlinkSync(tempPdfPath);
            fs.unlinkSync(invalidPdfPath);
            server.close();
            console.log('\n=============================================================');
            console.log('✨  ALL PREFLIGHT BINDING VERIFICATION TESTS PASSED ✨');
            console.log('=============================================================\n');
            process.exit(0);

        } catch (err) {
            console.error('🔴  HTTP Router Endpoint Verification Test Failed:');
            if (err.response) {
                console.error(`Status: ${err.response.status}`);
                console.error('Body:', err.response.data);
            } else {
                console.error('Error message:', err.message);
            }
            fs.unlinkSync(tempPdfPath);
            fs.unlinkSync(invalidPdfPath);
            server.close();
            process.exit(1);
        }
    });
}

runTests();
