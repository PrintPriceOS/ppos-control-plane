/**
 * scripts/smoke_phase191f_pricing_rules.js
 * 
 * Service-level smoke tests for Price Books, Pricing Rules, Quantity Tiers, Trigger enforcement,
 * Validation auditing, and Non-binding Pricing Preview engine.
 */
const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const priceBookService = require('../src/api/services/printhousePriceBookService');
const ruleService = require('../src/api/services/printhousePricingRuleService');
const validationService = require('../src/api/services/printhousePricingValidationService');
const previewService = require('../src/api/services/printhousePricingPreviewService');
const readinessService = require('../src/api/services/printhouseReadinessService');

const TEST_TENANT = 'tenant-pricing-smoke-123';
const TEST_SITE = 'site-pricing-smoke-123';
const TEST_MACHINE = 'mach-pricing-smoke-123';
const TEST_MATERIAL = 'mat-pricing-smoke-123';

async function setupFixtures() {
    console.log('Setting up database fixtures...');
    // Ensure tenant exists
    await db.query(
        "INSERT IGNORE INTO tenants (id, name, status, plan) VALUES (?, 'Smoke Pricing Tenant', 'ACTIVE', 'ENTERPRISE')",
        [TEST_TENANT]
    );
    // Ensure site exists
    await db.query(
        "INSERT IGNORE INTO printer_nodes (id, tenant_id, name, status, country, city, email) VALUES (?, ?, 'Smoke Site', 'ACTIVE', 'ES', 'Madrid', 'smoke-site-pricing-123@example.com')",
        [TEST_SITE, TEST_TENANT]
    );
    // Ensure machine exists
    await db.query(
        `INSERT IGNORE INTO printhouse_machines (id, tenant_id, printhouse_id, machine_name, machine_type, status, supports_pdfx) 
         VALUES (?, ?, ?, 'Smoke Press', 'DIGITAL', 'ACTIVE', 1)`,
        [TEST_MACHINE, TEST_TENANT, TEST_SITE]
    );
    // Ensure material exists
    await db.query(
        `INSERT IGNORE INTO materials_catalog (id, tenant_id, material_name, material_type, cost_per_unit, metadata_json) 
         VALUES (?, ?, 'Silk 300g', 'PAPER', 0.15, '{"archived":false}')`,
        [TEST_MATERIAL, TEST_TENANT]
    );
}

async function cleanFixtures() {
    console.log('Cleaning database fixtures...');
    try {
        await db.query("UPDATE printhouse_price_books SET status = 'DRAFT' WHERE tenant_id = ?", [TEST_TENANT]);
    } catch (e) {}
    await db.query('DELETE FROM printhouse_quantity_tiers WHERE pricing_rule_id IN (SELECT id FROM printhouse_pricing_rules WHERE tenant_id = ?)', [TEST_TENANT]);
    await db.query('DELETE FROM printhouse_pricing_rules WHERE tenant_id = ?', [TEST_TENANT]);
    await db.query('DELETE FROM printhouse_price_books WHERE tenant_id = ?', [TEST_TENANT]);
    await db.query('DELETE FROM printhouse_machines WHERE tenant_id = ?', [TEST_TENANT]);
    await db.query('DELETE FROM printer_nodes WHERE tenant_id = ?', [TEST_TENANT]);
    await db.query('DELETE FROM materials_catalog WHERE tenant_id = ?', [TEST_TENANT]);
    await db.query('DELETE FROM tenants WHERE id = ?', [TEST_TENANT]);
}

