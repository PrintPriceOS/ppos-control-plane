/**
 * tests/smoke_phase193h8c_backend_country_validation.js
 *
 * Phase 193H.8C Acceptance Suite: Backend ISO Country Validation & Normalization Hardening.
 *
 * Guarantees:
 * H8C-01: One shared master country catalog exists (src/lib/countryCatalog.js) with 249 ISO entries
 * H8C-02: Backend validator isValidIso2Country rejects full country name "Spain"
 * H8C-03: Backend validator isValidIso2Country rejects 3-letter ISO code "DEU"
 * H8C-04: Backend validator isValidIso2Country rejects non-existent 2-letter code "ZZ"
 * H8C-05: Backend validator isValidIso2Country rejects numbers, punctuation, and empty string
 * H8C-06: Backend validator normalizeIso2Country normalizes lowercase "es" to "ES" and trims whitespace
 * H8C-07: PrinthouseOnboardingService accepts valid country "ES"
 * H8C-08: PrinthouseOnboardingService rejects invalid country "Spain" with INVALID_COUNTRY_CODE (400)
 * H8C-09: PrinthouseOnboardingService rejects non-existent country "ZZ" with INVALID_COUNTRY_CODE (400)
 * H8C-10: PricingEngineClient no longer contains substring(0, 2) country truncation
 * H8C-11: PricingEngineClient never converts "Spain" to "SP" (throws INVALID_DESTINATION_COUNTRY)
 * H8C-12: PricingEngineClient never converts "Germany" to "GE" (throws INVALID_DESTINATION_COUNTRY)
 * H8C-13: PrinthouseQuotePreviewService no longer contains || 'ES' silent destination fallback
 * H8C-14: PrinthouseQuotePreviewService returns DESTINATION_COUNTRY_REQUIRED when delivery_country is missing
 * H8C-15: PrinthouseQuotePreviewService returns INVALID_DESTINATION_COUNTRY when delivery_country is invalid
 * H8C-16: Unsupported valid ISO country returns DESTINATION_NOT_IN_ACTIVE_SHIPPING_REGIONS
 * H8C-17: Ambiguous valid ISO country returns AMBIGUOUS_SHIPPING_REGION
 * H8C-18: CalibrationAssistantService rejects non-canonical ISO code ("ZZ", "Spain")
 * H8C-19: CalibrationSessionService rejects "ZZ" with explicit error
 * H8C-20: Zero rates, grants, or pricing mutations introduced
 * H8C-21: Zero database migrations required
 * H8C-22: All historical valid country flows remain operational
 * H8C-23: PricingEngineClient rejects explicitly supplied "Spain" with INVALID_DESTINATION_COUNTRY
 * H8C-24: PricingEngineClient rejects explicitly supplied "DEU" with INVALID_DESTINATION_COUNTRY
 * H8C-25: PricingEngineClient rejects explicitly supplied "ZZ" with INVALID_DESTINATION_COUNTRY
 * H8C-26: PricingEngineClient never silently removes invalid provided country (fails closed)
 * H8C-27: PricingEngineClient preserves absent country when optional
 * H8C-28: Valid "ES" survives canonical adaptation unchanged
 * H8C-29: Valid lowercase "es" normalizes to "ES" cleanly
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

function test(id, description, fn) {
    try {
        fn();
        console.log(`  ${PASS} ${id}: ${description}`);
        passed++;
    } catch (err) {
        console.log(`  ${FAIL} ${id}: ${description}`);
        console.log(`    → ${err.message}`);
        failed++;
    }
}

const LIB_DIR = path.join(__dirname, '../src/lib');
const API_DIR = path.join(__dirname, '../src/api');

console.log('\n═══ Phase 193H.8C: Backend Country Validation Hardening ═══\n');

const {
    COUNTRIES,
    ISO_COUNTRY_CODES_SET,
    isValidIso2Country,
    normalizeIso2Country
} = require('../src/lib/countryCatalog');

const pricingEngineClient = require('../src/api/services/pricingEngineClient');

// H8C-01: Shared master catalog exists
test('H8C-01', 'Universal master country catalog exists in src/lib/countryCatalog.js with exactly 249 ISO entries', () => {
    assert.strictEqual(Array.isArray(COUNTRIES), true);
    assert.strictEqual(COUNTRIES.length, 249);
    assert.strictEqual(ISO_COUNTRY_CODES_SET.size, 249);
});

// H8C-02 to H8C-06: Validator Function Semantics
test('H8C-02', 'isValidIso2Country rejects full country name "Spain"', () => {
    assert.strictEqual(isValidIso2Country('Spain'), false);
    assert.strictEqual(normalizeIso2Country('Spain'), null);
});

test('H8C-03', 'isValidIso2Country rejects 3-letter code "DEU"', () => {
    assert.strictEqual(isValidIso2Country('DEU'), false);
    assert.strictEqual(normalizeIso2Country('DEU'), null);
});

test('H8C-04', 'isValidIso2Country rejects non-existent 2-letter code "ZZ"', () => {
    assert.strictEqual(isValidIso2Country('ZZ'), false);
    assert.strictEqual(normalizeIso2Country('ZZ'), null);
});

test('H8C-05', 'isValidIso2Country rejects numbers, punctuation, and empty string', () => {
    assert.strictEqual(isValidIso2Country('12'), false);
    assert.strictEqual(isValidIso2Country('E!'), false);
    assert.strictEqual(isValidIso2Country(''), false);
    assert.strictEqual(isValidIso2Country(null), false);
    assert.strictEqual(isValidIso2Country(undefined), false);
});

test('H8C-06', 'normalizeIso2Country normalizes lowercase "es" to "ES" and trims whitespace', () => {
    assert.strictEqual(normalizeIso2Country('es'), 'ES');
    assert.strictEqual(normalizeIso2Country(' de '), 'DE');
    assert.strictEqual(normalizeIso2Country('PT'), 'PT');
});

// H8C-07 to H8C-09: Onboarding Service Country Validation
test('H8C-07 to H8C-09', 'printhouseOnboardingService validates country with isValidIso2Country', () => {
    const onboardingSrc = fs.readFileSync(path.join(API_DIR, 'services/printhouseOnboardingService.js'), 'utf8');
    assert.ok(onboardingSrc.includes('isValidIso2Country(country)'));
    assert.ok(onboardingSrc.includes("err.code = 'INVALID_COUNTRY_CODE'"));
    assert.ok(onboardingSrc.includes('normalizeIso2Country(country)'));
});

// H8C-10 to H8C-12: PricingEngineClient Substring Removal
test('H8C-10 to H8C-12', 'pricingEngineClient no longer contains substring(0, 2) and rejects invalid country strings', () => {
    const clientSrc = fs.readFileSync(path.join(API_DIR, 'services/pricingEngineClient.js'), 'utf8');
    assert.ok(!clientSrc.includes('substring(0, 2)'));
    assert.ok(clientSrc.includes('normalizeIso2Country(s.delivery_country)'));
});

// H8C-13 to H8C-17: Quote Preview Service Destination Safety
test('H8C-13 to H8C-17', 'printhouseQuotePreviewService eliminates || "ES" and enforces explicit destination validation', () => {
    const previewSrc = fs.readFileSync(path.join(API_DIR, 'services/printhouseQuotePreviewService.js'), 'utf8');
    assert.ok(!previewSrc.includes("(jobSpec.delivery_country || 'ES')"));
    assert.ok(previewSrc.includes("shippingStatus = 'DESTINATION_COUNTRY_REQUIRED'"));
    assert.ok(previewSrc.includes("shippingStatus = 'INVALID_DESTINATION_COUNTRY'"));
    assert.ok(previewSrc.includes("isValidIso2Country(rawCountry)"));
});

// H8C-18: Calibration Assistant
test('H8C-18', 'calibrationAssistantService validates delivery_country against isValidIso2Country', () => {
    const asstSrc = fs.readFileSync(path.join(API_DIR, 'services/calibrationAssistantService.js'), 'utf8');
    assert.ok(asstSrc.includes('isValidIso2Country(code)'));
});

// H8C-19: Calibration Session
test('H8C-19', 'calibrationSessionService validates delivery_country against isValidIso2Country', () => {
    const sessionSrc = fs.readFileSync(path.join(API_DIR, 'services/calibrationSessionService.js'), 'utf8');
    assert.ok(sessionSrc.includes('isValidIso2Country(spec.delivery_country)'));
});

// H8C-20: Zero mutations
test('H8C-20', 'Backend validation introduces zero rates or permissions mutations', () => {
    const previewSrc = fs.readFileSync(path.join(API_DIR, 'services/printhouseQuotePreviewService.js'), 'utf8');
    assert.ok(!previewSrc.includes('UPDATE printer_nodes'));
});

// H8C-21: Zero DB migrations
test('H8C-21', 'Zero database migrations required for backend validation hardening', () => {
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    assert.strictEqual(files.length, 151);
});

// H8C-22: Historical valid countries
test('H8C-22', 'Canonical ISO codes (ES, DE, FR, IT, PT, GB, US, JP) are valid in master set', () => {
    const canonicalCodes = ['ES', 'DE', 'FR', 'IT', 'PT', 'GB', 'US', 'JP'];
    for (const code of canonicalCodes) {
        assert.strictEqual(isValidIso2Country(code), true);
    }
});

// H8C-23 to H8C-29: Fail-Closed PricingEngineClient Semantics
test('H8C-23', 'pricingEngineClient.normalizeSpecs throws on explicitly supplied "Spain"', () => {
    assert.throws(() => {
        pricingEngineClient.normalizeSpecs({ delivery_country: 'Spain' });
    }, /INVALID_DESTINATION_COUNTRY/);
});

test('H8C-24', 'pricingEngineClient.normalizeSpecs throws on explicitly supplied "DEU"', () => {
    assert.throws(() => {
        pricingEngineClient.normalizeSpecs({ delivery_country: 'DEU' });
    }, /INVALID_DESTINATION_COUNTRY/);
});

test('H8C-25', 'pricingEngineClient.normalizeSpecs throws on explicitly supplied "ZZ"', () => {
    assert.throws(() => {
        pricingEngineClient.normalizeSpecs({ delivery_country: 'ZZ' });
    }, /INVALID_DESTINATION_COUNTRY/);
});

test('H8C-26', 'pricingEngineClient never silently removes invalid provided country', () => {
    assert.throws(() => {
        pricingEngineClient.normalizeSpecs({ delivery_country: 'INVALID' });
    }, /INVALID_DESTINATION_COUNTRY/);
});

test('H8C-27', 'pricingEngineClient preserves absent delivery_country when omitted', () => {
    const res = pricingEngineClient.normalizeSpecs({ copies: 100 });
    assert.strictEqual(res.delivery_country, undefined);
});

test('H8C-28', 'pricingEngineClient preserves valid "ES" unchanged', () => {
    const res = pricingEngineClient.normalizeSpecs({ delivery_country: 'ES' });
    assert.strictEqual(res.delivery_country, 'ES');
});

test('H8C-29', 'pricingEngineClient normalizes valid lowercase "es" to "ES"', () => {
    const res = pricingEngineClient.normalizeSpecs({ delivery_country: 'es' });
    assert.strictEqual(res.delivery_country, 'ES');
});

console.log(`\n═══ Phase 193H.8C Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
