/**
 * scripts/verify_hardened_intake_full.js
 * 
 * Unified Verification for PrintPrice Pro v5.3 Hardened Intake.
 * Simulates the full lifecycle from order declaration to MES dispatch.
 */
const db = require('../src/api/services/mysqlClient');
const ordersService = require('../src/api/services/ordersService');
const ingestionService = require('../src/api/services/productionFileIngestionService');
const validationService = require('../src/api/services/productionFileValidationService');
const invoiceService = require('../src/api/services/invoiceService');
const dispatchGating = require('../src/api/services/MarketplaceDispatchGatingService');
const crypto = require('crypto');

async function run() {
    console.log('--- STARTING HARDENED INTAKE VERIFICATION ---');

    const orderRef = `VERIFY-${Date.now().toString().slice(-6)}`;
    const userId = 'user-verifier';
    const tenantId = 'ppos-production';
    const printhouseId = 'printer-alpha-1'; // Assume this exists in test env

    try {
        // 1. Declare Order with Marketplace Metadata
        console.log(`[1/6] Provisioning order ${orderRef}...`);
        const orderData = {
            order_ref: orderRef,
            user_id: userId,
            tenant_id: tenantId,
            status: 'FILES_PENDING',
            specs: JSON.stringify({ trim_size: '210x297mm', page_count: 100 }),
            metadata_json: {
                production_files: {
                    required: true,
                    INTERIOR_PDF: { source_type: 'DOWNLOAD_URL', url: 'https://example.com/assets/interior.pdf' },
                    COVER_SPINE_BACK_PDF: { source_type: 'UPLOAD' }
                }
            }
        };

        // Industrial provisioning
        const orderId = 12345; // Simulated ID
        await ordersService.provisionHardenedAssets(orderId, orderData);
        console.log('Order repository provisioned.');

        // 2. Ingestion (Simulate Fetch)
        console.log('[2/6] Triggering asset ingestion...');
        // Mocking successful fetch for verification logic pathing
        await db.query(`
            UPDATE production_files 
            SET ingestion_status = 'FETCHED', 
                storage_url = 'test/interior.pdf',
                checksum = 'sha256:fake-hash'
            WHERE order_ref = ? AND kind = 'INTERIOR_PDF'
        `, [orderRef]);
        
        // Mocking upload for second asset
        await db.query(`
            UPDATE production_files 
            SET ingestion_status = 'UPLOADED', 
                storage_url = 'test/cover.pdf',
                checksum = 'sha256:fake-hash'
            WHERE order_ref = ? AND kind = 'COVER_SPINE_BACK_PDF'
        `, [orderRef]);
        console.log('Assets ingested.');

        // 3. Validation Orchestration
        console.log('[3/6] Orchestrating asset validation...');
        const validationResult = await validationService.validateOrderAssets(orderRef);
        console.log(`Validation result: ${validationResult.status}`);

        // 4. Invoice Generation
        console.log('[4/6] Generating invoice...');
        const invoice = await invoiceService.generateOrderInvoice(orderRef);
        console.log(`Invoice generated: ${invoice.invoice_number}`);

        // 5. Payment Simulation
        console.log('[5/6] Simulating payment...');
        await db.query(`
            UPDATE orders 
            SET invoice_payment = JSON_SET(invoice_payment, '$.payment_status', 'PAID')
            WHERE order_ref = ?
        `, [orderRef]);
        console.log('Payment status updated to PAID.');

        // 6. MES Dispatch Gating
        console.log('[6/6] Testing dispatch gating...');
        const context = { userId: 'admin-1', printhouseId: printhouseId, isSuperAdmin: true };
        const dispatch = await dispatchGating.dispatchOrder(orderRef, 'machine-digital-01', context);
        console.log(`Dispatch successful! ID: ${dispatch.dispatch_id}`);

        console.log('--- VERIFICATION SUCCESSFUL ---');
        process.exit(0);
    } catch (err) {
        console.error('--- VERIFICATION FAILED ---');
        console.error(err);
        process.exit(1);
    }
}

run();
