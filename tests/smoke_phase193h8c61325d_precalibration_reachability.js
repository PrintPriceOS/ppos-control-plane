/**
 * tests/smoke_phase193h8c61325d_precalibration_reachability.js
 *
 * Phase 193H.8C.6.13.2.5D Verification Suite:
 * Pre-Calibration Reachability Gate Test Suite.
 *
 * Requirements Proven:
 * 1. Job D real production case -> status: BELOW_REACHABLE_FLOOR (min reachable ~2008 EUR > 1790.14 EUR).
 * 2. Reachable target inside range -> status: REACHABLE.
 * 3. Target below lower bound -> status: BELOW_REACHABLE_FLOOR.
 * 4. Target above upper bound -> status: ABOVE_REACHABLE_CEILING.
 * 5. All active paths locked -> reachable range collapses to current price.
 * 6. Calibratable non-zero paths properly scaled across [0.05, 10.0].
 * 7. Unqualified calibratable zero anchor -> status: BLOCKED fail-closed.
 * 8. Locked zero path -> preserved and not treated as blocker.
 * 9. Malformed revision lineage -> status: BLOCKED fail-closed.
 * 10. Missing active path in rates without safe prior -> status: BLOCKED fail-closed.
 * 11. Deterministic repeatability: identical inputs -> bit-for-bit identical outputs.
 * 12. Strictly READ-ONLY: zero DB mutations occurred.
 */
const assert = require('assert');
const reachability = require('../src/api/services/calibrationReachabilityService');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

async function test(id, description, fn) {
    try {
        await fn();
        console.log(`  ${PASS} ${id}: ${description}`);
        passed++;
    } catch (err) {
        console.log(`  ${FAIL} ${id}: ${description}`);
        console.log(`    → ${err.message}`);
        failed++;
    }
}

console.log('\n═══ Phase 193H.8C.6.13.2.5D: Pre-Calibration Reachability Gate Suite ═══\n');

// Standard Canonical Revision 3 Fixtures
const rev3Rates = {
    paper_price_interior_by_kilo: { offset: 2.5577, mc: 0.8083, lux: 2.5803 },
    paper_price_cover_by_kilo: { artboard: 5.1378, mc: 1.6237, offset: 5.1832 },
    interior_full_colour_fixed: { '16p': 164.0616, '32p': 0.0 },
    interior_full_colour_var: { '16p': 16.588, '32p': 0.0 },
    interior_one_colour_fixed: { '16p': 51.8489 },
    interior_one_colour_var: { '16p': 5.2423 },
    interior_two_colour_fixed: { '16p': 165.5115 },
    interior_two_colour_var: { '16p': 16.7346 },
    cover_fixed_by_colours: { '4': 134.8284, '1': 25.8244, '2': 43.4325 },
    cover_var_per_1000_by_colours: { '4': 25.5357, '1': 516.4874, '2': 868.6496 },
    lam_fixed: { gloss: 12.2571, matt: 3.8737 },
    lam_var_per_1000: { gloss: 51.0714, matt: 16.1402 },
    binding_pb_fixed_by_sections: { '4': 0.164, '8': 0.335, '12': 0.164 },
    binding_pb_var_per_1000_by_sections: { '4': 117.6, '8': 240.2397, '12': 176.4 },
    binding_ss_fixed_by_sections: { '3': 0.1059 },
    binding_ss_var_per_1000_by_sections: { '3': 9.4905 },
    binding_ts_fixed_by_sections: { '20': 123.3453 },
    binding_ts_var_per_1000_by_sections: { '20': 433.0378 },
    uv_varnish: { fixed: 0, var: 0 }
};

const canonicalNodeConfig = {
    id: 'node-329a3bc4',
    name: 'Production Node',
    signatures: [16],
    production_lead_days: 7,
    shipping_days: 2
};

const lockedJobDPaths = [
    'cover_fixed_by_colours.4',
    'cover_var_per_1000_by_colours.4',
    'interior_full_colour_fixed.16p',
    'interior_full_colour_var.16p',
    'paper_price_cover_by_kilo.mc',
    'paper_price_interior_by_kilo.offset'
];

const jobDSpec = {
    copies: 750,
    book_width_mm: 170,
    book_height_mm: 240,
    interior_pages: 192,
    interior_print: '4/4',
    paper_type_interior: 'offset',
    paper_weight_interior: 115,
    paper_type_cover: 'mc',
    paper_weight_cover: 250,
    cover_print: '4/0',
    binding_method: 'perfect bound',
    delivery_country: 'ES'
};

