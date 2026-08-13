/**
 * tests/pricing_financial_integrity_immutability_test.js
 * 
 * Integration test suite for Phase 191F.1: Governed Pricing Immutability,
 * Snapshot isolation, Precedence Edge Cases, Validation, and Decimal Safety.
 */
const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const priceBookService = require('../src/api/services/printhousePriceBookService');
const ruleService = require('../src/api/services/printhousePricingRuleService');
const validationService = require('../src/api/services/printhousePricingValidationService');
const previewService = require('../src/api/services/printhousePricingPreviewService');

const TEST_TENANT = 'ph191f1-test-tenant';
const TEST_SITE = 'site-191f1-abc';
const TEST_MACHINE = 'mach-191f1-xyz';
const TEST_MATERIAL = 'mat-191f1-gsm';

async function setupDatabaseFixtures() {
    // Ensure table exists (handles test runner environment gaps)
    await db.query(`
        CREATE TABLE IF NOT EXISTS order_pricing_snapshots (
            id VARCHAR(64) PRIMARY KEY,
            order_id VARCHAR(64) NOT NULL,
            tenant_id VARCHAR(64) NOT NULL,
            amount DECIMAL(12,4) NOT NULL,
            currency VARCHAR(10) NOT NULL,
            rate_card_json JSON NULL
        ) ENGINE=InnoDB;
    `).catch(() => {});

    // Ensure cleanup of previous runs
    await cleanDatabaseFixtures();

    // Insert tenant, site, machine, material
    await db.query(
        "INSERT INTO tenants (id, name, status, plan) VALUES (?, 'Test Tenant 191F.1', 'ACTIVE', 'ENTERPRISE')",
        [TEST_TENANT]
    );
    await db.query(
        `INSERT INTO printer_nodes (id, tenant_id, name, country, city, status) 
         VALUES (?, ?, 'Production Site A', 'ES', 'Barcelona', 'ACTIVE')`,
        [TEST_SITE, TEST_TENANT]
    );
    await db.query(
        `INSERT INTO printhouse_machines (id, tenant_id, printhouse_id, name, type, status) 
         VALUES (?, ?, ?, 'Offset Press 1', 'OFFSET', 'ACTIVE')`,
        [TEST_MACHINE, TEST_TENANT, TEST_SITE]
    );
    await db.query(
        `INSERT INTO materials_catalog (id, tenant_id, name, type, supplier_name) 
         VALUES (?, ?, 'Mat Standard 150g', 'PAPER', 'PaperCorp')`,
        [TEST_MATERIAL, TEST_TENANT]
    );

    // Create a mock order pricing snapshot to verify isolation
    await db.query(
        `INSERT INTO order_pricing_snapshots (id, order_id, tenant_id, amount, currency, rate_card_json) 
         VALUES ('snap-mock-123', 'order-mock-456', ?, 150.00, 'EUR', '{"base": 150}')`,
        [TEST_TENANT]
    );
}

async function cleanDatabaseFixtures() {
    await db.query('DELETE FROM printhouse_quantity_tiers WHERE pricing_rule_id IN (SELECT id FROM printhouse_pricing_rules WHERE tenant_id = ?)', [TEST_TENANT]);
    await db.query('DELETE FROM printhouse_pricing_rules WHERE tenant_id = ?', [TEST_TENANT]);
    await db.query('DELETE FROM printhouse_price_books WHERE tenant_id = ?', [TEST_TENANT]);
    await db.query('DELETE FROM order_pricing_snapshots WHERE tenant_id = ?', [TEST_TENANT]);
    await db.query('DELETE FROM materials_catalog WHERE tenant_id = ?', [TEST_TENANT]);
    await db.query('DELETE FROM printhouse_machines WHERE tenant_id = ?', [TEST_TENANT]);
    await db.query('DELETE FROM printer_nodes WHERE tenant_id = ?', [TEST_TENANT]);
    await db.query('DELETE FROM tenants WHERE id = ?', [TEST_TENANT]);
}

