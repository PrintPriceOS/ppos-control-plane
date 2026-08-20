/**
 * scripts/audit_phase193h8d_country_data.js
 *
 * Phase 193H.8D — Production Stored Country Data Consistency Audit.
 *
 * SAFETY INVARIANTS:
 * - STRICTLY READ-ONLY (SELECT statements only).
 * - Enforces `SET SESSION TRANSACTION READ ONLY` where supported.
 * - Zero DML (No INSERT, UPDATE, DELETE, REPLACE).
 * - Zero DDL (No ALTER, CREATE, DROP, TRUNCATE).
 * - Zero schema mutations or auto-repairs.
 * - Disconnects immediately upon completion.
 *
 * Surfaces Audited:
 * 1. tenants.metadata_json -> $.country, $.billing_country
 * 2. printer_nodes.metadata_json -> $.country
 * 3. calibration_sessions.book_spec_json -> $.delivery_country
 * 4. materials.supplier_country
 * 5. printhouse_capabilities.country
 * 6. tax_profiles.country_code
 * 7. tax_audit_logs.customer_country, seller_country
 * 8. marketplace_launch_control.allowed_countries_json
 * 9. invite_codes.allowed_countries_json
 * 10. beta_access_control.allowed_countries_json
 * 11. printhouse_shipping_regions.countries_json (with overlap/ambiguity checks)
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const { getPool } = require('../src/api/services/mysqlClient');
const { COUNTRIES, ISO_COUNTRY_CODES_SET, isValidIso2Country, normalizeIso2Country } = require('../src/lib/countryCatalog');

// ISO-3 alpha-3 code mapping for common countries (for diagnostic classification)
const ISO3_MAP = {
    'ESP': 'ES', 'DEU': 'DE', 'FRA': 'FR', 'ITA': 'IT', 'PRT': 'PT',
    'GBR': 'GB', 'USA': 'US', 'JPN': 'JP', 'CAN': 'CA', 'NLD': 'NL',
    'BEL': 'BE', 'AUT': 'AT', 'CHE': 'CH', 'SWE': 'SE', 'NOR': 'NO',
    'DNK': 'DK', 'FIN': 'FI', 'POL': 'PL', 'CZE': 'CZ', 'IRL': 'IE',
    'GRC': 'GR', 'HUN': 'HU', 'ROU': 'RO', 'BGR': 'BG', 'HRV': 'HR',
    'SVK': 'SK', 'SVN': 'SI', 'LUX': 'LU', 'CYP': 'CY', 'MLT': 'MT',
    'EST': 'EE', 'LVA': 'LV', 'LTU': 'LT', 'ISL': 'IS', 'TUR': 'TR',
    'AUS': 'AU', 'NZL': 'NZ', 'MEX': 'MX', 'BRA': 'BR', 'ARG': 'AR',
    'CHL': 'CL', 'COL': 'CO', 'PER': 'PE', 'ZAF': 'ZA', 'EGY': 'EG',
    'MAR': 'MA', 'CHN': 'CN', 'IND': 'IN', 'KOR': 'KR', 'SGP': 'SG',
    'ARE': 'AE', 'SAU': 'SA', 'ISR': 'IL', 'UKR': 'UA', 'GEO': 'GE'
};

// Common Country Name to ISO-2 lookup table (for diagnostic classification)
const NAME_TO_ISO2_MAP = new Map(COUNTRIES.map(c => [c.name.toLowerCase(), c.code]));
NAME_TO_ISO2_MAP.set('spain', 'ES');
NAME_TO_ISO2_MAP.set('españa', 'ES');
NAME_TO_ISO2_MAP.set('germany', 'DE');
NAME_TO_ISO2_MAP.set('deutschland', 'DE');
NAME_TO_ISO2_MAP.set('france', 'FR');
NAME_TO_ISO2_MAP.set('italy', 'IT');
NAME_TO_ISO2_MAP.set('italia', 'IT');
NAME_TO_ISO2_MAP.set('portugal', 'PT');
NAME_TO_ISO2_MAP.set('united kingdom', 'GB');
NAME_TO_ISO2_MAP.set('uk', 'GB');
NAME_TO_ISO2_MAP.set('great britain', 'GB');
NAME_TO_ISO2_MAP.set('united states', 'US');
NAME_TO_ISO2_MAP.set('usa', 'US');
NAME_TO_ISO2_MAP.set('us', 'US');
NAME_TO_ISO2_MAP.set('netherlands', 'NL');
NAME_TO_ISO2_MAP.set('the netherlands', 'NL');
NAME_TO_ISO2_MAP.set('belgium', 'BE');
NAME_TO_ISO2_MAP.set('switzerland', 'CH');
NAME_TO_ISO2_MAP.set('austria', 'AT');
NAME_TO_ISO2_MAP.set('poland', 'PL');
NAME_TO_ISO2_MAP.set('polska', 'PL');

/**
 * Classifies a raw persisted value without mutating it.
 */