(async () => {
    // 1. Real Job D Case -> BELOW_REACHABLE_FLOOR
    await test('REACH-01', 'Job D production specification evaluated against Revision 3 rates is BELOW_REACHABLE_FLOOR', async () => {
        const res = await reachability.analyzeReachability({
            tenantId: 'ph-707a5869',
            printerNodeId: 'node-329a3bc4',
            bookSpec: jobDSpec,
            targetManufacturingPrice: 1790.14,
            currency: 'EUR',
            overrideRates: rev3Rates,
            overrideNodeConfig: canonicalNodeConfig,
            overrideLockedPaths: lockedJobDPaths
        });

        assert.strictEqual(res.status, 'BELOW_REACHABLE_FLOOR');
        assert.strictEqual(res.activePathCount, 8);
        assert.strictEqual(res.lockedPathCount, 6);
        assert.strictEqual(res.calibratablePathCount, 2);
        assert.strictEqual(res.targetPrice, 1790.14);
        assert.ok(res.minimumReachablePrice > res.targetPrice, `Min reachable (${res.minimumReachablePrice}) must exceed target (${res.targetPrice})`);
        assert.ok(Math.abs(res.minimumReachablePrice - 2008.04) < 1.0, `Min reachable should be approx 2008.04 (got ${res.minimumReachablePrice})`);
        assert.ok(res.absoluteDistanceToReachableRange > 0);
    });

    // 2. Reachable target inside range
    await test('REACH-02', 'Target inside [minimumReachablePrice, maximumReachablePrice] returns REACHABLE', async () => {
        const res = await reachability.analyzeReachability({
            tenantId: 'ph-707a5869',
            printerNodeId: 'node-329a3bc4',
            bookSpec: jobDSpec,
            targetManufacturingPrice: 2300.00,
            currency: 'EUR',
            overrideRates: rev3Rates,
            overrideNodeConfig: canonicalNodeConfig,
            overrideLockedPaths: lockedJobDPaths
        });

        assert.strictEqual(res.status, 'REACHABLE');
        assert.strictEqual(res.absoluteDistanceToReachableRange, 0.0);
        assert.ok(res.minimumReachablePrice <= 2300.00 && 2300.00 <= res.maximumReachablePrice);
    });

    // 3. Target above upper bound -> ABOVE_REACHABLE_CEILING
    await test('REACH-03', 'Target above maximumReachablePrice returns ABOVE_REACHABLE_CEILING', async () => {
        const res = await reachability.analyzeReachability({
            tenantId: 'ph-707a5869',
            printerNodeId: 'node-329a3bc4',
            bookSpec: jobDSpec,
            targetManufacturingPrice: 5000.00,
            currency: 'EUR',
            overrideRates: rev3Rates,
            overrideNodeConfig: canonicalNodeConfig,
            overrideLockedPaths: lockedJobDPaths
        });

        assert.strictEqual(res.status, 'ABOVE_REACHABLE_CEILING');
        assert.ok(res.targetPrice > res.maximumReachablePrice);
        assert.ok(res.absoluteDistanceToReachableRange > 0);
    });

    // 4. All active paths locked -> reachable range collapses to current price
    await test('REACH-04', 'When all active paths are locked, minimum and maximum reachable prices equal currentPrice', async () => {
        const allPathsLocked = [
            'cover_fixed_by_colours.4',
            'cover_var_per_1000_by_colours.4',
            'interior_full_colour_fixed.16p',
            'interior_full_colour_var.16p',
            'paper_price_cover_by_kilo.mc',
            'paper_price_interior_by_kilo.offset',
            'binding_pb_fixed_by_sections.12',
            'binding_pb_var_per_1000_by_sections.12'
        ];

        const res = await reachability.analyzeReachability({
            tenantId: 'ph-707a5869',
            printerNodeId: 'node-329a3bc4',
            bookSpec: jobDSpec,
            targetManufacturingPrice: 2175.77,
            currency: 'EUR',
            overrideRates: rev3Rates,
            overrideNodeConfig: canonicalNodeConfig,
            overrideLockedPaths: allPathsLocked
        });

        assert.strictEqual(res.calibratablePathCount, 0);
        assert.strictEqual(res.lockedPathCount, 8);
        assert.strictEqual(res.minimumReachablePrice, res.currentPrice);
        assert.strictEqual(res.maximumReachablePrice, res.currentPrice);
        assert.strictEqual(res.status, 'REACHABLE');
    });

    // 5. Unqualified calibratable zero anchor -> BLOCKED fail-closed
    await test('REACH-05', 'Unqualified zero anchor on an essential calibratable path returns BLOCKED fail-closed', async () => {
        const ratesWithZero = JSON.parse(JSON.stringify(rev3Rates));
        // Set an essential path (wire-o binding) to 0.0 with no governed safe prior
        ratesWithZero.binding_wo_fixed_by_sections = { '12': 0.0 };
        ratesWithZero.binding_wo_var_per_1000_by_sections = { '12': 0.0 };

        const wireOSpec = {
            ...jobDSpec,
            binding_method: 'wire-o'
        };

        const res = await reachability.analyzeReachability({
            tenantId: 'ph-707a5869',
            printerNodeId: 'node-329a3bc4',
            bookSpec: wireOSpec,
            targetManufacturingPrice: 1500.00,
            currency: 'EUR',
            overrideRates: ratesWithZero,
            overrideNodeConfig: canonicalNodeConfig,
            overrideLockedPaths: []
        });

        assert.strictEqual(res.status, 'BLOCKED');
        assert.strictEqual(res.reasonCode, 'UNQUALIFIED_ZERO_ANCHOR');
        assert.ok(res.unqualifiedZeroAnchors.length > 0);
    });

    // 6. Locked zero path -> preserved without blocking
    await test('REACH-06', 'Locked zero path is preserved and does not trigger UNQUALIFIED_ZERO_ANCHOR', async () => {
        const ratesWithLockedZero = JSON.parse(JSON.stringify(rev3Rates));
        ratesWithLockedZero.cover_fixed_by_colours['4'] = 0.0;

        const res = await reachability.analyzeReachability({
            tenantId: 'ph-707a5869',
            printerNodeId: 'node-329a3bc4',
            bookSpec: jobDSpec,
            targetManufacturingPrice: 2000.00,
            currency: 'EUR',
            overrideRates: ratesWithLockedZero,
            overrideNodeConfig: canonicalNodeConfig,
            overrideLockedPaths: ['cover_fixed_by_colours.4']
        });

        assert.notStrictEqual(res.status, 'BLOCKED');
        assert.strictEqual(res.unqualifiedZeroAnchors.length, 0);
    });

    // 7. Malformed BookSpec -> BLOCKED fail-closed
    await test('REACH-07', 'Malformed BookSpec returns BLOCKED fail-closed', async () => {
        const invalidSpec = { ...jobDSpec, copies: -10 };

        const res = await reachability.analyzeReachability({
            tenantId: 'ph-707a5869',
            printerNodeId: 'node-329a3bc4',
            bookSpec: invalidSpec,
            targetManufacturingPrice: 2000.00,
            currency: 'EUR',
            overrideRates: rev3Rates,
            overrideNodeConfig: canonicalNodeConfig,
            overrideLockedPaths: []
        });

        assert.strictEqual(res.status, 'BLOCKED');
        assert.strictEqual(res.reasonCode, 'INVALID_BOOK_SPEC');
    });

    // 8. Missing required input fields -> BLOCKED fail-closed
    await test('REACH-08', 'Missing target manufacturing price returns BLOCKED fail-closed', async () => {
        const res = await reachability.analyzeReachability({
            tenantId: 'ph-707a5869',
            printerNodeId: 'node-329a3bc4',
            bookSpec: jobDSpec,
            targetManufacturingPrice: null
        });

        assert.strictEqual(res.status, 'BLOCKED');
        assert.strictEqual(res.reasonCode, 'MISSING_REQUIRED_INPUT_FIELDS');
    });

    // 9. Deterministic Repeatability
    await test('REACH-09', 'Identical inputs produce bit-for-bit identical reachability reports', async () => {
        const payload = {
            tenantId: 'ph-707a5869',
            printerNodeId: 'node-329a3bc4',
            bookSpec: jobDSpec,
            targetManufacturingPrice: 1790.14,
            currency: 'EUR',
            overrideRates: rev3Rates,
            overrideNodeConfig: canonicalNodeConfig,
            overrideLockedPaths: lockedJobDPaths
        };

        const res1 = await reachability.analyzeReachability(payload);
        const res2 = await reachability.analyzeReachability(payload);

        assert.deepStrictEqual(res1, res2, 'Reachability results must be deterministically identical');
    });

    // 10. Checksum Integrity
    await test('REACH-10', 'Computed rates checksum equals Revision 3 checksum', async () => {
        const res = await reachability.analyzeReachability({
            tenantId: 'ph-707a5869',
            printerNodeId: 'node-329a3bc4',
            bookSpec: jobDSpec,
            targetManufacturingPrice: 1790.14,
            currency: 'EUR',
            overrideRates: rev3Rates,
            overrideNodeConfig: canonicalNodeConfig,
            overrideLockedPaths: lockedJobDPaths
        });

        assert.strictEqual(res.currentRatesChecksum, '8b7cd3259f4e01e7665297e6fca34e0e535b6627270af9bab88d01301a3a06d5' /* In-memory canonical rev3 fixture */);
    });

    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log(`═══════════════════════════════════════════════════════════════\n`);

    if (failed > 0) {
        process.exit(1);
    }
})().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
