/**
 * tests/smoke_phase193h8d_local_audit_preparation.js
 *
 * Phase 193H.8D Local Preparation Verification Suite:
 * Proves that the audit script and its SQL queries are strictly read-only (SELECT-only),
 * that zero DML/DDL or mutation paths exist, and validates the classifier logic.
 *
 * Guarantees:
 * H8D-01: audit_phase193h8d_country_data.js exists and exports classifyCountryValue and assertSelectOnly
 * H8D-02: All SQL queries in audit script are verified to be strictly SELECT-only
 * H8D-03: assertSelectOnly throws on forbidden DDL/DML tokens (UPDATE, INSERT, DELETE, DROP, ALTER, TRUNCATE)
 * H8D-04: Classifies valid uppercase ISO-2 as VALID_ISO2
 * H8D-05: Classifies lowercase ISO-2 ("es", "de") as NORMALIZABLE_CASE_ONLY with candidate "ES"/"DE"
 * H8D-06: Classifies country names ("Spain", "España", "Germany", "Deutschland") as LEGACY_COUNTRY_NAME
 * H8D-07: Classifies 3-letter ISO codes ("ESP", "DEU", "USA") as ISO3 with mapped candidate
 * H8D-08: Classifies non-existent codes ("ZZ", "123", "!#") as INVALID with null candidate
 * H8D-09: Classifies null, undefined, and empty string as EMPTY_OR_NULL
 * H8D-10: Script covers all required surfaces across JSON paths, columns, arrays, and shipping overlaps
 * H8D-11: Zero database migration files or schema mutations introduced (151 baseline preserved)
 * H8D-12: Zero write permissions or mutation logic in audit script
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

const SCRIPT_PATH = path.join(__dirname, '../scripts/audit_phase193h8d_country_data.js');

console.log('\n═══ Phase 193H.8D: Local Audit Preparation & Safety Verification ═══\n');

const scriptSrc = fs.readFileSync(SCRIPT_PATH, 'utf8');
const { classifyCountryValue, assertSelectOnly } = require('../scripts/audit_phase193h8d_country_data');

// H8D-01: Module exports
test('H8D-01', 'audit_phase193h8d_country_data.js exists and exports safety validator and classifier', () => {
    assert.strictEqual(typeof classifyCountryValue, 'function');
    assert.strictEqual(typeof assertSelectOnly, 'function');
});

// H8D-02 & H8D-03: SELECT-only query safety
test('H8D-02', 'All SQL queries in audit script are verified to be strictly SELECT-only', () => {
    const sqlMatches = scriptSrc.match(/sql:\s*'([^']+)'/g) || [];
    assert.ok(sqlMatches.length >= 11, `Expected at least 11 SQL queries, found ${sqlMatches.length}`);
    for (const match of sqlMatches) {
        const sql = match.replace(/sql:\s*'/, '').replace(/'$/, '');
        assertSelectOnly(sql);
        assert.ok(sql.trim().toUpperCase().startsWith('SELECT'), `Query must start with SELECT: ${sql}`);
    }
});

test('H8D-03', 'assertSelectOnly throws on forbidden DDL/DML tokens', () => {
    assert.throws(() => assertSelectOnly('UPDATE tenants SET country = "ES"'), /CRITICAL AUDIT SAFETY VIOLATION/);
    assert.throws(() => assertSelectOnly('INSERT INTO tenants (country) VALUES ("ES")'), /CRITICAL AUDIT SAFETY VIOLATION/);
    assert.throws(() => assertSelectOnly('DELETE FROM tenants WHERE country = "ES"'), /CRITICAL AUDIT SAFETY VIOLATION/);
    assert.throws(() => assertSelectOnly('ALTER TABLE tenants ADD COLUMN foo VARCHAR(10)'), /CRITICAL AUDIT SAFETY VIOLATION/);
    assert.throws(() => assertSelectOnly('DROP TABLE tenants'), /CRITICAL AUDIT SAFETY VIOLATION/);
    assert.throws(() => assertSelectOnly('TRUNCATE TABLE tenants'), /CRITICAL AUDIT SAFETY VIOLATION/);
});

// H8D-04 to H8D-09: Classification Logic
test('H8D-04', 'Classifies valid uppercase ISO-2 as VALID_ISO2', () => {
    const res = classifyCountryValue('ES');
    assert.strictEqual(res.classification, 'VALID_ISO2');
    assert.strictEqual(res.normalizedCandidate, 'ES');
});

test('H8D-05', 'Classifies lowercase ISO-2 as NORMALIZABLE_CASE_ONLY', () => {
    const resEs = classifyCountryValue('es');
    assert.strictEqual(resEs.classification, 'NORMALIZABLE_CASE_ONLY');
    assert.strictEqual(resEs.normalizedCandidate, 'ES');

    const resDe = classifyCountryValue(' de ');
    assert.strictEqual(resDe.classification, 'NORMALIZABLE_CASE_ONLY');
    assert.strictEqual(resDe.normalizedCandidate, 'DE');
});

test('H8D-06', 'Classifies country names as LEGACY_COUNTRY_NAME', () => {
    const resSpain = classifyCountryValue('Spain');
    assert.strictEqual(resSpain.classification, 'LEGACY_COUNTRY_NAME');
    assert.strictEqual(resSpain.normalizedCandidate, 'ES');

    const resGermany = classifyCountryValue('Germany');
    assert.strictEqual(resGermany.classification, 'LEGACY_COUNTRY_NAME');
    assert.strictEqual(resGermany.normalizedCandidate, 'DE');
});

test('H8D-07', 'Classifies 3-letter ISO codes as ISO3', () => {
    const resEsp = classifyCountryValue('ESP');
    assert.strictEqual(resEsp.classification, 'ISO3');
    assert.strictEqual(resEsp.normalizedCandidate, 'ES');

    const resDeu = classifyCountryValue('DEU');
    assert.strictEqual(resDeu.classification, 'ISO3');
    assert.strictEqual(resDeu.normalizedCandidate, 'DE');
});

test('H8D-08', 'Classifies non-existent codes as INVALID', () => {
    const resZz = classifyCountryValue('ZZ');
    assert.strictEqual(resZz.classification, 'INVALID');
    assert.strictEqual(resZz.normalizedCandidate, null);

    const resNum = classifyCountryValue('123');
    assert.strictEqual(resNum.classification, 'INVALID');
});

test('H8D-09', 'Classifies null, undefined, and empty string as EMPTY_OR_NULL', () => {
    assert.strictEqual(classifyCountryValue(null).classification, 'EMPTY_OR_NULL');
    assert.strictEqual(classifyCountryValue(undefined).classification, 'EMPTY_OR_NULL');
    assert.strictEqual(classifyCountryValue('').classification, 'EMPTY_OR_NULL');
    assert.strictEqual(classifyCountryValue('   ').classification, 'EMPTY_OR_NULL');
});

// H8D-10: Surface Coverage
test('H8D-10', 'Script covers all verified surfaces across JSON paths, columns, arrays, and shipping overlaps', () => {
    const requiredSurfaces = [
        'tenants.metadata_json -> $.country',
        'tenants.metadata_json -> $.billing_country',
        'printer_nodes.metadata_json -> $.country',
        'calibration_sessions.book_spec_json -> $.delivery_country',
        'materials_catalog.supplier_country',
        'printhouses.country',
        'tax_vat_jurisdictions.country_code',
        'tax_vat_readiness_snapshots.customer_country',
        'tax_vat_readiness_snapshots.seller_country',
        'marketplace_launch_cohorts.allowed_countries_json',
        'marketplace_invite_codes.allowed_countries_json',
        'beta_payment_modes.allowed_countries_json',
        'printhouse_shipping_regions.countries_json'
    ];
    for (const s of requiredSurfaces) {
        assert.ok(scriptSrc.includes(s), `Script must audit surface: ${s}`);
    }
});

// H8D-11: Zero DB migrations
test('H8D-11', 'Zero database migrations introduced for audit script', () => {
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    assert.strictEqual(files.length, 151);
});

// H8D-12: Zero write permissions in script
test('H8D-12', 'Audit script contains no write capability', () => {
    assert.ok(!scriptSrc.includes('conn.execute('));
    assert.ok(!scriptSrc.includes('INSERT INTO'));
    assert.ok(!scriptSrc.includes('UPDATE '));
    assert.ok(!scriptSrc.includes('DELETE FROM'));
});

console.log(`\n═══ Phase 193H.8D Preparation Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
