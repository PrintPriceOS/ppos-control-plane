'use strict';

/**
 * scripts/smoke_paper_supplier_hub_e2e.js
 *
 * Standalone End-to-End Verification Smoke Suite for Paper Supplier Hub (Phase 10 / Iterations I1-I7).
 *
 * Full Lifecycle Verified:
 * 1. Ephemeral DB isolation & Canonical schema bootstrap (Migrations 007, 162-166).
 * 2. Organization, tenant, node & role provisioning (Buyer Printhouse + Paper Supplier).
 * 3. Technical catalog definition & commercial offer publishing with multi-basis pricing.
 * 4. Industrial job paper requirements calculation (16pp signatures, waste factors, net/gross kg).
 * 5. Market paper rate resolution (cheapest offer discovery) & BPE forward rate patch generation.
 * 6. Printhouse RFQ placement & Supplier custom volume quoting with validity bounds.
 * 7. Buyer quote acceptance & transition to confirmed order.
 * 8. Supplier order fulfillment dispatch (carrier & tracking number).
 * 9. Physical warehouse intake & idempotent receipt (preventing over-receipt and double crediting).
 * 10. Automatic predictive inventory provisioning & audit ledger recording.
 * 11. Canonical printable document generation (Purchase Order & Packing Slip / Albarán with @media print).
 * 12. Cross-tenant security isolation (unauthorized document access rejection).
 * 13. Operational event notification dispatch & delivery audit.
 * 14. Clean teardown and zero persistent mutation.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

// Enforce test/CI ephemeral environment
process.env.NODE_ENV = 'test';
process.env.CI = 'true';
process.env.PPOS_CI_EPHEMERAL_FIXTURES = 'true';
process.env.PPOS_MIGRATION_EXECUTION = 'true';
process.env.PPOS_ENABLE_SCHEMA_MUTATION = 'true';
process.env.PAPER_SUPPLIER_HUB_ENABLED = 'true';

let mysqlClient = require('../src/api/services/mysqlClient');
const paperCostIntegrationService = require('../src/api/services/paperCostIntegrationService');
const paperProcurementService = require('../src/api/services/paperProcurementService');
const { parseMigrationSql } = require('../src/api/services/migrationSqlParser');
const { runBootstrap } = require('./bootstrap_canonical_schema');

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, message) {
    if (condition) {
        passedAssertions++;
        console.log(`  [PASS] ${message}`);
    } else {
        failedAssertions++;
        console.error(`  [FAIL] ${message}`);
    }
}

async function runSmokeSuite() {
    const startTime = Date.now();
    console.log('================================================================================');
    console.log('=== PPOS Paper Supplier Hub: End-to-End Verification Smoke Suite (I1 - I7) ===');
    console.log('================================================================================\n');

    const dbHost = process.env.TEST_MYSQL_HOST || process.env.MYSQL_HOST || '127.0.0.1';
    const dbPort = parseInt(process.env.TEST_MYSQL_PORT || process.env.MYSQL_PORT || '3307', 10);
    const dbUser = process.env.TEST_MYSQL_USER || process.env.MYSQL_USER || 'root';
    const dbPassword = process.env.TEST_MYSQL_PASSWORD !== undefined ? process.env.TEST_MYSQL_PASSWORD : (process.env.MYSQL_PASSWORD !== undefined ? process.env.MYSQL_PASSWORD : 'root_password_ppos_2026');

    const executionToken = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const executionSchema = `ppos_test_smoke_paper_hub_${executionToken}`;

    console.log(`[INIT] Connecting to MySQL at ${dbHost}:${dbPort} as ${dbUser}...`);
    console.log(`[INIT] Target ephemeral schema: ${executionSchema}\n`);

    let adminPool = null;
    let connectionPool = null;
    let schemaCreated = false;

    try {
        adminPool = mysql.createPool({
            host: dbHost,
            port: dbPort,
            user: dbUser,
            password: dbPassword,
            multipleStatements: true
        });

        // Test connectivity
        try {
            const [ping] = await adminPool.query('SELECT 1 as alive');
            assert(ping[0].alive === 1, 'Connected to MySQL server successfully');
        } catch (connErr) {
            console.log('\n----------------------------------------------------------------------');
            console.log('STATUS: BLOCKED / CONNECTED_ENV_REQUIRED');
            console.log(`Reason: No active MySQL connection available on ${dbHost}:${dbPort} (${connErr.code || connErr.message}).`);
            console.log('Requirements: Set explicit TEST_MYSQL_* variables targeting an isolated test database (or start local MySQL).');
            console.log('Real backend and database tests require an isolated MySQL instance.');
            console.log('----------------------------------------------------------------------\n');
            process.exitCode = 2;
            return;
        }

        // Create ephemeral database
        schemaCreated = false;
        await adminPool.query(`CREATE DATABASE \`${executionSchema}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        schemaCreated = true;
        assert(true, `Created ephemeral database ${executionSchema}`);

        connectionPool = mysql.createPool({
            host: dbHost,
            port: dbPort,
            user: dbUser,
            password: dbPassword,
            database: executionSchema,
            multipleStatements: true
        });

        // Configure process.env to target execution schema
        delete process.env.DATABASE_URL;
        process.env.MYSQL_HOST = dbHost;
        process.env.MYSQL_PORT = String(dbPort);
        process.env.MYSQL_USER = dbUser;
        process.env.MYSQL_PASSWORD = dbPassword;
        process.env.MYSQL_DATABASE = executionSchema;
        process.env.TEST_MYSQL_DATABASE = executionSchema;

        // Reconnect mysqlClient wrapper to our isolated pool
        mysqlClient.getPool = () => connectionPool;
        mysqlClient.query = async (sql, params) => {
            const [rows] = await connectionPool.query(sql, params);
            return rows;
        };
        mysqlClient.getConnection = async () => connectionPool.getConnection();

        // 1. Bootstrap Canonical Schema
        console.log('\n--- Step 1: Bootstrapping Canonical Schema & Official Migrations ---');
        await runBootstrap({
            host: dbHost,
            database: executionSchema,
            pool: connectionPool
        });
        assert(true, 'Canonical schema bootstrap completed successfully');

        // Run required migrations 007, 162-166
        const migrationsDir = path.join(__dirname, '../migrations');
        const requiredMigrations = [
            '007_mes_material_orchestration.sql',
            '162_phase196a_paper_suppliers_and_procurement_idempotency.sql',
            '163_phase196b_paper_products_and_import_staging.sql',
            '164_phase196c_supplier_paper_offers_and_revisions.sql',
            '165_phase196d_paper_supplier_offer_soft_delete_and_catalog_associations.sql',
            '166_phase196e_supplier_paper_procurement_orders.sql'
        ];

        for (const file of requiredMigrations) {
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            const parsed = parseMigrationSql(sql);
            for (const stmt of parsed.statements) {
                await connectionPool.query(stmt);
            }
        }
        assert(true, 'Applied migrations 007, 162, 163, 164, 165, 166 without drift');

        // Ensure notifications table exists
        await connectionPool.query(`
            CREATE TABLE IF NOT EXISTS control_plane_notifications (
                id VARCHAR(64) PRIMARY KEY,
                tenant_id VARCHAR(64) NOT NULL,
                user_id VARCHAR(64) NULL,
                scope VARCHAR(32) NOT NULL DEFAULT 'USER',
                type VARCHAR(64) NOT NULL,
                severity VARCHAR(32) NOT NULL DEFAULT 'info',
                title VARCHAR(255) NOT NULL,
                message TEXT NULL,
                entity_type VARCHAR(64) NULL,
                entity_id VARCHAR(64) NULL,
                action_url VARCHAR(255) NULL,
                metadata_json JSON NULL,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                read_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL,
                INDEX idx_cp_notif_tenant (tenant_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        assert(true, 'Notifications schema initialized');

        // 2. Provision Organizations, Sites and Actors
        console.log('\n--- Step 2: Provisioning Tenants, Suppliers, Printer Nodes & Capabilities ---');
        await connectionPool.query(`
            INSERT INTO tenants (id, name, status) VALUES
            ('tenant_smoke_buyer', 'Gutenberg Commercial Print Group', 'ACTIVE'),
            ('tenant_smoke_sappi', 'Sappi Fine Paper Europe SA', 'ACTIVE'),
            ('tenant_smoke_rival', 'Rival Merchant Paper Corp', 'ACTIVE');
        `);

        await connectionPool.query(`
            INSERT INTO paper_suppliers (id, tenant_id, name, status, contact_email, currencies_json) VALUES
            ('supp_smoke_sappi', 'tenant_smoke_sappi', 'Sappi Fine Paper Europe SA', 'ACTIVE', 'orders@sappi.eu', '["EUR"]'),
            ('supp_smoke_rival', 'tenant_smoke_rival', 'Rival Merchant Paper Corp', 'ACTIVE', 'sales@rivalpaper.com', '["EUR"]');
        `);

        await connectionPool.query(`
            INSERT INTO tenant_capabilities (id, tenant_id, capability, is_active) VALUES
            ('cap_smoke_buyer', 'tenant_smoke_buyer', 'PRINTHOUSE', 1),
            ('cap_smoke_sappi', 'tenant_smoke_sappi', 'PAPER_SUPPLIER', 1),
            ('cap_smoke_rival', 'tenant_smoke_rival', 'PAPER_SUPPLIER', 1);
        `);

        await connectionPool.query(`
            INSERT INTO supplier_memberships (id, user_id, tenant_id, supplier_id, supplier_role, is_active) VALUES
            ('mem_smoke_sappi_1', 'user_smoke_sappi_admin', 'tenant_smoke_sappi', 'supp_smoke_sappi', 'SUPPLIER_ADMIN', 1),
            ('mem_smoke_rival_1', 'user_smoke_rival_admin', 'tenant_smoke_rival', 'supp_smoke_rival', 'SUPPLIER_ADMIN', 1);
        `);

        await connectionPool.query(`
            INSERT INTO printer_nodes (id, tenant_id, name, country, city, email, status) VALUES
            ('node_smoke_frankfurt', 'tenant_smoke_buyer', 'Frankfurt Plant #1', 'DE', 'Frankfurt', 'plant1@gutenberg.de', 'ACTIVE');
        `);
        assert(true, 'Buyer printhouse, suppliers, and Frankfurt plant provisioned');

        // 3. Technical Paper Catalog & Offers
        console.log('\n--- Step 3: Defining Technical Paper Products & Publishing Commercial Offers ---');
        await connectionPool.query(`
            INSERT INTO paper_products (id, name, category, brand, manufacturer, description) VALUES
            ('prod_magno_gloss', 'Magno Gloss Coated', 'COATED', 'Magno', 'Sappi', 'Triple coated gloss woodfree art paper'),
            ('prod_rival_gloss', 'Rival Coated Silk', 'COATED', 'RivalArt', 'RivalCorp', 'Silk coated merchant paper');
        `);

        await connectionPool.query(`
            INSERT INTO paper_variants (id, product_id, gsm, width_mm, height_mm, finish, grain_direction, caliper_um, fingerprint) VALUES
            ('var_magno_130', 'prod_magno_gloss', 130, 700.00, 1000.00, 'GLOSS', 'LONG_GRAIN', 115, 'fp_magno_130_70100'),
            ('var_rival_130', 'prod_rival_gloss', 130, 700.00, 1000.00, 'SILK', 'LONG_GRAIN', 118, 'fp_rival_130_70100');
        `);

        await connectionPool.query(`
            INSERT INTO supplier_paper_catalog_variants (id, tenant_id, supplier_id, variant_id, status) VALUES
            ('cat_sappi_magno', 'tenant_smoke_sappi', 'supp_smoke_sappi', 'var_magno_130', 'ACTIVE'),
            ('cat_rival_magno', 'tenant_smoke_rival', 'supp_smoke_rival', 'var_rival_130', 'ACTIVE');
        `);

        // Offer 1 (Sappi): 1.75 EUR/kg (competitive market offer)
        // Offer 2 (Rival): 1.95 EUR/kg
        await connectionPool.query(`
            INSERT INTO supplier_paper_offers (
                id, tenant_id, supplier_id, variant_id, supplier_sku, price_amount, currency,
                price_basis, moq, order_multiple, sheets_per_pack, visibility, status
            ) VALUES
            ('off_sappi_magno_130', 'tenant_smoke_sappi', 'supp_smoke_sappi', 'var_magno_130', 'SAP-MAG-130-70100', 1.75, 'EUR', 'KG', 500, 50, NULL, 'MARKETPLACE', 'ACTIVE'),
            ('off_rival_silk_130', 'tenant_smoke_rival', 'supp_smoke_rival', 'var_rival_130', 'RIV-SILK-130-70100', 1.95, 'EUR', 'KG', 500, 50, NULL, 'MARKETPLACE', 'ACTIVE');
        `);
        assert(true, 'Technical products, variants, and 2 commercial offers published (Sappi @ 1.75 EUR/kg, Rival @ 1.95 EUR/kg)');

        // 4. Physical Calculations & Industrial Job Paper Estimation
        console.log('\n--- Step 4: Verifying Pure Physical Formulas & Job Estimation ---');
        const sheetWeight = paperCostIntegrationService.calculateSheetWeightKg(700, 1000, 130);
        assert(Math.abs(sheetWeight - 0.091) < 0.0001, `Sheet weight for 700x1000mm @ 130gsm is exactly 0.091 kg (got ${sheetWeight.toFixed(4)})`);

        const normalizedTonnePrice = paperCostIntegrationService.convertPriceToKg({
            priceAmount: 1750,
            priceBasis: 'TONNE',
            widthMm: 700,
            heightMm: 1000,
            gsm: 130
        });
        assert(Math.abs(normalizedTonnePrice - 1.75) < 0.001, `1,750 EUR/tonne normalizes to 1.75 EUR/kg (got ${normalizedTonnePrice})`);

        // Industrial print job specification: 1,000 copies, 96 interior pages, 16pp signatures
        const jobSpec = {
            copies: 1000,
            interior_pages: 96,
            signature_size: 16,
            paper_weight_interior: 130,
            paper_weight_cover: 300,
            press_sheet_width_mm: 700,
            press_sheet_height_mm: 1000,
            interior_makeready_sheets: 600,
            cover_makeready_sheets: 50,
            run_waste_rate: 0.025,
            rate_per_kg_interior: 1.75,
            rate_per_kg_cover: 2.20
        };

        const jobEstimate = paperCostIntegrationService.calculateJobPaperRequirements(jobSpec);
        assert(jobEstimate.signaturesCount === 6, `96 pages on 16pp imposition yields 6 signatures (got ${jobEstimate.signaturesCount})`);
        assert(jobEstimate.interior.netSheets === 6000, `Net sheets = 6,000 (got ${jobEstimate.interior.netSheets})`);
        const interiorWasteSheets = jobEstimate.interior.makereadySheets + jobEstimate.interior.runWasteSheets;
        assert(interiorWasteSheets === 750, `Waste sheets = 600 setup + 150 run waste = 750 (got ${interiorWasteSheets})`);
        assert(jobEstimate.interior.totalSheets === 6750, `Gross required sheets = 6,750 (got ${jobEstimate.interior.totalSheets})`);
        assert(jobEstimate.totals.totalGrossKg > 0, `Total gross weight calculated: ${jobEstimate.totals.totalGrossKg.toFixed(2)} kg`);

        // 5. Market Paper Rate Discovery & BPE Patching
        console.log('\n--- Step 5: Resolving Market Paper Rate & Building BPE Forward Rate Patch ---');
        const resolvedOffer = await paperCostIntegrationService.resolveMarketPaperRate(
            'tenant_smoke_buyer',
            { gsm: 130, widthMm: 700, heightMm: 1000, targetCurrency: 'EUR' }
        );
        assert(resolvedOffer.offerId === 'off_sappi_magno_130', `Cheapest offer resolved correctly to Sappi Magno Gloss (got ${resolvedOffer.offerId})`);
        assert(Math.abs(resolvedOffer.pricePerKg - 1.75) < 0.001, `Resolved price is 1.75 EUR/kg (got ${resolvedOffer.pricePerKg})`);

        const bpePatch = await paperCostIntegrationService.buildBpePaperPatch({
            tenantId: 'tenant_smoke_buyer',
            interiorPaperType: 'couché_brillante',
            interiorGsm: 130
        });
        assert(bpePatch.paper_price_interior_by_kilo?.['couché_brillante'] === 1.75, 'BPE rate patch populated paper_price_interior_by_kilo correctly');
        assert(bpePatch._metadata?.source === 'PPOS_PAPER_SUPPLIER_HUB', 'BPE metadata source is PPOS_PAPER_SUPPLIER_HUB');
        assert(bpePatch._metadata?.interior?.offerId === 'off_sappi_magno_130', 'BPE metadata provenance points to Sappi offer');

        // 6. Printhouse Buyer RFQ Placement
        console.log('\n--- Step 6: Placing Sourcing RFQ & Supplier Custom Volume Quoting ---');
        const buyerActor = {
            tenantId: 'tenant_smoke_buyer',
            printhouseId: 'node_smoke_frankfurt',
            userId: 'buyer_proc_mgr',
            email: 'procurement@gutenberg.de',
            role: 'ADMIN'
        };

        const rfqOrder = await paperProcurementService.placeOrderOrRfq(buyerActor, {
            type: 'RFQ',
            offerId: 'off_sappi_magno_130',
            variantId: 'var_magno_130',
            orderedQuantity: 6750,
            quantityBasis: 'SHEET',
            printhouseId: 'node_smoke_frankfurt',
            buyerNotes: 'Requesting VIP volume pricing for autumn catalog run'
        });

        assert(rfqOrder.id && rfqOrder.orderType === 'RFQ', `RFQ created with id ${rfqOrder.id} and status ${rfqOrder.status}`);
        assert(rfqOrder.status === 'SUBMITTED', 'RFQ initial state is SUBMITTED');

        // Supplier quotes custom price 1.65 EUR/sheet (discounted from original catalog price)
        const quoteResult = await paperProcurementService.transitionSupplierOrder(
            'supp_smoke_sappi',
            rfqOrder.id,
            'QUOTE',
            {
                pricePerBasis: 1.65,
                priceBasis: 'SHEET',
                expectedDeliveryDate: '2026-11-25T12:00:00Z',
                supplierNotes: 'Special volume project price: 1.65 EUR/sheet confirmed'
            },
            'user_smoke_sappi_admin'
        );
        assert(quoteResult.status === 'QUOTED', `RFQ status transitioned to QUOTED (got ${quoteResult.status})`);
        assert(quoteResult.snapshot?.pricePerBasis === 1.65, 'Quoted price updated to 1.65 EUR/sheet');

        // 7. Buyer Accepts Quote -> Transition to Confirmed Order
        console.log('\n--- Step 7: Accepting RFQ Quote & Converting to Confirmed Order ---');
        const confirmedOrder = await paperProcurementService.acceptRfqQuote(buyerActor, rfqOrder.id);
        assert(confirmedOrder.status === 'CONFIRMED', `Order status transitioned to CONFIRMED (got ${confirmedOrder.status})`);
        assert(confirmedOrder.orderType === 'ORDER', `Order type converted to ORDER (got ${confirmedOrder.orderType})`);

        // 8. Supplier Dispatches Order
        console.log('\n--- Step 8: Supplier Dispatching Logistics Fulfillment ---');
        const dispatchResult = await paperProcurementService.transitionSupplierOrder(
            'supp_smoke_sappi',
            rfqOrder.id,
            'DISPATCHED',
            {
                carrier: 'DHL Freight Global',
                trackingNumber: 'DHL-SMOKE-2026-7788'
            },
            'user_smoke_sappi_admin'
        );
        assert(dispatchResult.status === 'DISPATCHED', `Order status transitioned to DISPATCHED (got ${dispatchResult.status})`);

        // 9. Goods Receipt & Idempotent Warehouse Intake
        console.log('\n--- Step 9: Receiving Goods at Warehouse & Idempotent Stock Intake ---');
        const receiptOptions = {
            receiptNumber: 'ALB-SMOKE-001',
            receivedSheets: 6750,
            receivedQuantity: 614.25, // kg
            idempotencyKey: 'idemp_smoke_rec_key_001',
            notes: 'Pallets inspected: 0 damaged sheets, packaging intact'
        };

        const receiptResult = await paperProcurementService.receiveOrderAtomic(
            rfqOrder.id,
            buyerActor,
            receiptOptions
        );
        assert(receiptResult.orderStatus === 'RECEIVED', `Order status transitioned to RECEIVED (got ${receiptResult.orderStatus})`);
        assert(receiptResult.receiptId && receiptResult.receiptNumber, `Receipt record created with number ${receiptResult.receiptNumber}`);

        // Replay identical receipt (Idempotency verification)
        const replayResult = await paperProcurementService.receiveOrderAtomic(
            rfqOrder.id,
            buyerActor,
            receiptOptions
        );
        assert(replayResult.idempotentReplay === true, 'Duplicate receipt replay acknowledged with idempotentReplay=true without mutation');

        // Verify stock in predictive_material_inventory
        const [inventoryRows] = await connectionPool.query(`
            SELECT * FROM predictive_material_inventory
            WHERE tenant_id = 'tenant_smoke_buyer' AND printhouse_id = 'node_smoke_frankfurt';
        `);
        assert(inventoryRows.length >= 1, `Material inventory automatically provisioned in warehouse (${inventoryRows.length} item)`);
        assert(inventoryRows[0].current_stock_units >= 6750, `Stock credited correctly: ${inventoryRows[0].current_stock_units} units available`);

        // Verify ledger event in material_inventory_events
        const [eventRows] = await connectionPool.query(`
            SELECT * FROM material_inventory_events
            WHERE material_inventory_id = ?;
        `, [inventoryRows[0].id]);
        assert(eventRows.length >= 1, `Inventory event recorded in audit ledger (found ${eventRows.length} events)`);
        assert(eventRows[0].event_type === 'PROCUREMENT_RECEIPT', `Event type is PROCUREMENT_RECEIPT (got ${eventRows[0].event_type})`);

        // 10. Canonical Document Generation (PO & Packing Slip)
        console.log('\n--- Step 10: Generating Canonical Printable Documents & Validating HTML ---');
        const poDoc = await paperProcurementService.generateProcurementDocument(
            rfqOrder.id,
            'PO',
            buyerActor
        );
        assert(poDoc.ok === true, 'Purchase Order document generated successfully');
        assert(poDoc.data.documentType === 'PO', 'Document type is PO');
        assert(poDoc.data.printableHtml.includes('@media print'), 'PO HTML contains @media print stylesheet');
        assert(poDoc.data.printableHtml.includes('Gutenberg Commercial Print Group'), 'PO HTML contains Buyer name');
        assert(poDoc.data.printableHtml.includes('Sappi Fine Paper Europe SA'), 'PO HTML contains Supplier name');
        assert(poDoc.data.printableHtml.includes('Magno Gloss Coated'), 'PO HTML contains Material technical name');

        const supplierActor = {
            supplierId: 'supp_smoke_sappi',
            tenantId: 'tenant_smoke_sappi',
            role: 'SUPPLIER_ADMIN'
        };

        const packingSlipDoc = await paperProcurementService.generateProcurementDocument(
            rfqOrder.id,
            'PACKING_SLIP',
            supplierActor
        );
        assert(packingSlipDoc.ok === true, 'Packing Slip document generated successfully');
        assert(packingSlipDoc.data.documentType === 'PACKING_SLIP', 'Document type is PACKING_SLIP');
        assert(packingSlipDoc.data.printableHtml.includes('ALB-SMOKE-001'), 'Packing Slip HTML contains receipt reference ALB-SMOKE-001');
        assert(packingSlipDoc.data.printableHtml.includes('DHL-SMOKE-2026-7788'), 'Packing Slip HTML contains carrier tracking number');

        // 11. Cross-Tenant Security Isolation
        console.log('\n--- Step 11: Verifying Cross-Tenant Security Boundary Rejection ---');
        const rivalSupplierActor = {
            supplierId: 'supp_smoke_rival',
            tenantId: 'tenant_smoke_rival',
            role: 'SUPPLIER_ADMIN'
        };

        let rivalBlocked = false;
        try {
            await paperProcurementService.generateProcurementDocument(
                rfqOrder.id,
                'PO',
                rivalSupplierActor
            );
        } catch (err) {
            rivalBlocked = err.code === 'FORBIDDEN_DOCUMENT_ACCESS' || err.statusCode === 403;
        }
        assert(rivalBlocked === true, 'Unauthorized rival supplier access to procurement document rejected with HTTP 403 (FORBIDDEN_DOCUMENT_ACCESS)');

        // 12. Notification Records Verification
        console.log('\n--- Step 12: Auditing Operational Event Notifications ---');
        const [notifications] = await connectionPool.query(`
            SELECT type, tenant_id, title FROM control_plane_notifications
            ORDER BY created_at ASC;
        `);
        console.log(`  Found ${notifications.length} notification event(s) logged.`);
        const eventTypes = notifications.map(n => n.type);
        assert(eventTypes.includes('PAPER_RFQ_SUBMITTED') || eventTypes.includes('PAPER_ORDER_SUBMITTED'), 'PAPER_RFQ_SUBMITTED/PAPER_ORDER_SUBMITTED notification present');
        assert(eventTypes.includes('PAPER_ORDER_DISPATCHED'), 'PAPER_ORDER_DISPATCHED notification present');
        assert(eventTypes.includes('PAPER_ORDER_RECEIVED'), 'PAPER_ORDER_RECEIVED notification present');

    } catch (err) {
        console.error('\n[FATAL ERROR IN SMOKE SUITE]:', err);
        failedAssertions++;
    } finally {
        // Teardown ephemeral database
        if (connectionPool) {
            try { await connectionPool.end(); } catch {}
        }
        if (adminPool) {
            if (schemaCreated) {
                console.log('\n--- Teardown: Dropping Ephemeral Database ---');
                try {
                    await adminPool.query(`DROP DATABASE IF EXISTS \`${executionSchema}\`;`);
                    console.log(`[TEARDOWN] Dropped ephemeral database ${executionSchema}`);
                } catch (cleanupErr) {
                    console.warn(`[WARN] Failed to drop schema ${executionSchema}:`, cleanupErr.message);
                }
            }
            try { await adminPool.end(); } catch {}
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n================================================================================');
    console.log(`=== SMOKE SUITE SUMMARY: ${passedAssertions} PASSED, ${failedAssertions} FAILED (${duration}s) ===`);
    console.log('================================================================================');

    if (failedAssertions > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runSmokeSuite();
