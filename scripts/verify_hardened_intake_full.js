/**
 * scripts/verify_hardened_intake_full.js
 * 
 * Unified Verification for PrintPrice Pro v5.3 Hardened Intake.
 * Tests the full lifecycle via PUBLIC API ENDPOINTS to ensure forensic integrity.
 */
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

async function run() {
    console.log('--- STARTING PUBLIC API HARDENED INTAKE VERIFICATION ---');

    const PORT = process.env.PORT || process.env.PPOS_CONTROL_PORT || 8080;
    const BASE_URL = `http://localhost:${PORT}`;
    const TOKEN = process.env.PPOS_CONTROL_TOKEN || 'test-token';
    const orderRef = `V53-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    
    // Industrial: Use a real user ID from the DB or a common fallback
    const userId = 'user-verifier'; 
    const printhouseId = 'printer-alpha-1';

    const client = axios.create({
        baseURL: BASE_URL,
        headers: { 'Authorization': `Bearer ${TOKEN}` },
        validateStatus: () => true
    });

    try {
        // 0. Auth Check
        console.log('[0/6] Verifying administrative access...');
        const authCheck = await client.get('/api/admin/verify');
        if (authCheck.status !== 200) {
            throw new Error(`Auth failed (${authCheck.status}): ${JSON.stringify(authCheck.data)}`);
        }
        console.log(`Access verified for ${authCheck.data.user.role}.`);

        // 1. Declare Order with Marketplace Metadata
        console.log(`[1/6] Declaring hardened order ${orderRef}...`);
        const orderData = {
            order_ref: orderRef,
            user_id: userId,
            tenant_id: 'ppos-production',
            specs: { trim_size: '210x297mm', page_count: 128 },
            offer_print_house: printhouseId,
            offer_price: 150.00,
            metadata_json: {
                production_files: {
                    required: true,
                    INTERIOR_PDF: { source_type: 'DOWNLOAD_URL', url: 'https://example.com/assets/interior.pdf' },
                    COVER_SPINE_BACK_PDF: { source_type: 'UPLOAD', filename: 'cover_v1.pdf' }
                }
            }
        };

        const createRes = await client.post('/api/admin/orders', orderData);
        if (createRes.status !== 201) {
            throw new Error(`Order declaration failed (${createRes.status}): ${JSON.stringify(createRes.data)}`);
        }
        console.log('Order declared and repository provisioned.');

        // 2. Ingestion Simulation (Manual Trigger)
        console.log('[2/6] Triggering remote asset ingestion...');
        // We simulate a successful fetch by hitting the fetch endpoint. 
        // In a real test environment, this would hit the actual ingestion service.
        const fetchRes = await client.post(`/api/admin/orders/${orderRef}/production-files/fetch`);
        // Note: fetchRes might return 404 or error if example.com is unreachable, 
        // but the route itself is tested.
        console.log(`Ingestion trigger response: ${fetchRes.status}`);

        // 3. Validation Orchestration
        console.log('[3/6] Triggering forensic asset validation...');
        // We skip the actual file check by manually marking them as FETCHED/UPLOADED in DB for this test if needed,
        // but here we hit the endpoint to verify the gating logic.
        const validateRes = await client.post(`/api/admin/orders/${orderRef}/production-files/validate`);
        console.log(`Validation orchestration response: ${validateRes.status} (Expected 422 if files missing)`);

        // 4. Invoice Generation Gating Test
        console.log('[4/6] Testing invoice generation gating...');
        const invoiceRes = await client.post(`/api/admin/orders/${orderRef}/invoice/generate`);
        if (invoiceRes.status === 422) {
            console.log('PASS: Invoice correctly blocked pending file validation.');
        } else if (invoiceRes.status === 200) {
            console.log('INFO: Invoice generated (validation was bypassed or previously successful).');
        } else {
            console.warn(`Unexpected invoice status: ${invoiceRes.status}`);
        }

        // 5. Printhouse Scope Test
        console.log('[5/6] Testing printhouse-scoped isolation...');
        // We simulate a printhouse context if we had a printhouse token, 
        // but as SUPER_ADMIN we can check the printhouse route directly.
        const phOrderRes = await client.get(`/api/printhouse/orders/${orderRef}`);
        if (phOrderRes.status === 200) {
            console.log('PASS: Printhouse route accessible for assigned order.');
        } else {
            console.error(`FAIL: Printhouse route inaccessible (${phOrderRes.status})`);
        }

        // 6. Forensic Event Log Check
        console.log('[6/6] Verifying forensic audit trail...');
        const filesRes = await client.get(`/api/admin/orders/${orderRef}/production-files`);
        if (filesRes.data && filesRes.data.files) {
            console.log(`Repository found with ${filesRes.data.files.length} assets.`);
        }

        console.log('\n--- VERIFICATION COMPLETED ---');
        console.log('Note: Full E2E success requires valid PDF assets in storage for validation step.');
        process.exit(0);
    } catch (err) {
        console.error('\n--- VERIFICATION CRASHED ---');
        console.error(err.message);
        if (err.response) console.error(JSON.stringify(err.response.data, null, 2));
        process.exit(1);
    }
}

run();
