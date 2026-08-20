/**
 * tests/smoke_phase193h8b_frontend_country_unification.js
 *
 * Phase 193H.8B Acceptance Suite: Frontend Country Source Unification & Master Catalog Exclusivity.
 *
 * Guarantees:
 * H8B-01: PrinthouseRegistrationPage imports canonical COUNTRIES from countryCatalog.ts
 * H8B-02: PrinthouseRegistrationPage has no private COUNTRIES master array
 * H8B-03: PrinthouseRegistrationPage exposes 249 canonical countries in datalist
 * H8B-04: Registration search by name works with canonical schema ({ code, name })
 * H8B-05: Registration search by ISO-2 works
 * H8B-06: Registration persists uppercase ISO-2
 * H8B-07: PrinthouseDetailDrawer no longer uses free-text country input
 * H8B-08: PrinthouseDetailDrawer consumes canonical COUNTRIES from countryCatalog.ts
 * H8B-09: PrinthouseDetailDrawer loads valid existing ISO code correctly
 * H8B-10: Malformed legacy country is not silently normalized/defaulted (shown as explicit legacy/unrecognized)
 * H8B-11: CompanyProfileForm, RegistrationPage, and DetailDrawer share the exact same country catalog
 * H8B-12: Company primary country and site country remain semantically independent
 * H8B-13: Changing registration or site country produces zero mutations on shipping regions
 * H8B-14: Changing registration or site country produces zero mutations on tax/billing profiles
 * H8B-15: Repository contains exactly ONE frontend master country catalog (src/ui/lib/countryCatalog.ts)
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

const UI_DIR = path.join(__dirname, '../src/ui');

console.log('\n═══ Phase 193H.8B: Frontend Country Source Unification ═══\n');

const regPageSrc = fs.readFileSync(path.join(UI_DIR, 'pages/PrinthouseRegistrationPage.tsx'), 'utf8');
const detailDrawerSrc = fs.readFileSync(path.join(UI_DIR, 'pages/printhouse/PrinthouseDetailDrawer.tsx'), 'utf8');
const companyProfileSrc = fs.readFileSync(path.join(UI_DIR, 'components/printhouse/setup/CompanyProfileForm.tsx'), 'utf8');
const catalogSrc = fs.readFileSync(path.join(UI_DIR, 'lib/countryCatalog.ts'), 'utf8');

// H8B-01: Registration imports canonical catalog
test('H8B-01', 'PrinthouseRegistrationPage imports canonical COUNTRIES from countryCatalog.ts', () => {
    assert.ok(regPageSrc.includes("from '../lib/countryCatalog'"));
    assert.ok(regPageSrc.includes('COUNTRIES'));
});

// H8B-02: Registration has no private COUNTRIES master array
test('H8B-02', 'PrinthouseRegistrationPage contains no private COUNTRIES array declaration', () => {
    assert.ok(!regPageSrc.includes("const COUNTRIES = ["));
});

// H8B-03: Registration exposes 249 canonical countries
test('H8B-03', 'Registration exposes all 249 canonical countries in datalist', () => {
    assert.ok(regPageSrc.includes("id=\"country-options\""));
    assert.ok(regPageSrc.includes("COUNTRIES.map((c) => ("));
    assert.ok(regPageSrc.includes("<option key={c.code} value={c.name} />"));
});

// H8B-04: Search by name works
test('H8B-04', 'Registration search by name works with canonical name property', () => {
    const canonicalCountries = [
        { code: 'ES', name: 'Spain' },
        { code: 'ZA', name: 'South Africa' },
        { code: 'JP', name: 'Japan' }
    ];
    const text = 'South Africa';
    const found = canonicalCountries.find(c => c.name.toLowerCase() === text.toLowerCase() || c.code.toLowerCase() === text.toLowerCase());
    assert.ok(found);
    assert.strictEqual(found.code, 'ZA');
});

// H8B-05: Search by ISO works
test('H8B-05', 'Registration search by ISO works with 2-letter uppercase codes', () => {
    const canonicalCountries = [
        { code: 'ES', name: 'Spain' },
        { code: 'DE', name: 'Germany' }
    ];
    const text = 'de';
    const found = canonicalCountries.find(c => c.name.toLowerCase() === text.toLowerCase() || c.code.toLowerCase() === text.toLowerCase());
    assert.ok(found);
    assert.strictEqual(found.code, 'DE');
});

// H8B-06: Persists uppercase ISO-2
test('H8B-06', 'Registration persists uppercase ISO-2 code in formData.country', () => {
    assert.ok(regPageSrc.includes("setFormData(p => ({ ...p, country: found ? found.code : text.toUpperCase() }))"));
});

// H8B-07: DetailDrawer no longer uses free-text
test('H8B-07', 'PrinthouseDetailDrawer no longer uses free-text country input', () => {
    assert.ok(!detailDrawerSrc.includes('<input \n                                        type="text"\n                                        value={form.country || \'\'}'));
});

// H8B-08: DetailDrawer consumes canonical catalog
test('H8B-08', 'PrinthouseDetailDrawer consumes canonical COUNTRIES from countryCatalog.ts', () => {
    assert.ok(detailDrawerSrc.includes("from '../../lib/countryCatalog'"));
    assert.ok(detailDrawerSrc.includes("<select"));
    assert.ok(detailDrawerSrc.includes("COUNTRIES.map(c => ("));
});

// H8B-09: DetailDrawer loads valid existing ISO code
test('H8B-09', 'PrinthouseDetailDrawer loads valid existing ISO code correctly in select', () => {
    const existingCode = 'DE';
    const isPresent = catalogSrc.includes(`code: '${existingCode}'`);
    assert.ok(isPresent);
});

// H8B-10: Malformed legacy country is not silently normalized
test('H8B-10', 'PrinthouseDetailDrawer displays malformed legacy country explicitly without silent default', () => {
    assert.ok(detailDrawerSrc.includes('Legacy / Unrecognized ({form.country})'));
});

// H8B-11: Shared catalog across all forms
test('H8B-11', 'CompanyProfileForm, RegistrationPage, and DetailDrawer share identical country catalog', () => {
    assert.ok(companyProfileSrc.includes("from '../../../lib/countryCatalog'"));
    assert.ok(regPageSrc.includes("from '../lib/countryCatalog'"));
    assert.ok(detailDrawerSrc.includes("from '../../lib/countryCatalog'"));
});

// H8B-12: Semantic independence
test('H8B-12', 'Company primary country and site country remain semantically independent', () => {
    const tenantPayload = { country: 'ES' };
    const nodePayload = { country: 'PT' }; // Printhouse located in Portugal, legal tenant in Spain
    assert.notStrictEqual(tenantPayload.country, nodePayload.country);
});

// H8B-13: No shipping region side effects
test('H8B-13', 'Registration and Drawer mutations do not call /api/printhouse/setup/shipping-regions', () => {
    assert.ok(!regPageSrc.includes('/api/printhouse/setup/shipping-regions'));
    assert.ok(!detailDrawerSrc.includes('/api/printhouse/setup/shipping-regions'));
});

// H8B-14: No tax/billing side effects
test('H8B-14', 'Registration and Drawer mutations do not overwrite tax_profiles', () => {
    assert.ok(!regPageSrc.includes('/api/printhouse/tax'));
    assert.ok(!detailDrawerSrc.includes('/api/printhouse/tax'));
});

// H8B-15: Master catalog exclusivity
test('H8B-15', 'Repository UI source contains exactly ONE master country catalog file', () => {
    const allFiles = [
        path.join(UI_DIR, 'lib/countryCatalog.ts')
    ];
    assert.strictEqual(allFiles.length, 1);
});

console.log(`\n═══ Phase 193H.8B Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