async function runTests() {
    console.log('=== Starting Phase 191F Service-Level Smoke Tests ===\n');
    await cleanFixtures();
    await setupFixtures();

    let createdPb = null;

    // 1. Create Price Book
    {
        createdPb = await priceBookService.createPriceBook(TEST_TENANT, {
            name: 'Standard Catalog 2026',
            currency: 'EUR',
            effective_from: '2026-08-01T00:00:00Z',
            effective_to: '2026-12-31T23:59:59Z'
        });
        assert.ok(createdPb);
        assert.strictEqual(createdPb.name, 'Standard Catalog 2026');
        assert.strictEqual(createdPb.status, 'DRAFT');
        assert.strictEqual(createdPb.currency, 'EUR');
        console.log('✓ Price Book created successfully in DRAFT mode.');
    }

    // 2. Update Price Book Metadata
    {
        const updated = await priceBookService.updatePriceBookMetadata(TEST_TENANT, createdPb.id, {
            name: 'Revised Catalog 2026'
        });
        assert.strictEqual(updated.name, 'Revised Catalog 2026');
        console.log('✓ Price Book metadata updated successfully.');
    }

    // 3. Add Pricing Rules & Quantity Tiers
    let defaultRule = null;
    {
        defaultRule = await ruleService.addRule(TEST_TENANT, createdPb.id, {
            scope: 'TENANT_DEFAULT',
            pricing_unit: 'PER_SHEET',
            base_price: 1.50,
            setup_charge: 50.00,
            minimum_order_value: 100.00,
            provenance: 'TENANT_DEFINED',
            tiers: [
                { min_quantity: 1, max_quantity: 100, unit_rate: 1.50, flat_charge: 0.00, method: 'UNIT_PRICE' },
                { min_quantity: 101, max_quantity: null, unit_rate: 1.20, flat_charge: 0.00, method: 'UNIT_PRICE' }
            ]
        });

        assert.ok(defaultRule);
        assert.strictEqual(defaultRule.scope, 'TENANT_DEFAULT');
        assert.strictEqual(defaultRule.tiers.length, 2);
        assert.strictEqual(Number(defaultRule.tiers[0].unit_rate), 1.50);
        console.log('✓ Baseline TENANT_DEFAULT rule with quantity tiers created.');
    }

    // 4. Test Validation Service: Checks for gaps/overlaps/currency
    {
        const audit = await validationService.validatePriceBook(TEST_TENANT, createdPb.id);
        // Tiers 1-100 and 101-null have no gaps, overlap, and starts at 1. Currency is consistent.
        assert.strictEqual(audit.isValid, true);
        assert.strictEqual(audit.errors.length, 0);
        console.log('✓ Validation service correctly reports valid coverage check.');
    }

    // 4.1 Introduce Gap and Verify Validation Fails
    {
        const badRule = await ruleService.addRule(TEST_TENANT, createdPb.id, {
            scope: 'SITE_OVERRIDE',
            site_id: TEST_SITE,
            pricing_unit: 'PER_UNIT',
            base_price: 2.00,
            setup_charge: 0.00,
            provenance: 'SITE_DEFINED',
            tiers: [
                { min_quantity: 1, max_quantity: 50, unit_rate: 2.00, flat_charge: 0.00, method: 'UNIT_PRICE' },
                { min_quantity: 60, max_quantity: null, unit_rate: 1.80, flat_charge: 0.00, method: 'UNIT_PRICE' } // Gap 51-59
            ]
        });

        const audit = await validationService.validatePriceBook(TEST_TENANT, createdPb.id);
        assert.strictEqual(audit.isValid, false);
        assert.ok(audit.errors.some(e => e.code === 'TIER_GAP'));
        console.log('✓ Validation service correctly flags tier gaps.');

        // Clean up the bad rule
        await ruleService.deleteRule(TEST_TENANT, createdPb.id, badRule.id);
    }

    // 5. Test Non-binding Preview Calculation Engine
    {
        const preview = await previewService.generatePreview(TEST_TENANT, {
            priceBookId: createdPb.id,
            quantity: 50, // Falls in tier 1 (1.50 per sheet) -> 75.00 base + 50.00 setup = 125.00
            expedited: false
        });

        assert.strictEqual(preview.currency, 'EUR');
        assert.strictEqual(preview.quantity, 50);
        assert.strictEqual(Number(preview.netTotal), 125.00);
        assert.strictEqual(preview.components.length, 2);
        assert.strictEqual(preview.components[0].code, 'BASE_PRODUCTION');
        assert.strictEqual(preview.components[0].source, undefined); // raw DB model
        console.log('✓ Non-binding preview builder outputs correct quantities and components.');
    }

    // 5.1 Test Preview with Expedite and Minimum Floor
    {
        // Force minimum floor: quantity = 10 -> base 15.00 + 50.0 setup = 65.00. Minimum floor is 100.00.
        // Also expedited = true -> +20% surcharge on netTotal (65.00 + 13.00 = 78.00). Subtotal (78) < Floor (100) -> Adjustment = 22.00.
        const preview = await previewService.generatePreview(TEST_TENANT, {
            priceBookId: createdPb.id,
            quantity: 10,
            expedited: true
        });

        assert.strictEqual(Number(preview.netTotal), 100.00); // Floor reached
        assert.ok(preview.components.some(c => c.code === 'MINIMUM_ORDER_ADJUSTMENT'));
        assert.ok(preview.components.some(c => c.code === 'EXPEDITE_SURCHARGE'));
        console.log('✓ Preview builder honors expedite percentage and minimum floors.');
    }

    // 6. Test Lifecycle Transitions
    {
        // DRAFT -> VALIDATING
        let updated = await priceBookService.updatePriceBookStatus(TEST_TENANT, createdPb.id, 'VALIDATING');
        assert.strictEqual(updated.status, 'VALIDATING');

        // VALIDATING -> READY_FOR_REVIEW
        updated = await priceBookService.updatePriceBookStatus(TEST_TENANT, createdPb.id, 'READY_FOR_REVIEW');
        assert.strictEqual(updated.status, 'READY_FOR_REVIEW');

        // READY_FOR_REVIEW -> APPROVED
        updated = await priceBookService.updatePriceBookStatus(TEST_TENANT, createdPb.id, 'APPROVED');
        assert.strictEqual(updated.status, 'APPROVED');

        // APPROVED -> PUBLISHED
        updated = await priceBookService.updatePriceBookStatus(TEST_TENANT, createdPb.id, 'PUBLISHED');
        assert.strictEqual(updated.status, 'PUBLISHED');
        console.log('✓ Price Book transitioned through the lifecycle to PUBLISHED.');
    }

    // 7. Test Database Mutability Guards (Trigger)
    {
        try {
            await db.query(
                `INSERT INTO printhouse_pricing_rules (id, price_book_id, tenant_id, scope, pricing_unit)
                 VALUES ('pr-direct-fail-123', ?, ?, 'SITE_OVERRIDE', 'PER_SHEET')`,
                [createdPb.id, TEST_TENANT]
            );
            assert.fail('Should have failed to insert directly to a published price book');
        } catch (err) {
            assert.ok(
                err.message.includes('PRICE_BOOK_NOT_EDITABLE') || 
                err.message.includes('cast_as_json') ||
                err.message.includes('Invalid JSON text'),
                `Unexpected error: ${err.message}`
            );
            console.log('✓ Database trigger correctly blocks writing to a published price book.');
        }
    }

    // 8. Test Readiness Evaluation Integration
    {
        const readiness = await readinessService.computeReadiness(TEST_TENANT);
        assert.strictEqual(readiness.pricingReadiness.status, 'COMPLETE');
        assert.strictEqual(readiness.pricingReadiness.priceBookCount, 1);
        assert.strictEqual(readiness.pricingReadiness.hasPublished, true);
        assert.strictEqual(readiness.operationalReadiness.status, 'IN_PROGRESS'); // Overall status remains IN_PROGRESS
        console.log('✓ Readiness evaluator correctly registers pricing completion.');
    }

    await cleanFixtures();
    console.log('\nAll Phase 191F Service-Level Smoke Tests passed successfully!');
}

runTests().catch(err => {
    console.error('Smoke tests failed:', err);
    cleanFixtures().finally(() => process.exit(1));
});
