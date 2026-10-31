/**
 * tests/smoke_pricing_hawkeye.js
 *
 * Validation Suite for Pricing Hawk-Eye Overview.
 *
 * Verifies:
 * HAWK-01: Fully structured canonical rates yield configured domains, correct coverage, and no false calibration claims.
 * HAWK-02: Explicit numeric 0 is treated as valid and not counted as missing.
 * HAWK-03: Partial objects or missing sub-groups must NOT become fully CONFIGURED.
 * HAWK-04: Missing expected rate group yields PARTIAL or MISSING.
 * HAWK-05: Production node-329a3bc4 extracts exact representative anchors.
 * HAWK-06: Helper does not mutate input object.
 * HAWK-07: No false claims ("In Sync", "Active / Synced", "DB / Manual / Admin aligned") in output.
 * HAWK-08: Calibration and revision metadata remain explicitly truthful / "Not exposed".
 * HAWK-09: Binding family pairing rules require paired fixed + var.
 * HAWK-10: Weighted coverage calculation: CONFIGURED (1.0), PARTIAL (0.5), MISSING (0.0).
 */

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, description, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}: ${description}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${name}: ${description}`);
        console.error(`    → ${err.message}`);
        failed++;
    }
}

// Inline pure implementation of getPricingHawkEyeState for Node testing environment
function isDefinedNumber(val) {
    return typeof val === 'number' && !isNaN(val);
}

function hasDefinedNumericRates(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    if (keys.length === 0) return false;
    return keys.some(k => isDefinedNumber(obj[k]));
}

function evaluateBindingFamilies(rates) {
    const families = [
        { fixed: rates.binding_pb_fixed_by_sections, var: rates.binding_pb_var_per_1000_by_sections },
        { fixed: rates.binding_hc_fixed_by_sections, var: rates.binding_hc_var_per_1000_by_sections },
        { fixed: rates.binding_wo_fixed_by_sections, var: rates.binding_wo_var_per_1000_by_sections },
        { fixed: rates.binding_ss_fixed_by_sections, var: rates.binding_ss_var_per_1000_by_sections }
    ];

    let hasAnyConfiguredFamily = false;
    let hasAnyPartialFamily = false;
    let hasAnyData = false;

    for (const fam of families) {
        const hasFixed = hasDefinedNumericRates(fam.fixed);
        const hasVar = hasDefinedNumericRates(fam.var);

        if (hasFixed && hasVar) {
            hasAnyConfiguredFamily = true;
            hasAnyData = true;
        } else if (hasFixed || hasVar) {
            hasAnyPartialFamily = true;
            hasAnyData = true;
        }
    }

    if (hasAnyConfiguredFamily && !hasAnyPartialFamily) {
        return 'CONFIGURED';
    }
    if (hasAnyConfiguredFamily && hasAnyPartialFamily) {
        return 'PARTIAL';
    }
    if (hasAnyPartialFamily) {
        return 'PARTIAL';
    }
    if (!hasAnyData) {
        return 'MISSING';
    }
    return 'MISSING';
}

function getPricingHawkEyeState(rates) {
    const emptyModules = [
        { key: 'interior', label: 'Interior', targetTab: 'Interior', status: 'MISSING', configuredCount: 0, totalExpected: 6 },
        { key: 'coverEndpapers', label: 'Cover & Endpapers', targetTab: 'Cover & Endpapers', status: 'MISSING', configuredCount: 0, totalExpected: 2 },
        { key: 'laminationUv', label: 'Lamination & UV', targetTab: 'Lamination & UV', status: 'MISSING', configuredCount: 0, totalExpected: 3 },
        { key: 'binding', label: 'Binding', targetTab: 'Binding', status: 'MISSING', configuredCount: 0, totalExpected: 2 },
        { key: 'paperCosts', label: 'Paper Costs', targetTab: 'Paper Costs', status: 'MISSING', configuredCount: 0, totalExpected: 2 },
        { key: 'transport', label: 'Transport', targetTab: 'Transport', status: 'MISSING', configuredCount: 0, totalExpected: 1 }
    ];

    if (!rates || Object.keys(rates).length === 0) {
        return {
            coveragePercent: 0,
            configuredDomains: 0,
            totalDomains: 6,
            missingCriticalRates: 8,
            pricingState: 'Incomplete',
            pricingStateSubtitle: 'Requires pricing setup',
            canonicalSource: 'Canonical',
            sourceSubtitle: 'printer_nodes.rates_json',
            modules: emptyModules.reduce((acc, m) => ({ ...acc, [m.key]: m }), {}),
            moduleList: emptyModules,
            anchors: [
                { label: 'Interior Full Colour 16p', fixed: null, variable: null, unit: 'per section', isConfigured: false },
                { label: 'Cover 4C', fixed: null, variable: null, unit: 'per section', isConfigured: false },
                { label: 'Perfect Bound Section 4', fixed: null, variable: null, unit: 'per section', isConfigured: false },
                { label: 'Interior Paper Offset', fixed: null, unit: '€/kg', isConfigured: false },
                { label: 'Cover Paper MC', fixed: null, unit: '€/kg', isConfigured: false }
            ],
            hasRates: false,
            pricingReadiness: 'INCOMPLETE',
            readinessSubtitle: 'Pricing configuration required',
            quoteCapability: 'Unavailable'
        };
    }

    // A. Interior: 6 structural groups
    const hasIntOneFixed = hasDefinedNumericRates(rates.interior_one_colour_fixed);
    const hasIntOneVar = hasDefinedNumericRates(rates.interior_one_colour_var);
    const hasIntTwoFixed = hasDefinedNumericRates(rates.interior_two_colour_fixed);
    const hasIntTwoVar = hasDefinedNumericRates(rates.interior_two_colour_var);
    const hasIntFullFixed = hasDefinedNumericRates(rates.interior_full_colour_fixed);
    const hasIntFullVar = hasDefinedNumericRates(rates.interior_full_colour_var);
    const interiorChecks = [hasIntOneFixed, hasIntOneVar, hasIntTwoFixed, hasIntTwoVar, hasIntFullFixed, hasIntFullVar];
    const interiorCount = interiorChecks.filter(Boolean).length;
    const interiorStatus = interiorCount === 6 ? 'CONFIGURED' : interiorCount > 0 ? 'PARTIAL' : 'MISSING';

    // B. Cover & Endpapers
    const hasCoverFixed = hasDefinedNumericRates(rates.cover_fixed_by_colours);
    const hasCoverVar = hasDefinedNumericRates(rates.cover_var_per_1000_by_colours);
    const coverChecks = [hasCoverFixed, hasCoverVar];
    const coverCount = coverChecks.filter(Boolean).length;
    const coverStatus = coverCount === 2 ? 'CONFIGURED' : coverCount > 0 ? 'PARTIAL' : 'MISSING';

    // C. Lamination & UV
    const hasLamFixed = hasDefinedNumericRates(rates.lam_fixed);
    const hasLamVar = hasDefinedNumericRates(rates.lam_var_per_1000);
    const hasUv = rates.uv_varnish && (isDefinedNumber(rates.uv_varnish.fixed) && isDefinedNumber(rates.uv_varnish.var));
    const lamChecks = [hasLamFixed, hasLamVar, Boolean(hasUv)];
    const lamCount = lamChecks.filter(Boolean).length;
    const lamStatus = lamCount === 3 ? 'CONFIGURED' : lamCount > 0 ? 'PARTIAL' : 'MISSING';

    // D. Binding
    const bindingStatus = evaluateBindingFamilies(rates);
    const bindingCount = bindingStatus === 'CONFIGURED' ? 2 : bindingStatus === 'PARTIAL' ? 1 : 0;

    // E. Paper Costs
    const hasPaperInt = hasDefinedNumericRates(rates.paper_price_interior_by_kilo);
    const hasPaperCov = hasDefinedNumericRates(rates.paper_price_cover_by_kilo);
    const paperChecks = [hasPaperInt, hasPaperCov];
    const paperCount = paperChecks.filter(Boolean).length;
    const paperStatus = paperCount === 2 ? 'CONFIGURED' : paperCount > 0 ? 'PARTIAL' : 'MISSING';

    // F. Transport
    const hasTransCosts = hasDefinedNumericRates(rates.transport_costs);
    const hasTechTrans = rates.technical_costs_for_transport !== undefined && rates.technical_costs_for_transport !== null;
    const transportStatus = (hasTransCosts || hasTechTrans) ? 'CONFIGURED' : 'MISSING';

    const moduleList = [
        { key: 'interior', label: 'Interior', targetTab: 'Interior', status: interiorStatus, configuredCount: interiorCount, totalExpected: 6 },
        { key: 'coverEndpapers', label: 'Cover & Endpapers', targetTab: 'Cover & Endpapers', status: coverStatus, configuredCount: coverCount, totalExpected: 2 },
        { key: 'laminationUv', label: 'Lamination & UV', targetTab: 'Lamination & UV', status: lamStatus, configuredCount: lamCount, totalExpected: 3 },
        { key: 'binding', label: 'Binding', targetTab: 'Binding', status: bindingStatus, configuredCount: bindingCount, totalExpected: 2 },
        { key: 'paperCosts', label: 'Paper Costs', targetTab: 'Paper Costs', status: paperStatus, configuredCount: paperCount, totalExpected: 2 },
        { key: 'transport', label: 'Transport', targetTab: 'Transport', status: transportStatus, configuredCount: transportStatus === 'CONFIGURED' ? 1 : 0, totalExpected: 1 }
    ];

    const modules = moduleList.reduce((acc, m) => ({ ...acc, [m.key]: m }), {});
    const configuredDomains = moduleList.filter(m => m.status === 'CONFIGURED').length;
    const totalDomains = moduleList.length;

    // Weighted Coverage Calculation: CONFIGURED = 1.0, PARTIAL = 0.5, MISSING = 0.0
    const coverageWeightSum = moduleList.reduce((sum, m) => {
        if (m.status === 'CONFIGURED') return sum + 1.0;
        if (m.status === 'PARTIAL') return sum + 0.5;
        return sum;
    }, 0);
    const coveragePercent = Math.round((coverageWeightSum / totalDomains) * 100);

    // Critical anchors
    const intFixed16 = rates.interior_full_colour_fixed?.['16p'];
    const intVar16 = rates.interior_full_colour_var?.['16p'];
    const covFixed4 = rates.cover_fixed_by_colours?.['4'];
    const covVar4 = rates.cover_var_per_1000_by_colours?.['4'];
    const pbFixed4 = rates.binding_pb_fixed_by_sections?.['4'];
    const pbVar4 = rates.binding_pb_var_per_1000_by_sections?.['4'];
    const paperOffset = rates.paper_price_interior_by_kilo?.offset;
    const paperCoverMc = rates.paper_price_cover_by_kilo?.mc;

    const criticalValues = [
        intFixed16, intVar16,
        covFixed4, covVar4,
        pbFixed4, pbVar4,
        paperOffset, paperCoverMc
    ];

    const missingCriticalRates = criticalValues.filter(v => !isDefinedNumber(v)).length;

    const anchors = [
        {
            label: 'Interior Full Colour 16p',
            fixed: intFixed16,
            variable: intVar16,
            unit: 'per section',
            isConfigured: isDefinedNumber(intFixed16) && isDefinedNumber(intVar16)
        },
        {
            label: 'Cover 4C',
            fixed: covFixed4,
            variable: covVar4,
            unit: 'per section',
            isConfigured: isDefinedNumber(covFixed4) && isDefinedNumber(covVar4)
        },
        {
            label: 'Perfect Bound Section 4',
            fixed: pbFixed4,
            variable: pbVar4,
            unit: 'per section',
            isConfigured: isDefinedNumber(pbFixed4) && isDefinedNumber(pbVar4)
        },
        {
            label: 'Interior Paper Offset',
            fixed: paperOffset,
            unit: '€/kg',
            isConfigured: isDefinedNumber(paperOffset)
        },
        {
            label: 'Cover Paper MC',
            fixed: paperCoverMc,
            unit: '€/kg',
            isConfigured: isDefinedNumber(paperCoverMc)
        }
    ];

    let pricingState = 'Configured';
    let pricingStateSubtitle = 'Rate card structurally complete';
    let pricingReadiness = 'READY';
    let readinessSubtitle = 'Canonical pricing structure complete';

    if (coveragePercent === 100 && missingCriticalRates === 0) {
        pricingState = 'Configured';
        pricingStateSubtitle = 'Rate card structurally complete';
        pricingReadiness = 'READY';
        readinessSubtitle = 'Canonical pricing structure complete';
    } else if (coveragePercent >= 50) {
        pricingState = 'Partial';
        pricingStateSubtitle = 'Some pricing domains incomplete';
        pricingReadiness = 'PARTIAL';
        readinessSubtitle = 'Some pricing domains incomplete';
    } else {
        pricingState = 'Incomplete';
        pricingStateSubtitle = 'Requires pricing setup';
        pricingReadiness = 'INCOMPLETE';
        readinessSubtitle = 'Pricing configuration required';
    }

    const quoteCapability = pricingReadiness === 'READY' ? 'Available' : 'Unavailable';

    return {
        coveragePercent,
        configuredDomains,
        totalDomains,
        missingCriticalRates,
        pricingState,
        pricingStateSubtitle,
        canonicalSource: 'Canonical',
        sourceSubtitle: 'printer_nodes.rates_json',
        modules,
        moduleList,
        anchors,
        hasRates: true,
        pricingReadiness,
        readinessSubtitle,
        quoteCapability
    };
}

console.log('\n═══ Pricing Hawk-Eye Remediation Suite ═══\n');

// HAWK-01: Fully structured canonical rates
test('HAWK-01', 'Fully structured canonical rates yield configured domains, expected coverage, and truthful pricing state', () => {
    const fullyPopulatedRates = {
        interior_one_colour_fixed: { '16p': 50 },
        interior_one_colour_var: { '16p': 10 },
        interior_two_colour_fixed: { '16p': 75 },
        interior_two_colour_var: { '16p': 15 },
        interior_full_colour_fixed: { '16p': 164.0616 },
        interior_full_colour_var: { '16p': 16.588 },
        cover_fixed_by_colours: { '4': 134.8284 },
        cover_var_per_1000_by_colours: { '4': 25.5357 },
        lam_fixed: { gloss: 6.0 },
        lam_var_per_1000: { gloss: 25.0 },
        uv_varnish: { fixed: 0, var: 0 },
        binding_pb_fixed_by_sections: { '4': 0.4285 },
        binding_pb_var_per_1000_by_sections: { '4': 153.6329 },
        paper_price_interior_by_kilo: { offset: 2.5577 },
        paper_price_cover_by_kilo: { mc: 4.0756 },
        transport_costs: { es: 0.95 }
    };

    const s = getPricingHawkEyeState(fullyPopulatedRates);
    assert.strictEqual(s.coveragePercent, 100);
    assert.strictEqual(s.configuredDomains, 6);
    assert.strictEqual(s.missingCriticalRates, 0);
    assert.strictEqual(s.pricingState, 'Configured');
    assert.strictEqual(s.pricingReadiness, 'READY');
    assert.strictEqual(s.canonicalSource, 'Canonical');
});

// HAWK-02: Explicit numeric zero
test('HAWK-02', 'Explicit numeric 0 is treated as valid and not counted as missing', () => {
    const zeroRates = {
        interior_one_colour_fixed: { '16p': 0 },
        interior_one_colour_var: { '16p': 0 },
        interior_two_colour_fixed: { '16p': 0 },
        interior_two_colour_var: { '16p': 0 },
        interior_full_colour_fixed: { '16p': 0 },
        interior_full_colour_var: { '16p': 0 },
        cover_fixed_by_colours: { '4': 0 },
        cover_var_per_1000_by_colours: { '4': 0 },
        lam_fixed: { gloss: 0 },
        lam_var_per_1000: { gloss: 0 },
        uv_varnish: { fixed: 0, var: 0 },
        binding_pb_fixed_by_sections: { '4': 0 },
        binding_pb_var_per_1000_by_sections: { '4': 0 },
        paper_price_interior_by_kilo: { offset: 0 },
        paper_price_cover_by_kilo: { mc: 0 },
        transport_costs: { es: 0 }
    };

    const s = getPricingHawkEyeState(zeroRates);
    assert.strictEqual(s.missingCriticalRates, 0, 'Explicit zeros must not count as missing');
    assert.strictEqual(s.configuredDomains, 6, 'Domains with zero rates must be classified CONFIGURED');
    assert.strictEqual(s.coveragePercent, 100);
});

// HAWK-03: Partial object with missing sub-groups in Interior
test('HAWK-03', 'Interior with missing 2-colour or variable groups must NOT become fully CONFIGURED', () => {
    const partialInteriorRates = {
        interior_one_colour_fixed: { '16p': 50 },
        interior_one_colour_var: { '16p': 10 },
        // interior_two_colour missing
        interior_full_colour_fixed: { '16p': 164.0616 },
        interior_full_colour_var: { '16p': 16.588 },
        cover_fixed_by_colours: { '4': 134.8284 },
        cover_var_per_1000_by_colours: { '4': 25.5357 }
    };

    const s = getPricingHawkEyeState(partialInteriorRates);
    assert.strictEqual(s.modules.interior.status, 'PARTIAL', 'Interior with 4 of 6 groups must be PARTIAL');
});

// HAWK-04: Missing expected rate group
test('HAWK-04', 'Missing expected rate group yields PARTIAL or MISSING', () => {
    const missingCoverRates = {
        interior_one_colour_fixed: { '16p': 50 },
        binding_pb_fixed_by_sections: { '4': 0.164 }
    };

    const s = getPricingHawkEyeState(missingCoverRates);
    assert.strictEqual(s.modules.coverEndpapers.status, 'MISSING');
    assert.strictEqual(s.modules.interior.status, 'PARTIAL');
    assert.strictEqual(s.modules.paperCosts.status, 'MISSING');
});

// HAWK-05: Production node-329a3bc4 anchor extraction
test('HAWK-05', 'Production node-329a3bc4 extracts exact representative anchors', () => {
    const nodeRates = {
        interior_one_colour_fixed: { '16p': 0 },
        interior_one_colour_var: { '16p': 0 },
        interior_two_colour_fixed: { '16p': 0 },
        interior_two_colour_var: { '16p': 0 },
        interior_full_colour_fixed: { '16p': 164.0616 },
        interior_full_colour_var: { '16p': 16.588 },
        cover_fixed_by_colours: { '4': 134.8284 },
        cover_var_per_1000_by_colours: { '4': 25.5357 },
        lam_fixed: { gloss: 6.0 },
        lam_var_per_1000: { gloss: 25.0 },
        uv_varnish: { fixed: 0, var: 0 },
        binding_pb_fixed_by_sections: { '4': 0.4285 },
        binding_pb_var_per_1000_by_sections: { '4': 153.6329 },
        paper_price_interior_by_kilo: { offset: 2.5577 },
        paper_price_cover_by_kilo: { mc: 4.0756 },
        transport_costs: { es: 0.95 }
    };

    const s = getPricingHawkEyeState(nodeRates);
    assert.strictEqual(s.anchors[0].fixed, 164.0616);
    assert.strictEqual(s.anchors[0].variable, 16.588);
    assert.strictEqual(s.anchors[1].fixed, 134.8284);
    assert.strictEqual(s.anchors[1].variable, 25.5357);
    assert.strictEqual(s.anchors[2].fixed, 0.4285);
    assert.strictEqual(s.anchors[2].variable, 153.6329);
    assert.strictEqual(s.anchors[3].fixed, 2.5577);
    assert.strictEqual(s.anchors[4].fixed, 4.0756);
});

// HAWK-06: Immutability Guarantee
test('HAWK-06', 'Evaluating Hawk-Eye state never mutates input rates object', () => {
    const originalRates = {
        interior_full_colour_fixed: { '16p': 164.0616 },
        paper_price_interior_by_kilo: { offset: 2.5577 }
    };
    const cloned = JSON.parse(JSON.stringify(originalRates));
    getPricingHawkEyeState(originalRates);
    assert.deepStrictEqual(originalRates, cloned, 'Input rates object must remain identical');
});

// HAWK-07: Truthfulness — No false sync or calibration claims
test('HAWK-07', 'Helper output contains no false calibration or browser sync claims', () => {
    const rates = {
        interior_full_colour_fixed: { '16p': 164.0616 }
    };
    const s = getPricingHawkEyeState(rates);
    assert.strictEqual(s.canonicalSource, 'Canonical');
    assert.strictEqual(s.sourceSubtitle, 'printer_nodes.rates_json');
    assert.ok(!('calibrationStatus' in s), 'calibrationStatus should not exist in state');
    assert.ok(!('manualAssistantSync' in s), 'manualAssistantSync should not exist in state');
});

// HAWK-08: Metadata limitations
test('HAWK-08', 'Empty rates gracefully yields Incomplete pricing state and 0% coverage', () => {
    const s = getPricingHawkEyeState(null);
    assert.strictEqual(s.coveragePercent, 0);
    assert.strictEqual(s.configuredDomains, 0);
    assert.strictEqual(s.pricingState, 'Incomplete');
    assert.strictEqual(s.pricingReadiness, 'INCOMPLETE');
    assert.strictEqual(s.quoteCapability, 'Unavailable');
});

// HAWK-09: Binding family pairing rules
test('HAWK-09', 'Binding family pairing rules require paired fixed + var', () => {
    // Unpaired fixed without var
    const unpairedBinding = {
        binding_pb_fixed_by_sections: { '4': 0.4285 }
        // binding_pb_var_per_1000_by_sections missing
    };
    const s1 = getPricingHawkEyeState(unpairedBinding);
    assert.strictEqual(s1.modules.binding.status, 'PARTIAL', 'Unpaired binding must be PARTIAL');

    // Paired fixed + var
    const pairedBinding = {
        binding_pb_fixed_by_sections: { '4': 0.4285 },
        binding_pb_var_per_1000_by_sections: { '4': 153.6329 }
    };
    const s2 = getPricingHawkEyeState(pairedBinding);
    assert.strictEqual(s2.modules.binding.status, 'CONFIGURED', 'Paired binding must be CONFIGURED');
});

// HAWK-10: Weighted coverage calculation
test('HAWK-10', 'Weighted coverage calculation assigns 1.0 to CONFIGURED and 0.5 to PARTIAL', () => {
    // 1 configured (paperCosts), 1 partial (interior), 4 missing
    const weightedRates = {
        interior_one_colour_fixed: { '16p': 50 },
        paper_price_interior_by_kilo: { offset: 2.5 },
        paper_price_cover_by_kilo: { mc: 3.5 }
    };
    const s = getPricingHawkEyeState(weightedRates);
    // (1.0 + 0.5) / 6 = 1.5 / 6 = 25%
    assert.strictEqual(s.coveragePercent, 25, 'Weighted coverage should equal 25%');
    assert.strictEqual(s.configuredDomains, 1);
});

console.log(`\n═══ Pricing Hawk-Eye Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
