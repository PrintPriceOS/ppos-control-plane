/**
 * scripts/smoke_phase192b_live_quote_eligibility.js
 * 
 * Phase 192B.1 Service-Level Smoke Tests for Live Quote Eligibility,
 * Double-Grant Enforcement, Deterministic Money Safety, and Zero DB Deltas.
 */
const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const moneyUtil = require('../src/api/services/moneyUtil');

const mockGrants = new Map();
const mockPriceBooks = new Map();

// Side-effect delta counters
let orderCount = 0;
let routingCount = 0;
let dispatchCount = 0;
let snapshotCount = 0;
let grantCount = 0;

const originalQuery = db.query;
db.query = async function mockQuery(sql, params = []) {
    const sqlTrim = sql.trim().toUpperCase();

    // Verify zero mutations on database
    if (sqlTrim.startsWith('INSERT') || sqlTrim.startsWith('UPDATE') || sqlTrim.startsWith('DELETE')) {
        if (sqlTrim.includes('ORDERS')) orderCount++;
        if (sqlTrim.includes('ROUTING')) routingCount++;
        if (sqlTrim.includes('DISPATCH')) dispatchCount++;
        if (sqlTrim.includes('SNAPSHOT')) snapshotCount++;
        if (sqlTrim.includes('ACTIVATION_GRANTS')) grantCount++;
    }

    try {
        return await originalQuery.call(db, sql, params);
    } catch (err) {
        if (err.code !== 'DB_UNCONFIGURED' && !err.message.includes('UNCONFIGURED')) {
            throw err;
        }

        if (sqlTrim.includes('PRINTHOUSE_ACTIVATION_GRANTS')) {
            const rows = Array.from(mockGrants.values());
            return rows.filter(r => r.tenant_id === params[0]);
        }

        if (sqlTrim.includes('PRINTHOUSE_PRICE_BOOKS')) {
            const rows = Array.from(mockPriceBooks.values());
            return rows.filter(r => r.tenant_id === params[0]);
        }

        return [];
    }
};

const liveQuoteService = require('../src/api/services/liveQuoteEligibilityService');
const previewService = require('../src/api/services/printhousePricingPreviewService');

let mockCostAmount = 150.00;
previewService.calculatePreview = async function mockPreview() {
    return {
        costBreakdown: {
            currency: 'EUR',
            totalCost: mockCostAmount
        }
    };
};

const TEST_TENANT = 'tenant-quote-smoke-1';

async function runTests() {
    console.log('=== Starting Phase 192B.1 Live Quote Eligibility & Precision Smoke Tests ===\n');

    // 1. Money Safety Unit Tests (Integer Minor Units)
    {
        assert.strictEqual(moneyUtil.fromCents(moneyUtil.addCents(moneyUtil.toCents(0.10), moneyUtil.toCents(0.20))), '0.30');
        assert.strictEqual(moneyUtil.fromCents(moneyUtil.multiplyCents(moneyUtil.toCents(0.10), 3)), '0.30');
        assert.strictEqual(moneyUtil.fromCents(moneyUtil.multiplyCents(moneyUtil.toCents(19.99), 3)), '59.97');
        assert.strictEqual(moneyUtil.fromCents(moneyUtil.toCents(0.005)), '0.01');
        assert.strictEqual(moneyUtil.fromCents(moneyUtil.toCents(1.005)), '1.01');
        console.log('✓ Money Safety 1: All 5 deterministic money precision cases passed cleanly (0.10+0.20="0.30", 19.99*3="59.97")');
    }

    // 2. Double-Grant Enforcement
    {
        mockGrants.clear();
        mockPriceBooks.clear();

        // Case A: MARKETPLACE_VISIBLE = true, LIVE_QUOTING_ALLOWED = false
        mockGrants.set(TEST_TENANT, {
            tenant_id: TEST_TENANT, status: 'ACTIVE',
            marketplace_visible: true, live_quoting_allowed: false
        });
        const resA = await liveQuoteService.evaluateEligibility(TEST_TENANT);
        assert.strictEqual(resA.eligible, false);
        assert.strictEqual(resA.discoverable, true);
        assert.ok(resA.blockingIssues.some(b => b.code === 'LIVE_QUOTING_NOT_GRANTED'));
        console.log('✓ Double Grant Case A: Discoverable node missing LIVE_QUOTING_ALLOWED is NOT eligible for live quotes');

        // Case B: MARKETPLACE_VISIBLE = false, LIVE_QUOTING_ALLOWED = true
        mockGrants.set(TEST_TENANT, {
            tenant_id: TEST_TENANT, status: 'ACTIVE',
            marketplace_visible: false, live_quoting_allowed: true
        });
        const resB = await liveQuoteService.evaluateEligibility(TEST_TENANT);
        assert.strictEqual(resB.eligible, false);
        assert.strictEqual(resB.discoverable, false);
        assert.ok(resB.blockingIssues.some(b => b.code === 'MARKETPLACE_NOT_VISIBLE'));
        console.log('✓ Double Grant Case B: Undiscoverable node with LIVE_QUOTING_ALLOWED is NOT eligible for live quotes');

        // Case C: Both Grants Active
        mockGrants.set(TEST_TENANT, {
            tenant_id: TEST_TENANT, status: 'ACTIVE',
            marketplace_visible: true, live_quoting_allowed: true
        });
        mockPriceBooks.set('pb-1', {
            id: 'pb-1', tenant_id: TEST_TENANT, name: 'Standard Price Book', status: 'PUBLISHED', currency: 'EUR'
        });
        const resC = await liveQuoteService.evaluateEligibility(TEST_TENANT);
        assert.strictEqual(resC.eligible, true);
        assert.strictEqual(resC.discoverable, true);
        console.log('✓ Double Grant Case C: Both grants active -> QUOTE_ELIGIBLE');
    }

    // 3. Governed Live Quote Calculation with Deterministic Money Expectations
    {
        mockCostAmount = 19.99;
        const quote = await liveQuoteService.calculateLiveQuote(TEST_TENANT, { quantity: 3 });
        assert.strictEqual(quote.status, 'CALCULATED');
        assert.strictEqual(quote.pricing.netAmount, '19.99');
        assert.strictEqual(quote.pricing.taxAmount, '4.20'); // 1999 * 0.21 = 419.79 -> 420 cents = 4.20
        assert.strictEqual(quote.pricing.grossAmount, '24.19');
        console.log('✓ Governed Live Quote calculated with exact string money expectations (net="19.99", tax="4.20", gross="24.19")');
    }

    // 4. Side-Effect DB Delta Proof
    {
        assert.strictEqual(orderCount, 0);
        assert.strictEqual(routingCount, 0);
        assert.strictEqual(dispatchCount, 0);
        assert.strictEqual(snapshotCount, 0);
        assert.strictEqual(grantCount, 0);
        console.log('✓ Side-Effect DB Delta Proof: ORDER=0, ROUTING=0, DISPATCH=0, SNAPSHOT=0, GRANT=0');
    }

    console.log('\nAll Phase 192B.1 Live Quote Eligibility Smoke Tests Passed Successfully!');
}

runTests().catch(err => {
    console.error('Smoke tests failed:', err);
    process.exit(1);
});