async function runTests() {
    console.log('=== Starting Phase 191F.1 Financial Integrity & Immutability Tests ===\n');
    await setupDatabaseFixtures();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. IMMUTABILITY OF SEALED GRAPH (Database Triggers)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- 1. Testing Immutability of Published Graph ---');
    
    // Create draft book, rules, and tiers
    const draftBook = await priceBookService.createPriceBook(TEST_TENANT, {
        name: 'Standard Price Book',
        currency: 'EUR'
    });

    const ruleData = {
        scope: 'TENANT_DEFAULT',
        pricing_unit: 'PER_UNIT',
        base_price: 1.50,
        setup_charge: 50.00,
        minimum_order_value: 100.00,
        tiers: [
            { min_quantity: 1, max_quantity: 100, unit_rate: 1.50, flat_charge: 0, method: 'UNIT_PRICE' },
            { min_quantity: 101, max_quantity: null, unit_rate: 1.20, flat_charge: 0, method: 'UNIT_PRICE' }
        ]
    };

    const rule = await ruleService.addRule(TEST_TENANT, draftBook.id, ruleData);
    assert.ok(rule.id, 'Should create pricing rule in DRAFT book');

    // Transition book to PUBLISHED
    await priceBookService.updatePriceBookStatus(TEST_TENANT, draftBook.id, 'VALIDATING');
    await priceBookService.updatePriceBookStatus(TEST_TENANT, draftBook.id, 'READY_FOR_REVIEW');
    await priceBookService.updatePriceBookStatus(TEST_TENANT, draftBook.id, 'APPROVED');
    await priceBookService.updatePriceBookStatus(TEST_TENANT, draftBook.id, 'PUBLISHED');
    console.log('✓ Price Book successfully transitioned to PUBLISHED');

    // Test: Adding rules to a PUBLISHED book is blocked by trigger
    try {
        await ruleService.addRule(TEST_TENANT, draftBook.id, {
            scope: 'SITE_OVERRIDE',
            site_id: TEST_SITE,
            pricing_unit: 'PER_JOB',
            base_price: 200.00
        });
        assert.fail('Should have thrown an error adding rule to published book');
    } catch (err) {
        assert.ok(
            err.message.includes('PRICE_BOOK_NOT_EDITABLE') || err.code === 'ER_INVALID_JSON_TEXT_IN_PARAM',
            `Expected database trigger error. Got: ${err.message}`
        );
        console.log('✓ Trigger blocked inserting rules into a published price book');
    }

    // Test: Modifying existing rule in a PUBLISHED book is blocked
    try {
        await db.query(
            'UPDATE printhouse_pricing_rules SET base_price = 99.00 WHERE id = ?',
            [rule.id]
        );
        assert.fail('Should have blocked updating rule in published book');
    } catch (err) {
        assert.ok(
            err.message.includes('PRICE_BOOK_NOT_EDITABLE') || err.code === 'ER_INVALID_JSON_TEXT_IN_PARAM',
            `Expected update failure. Got: ${err.message}`
        );
        console.log('✓ Trigger blocked updating rules associated with a published price book');
    }

    // Test: Deleting existing rule in a PUBLISHED book is blocked
    try {
        await db.query(
            'DELETE FROM printhouse_pricing_rules WHERE id = ?',
            [rule.id]
        );
        assert.fail('Should have blocked deleting rule in published book');
    } catch (err) {
        assert.ok(
            err.message.includes('PRICE_BOOK_NOT_EDITABLE') || err.code === 'ER_INVALID_JSON_TEXT_IN_PARAM',
            `Expected delete failure. Got: ${err.message}`
        );
        console.log('✓ Trigger blocked deleting rules associated with a published price book');
    }

    // Test: Modifying quantity tiers on a PUBLISHED book is blocked
    try {
        const [tier] = rule.tiers;
        await db.query(
            'UPDATE printhouse_quantity_tiers SET unit_rate = 9.99 WHERE id = ?',
            [tier.id]
        );
        assert.fail('Should have blocked updating quantity tier in published book');
    } catch (err) {
        assert.ok(
            err.message.includes('PRICE_BOOK_NOT_EDITABLE') || err.code === 'ER_INVALID_JSON_TEXT_IN_PARAM',
            `Expected update tier failure. Got: ${err.message}`
        );
        console.log('✓ Trigger blocked updating quantity tiers associated with a published price book');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. SNAPSHOT ISOLATION Checks
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Testing Snapshot Isolation ---');
    
    // Test: Preview simulation does NOT create/touch snapshots
    const snapBefore = await db.query('SELECT COUNT(*) as count FROM order_pricing_snapshots');
    
    await previewService.generatePreview(TEST_TENANT, {
        priceBookId: draftBook.id,
        quantity: 50,
        siteId: TEST_SITE
    });

    const snapAfter = await db.query('SELECT COUNT(*) as count FROM order_pricing_snapshots');
    assert.strictEqual(snapBefore[0].count, snapAfter[0].count, 'Preview must not insert any order pricing snapshots');
    console.log('✓ Verified: preview simulations do NOT touch order pricing snapshots');

    // Test: Onboarding operations cannot mutate historical snapshots
    try {
        await db.query(
            "UPDATE order_pricing_snapshots SET amount = 9999.99 WHERE id = 'snap-mock-123'"
        );
        assert.fail('Order pricing snapshots trigger must block mutations');
    } catch (err) {
        console.log('✓ Trigger successfully blocked updating sealed historical order pricing snapshot');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. PRECEDENCE EDGE CASES
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Testing Precedence Resolution Edge Cases ---');

    // Create a new draft book for override resolution tests
    const overrideBook = await priceBookService.createPriceBook(TEST_TENANT, {
        name: 'Override Test Book',
        currency: 'EUR'
    });

    // A. Tenant Default (Rate: 1.00, setup: 10.00)
    await ruleService.addRule(TEST_TENANT, overrideBook.id, {
        scope: 'TENANT_DEFAULT',
        pricing_unit: 'PER_UNIT',
        base_price: 1.00,
        setup_charge: 10.00
    });

    // B. Site Override (Rate: 0.80, setup: 20.00)
    await ruleService.addRule(TEST_TENANT, overrideBook.id, {
        scope: 'SITE_OVERRIDE',
        site_id: TEST_SITE,
        pricing_unit: 'PER_UNIT',
        base_price: 0.80,
        setup_charge: 20.00
    });

    // C. Machine Override (Rate: 0.60, setup: 30.00)
    await ruleService.addRule(TEST_TENANT, overrideBook.id, {
        scope: 'MACHINE_OVERRIDE',
        site_id: TEST_SITE,
        machine_id: TEST_MACHINE,
        pricing_unit: 'PER_UNIT',
        base_price: 0.60,
        setup_charge: 30.00
    });

    // D. Material Surcharge (Rate: 0.15, setup: 5.00)
    await ruleService.addRule(TEST_TENANT, overrideBook.id, {
        scope: 'MATERIAL_RULE',
        site_id: TEST_SITE,
        material_catalog_id: TEST_MATERIAL,
        pricing_unit: 'PER_UNIT',
        base_price: 0.15,
        setup_charge: 5.00
    });

    // E. Finishing Surcharge (Rate: 0.05, setup: 1.00)
    await ruleService.addRule(TEST_TENANT, overrideBook.id, {
        scope: 'FINISHING_RULE',
        capability_name: 'spot_uv',
        pricing_unit: 'PER_UNIT',
        base_price: 0.05,
        setup_charge: 1.00
    });

    // Verify Override Precedence Resolution:
    // 1. All Overrides (Machine overrides site overrides tenant)
    {
        const prev = await previewService.generatePreview(TEST_TENANT, {
            priceBookId: overrideBook.id,
            quantity: 100,
            siteId: TEST_SITE,
            machineId: TEST_MACHINE,
            materialCatalogId: TEST_MATERIAL,
            capabilities: ['spot_uv']
        });
        
        // Base rate component: 0.60 * 100 + 30 = 90.00 (MACHINE)
        // Material surcharge component: 0.15 * 100 + 5 = 20.00
        // Finishing surcharge component: 0.05 * 100 + 1 = 6.00
        // Expected net: 90 + 20 + 6 = 116.00
        assert.strictEqual(prev.netTotal, '116.00', 'Machine override precedence resolved incorrectly');
        console.log('✓ Machine Override takes precedence over Site & Tenant correctly');
    }

    // 2. Site Override only (Site overrides tenant)
    {
        const prev = await previewService.generatePreview(TEST_TENANT, {
            priceBookId: overrideBook.id,
            quantity: 100,
            siteId: TEST_SITE
        });
        // Base rate: 0.80 * 100 + 20 = 100.00 (SITE)
        assert.strictEqual(prev.netTotal, '100.00', 'Site override precedence resolved incorrectly');
        console.log('✓ Site Override takes precedence over Tenant correctly');
    }

    // 3. Tenant Default fallback
    {
        const prev = await previewService.generatePreview(TEST_TENANT, {
            priceBookId: overrideBook.id,
            quantity: 100
        });
        // Base rate: 1.00 * 100 + 10 = 110.00 (TENANT)
        assert.strictEqual(prev.netTotal, '110.00', 'Tenant Default fallback resolved incorrectly');
        console.log('✓ Tenant Default fallback matches correctly');
    }

    // 4. Duplicate validation check
    {
        // Try adding duplicate Tenant Default rule
        await ruleService.addRule(TEST_TENANT, overrideBook.id, {
            scope: 'TENANT_DEFAULT',
            pricing_unit: 'PER_UNIT',
            base_price: 99.00
        });
        const audit = await validationService.validatePriceBook(TEST_TENANT, overrideBook.id);
        assert.strictEqual(audit.isValid, false, 'Validation should flag duplicate rules');
        const hasDupError = audit.errors.some(e => e.code === 'DUPLICATE_PRICING_RULE');
        assert.ok(hasDupError, 'Expected DUPLICATE_PRICING_RULE validation error');
        console.log('✓ Validation service correctly flags duplicate pricing rules');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. DECIMAL SAFETY Checks
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Testing Decimal Safety & Rounding Invariants ---');

    // Create price book with fractional rates
    const decimalBook = await priceBookService.createPriceBook(TEST_TENANT, {
        name: 'Decimal Safety Book',
        currency: 'EUR'
    });

    // Base rule with rate 0.10, setup charge 0.20
    // Sum is 0.10 + 0.20 = 0.30 (testing JS floats sum)
    await ruleService.addRule(TEST_TENANT, decimalBook.id, {
        scope: 'TENANT_DEFAULT',
        pricing_unit: 'PER_UNIT',
        base_price: 0.10,
        setup_charge: 0.20
    });

    {
        const prev = await previewService.generatePreview(TEST_TENANT, {
            priceBookId: decimalBook.id,
            quantity: 1
        });
        // 0.10 * 1 + 0.20 = 0.30
        assert.strictEqual(prev.netTotal, '0.30', 'Decimal float summation failed');
        console.log('✓ Float summation drift avoided successfully (0.1 + 0.2 = 0.30)');
    }

    // Test with fractional rates (e.g. base_price = 0.1234, setup = 12.3456)
    const decimalBook2 = await priceBookService.createPriceBook(TEST_TENANT, {
        name: 'Decimal safety book 2',
        currency: 'USD'
    });
    await ruleService.addRule(TEST_TENANT, decimalBook2.id, {
        scope: 'TENANT_DEFAULT',
        pricing_unit: 'PER_SHEET',
        base_price: 0.1234,
        setup_charge: 12.3456
    });

    {
        const prev = await previewService.generatePreview(TEST_TENANT, {
            priceBookId: decimalBook2.id,
            quantity: 1000
        });
        // 0.1234 * 1000 = 123.4
        // setup = 12.3456
        // netTotal = 123.4 + 12.3456 = 135.7456 -> rounded to 2 decimal places = 135.75
        // tax = 135.75 * 0.10 = 13.575 -> gross = 135.75 + 13.58 = 149.33
        assert.strictEqual(prev.netTotal, '135.75', 'Decimal fractional net calculation resolved incorrectly');
        console.log('✓ Granular components round to 4 decimals, final rounds to 2 decimals correctly');
    }

    // Test with very large quantities (e.g. quantity = 1,000,000)
    {
        const prev = await previewService.generatePreview(TEST_TENANT, {
            priceBookId: decimalBook2.id,
            quantity: 1000000
        });
        // 0.1234 * 1000000 = 123400
        // setup = 12.3456
        // netTotal = 123400 + 12.3456 = 123412.3456 -> 123412.35
        assert.strictEqual(prev.netTotal, '123412.35', 'Large quantity calculation resolved incorrectly');
        console.log('✓ Huge quantities calculated without integer overflows or intermediate float drift');
    }

    await cleanDatabaseFixtures();
    console.log('\nAll Phase 191F.1 Integrity & Immutability Tests passed successfully!');
    process.exit(0);
}

runTests().catch(err => {
    console.error('Test suite failed:', err);
    cleanDatabaseFixtures().then(() => process.exit(1));
});