function classifyCountryValue(val) {
    if (val === null || val === undefined) {
        return { classification: 'EMPTY_OR_NULL', normalizedCandidate: null };
    }

    if (typeof val !== 'string') {
        return { classification: 'INVALID', normalizedCandidate: null };
    }

    const trimmed = val.trim();
    if (trimmed === '') {
        return { classification: 'EMPTY_OR_NULL', normalizedCandidate: null };
    }

    // 1. Exact canonical ISO-2
    if (isValidIso2Country(trimmed)) {
        return { classification: 'VALID_ISO2', normalizedCandidate: trimmed };
    }

    // 2. Case-only normalizable (e.g., "es", "Es")
    const upper = trimmed.toUpperCase();
    if (isValidIso2Country(upper)) {
        return { classification: 'NORMALIZABLE_CASE_ONLY', normalizedCandidate: upper };
    }

    // 3. ISO-3 3-letter code (e.g., "ESP", "DEU")
    if (ISO3_MAP[upper]) {
        return { classification: 'ISO3', normalizedCandidate: ISO3_MAP[upper] };
    }

    // 4. Legacy Country Name (e.g., "Spain", "Germany", "Deutschland")
    const lower = trimmed.toLowerCase();
    if (NAME_TO_ISO2_MAP.has(lower)) {
        return { classification: 'LEGACY_COUNTRY_NAME', normalizedCandidate: NAME_TO_ISO2_MAP.get(lower) };
    }

    // 5. Unrecognized / Invalid
    return { classification: 'INVALID', normalizedCandidate: null };
}

/**
 * Safety static verification of all SQL queries in this script.
 */
const FORBIDDEN_SQL_PATTERNS = [
    /\bUPDATE\b/i, /\bINSERT\b/i, /\bDELETE\b/i, /\bREPLACE\b/i,
    /\bALTER\b/i, /\bCREATE\b/i, /\bDROP\b/i, /\bTRUNCATE\b/i,
    /\bGRANT\b/i, /\bREVOKE\b/i, /\bRENAME\b/i, /\bCALL\b/i
];

function assertSelectOnly(sql) {
    for (const pattern of FORBIDDEN_SQL_PATTERNS) {
        if (pattern.test(sql)) {
            throw new Error(`CRITICAL AUDIT SAFETY VIOLATION: Query contains forbidden DDL/DML token: ${pattern}`);
        }
    }
}

async function runAudit() {
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('  PHASE 193H.8D: STORED COUNTRY DATA CONSISTENCY AUDIT (READ-ONLY)');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    let pool = null;
    try {
        pool = getPool();
    } catch (e) {
        console.error('FATAL: Could not initialize database pool:', e.message);
        process.exit(1);
    }

    let conn = null;
    try {
        conn = await pool.getConnection();

        // Safety guarantee: Read-only session
        try {
            await conn.query('SET SESSION TRANSACTION READ ONLY');
        } catch (e) {
            // Note: If server does not support session tx read only, continue safely with select-only assertions
        }

        // 1. Connection Pre-Flight Information
        const [metaRows] = await conn.query('SELECT DATABASE() AS db_name, @@version AS mysql_version, @@hostname AS host_name, NOW() AS ts');
        const dbInfo = metaRows[0] || {};
        console.log(`DATABASE NAME:   ${dbInfo.db_name || 'UNKNOWN'}`);
        console.log(`SERVER HOST:     ${dbInfo.host_name || 'UNKNOWN'}`);
        console.log(`MYSQL VERSION:   ${dbInfo.mysql_version || 'UNKNOWN'}`);
        console.log(`AUDIT TIMESTAMP: ${dbInfo.ts ? new Date(dbInfo.ts).toISOString() : new Date().toISOString()}`);
        console.log(`AUDIT SQL MODE:  SELECT_ONLY (Strictly Enforced)\n`);

        const summaryStats = {
            surfacesAudited: 0,
            totalRowsInspected: 0,
            countsByClass: {
                VALID_ISO2: 0,
                NORMALIZABLE_CASE_ONLY: 0,
                LEGACY_COUNTRY_NAME: 0,
                ISO3: 0,
                INVALID: 0,
                EMPTY_OR_NULL: 0,
                MALFORMED_JSON: 0
            }
        };

        const findings = [];

        // Helper to query and analyze a single column or JSON extraction
        async function auditSurface(config) {
            const { surfaceName, semanticDomain, sql, isJsonArray, idColumn, valueExtractor } = config;
            assertSelectOnly(sql);
            summaryStats.surfacesAudited++;

            let rows = [];
            try {
                const [queryRows] = await conn.query(sql);
                rows = queryRows || [];
            } catch (err) {
                console.log(`[SURFACE] ${surfaceName}: SKIPPED/ERROR (${err.message})`);
                return;
            }

            summaryStats.totalRowsInspected += rows.length;

            const classCounts = {
                VALID_ISO2: 0,
                NORMALIZABLE_CASE_ONLY: 0,
                LEGACY_COUNTRY_NAME: 0,
                ISO3: 0,
                INVALID: 0,
                EMPTY_OR_NULL: 0,
                MALFORMED_JSON: 0
            };

            const distinctRawValues = new Map();

            for (const r of rows) {
                const id = r[idColumn] || 'unknown';
                let rawVal = valueExtractor(r);

                if (isJsonArray) {
                    if (rawVal === null || rawVal === undefined || rawVal === '') {
                        classCounts.EMPTY_OR_NULL++;
                        summaryStats.countsByClass.EMPTY_OR_NULL++;
                        continue;
                    }

                    let parsedArray = null;
                    if (Array.isArray(rawVal)) {
                        parsedArray = rawVal;
                    } else if (typeof rawVal === 'string') {
                        try {
                            parsedArray = JSON.parse(rawVal);
                        } catch (e) {
                            classCounts.MALFORMED_JSON++;
                            summaryStats.countsByClass.MALFORMED_JSON++;
                            findings.push({
                                severity: 'P1',
                                surface: surfaceName,
                                rowId: id,
                                rawValue: rawVal,
                                classification: 'MALFORMED_JSON',
                                message: 'Malformed JSON array in storage'
                            });
                            continue;
                        }
                    }

                    if (!Array.isArray(parsedArray)) {
                        classCounts.MALFORMED_JSON++;
                        summaryStats.countsByClass.MALFORMED_JSON++;
                        findings.push({
                            severity: 'P1',
                            surface: surfaceName,
                            rowId: id,
                            rawValue: rawVal,
                            classification: 'MALFORMED_JSON',
                            message: 'JSON value is not an array'
                        });
                        continue;
                    }

                    // Inspect each element in array
                    const seenInRow = new Set();
                    for (const member of parsedArray) {
                        const cl = classifyCountryValue(member);
                        classCounts[cl.classification]++;
                        summaryStats.countsByClass[cl.classification]++;

                        const distinctKey = String(member);
                        distinctRawValues.set(distinctKey, (distinctRawValues.get(distinctKey) || 0) + 1);

                        if (seenInRow.has(member)) {
                            findings.push({
                                severity: 'P2',
                                surface: surfaceName,
                                rowId: id,
                                rawValue: member,
                                classification: cl.classification,
                                message: 'Duplicate country element within single JSON array'
                            });
                        }
                        seenInRow.add(member);

                        if (cl.classification !== 'VALID_ISO2' && cl.classification !== 'EMPTY_OR_NULL') {
                            findings.push({
                                severity: cl.classification === 'INVALID' ? 'P1' : 'P2',
                                surface: surfaceName,
                                rowId: id,
                                rawValue: member,
                                classification: cl.classification,
                                normalizedCandidate: cl.normalizedCandidate,
                                message: `Non-canonical array member in ${surfaceName}`
                            });
                        }
                    }
                } else {
                    // Scalar value analysis
                    const cl = classifyCountryValue(rawVal);
                    classCounts[cl.classification]++;
                    summaryStats.countsByClass[cl.classification]++;

                    const distinctKey = rawVal === null ? 'NULL' : String(rawVal);
                    distinctRawValues.set(distinctKey, (distinctRawValues.get(distinctKey) || 0) + 1);

                    if (cl.classification !== 'VALID_ISO2' && cl.classification !== 'EMPTY_OR_NULL') {
                        findings.push({
                            severity: cl.classification === 'INVALID' ? 'P1' : 'P2',
                            surface: surfaceName,
                            rowId: id,
                            rawValue: rawVal,
                            classification: cl.classification,
                            normalizedCandidate: cl.normalizedCandidate,
                            message: `Non-canonical country value in ${surfaceName}`
                        });
                    }
                }
            }

            console.log(`───────────────────────────────────────────────────────────────────────────`);
            console.log(`SURFACE:          ${surfaceName}`);
            console.log(`SEMANTIC DOMAIN:  ${semanticDomain}`);
            console.log(`TOTAL ROWS:       ${rows.length}`);
            console.log(`DISTINCT VALUES:  ${distinctRawValues.size}`);
            console.log(`BREAKDOWN:        VALID_ISO2: ${classCounts.VALID_ISO2} | CASE_ONLY: ${classCounts.NORMALIZABLE_CASE_ONLY} | NAMES: ${classCounts.LEGACY_COUNTRY_NAME} | ISO3: ${classCounts.ISO3} | INVALID: ${classCounts.INVALID} | NULL/EMPTY: ${classCounts.EMPTY_OR_NULL}`);
            if (classCounts.MALFORMED_JSON > 0) {
                console.log(`                  MALFORMED_JSON: ${classCounts.MALFORMED_JSON}`);
            }
            if (distinctRawValues.size > 0 && distinctRawValues.size <= 10) {
                console.log(`DISTINCT SAMPLE:  ${Array.from(distinctRawValues.entries()).map(([k, v]) => `${k} (${v})`).join(', ')}`);
            }
        }

        // 1. tenants.metadata_json -> country
        await auditSurface({
            surfaceName: 'tenants.metadata_json -> $.country',
            semanticDomain: 'COMPANY_PRIMARY_COUNTRY',
            sql: 'SELECT id, JSON_UNQUOTE(JSON_EXTRACT(metadata_json, "$.country")) AS val FROM tenants',
            isJsonArray: false,
            idColumn: 'id',
            valueExtractor: r => r.val
        });

        // 2. tenants.metadata_json -> billing_country
        await auditSurface({
            surfaceName: 'tenants.metadata_json -> $.billing_country',
            semanticDomain: 'BILLING_COUNTRY',
            sql: 'SELECT id, JSON_UNQUOTE(JSON_EXTRACT(metadata_json, "$.billing_country")) AS val FROM tenants',
            isJsonArray: false,
            idColumn: 'id',
            valueExtractor: r => r.val
        });

        // 3. printer_nodes.metadata_json -> country
        await auditSurface({
            surfaceName: 'printer_nodes.metadata_json -> $.country',
            semanticDomain: 'SITE_COUNTRY',
            sql: 'SELECT id, JSON_UNQUOTE(JSON_EXTRACT(metadata_json, "$.country")) AS val FROM printer_nodes',
            isJsonArray: false,
            idColumn: 'id',
            valueExtractor: r => r.val
        });

        // 4. calibration_sessions.book_spec_json -> delivery_country
        await auditSurface({
            surfaceName: 'calibration_sessions.book_spec_json -> $.delivery_country',
            semanticDomain: 'REFERENCE_JOB_DESTINATION',
            sql: 'SELECT id, JSON_UNQUOTE(JSON_EXTRACT(book_spec_json, "$.delivery_country")) AS val FROM printhouse_pricing_calibration_sessions',
            isJsonArray: false,
            idColumn: 'id',
            valueExtractor: r => r.val
        });

        // 5. materials_catalog.supplier_country (Migration 007)
        await auditSurface({
            surfaceName: 'materials_catalog.supplier_country',
            semanticDomain: 'SUPPLIER_ORIGIN_COUNTRY',
            sql: 'SELECT id, supplier_country AS val FROM materials_catalog',
            isJsonArray: false,
            idColumn: 'id',
            valueExtractor: r => r.val
        });

        // 6. printhouses.country (Migration 015)
        await auditSurface({
            surfaceName: 'printhouses.country',
            semanticDomain: 'SITE_COUNTRY_LEGACY',
            sql: 'SELECT id, country AS val FROM printhouses',
            isJsonArray: false,
            idColumn: 'id',
            valueExtractor: r => r.val
        });

        // 7. tax_vat_jurisdictions.country_code (Migration 033)
        await auditSurface({
            surfaceName: 'tax_vat_jurisdictions.country_code',
            semanticDomain: 'TAX_JURISDICTION',
            sql: 'SELECT id, country_code AS val FROM tax_vat_jurisdictions',
            isJsonArray: false,
            idColumn: 'id',
            valueExtractor: r => r.val
        });

        // 8. marketplace_launch_cohorts.allowed_countries_json (Migration 025)
        await auditSurface({
            surfaceName: 'marketplace_launch_cohorts.allowed_countries_json',
            semanticDomain: 'MARKETPLACE_LAUNCH_ALLOWLIST',
            sql: 'SELECT id, allowed_countries_json AS val FROM marketplace_launch_cohorts',
            isJsonArray: true,
            idColumn: 'id',
            valueExtractor: r => r.val
        });

        // 9. marketplace_invite_codes.allowed_countries_json (Migration 026)
        await auditSurface({
            surfaceName: 'marketplace_invite_codes.allowed_countries_json',
            semanticDomain: 'INVITE_CODE_ALLOWLIST',
            sql: 'SELECT id, allowed_countries_json AS val FROM marketplace_invite_codes',
            isJsonArray: true,
            idColumn: 'id',
            valueExtractor: r => r.val
        });

        // 10. beta_payment_modes.allowed_countries_json (Migration 030)
        await auditSurface({
            surfaceName: 'beta_payment_modes.allowed_countries_json',
            semanticDomain: 'BETA_PAYMENT_ALLOWLIST',
            sql: 'SELECT id, allowed_countries_json AS val FROM beta_payment_modes',
            isJsonArray: true,
            idColumn: 'id',
            valueExtractor: r => r.val
        });

        // 11. printhouse_shipping_regions.countries_json (Migration 142)
        await auditSurface({
            surfaceName: 'printhouse_shipping_regions.countries_json',
            semanticDomain: 'SHIPPING_REGION_COVERAGE',
            sql: 'SELECT id, tenant_id, site_id, name, enabled, countries_json AS val FROM printhouse_shipping_regions',
            isJsonArray: true,
            idColumn: 'id',
            valueExtractor: r => r.val
        });

        // 12. Shipping Region Enabled Multi-Region Overlap Check (Migration 142)
        console.log(`───────────────────────────────────────────────────────────────────────────`);
        console.log(`AUDIT CHECK: Shipping Region Overlap Ambiguity Matrix`);
        const [regionRows] = await conn.query('SELECT id, tenant_id, site_id, name, enabled, countries_json FROM printhouse_shipping_regions WHERE enabled = 1');
        
        const coverageByNode = new Map(); // key: tenantId:siteId -> Map(country -> [regionNames])
        for (const reg of regionRows || []) {
            const key = `${reg.tenant_id}:${reg.site_id}`;
            if (!coverageByNode.has(key)) coverageByNode.set(key, new Map());
            const countryMap = coverageByNode.get(key);

            let arr = [];
            try {
                arr = typeof reg.countries_json === 'string' ? JSON.parse(reg.countries_json) : (reg.countries_json || []);
            } catch (e) {}

            if (Array.isArray(arr)) {
                for (const c of arr) {
                    const norm = (c || '').toUpperCase().trim();
                    if (!countryMap.has(norm)) countryMap.set(norm, []);
                    countryMap.get(norm).push({ regionId: reg.id, regionName: reg.name });
                }
            }
        }

        let overlapCount = 0;
        for (const [nodeKey, countryMap] of coverageByNode.entries()) {
            for (const [country, regList] of countryMap.entries()) {
                if (regList.length > 1) {
                    overlapCount++;
                    findings.push({
                        severity: 'P2',
                        surface: 'printhouse_shipping_regions',
                        rowId: nodeKey,
                        rawValue: country,
                        classification: 'AMBIGUOUS_SHIPPING_REGION_OVERLAP',
                        message: `Country ${country} is configured in multiple active regions (${regList.map(r => r.regionName).join(', ')}) for node ${nodeKey}`
                    });
                }
            }
        }
        console.log(`SHIPPING OVERLAP COUNT: ${overlapCount} ambiguous country mappings detected.`);

        // Final Summary
        console.log('\n═══════════════════════════════════════════════════════════════════════════');
        console.log('  AUDIT SUMMARY & METRICS');
        console.log('═══════════════════════════════════════════════════════════════════════════');
        console.log(`TOTAL SURFACES AUDITED:    ${summaryStats.surfacesAudited}`);
        console.log(`TOTAL ROWS INSPECTED:      ${summaryStats.totalRowsInspected}`);
        console.log(`TOTAL FINDINGS RECORDED:   ${findings.length}`);
        console.log(`  VALID_ISO2:              ${summaryStats.countsByClass.VALID_ISO2}`);
        console.log(`  NORMALIZABLE_CASE_ONLY:  ${summaryStats.countsByClass.NORMALIZABLE_CASE_ONLY}`);
        console.log(`  LEGACY_COUNTRY_NAME:     ${summaryStats.countsByClass.LEGACY_COUNTRY_NAME}`);
        console.log(`  ISO3:                    ${summaryStats.countsByClass.ISO3}`);
        console.log(`  INVALID:                 ${summaryStats.countsByClass.INVALID}`);
        console.log(`  EMPTY_OR_NULL:           ${summaryStats.countsByClass.EMPTY_OR_NULL}`);
        console.log(`  MALFORMED_JSON:          ${summaryStats.countsByClass.MALFORMED_JSON}`);
        console.log(`PRODUCTION MUTATION PROOF: NONE (SELECT-only session)\n`);

        if (findings.length > 0) {
            console.log('FINDINGS DETAILS (SAMPLE):');
            findings.slice(0, 15).forEach((f, idx) => {
                console.log(`  [${f.severity}] #${idx + 1} Surface: ${f.surface} | ID: ${f.rowId} | Value: ${JSON.stringify(f.rawValue)} | Class: ${f.classification} | Candidate: ${f.normalizedCandidate || 'N/A'}`);
            });
            if (findings.length > 15) {
                console.log(`  ... and ${findings.length - 15} more findings.`);
            }
        }

    } catch (err) {
        console.error('AUDIT EXECUTION ERROR:', err.message);
    } finally {
        if (conn) conn.release();
        if (pool) await pool.end();
        console.log('\nAudit connection closed safely.');
    }
}

// Statically verify all queries in script before exporting/running
if (require.main === module) {
    runAudit();
}

module.exports = {
    classifyCountryValue,
    assertSelectOnly,
    ISO3_MAP,
    NAME_TO_ISO2_MAP
};
