/**
 * scripts/test_onboarding_connected_suite.js
 *
 * Dedicated Connected Onboarding & Calibration Test Suite for PrintPrice OS Control Plane.
 * Conforms strictly to the official MySQL schema and validated connected harness architecture.
 *
 * STRICT EXECUTION & SECURITY GUARDRAILS:
 * 1. Zero dotenv loading. No fallback to generic MYSQL_* / DATABASE_URL.
 *    Clean DATABASE_URL and MYSQL_URL before importing services.
 * 2. MySQL target exclusively: 127.0.0.1:3306, db: pposrcmdw0qdtest, user: ppos_rc_mdw0qd.
 *    Positive verification: SELECT CURRENT_USER(), DATABASE() on direct connection and CP pool.
 *    Exact required identity: ppos_rc_mdw0qd@127.0.0.1 on pposrcmdw0qdtest.
 * 3. Zero DDL/CREATE TABLE. Conforms strictly to official migrated MySQL schema.
 * 4. Rigorous schema compliance:
 *    - Creates official `tenants` records before referencing in `printer_nodes`.
 *    - `printer_nodes` seeded with initial valid rates matrix fixture (rates_json ONLY; no nonexistent rates_checksum column).
 *    - Creates real users in `control_users` and trackable authenticated sessions in `user_sessions` via `userSessionService.createSession`.
 *    - Issues standard JWTs (sub, jti, tenant_id, role, issuer, audience) validating `userSessionService.validateSession` contract.
 *    - `printhouse_pricing_revisions` queries by printer_node_id and rates_checksum (not printhouse_id/version/checksum).
 *    - Tracks and cleans `printhouse_pricing_calibration_acceptances`.
 * 5. Unique IDs per execution. Tracks all created IDs and performs automatic orphan discovery by execution tenant.
 *    Deterministic teardown in strict foreign-key order across all 8 tables:
 *    `acceptances` -> `revisions` -> `runs` -> `sessions` -> `user_sessions` -> `control_users` -> `printer_nodes` -> `tenants`.
 *    Cleanup verification checks zero residuals in all 8 affected tables; cleanup failure exits with code 1.
 * 6. Effective scope:
 *    - Official routes: POST for /ready, POST for /reject (cancellation), POST for /calculate, POST for /accept.
 *    - Strict cross-tenant isolation testing using a REAL session and REAL run ID belonging to Tenant A.
 *    - Real cancellation flow: tests POST /reject, verifying status 'REJECTED' and rates matching initial baseline.
 *    - Commercial isolation: asserts zero publications in `bpe_pricing_publications` and zero activation grants in `printhouse_activation_grants`
 *      (including production_dispatch_allowed, marketplace_visible, job_routing_allowed, live_quoting_allowed) without silent error catchers.
 *    - Verifies cryptographic integrity of rates_checksum by computing canonical SHA-256 exclusively from stored rates_json.
 * 7. Clean server, client, and pool shutdown with HTTP timeouts.
 */

'use strict';

// ── 1. FAIL-SAFE ENVIRONMENT & PARAMETER ENFORCEMENT ──
if (process.env.NODE_ENV === 'production' || process.env.PPOS_ENV === 'production') {
    console.error('[FATAL] test_onboarding_connected_suite.js MUST NEVER be executed in production.');
    process.exit(1);
}

// Explicitly remove any inherited connection strings that could point to production
delete process.env.DATABASE_URL;
delete process.env.MYSQL_URL;
delete process.env.MONGODB_URI;

const REQUIRED_MYSQL = {
    host: '127.0.0.1',
    port: 3306,
    user: 'ppos_rc_mdw0qd',
    database: 'pposrcmdw0qdtest'
};

const isRegressionMode = process.argv.includes('--regressions') || process.argv.includes('--self-test');

const configuredMysqlHost = process.env.PPOS_TEST_MYSQL_HOST || REQUIRED_MYSQL.host;
const configuredMysqlPort = parseInt(process.env.PPOS_TEST_MYSQL_PORT || String(REQUIRED_MYSQL.port), 10);
const configuredMysqlUser = process.env.PPOS_TEST_MYSQL_USER || REQUIRED_MYSQL.user;
const configuredMysqlDb = process.env.PPOS_TEST_MYSQL_DATABASE || REQUIRED_MYSQL.database;

if (require.main === module && !isRegressionMode) {
    if (configuredMysqlHost !== REQUIRED_MYSQL.host ||
        configuredMysqlPort !== REQUIRED_MYSQL.port ||
        configuredMysqlUser !== REQUIRED_MYSQL.user ||
        configuredMysqlDb !== REQUIRED_MYSQL.database) {
        console.error(`\n[FATAL] Configuration rejected: MySQL parameters must be strictly identical to:`);
        console.error(`  Host: ${REQUIRED_MYSQL.host}`);
        console.error(`  Port: ${REQUIRED_MYSQL.port}`);
        console.error(`  User: ${REQUIRED_MYSQL.user}`);
        console.error(`  Database: ${REQUIRED_MYSQL.database}`);
        console.error(`Attempted configuration: ${configuredMysqlUser}@${configuredMysqlHost}:${configuredMysqlPort}/${configuredMysqlDb}`);
        process.exit(1);
    }

    const testPassword = process.env.PPOS_TEST_MYSQL_PASSWORD;
    if (!testPassword || typeof testPassword !== 'string' || testPassword.trim() === '') {
        console.error('\n[FATAL] Missing required environment variable: PPOS_TEST_MYSQL_PASSWORD');
        console.error('Explicit test password must be supplied via PPOS_TEST_MYSQL_PASSWORD.');
        process.exit(1);
    }

    // Set CP environment variables strictly before importing CP services and routes
    process.env.MYSQL_HOST = REQUIRED_MYSQL.host;
    process.env.MYSQL_PORT = String(REQUIRED_MYSQL.port);
    process.env.MYSQL_USER = REQUIRED_MYSQL.user;
    process.env.MYSQL_PASSWORD = testPassword;
    process.env.MYSQL_DATABASE = REQUIRED_MYSQL.database;
} else {
    // Standalone regression mode or unit test require
    process.env.MYSQL_HOST = process.env.MYSQL_HOST || REQUIRED_MYSQL.host;
    process.env.MYSQL_PORT = process.env.MYSQL_PORT || String(REQUIRED_MYSQL.port);
    process.env.MYSQL_USER = process.env.MYSQL_USER || REQUIRED_MYSQL.user;
    process.env.MYSQL_PASSWORD = process.env.PPOS_TEST_MYSQL_PASSWORD || 'regression_mode_placeholder';
    process.env.MYSQL_DATABASE = process.env.MYSQL_DATABASE || REQUIRED_MYSQL.database;
}

/**
 * Resolves the explicit test MySQL password with verified scope.
 * Reads EXCLUSIVELY from process.env.PPOS_TEST_MYSQL_PASSWORD without fallbacks.
 * Validates presence, non-empty, and non-placeholder value before any connection attempt.
 * Never prints or leaks credentials.
 *
 * @returns {string} Explicit password for isolated test MySQL
 */
function resolveConnectedMysqlPassword() {
    const candidate = process.env.PPOS_TEST_MYSQL_PASSWORD;
    if (typeof candidate !== 'string' || candidate.trim() === '' || candidate === 'regression_mode_placeholder') {
        throw new Error('MISSING_TEST_PASSWORD: Explicit test password must be supplied via PPOS_TEST_MYSQL_PASSWORD before creating MySQL connections.');
    }
    return candidate;
}

/**
 * Builds the direct MySQL connection config ensuring positive identity and proper credential scoping.
 *
 * @returns {{ host: string, port: number, user: string, password: string, database: string }}
 */
function getDirectMysqlConnectionConfig() {
    const password = resolveConnectedMysqlPassword();
    return {
        host: REQUIRED_MYSQL.host,
        port: REQUIRED_MYSQL.port,
        user: REQUIRED_MYSQL.user,
        password,
        database: REQUIRED_MYSQL.database
    };
}

delete process.env.DATABASE_URL;
delete process.env.MYSQL_URL;

const JWT_SECRET = process.env.JWT_TEST_SECRET || 'test_isolated_connected_secret_key_2026';
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ppos:control';
process.env.JWT_ISSUER = process.env.JWT_ISSUER || 'https://auth.printprice.pro';

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// Import Control Plane services with verified clean environment
const mysqlClient = require('../src/api/services/mysqlClient');
const userSessionService = require('../src/api/services/userSessionService');
const printhouseOnboardingRoutes = require('../src/api/routes/printhouseOnboardingRoutes');
const pricingAdapter = require('../src/api/services/buildPriceCalibrationAdapter');
const deterministicSolver = require('../src/api/services/deterministicInversePricingSolver');
const calibrationAcceptanceService = require('../src/api/services/calibrationAcceptanceService');
const {
    DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE,
    DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT,
    CANONICAL_ACCEPTABLE_RUN_STATUSES,
    computeGovernanceTolerance
} = require('../src/api/services/calibrationGovernanceTolerances');

// ── 2. CANONICAL STRINGIFY & CHECKSUM UTILITIES ──
function canonicalStringify(obj) {
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(v => canonicalStringify(v)).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

function computeCanonicalRatesChecksum(rates) {
    if (!rates) return null;
    const parsed = typeof rates === 'string' ? JSON.parse(rates) : rates;
    const canonical = canonicalStringify(parsed);
    return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Normalizes a rates checksum admitting strictly 64-character hexadecimal,
 * with or without 'sha256:' prefix.
 *
 * Rejects:
 * - missing values (null, undefined, empty string, whitespace)
 * - incorrect types (non-strings)
 * - invalid lengths (not exactly 64 hex chars, or not exactly 71 chars if prefixed)
 * - non-hexadecimal characters
 * - corrupted or multiple prefixes
 *
 * Returns strictly 64 lowercase hex characters, or null if invalid.
 * Does NOT perform indiscriminate prefix stripping.
 *
 * @param {any} checksum
 * @returns {string|null} 64 lowercase hex characters, or null if invalid
 */
function normalizeSha256Hex(checksum) {
    if (typeof checksum !== 'string') return null;
    const trimmed = checksum.trim();
    if (!trimmed) return null;

    // Strict validation: must match either exactly 64 hex chars OR 'sha256:' followed by exactly 64 hex chars
    // Case-insensitive for hex and prefix, returns strictly lowercase 64 hex characters
    const match = trimmed.match(/^(?:sha256:)?([0-9a-fA-F]{64})$/i);
    if (!match) return null;
    return match[1].toLowerCase();
}

/**
 * Generates sanitized diagnostic metadata for invalid checksum inputs.
 * NEVER echoes or inspects substrings of the input value to prevent secret leakage.
 * Displays exclusively:
 * - origen: stored o computed
 * - tipo recibido
 * - longitud (si es string)
 * - motivo del rechazo
 *
 * @param {'stored'|'computed'} origin
 * @param {any} val
 * @returns {string}
 */
function describeInvalidChecksum(origin, val) {
    const valType = val === null ? 'null' : typeof val;
    if (valType !== 'string') {
        return `[origen: ${origin}] [tipo: ${valType}] [motivo: Valor ausente o tipo no string]`;
    }

    const len = val.length;
    const trimmed = val.trim();
    if (trimmed.length === 0) {
        return `[origen: ${origin}] [tipo: string] [longitud: ${len}] [motivo: Cadena vacía o solo espacios en blanco]`;
    }

    let reason = 'Formato SHA-256 no conforme';
    if (/^sha256:/i.test(trimmed)) {
        const withoutPrefix = trimmed.replace(/^sha256:/i, '');
        if (withoutPrefix.length !== 64) {
            reason = `Longitud inválida tras prefijo sha256: (esperado 64 hex chars, recibido ${withoutPrefix.length})`;
        } else if (!/^[0-9a-fA-F]{64}$/.test(withoutPrefix)) {
            reason = 'Caracteres no hexadecimales tras prefijo sha256:';
        } else {
            reason = 'Prefijo malformado';
        }
    } else {
        if (trimmed.length !== 64) {
            reason = `Longitud inválida para digest hexadecimal puro (esperado 64, recibido ${trimmed.length})`;
        } else if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
            reason = 'Caracteres no hexadecimales en digest';
        }
    }

    return `[origen: ${origin}] [tipo: string] [longitud: ${len}] [motivo: ${reason}]`;
}

/**
 * Compares stored and computed checksums with strict equality of normalized digests.
 * Displays normalized digests ONLY when they have passed strict SHA-256 validation.
 * In case of failure, provides detailed diagnostic containing exclusively:
 * - origin (stored / computed)
 * - received type
 * - length (if string)
 * - rejection reason
 * NEVER echoes raw rates, credentials, tokens, or personal data.
 *
 * @param {any} stored
 * @param {any} computed
 * @returns {{ valid: boolean, storedNormalized: string|null, computedNormalized: string|null, error: string|null }}
 */
function verifyRatesChecksumIntegrity(stored, computed) {
    const storedNorm = normalizeSha256Hex(stored);
    const computedNorm = normalizeSha256Hex(computed);

    if (!storedNorm) {
        return {
            valid: false,
            storedNormalized: null,
            computedNormalized: computedNorm,
            error: describeInvalidChecksum('stored', stored)
        };
    }

    if (!computedNorm) {
        return {
            valid: false,
            storedNormalized: storedNorm,
            computedNormalized: null,
            error: describeInvalidChecksum('computed', computed)
        };
    }

    if (storedNorm !== computedNorm) {
        return {
            valid: false,
            storedNormalized: storedNorm,
            computedNormalized: computedNorm,
            error: `Checksum mismatch (stored: "${storedNorm}", calculated: "${computedNorm}")`
        };
    }

    return {
        valid: true,
        storedNormalized: storedNorm,
        computedNormalized: computedNorm,
        error: null
    };
}

/**
 * Executes regression assertions for checksum normalization and comparison:
 * 1. Hexadecimal puro equivalente (lowercase, uppercase, mixed-case).
 * 2. Formato sha256:<hash> equivalente (pure vs sha256: prefix, both prefixed, prefix casing).
 * 3. Hash válido pero diferente (rejects mismatch, sanitizes output without rates/secrets).
 * 4. Formatos inválidos y valores ausentes (null, undefined, non-strings, lengths != 64, non-hex chars, bad prefixes).
 * 5. Sanitización estricta de diagnósticos: verifica que tokens, contraseñas y JSON ficticios nunca aparezcan en el error.
 */
function runChecksumIntegrityRegressions() {
    console.log('[REGRESSION] Running Checksum Integrity Normalization Regressions...');
    const hashA = '08356ccedaa6377630e6f20e6bf674394d3b28edac46fbfd9621c37ef310f00d';
    const hashB = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    // 1. Hexadecimal puro equivalente
    const reg1a = verifyRatesChecksumIntegrity(hashA, hashA);
    if (!reg1a.valid || reg1a.storedNormalized !== hashA || reg1a.computedNormalized !== hashA) {
        throw new Error('Regression 1a failed: Identical pure hex digests must match');
    }
    const reg1b = verifyRatesChecksumIntegrity(hashA.toUpperCase(), hashA);
    if (!reg1b.valid || reg1b.storedNormalized !== hashA) {
        throw new Error('Regression 1b failed: Uppercase pure hex must normalize and match lowercase');
    }

    // 2. Formato sha256:<hash> equivalente
    const reg2a = verifyRatesChecksumIntegrity(hashA, 'sha256:' + hashA);
    if (!reg2a.valid || reg2a.storedNormalized !== hashA || reg2a.computedNormalized !== hashA) {
        throw new Error('Regression 2a failed: Pure hex and sha256: prefixed hash must match');
    }
    const reg2b = verifyRatesChecksumIntegrity('sha256:' + hashA, hashA);
    if (!reg2b.valid || reg2b.storedNormalized !== hashA) {
        throw new Error('Regression 2b failed: Stored sha256: prefix and computed pure hex must match');
    }
    const reg2c = verifyRatesChecksumIntegrity('sha256:' + hashA, 'SHA256:' + hashA.toUpperCase());
    if (!reg2c.valid || reg2c.storedNormalized !== hashA) {
        throw new Error('Regression 2c failed: Both prefixed with varying prefix/hex case must match');
    }

    // 3. Hash válido pero diferente
    const reg3 = verifyRatesChecksumIntegrity(hashA, hashB);
    if (reg3.valid !== false || !reg3.error) {
        throw new Error('Regression 3 failed: Distinct valid hashes must be rejected');
    }
    if (!reg3.error.includes(hashA) || !reg3.error.includes(hashB)) {
        throw new Error('Regression 3 failed: Error message must show stored and calculated checksums');
    }
    // Verify error does NOT contain secrets, tokens, rates, or personal data
    if (reg3.error.includes('password') || reg3.error.includes('Bearer') || reg3.error.includes('rates_json')) {
        throw new Error('Regression 3 failed: Diagnostic error must not leak sensitive fields');
    }

    // 4. Formatos inválidos y valores ausentes
    const invalidInputs = [
        null,
        undefined,
        '',
        '   ',
        12345,
        true,
        {},
        [],
        hashA.slice(0, 63), // 63 chars
        hashA + 'a',        // 65 chars
        hashA.slice(0, 32), // 32 chars (MD5)
        hashA.slice(0, 63) + 'g', // non-hex character 'g'
        'sha256:',          // prefix only without hex
        'sha256:short',     // prefix with short string
        'sha256:sha256:' + hashA, // double prefix
        'md5:' + hashA,     // unsupported algorithm prefix
        'sha256:' + hashA.slice(0, 63) + 'z' // non-hex character 'z'
    ];

    for (const invalid of invalidInputs) {
        const norm = normalizeSha256Hex(invalid);
        if (norm !== null) {
            throw new Error(`Regression 4 failed: Expected null for invalid input ${JSON.stringify(invalid)}, got "${norm}"`);
        }
        const regInvStored = verifyRatesChecksumIntegrity(invalid, hashA);
        if (regInvStored.valid !== false) {
            throw new Error(`Regression 4 failed: Invalid stored input must be rejected: ${JSON.stringify(invalid)}`);
        }
        const regInvComputed = verifyRatesChecksumIntegrity(hashA, invalid);
        if (regInvComputed.valid !== false) {
            throw new Error(`Regression 4 failed: Invalid computed input must be rejected: ${JSON.stringify(invalid)}`);
        }
    }

    // 5. Cero filtración de datos sensibles en diagnósticos de formato inválido
    const sensitiveInputs = [
        { label: 'fake Bearer token', val: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSecretSignature', leakSubstrings: ['Bearer', 'eyJ', 'doNotLeakThisSecretSignature'] },
        { label: 'fake password credential', val: 'SuperSecretAdminPassword123!#%&_database_root_credential', leakSubstrings: ['SuperSecretAdminPassword', 'database_root', 'credential'] },
        { label: 'fake JSON rates payload', val: JSON.stringify({ secretApiKey: 'sk-live-1234567890abcdef', rates: { price: 9999, discount: 'secret' } }), leakSubstrings: ['secretApiKey', 'sk-live', 'price', '9999'] },
        { label: 'fake prefixed token', val: 'sha256:Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidTokenWithSensitiveContent', leakSubstrings: ['Bearer', 'invalidTokenWithSensitiveContent'] }
    ];

    for (const item of sensitiveInputs) {
        // Test as stored
        const resStored = verifyRatesChecksumIntegrity(item.val, hashA);
        if (resStored.valid !== false) throw new Error(`Expected invalid for ${item.label} as stored`);
        if (!resStored.error.includes('[origen: stored]') || !resStored.error.includes('[tipo: string]') || !resStored.error.includes(`[longitud: ${item.val.length}]`)) {
            throw new Error(`Diagnostic metadata missing origin, type, or length for ${item.label}`);
        }
        for (const sub of item.leakSubstrings) {
            if (resStored.error.includes(sub)) {
                throw new Error(`LEAK DETECTED: diagnostic error for ${item.label} exposed sensitive substring "${sub}"`);
            }
        }

        // Test as computed
        const resComputed = verifyRatesChecksumIntegrity(hashA, item.val);
        if (resComputed.valid !== false) throw new Error(`Expected invalid for ${item.label} as computed`);
        if (!resComputed.error.includes('[origen: computed]') || !resComputed.error.includes('[tipo: string]') || !resComputed.error.includes(`[longitud: ${item.val.length}]`)) {
            throw new Error(`Diagnostic metadata missing origin, type, or length for ${item.label}`);
        }
        for (const sub of item.leakSubstrings) {
            if (resComputed.error.includes(sub)) {
                throw new Error(`LEAK DETECTED: diagnostic error for ${item.label} exposed sensitive substring "${sub}"`);
            }
        }
    }

    // 6. Regresión de alcance de mysqlPassword y preparación de configuración MySQL aislada
    console.log('[REGRESSION] Running MySQL Connection Scope & Password Resolution Regressions...');
    const savedPposPass = process.env.PPOS_TEST_MYSQL_PASSWORD;
    const savedMysqlPass = process.env.MYSQL_PASSWORD;
    try {
        // A. Con PPOS_TEST_MYSQL_PASSWORD configurado: debe resolver correctamente sin ReferenceError
        process.env.PPOS_TEST_MYSQL_PASSWORD = 'scope_verification_pass_2026';
        delete process.env.MYSQL_PASSWORD;
        const resolvedPass = resolveConnectedMysqlPassword();
        if (resolvedPass !== 'scope_verification_pass_2026') {
            throw new Error('Regression 6a failed: Expected resolved password to match PPOS_TEST_MYSQL_PASSWORD');
        }
        const connConfig = getDirectMysqlConnectionConfig();
        if (connConfig.host !== REQUIRED_MYSQL.host ||
            connConfig.port !== REQUIRED_MYSQL.port ||
            connConfig.user !== REQUIRED_MYSQL.user ||
            connConfig.database !== REQUIRED_MYSQL.database ||
            connConfig.password !== 'scope_verification_pass_2026') {
            throw new Error('Regression 6b failed: Direct MySQL configuration mismatch or password incorrectly scoped');
        }

        // B. Sin contraseña: debe lanzar MISSING_TEST_PASSWORD determinista, NUNCA ReferenceError
        delete process.env.PPOS_TEST_MYSQL_PASSWORD;
        delete process.env.MYSQL_PASSWORD;
        let missingPassError = null;
        try {
            resolveConnectedMysqlPassword();
        } catch (err) {
            missingPassError = err;
        }
        if (!missingPassError) {
            throw new Error('Regression 6c failed: Expected resolveConnectedMysqlPassword to throw when password is missing');
        }
        if (missingPassError instanceof ReferenceError) {
            throw new Error(`Regression 6c failed: Threw ReferenceError instead of controlled Error: ${missingPassError.message}`);
        }
        if (!missingPassError.message.includes('MISSING_TEST_PASSWORD') || !missingPassError.message.includes('PPOS_TEST_MYSQL_PASSWORD')) {
            throw new Error(`Regression 6c failed: Expected MISSING_TEST_PASSWORD diagnostic, got: ${missingPassError.message}`);
        }

        // C. PPOS_TEST_MYSQL_PASSWORD ausente + MYSQL_PASSWORD configurada: debe rechazar estrictamente con MISSING_TEST_PASSWORD (cero fallback)
        delete process.env.PPOS_TEST_MYSQL_PASSWORD;
        process.env.MYSQL_PASSWORD = 'unauthorized_inherited_db_secret_pass';
        let fallbackError = null;
        try {
            resolveConnectedMysqlPassword();
        } catch (err) {
            fallbackError = err;
        }
        if (!fallbackError || !fallbackError.message.includes('MISSING_TEST_PASSWORD')) {
            throw new Error('Regression 6d failed: resolveConnectedMysqlPassword must reject without falling back to MYSQL_PASSWORD');
        }
        if (fallbackError.message.includes('unauthorized_inherited_db_secret_pass')) {
            throw new Error('Regression 6d failed: Credential content leaked in error message');
        }

        // D. Cadena vacía o solo espacios en PPOS_TEST_MYSQL_PASSWORD: debe rechazar con MISSING_TEST_PASSWORD
        process.env.PPOS_TEST_MYSQL_PASSWORD = '   ';
        let emptyError = null;
        try {
            resolveConnectedMysqlPassword();
        } catch (err) {
            emptyError = err;
        }
        if (!emptyError || !emptyError.message.includes('MISSING_TEST_PASSWORD')) {
            throw new Error('Regression 6e failed: Expected empty string to be rejected with MISSING_TEST_PASSWORD');
        }

        // E. Con placeholder de regresión en PPOS_TEST_MYSQL_PASSWORD: también debe ser rechazado deterministamente
        process.env.PPOS_TEST_MYSQL_PASSWORD = 'regression_mode_placeholder';
        let placeholderError = null;
        try {
            resolveConnectedMysqlPassword();
        } catch (err) {
            placeholderError = err;
        }
        if (!placeholderError || placeholderError instanceof ReferenceError || !placeholderError.message.includes('MISSING_TEST_PASSWORD')) {
            throw new Error('Regression 6f failed: Expected placeholder to be rejected with MISSING_TEST_PASSWORD');
        }
    } finally {
        if (savedPposPass !== undefined) process.env.PPOS_TEST_MYSQL_PASSWORD = savedPposPass;
        else delete process.env.PPOS_TEST_MYSQL_PASSWORD;
        if (savedMysqlPass !== undefined) process.env.MYSQL_PASSWORD = savedMysqlPass;
        else delete process.env.MYSQL_PASSWORD;
    }

    console.log('[REGRESSION] All 6 Checksum Integrity & Connection Scope Regression Suites Passed Successfully (Zero Leakage Verified).');
}

function deepMergeRates(target, source) {
    const out = JSON.parse(JSON.stringify(target || {}));
    for (const key of Object.keys(source || {})) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            out[key] = deepMergeRates(out[key] || {}, source[key]);
        } else {
            out[key] = source[key];
        }
    }
    return out;
}

/**
 * Executes standalone regression suites for curve multi-targets, solver contracts,
 * governance tolerance evaluation gate, and safe diagnostics formatting:
 * 7. Synthetic curve target generation and structure (monotonic total price, non-increasing unit cost).
 * 8. Multi-quantity solver contract, identifiability (EXACTLY_DETERMINED) and unitless residual ratios.
 * 9. Governed curve acceptance gate (Valid Curve -> ACCEPTABLE vs Perturbed -> REJECTED with POINT_OUT_OF_TOLERANCE).
 * 10. Sanitized diagnostic formatting and zero secret/token leakage.
 */
function runCurveHarnessRegressions() {
    console.log('[REGRESSION] Running Curve Harness & Solver Contract Regressions...');

    const CURVE_BOOK_SPEC = {
        copies: 500,
        interior_pages: 96,
        book_width_mm: 148,
        book_height_mm: 210,
        interior_print: '4/4',
        cover_print: '4/0',
        paper_type_interior: 'offset',
        paper_weight_interior: 90,
        paper_type_cover: 'mc',
        paper_weight_cover: 250,
        binding_method: 'perfect bound',
        delivery_country: 'DE'
    };

    const CURVE_QUANTITIES = [100, 200, 300, 400, 500, 600, 700, 800];

    // Suite 7: Synthetic curve target generation and structure
    const syntheticTargets = CURVE_QUANTITIES.map(q => {
        const fwd = pricingAdapter.evaluateForwardPrice({ ...CURVE_BOOK_SPEC, copies: q }, INITIAL_VALID_RATES, {}, {});
        return {
            quantity: q,
            targetManufacturingPrice: Number(fwd.predictedManufacturingPrice.toFixed(2)),
            targetBasis: 'MANUFACTURING_PRICE',
            currency: 'EUR'
        };
    });

    if (syntheticTargets.length !== 8) {
        throw new Error('Regression 7a failed: Expected exactly 8 synthetic targets');
    }
    for (let i = 0; i < syntheticTargets.length; i++) {
        const t = syntheticTargets[i];
        if (!Number.isInteger(t.quantity) || t.quantity < 1) throw new Error(`Regression 7b failed: Target ${i} has invalid quantity`);
        if (!Number.isFinite(t.targetManufacturingPrice) || t.targetManufacturingPrice <= 0) throw new Error(`Regression 7c failed: Target ${i} has invalid price`);
        if (t.targetBasis !== 'MANUFACTURING_PRICE') throw new Error(`Regression 7d failed: Target ${i} basis must be MANUFACTURING_PRICE`);
        if (i > 0) {
            const prev = syntheticTargets[i - 1];
            if (t.quantity <= prev.quantity) throw new Error(`Regression 7e failed: Quantities must be strictly ascending`);
            if (t.targetManufacturingPrice <= prev.targetManufacturingPrice) throw new Error(`Regression 7f failed: Total prices must be monotonic`);
            const prevUnit = prev.targetManufacturingPrice / prev.quantity;
            const curUnit = t.targetManufacturingPrice / t.quantity;
            if (curUnit > prevUnit + 1e-4) throw new Error(`Regression 7g failed: Unit price must be non-increasing (${curUnit} > ${prevUnit})`);
        }
    }

    // Suite 8: Solver multi-quantity contract, identifiability and residuals
    const solverSession = {
        bookSpec: CURVE_BOOK_SPEC,
        currentRatesSnapshot: INITIAL_VALID_RATES,
        multiTargets: syntheticTargets
    };
    const solverRes = deterministicSolver.solveMultiQuantity(solverSession);
    if (!CANONICAL_ACCEPTABLE_RUN_STATUSES.includes(solverRes.status)) {
        throw new Error(`Regression 8a failed: Expected status in CANONICAL_ACCEPTABLE_RUN_STATUSES (${CANONICAL_ACCEPTABLE_RUN_STATUSES.join(', ')}), got: ${solverRes.status}`);
    }
    if (solverRes.status !== 'ACCEPTABLE_CANDIDATE') {
        throw new Error(`Regression 8a.2 failed: Expected ACCEPTABLE_CANDIDATE solver status for baseline-derived synthetic curve, got: ${solverRes.status}`);
    }
    if (!solverRes.identifiabilityReport || solverRes.identifiabilityReport.status !== 'EXACTLY_DETERMINED') {
        throw new Error(`Regression 8b failed: Identifiability status reported by solver must be EXACTLY_DETERMINED, got: ${solverRes.identifiabilityReport?.status}`);
    }
    if (solverRes.identifiabilityReport.freeParameterCount !== 8 || solverRes.identifiabilityReport.targetPointCount !== 8) {
        throw new Error(`Regression 8c failed: Expected 8 free parameters and 8 targets`);
    }
    if (!Array.isArray(solverRes.pointResults) || solverRes.pointResults.length !== 8) {
        throw new Error(`Regression 8d failed: pointResults must be array of 8 points`);
    }
    for (let i = 0; i < solverRes.pointResults.length; i++) {
        const pt = solverRes.pointResults[i];
        const expQ = CURVE_QUANTITIES[i];
        const expTargetPrice = syntheticTargets[i].targetManufacturingPrice;

        if (!Number.isInteger(pt.quantity) || pt.quantity !== expQ) {
            throw new Error(`Regression 8e.1 failed: Point ${i} quantity must match expected ${expQ}`);
        }
        if (!Number.isFinite(pt.targetManufacturingPrice) || Math.abs(pt.targetManufacturingPrice - expTargetPrice) > 0.01) {
            throw new Error(`Regression 8e.2 failed: Point ${i} target price must match expected ${expTargetPrice}`);
        }
        if (!Number.isFinite(pt.predictedManufacturingPrice) || pt.predictedManufacturingPrice <= 0) {
            throw new Error(`Regression 8e.3 failed: Point ${i} predicted price must be finite and positive`);
        }

        const unroundedAbsRes = Math.abs(pt.predictedManufacturingPrice - pt.targetManufacturingPrice);
        const unroundedRatioRes = pt.targetManufacturingPrice > 0 ? unroundedAbsRes / pt.targetManufacturingPrice : 0;
        const effTol = computeGovernanceTolerance(pt.targetManufacturingPrice, DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE, DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT);

        if (Math.abs(pt.absoluteResidual - unroundedAbsRes) > 0.001) {
            throw new Error(`Regression 8e.4 failed: Point ${i} absolute residual (${pt.absoluteResidual}) contradicts recalculated (${unroundedAbsRes})`);
        }
        if (Math.abs(pt.percentageResidual - unroundedRatioRes) > 0.0001) {
            throw new Error(`Regression 8e.5 failed: Point ${i} percentage residual ratio (${pt.percentageResidual}) contradicts recalculated (${unroundedRatioRes})`);
        }
        if (pt.withinTolerance !== (pt.absoluteResidual <= effTol)) {
            throw new Error(`Regression 8e.6 failed: Point ${i} withinTolerance flag contradicts official tolerance check`);
        }
    }
    if (solverRes.absoluteResidual !== solverRes.curveMetrics.maxAbsoluteResidual) {
        throw new Error(`Regression 8h failed: solver absoluteResidual must match curveMetrics.maxAbsoluteResidual`);
    }
    if (solverRes.percentResidual !== solverRes.curveMetrics.maxPercentageResidual) {
        throw new Error(`Regression 8i failed: solver percentResidual must match curveMetrics.maxPercentageResidual`);
    }

    // Suite 9: Governance tolerance evaluation gate (Valid Curve vs Out-of-Tolerance)
    const validCurveSessionDb = {
        book_spec_json: CURVE_BOOK_SPEC,
        multi_targets_json: syntheticTargets,
        target_manufacturing_price: syntheticTargets[0].targetManufacturingPrice
    };
    const resultingRates = deepMergeRates(INITIAL_VALID_RATES, solverRes.proposedPatch);
    const nodeConfig = { signatures: null, production_lead_days: 7, delivery_time: 2 };
    const validGovernance = calibrationAcceptanceService.evaluateCurveAcceptance(
        validCurveSessionDb,
        { identifiability_json: solverRes.identifiabilityReport },
        resultingRates,
        CURVE_BOOK_SPEC,
        nodeConfig
    );
    if (validGovernance.status !== 'ACCEPTABLE') {
        throw new Error(`Regression 9a failed: Valid curve must evaluate to ACCEPTABLE, got: ${validGovernance.status} (reasons: ${validGovernance.reasons.join(', ')})`);
    }
    if (validGovernance.reasons.length !== 0) {
        throw new Error(`Regression 9b failed: Valid curve must have zero rejection reasons`);
    }

    // Perturbed curve: Point 800 set to 1320.00 EUR (baseline is 1364.50 EUR, q=700 is 1267.00 EUR)
    // Monotonic: 1320 > 1267; Unit non-increasing: 1320/800 = 1.65 < 1267/700 = 1.81.
    // Residual at 800: ~42.50 EUR > 6.60 EUR effective tolerance.
    const perturbedTargets = syntheticTargets.map(t => t.quantity === 800 ? { ...t, targetManufacturingPrice: 1320.00 } : { ...t });
    const perturbedSessionDb = {
        book_spec_json: CURVE_BOOK_SPEC,
        multi_targets_json: perturbedTargets,
        target_manufacturing_price: perturbedTargets[0].targetManufacturingPrice
    };
    const perturbedSolverRes = deterministicSolver.solveMultiQuantity({
        bookSpec: CURVE_BOOK_SPEC,
        currentRatesSnapshot: INITIAL_VALID_RATES,
        multiTargets: perturbedTargets
    });
    if (!CANONICAL_ACCEPTABLE_RUN_STATUSES.includes(perturbedSolverRes.status) || perturbedSolverRes.status !== 'SUCCEEDED') {
        throw new Error(`Regression 9c failed: Expected perturbed solver to produce SUCCEEDED run in CANONICAL_ACCEPTABLE_RUN_STATUSES, got: ${perturbedSolverRes.status}`);
    }
    const pt800Solver = perturbedSolverRes.pointResults.find(p => p.quantity === 800);
    if (!pt800Solver || pt800Solver.withinTolerance !== false) {
        throw new Error(`Regression 9d failed: Point 800 must have withinTolerance: false in solver`);
    }

    const perturbedGovernance = calibrationAcceptanceService.evaluateCurveAcceptance(
        perturbedSessionDb,
        { identifiability_json: perturbedSolverRes.identifiabilityReport },
        deepMergeRates(INITIAL_VALID_RATES, perturbedSolverRes.proposedPatch),
        CURVE_BOOK_SPEC,
        nodeConfig
    );
    if (perturbedGovernance.status !== 'REJECTED') {
        throw new Error(`Regression 9e failed: Perturbed curve must evaluate to REJECTED, got: ${perturbedGovernance.status}`);
    }
    if (!perturbedGovernance.reasons.includes('POINT_OUT_OF_TOLERANCE')) {
        throw new Error(`Regression 9f failed: Perturbed curve reasons must include POINT_OUT_OF_TOLERANCE, got: [${perturbedGovernance.reasons.join(', ')}]`);
    }
    if (perturbedGovernance.curveMetrics.rejectedPointCount !== 1) {
        throw new Error(`Regression 9g failed: Expected exactly 1 rejected point, got: ${perturbedGovernance.curveMetrics.rejectedPointCount}`);
    }

    // Suite 10: Sanitized diagnostic formatting and zero secret leakage
    // Test with real Express wrapHandler error response shape: { ok: false, error: '...', message: '...' }
    const testDiagResReal = {
        status: 422,
        body: {
            ok: false,
            error: 'GOVERNANCE_CURVE_REJECTED',
            message: 'GOVERNANCE_CURVE_REJECTED: [POINT_OUT_OF_TOLERANCE] (quantities: [100, 200, 300, 400, 500, 600, 700, 800])',
            unauthorizedSecret: 'super_secret_db_password_123',
            authorizationHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
        }
    };
    const formattedDiag = formatHttpDiagnostic('POST', '/api/printhouse/onboarding/pricing/calibrations/cal-test/accept', testDiagResReal);
    if (!formattedDiag.includes('HTTP 422') || !formattedDiag.includes('GOVERNANCE_CURVE_REJECTED') || !formattedDiag.includes('POINT_OUT_OF_TOLERANCE')) {
        throw new Error(`Regression 10a failed: Formatted diagnostic must contain HTTP 422, error code, and extracted reason POINT_OUT_OF_TOLERANCE`);
    }
    if (formattedDiag.includes('super_secret_db_password_123') || formattedDiag.includes('Bearer eyJhbGciOi')) {
        throw new Error(`Regression 10b failed: Formatted diagnostic leaked secrets or tokens`);
    }

    console.log('[REGRESSION] All Curve Harness & Solver Contract Regressions Passed Successfully.');
}

// ── 3. CANONICAL INDUSTRIAL RATES FIXTURE & CONSUMED KEYS DOCUMENTATION ──
// Strictly compatible with @ppos/pricing-engine and src/api/services/buildPriceCalibrationAdapter.js.
// Documented keys consumed by canonical forward pricing engine and inverse pricing solver:
// - Interior print setup & variable runs: interior_full_colour_fixed, interior_full_colour_var (by signature size '16p', '32p', etc.)
// - Cover print setup & variable runs: cover_fixed_by_colours, cover_var_per_1000_by_colours (by color count '1'..'5')
// - Lamination setup & variable runs: lam_fixed, lam_var_per_1000 ('matt', 'gloss', 'varnish')
// - Binding setup & variable runs: binding_pb_fixed_by_sections, binding_pb_var_per_1000_by_sections (by section count '1'..'30')
// - Paper setup waste sheets: paper_interior_fixed_by_colours, paper_cover_fixed_by_colours
// - Paper run waste sheets per 1000: paper_interior_var_per_1000_by_colours, paper_cover_var_per_1000_by_colours
// - Paper binding waste percentage: paper_waste_for_binding ('pb', 'ss', 'hc', etc.)
// - Paper prices per kg: paper_price_interior_by_kilo ('offset', 'mc', 'lux', etc.), paper_price_cover_by_kilo ('mc', 'artboard', etc.)
// - Zero ignored / dummy parameters (eliminates former synthetic hourly/machine placeholders).
const INITIAL_VALID_RATES = {
    interior_one_colour_fixed: { '32p': 30, '16p': 18, '8p': 10, '4p': 6 },
    interior_one_colour_var: { '32p': 12, '16p': 7, '8p': 4, '4p': 2 },
    interior_two_colour_fixed: { '32p': 50, '16p': 30, '8p': 18, '4p': 10 },
    interior_two_colour_var: { '32p': 20, '16p': 12, '8p': 7, '4p': 4 },
    interior_full_colour_fixed: { '32p': 80, '16p': 48, '8p': 28, '4p': 16 },
    interior_full_colour_var: { '32p': 35, '16p': 20, '8p': 12, '4p': 6 },
    cover_fixed_by_colours: { '1': 25, '2': 35, '3': 50, '4': 65, '5': 80 },
    cover_var_per_1000_by_colours: { '1': 10, '2': 14, '3': 20, '4': 26, '5': 32 },
    lam_fixed: { 'matt': 40, 'gloss': 40, 'varnish': 30 },
    lam_var_per_1000: { 'matt': 15, 'gloss': 15, 'varnish': 10 },
    uv_varnish: { fixed: 50, var: 20 },
    pms_cover: { fixed: 30, var: 12 },
    pms_interior_fixed: 25,
    binding_pb_fixed_by_sections: {
        '1': 80, '2': 85, '3': 90, '4': 95, '5': 100, '6': 105, '7': 110, '8': 115,
        '9': 120, '10': 125, '11': 130, '12': 135, '13': 140, '14': 145, '15': 150,
        '16': 155, '17': 160, '18': 165, '19': 170, '20': 175, '21': 180, '22': 185,
        '23': 190, '24': 195, '25': 200, '26': 205, '27': 210, '28': 215, '29': 220, '30': 225
    },
    binding_pb_var_per_1000_by_sections: {
        '1': 30, '2': 32, '3': 34, '4': 36, '5': 38, '6': 40, '7': 42, '8': 44,
        '9': 46, '10': 48, '11': 50, '12': 52, '13': 54, '14': 56, '15': 58,
        '16': 60, '17': 62, '18': 64, '19': 66, '20': 68, '21': 70, '22': 72,
        '23': 74, '24': 76, '25': 78, '26': 80, '27': 82, '28': 84, '29': 86, '30': 88
    },
    binding_ss_fixed_by_sections: { '1': 40, '2': 43, '3': 46, '4': 49, '5': 52 },
    binding_ss_var_per_1000_by_sections: { '1': 15, '2': 16, '3': 17, '4': 18, '5': 19 },
    binding_ts_fixed_by_sections: { '1': 100, '2': 106, '3': 112, '4': 118, '5': 124 },
    binding_ts_var_per_1000_by_sections: { '1': 40, '2': 43, '3': 46, '4': 49, '5': 52 },
    binding_hc_fixed_by_sections: { '1': 140, '2': 148, '3': 156, '4': 164, '5': 172 },
    binding_hc_var_per_1000_by_sections: { '1': 55, '2': 59, '3': 63, '4': 67, '5': 71 },
    paper_interior_fixed_by_colours: { 'one': 5, 'two': 6, 'full': 8 },
    paper_interior_var_per_1000_by_colours: { 'one': 80, 'two': 95, 'full': 120 },
    paper_cover_fixed_by_colours: { 'one': 4, 'two': 5, 'full': 6 },
    paper_cover_var_per_1000_by_colours: { 'one': 60, 'two': 75, 'full': 95 },
    paper_waste_for_binding: { 'pb': 5, 'ss': 3, 'sc': 5, 'hc': 6, 'wo': 4, 'sp': 4 },
    paper_price_interior_by_kilo: { 'offset': 1.2, 'mc': 1.45, 'lux': 1.8, 'munken': 2.1, 'other': 1.2 },
    paper_price_cover_by_kilo: { 'mc': 1.5, 'artboard': 1.65, 'offset': 1.2, 'wfmc': 1.55, 'other': 1.5 }
};
const INITIAL_RATES_JSON_STR = canonicalStringify(INITIAL_VALID_RATES);
const INITIAL_RATES_CHECKSUM = computeCanonicalRatesChecksum(INITIAL_VALID_RATES);

// Dedicated fixture for Tenant B to verify cross-tenant isolation and node integrity
const TENANT_B_INITIAL_RATES = {
    ...INITIAL_VALID_RATES,
    interior_full_colour_fixed: { '32p': 92, '16p': 56, '8p': 32, '4p': 18 },
    interior_full_colour_var: { '32p': 38, '16p': 22, '8p': 13, '4p': 7 },
    cover_fixed_by_colours: { '1': 28, '2': 40, '3': 56, '4': 72, '5': 88 },
    cover_var_per_1000_by_colours: { '1': 11, '2': 15, '3': 22, '4': 28, '5': 35 }
};
const TENANT_B_INITIAL_RATES_JSON_STR = canonicalStringify(TENANT_B_INITIAL_RATES);
const TENANT_B_RATES_CHECKSUM = computeCanonicalRatesChecksum(TENANT_B_INITIAL_RATES);

const EXECUTION_TAG = 'test_onb_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
const tracker = {
    tenants: new Set(),
    printerNodes: new Set(),
    controlUserIds: new Set(),
    userSessionIds: new Set(),
    sessionIds: new Set(),
    runIds: new Set(),
    revisionIds: new Set(),
    acceptanceIds: new Set()
};

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition, message, details = '') {
    totalAssertions++;
    if (condition) {
        console.log(`  ✓ ${message}`);
        passedAssertions++;
    } else {
        console.error(`  ✗ FAIL: ${message}${details ? ` -> ${details}` : ''}`);
        throw new Error(`Assertion failed: ${message}`);
    }
}

/**
 * Creates a real authenticated user in control_users, a trackable server session
 * in user_sessions via userSessionService.createSession, and issues a signed Bearer JWT
 * that strictly satisfies src/api/middleware/auth.js (sub, tenant_id, role, jti, audience, issuer).
 *
 * PRECONDITION & AUTHENTICITY CONTRACT:
 * - Table `control_users` MUST exist in MySQL target; if absent, execution aborts immediately.
 * - Insertion into `control_users` MUST return a valid numeric `insertId`.
 * - Zero fallback to synthetic or invented user IDs.
 */
async function createRealUserAndSession(directConn, tenantId, role = 'PRINTHOUSE_OPERATOR', userTag = 'op') {
    const email = `${userTag}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}@test-connected.local`;
    const passwordHash = await bcrypt.hash('HarnessSecurePass2026!', 10);

    // 1. Verify existence of control_users. Strictly abort if table is missing.
    const [userTableCheck] = await directConn.query("SHOW TABLES LIKE 'control_users'");
    if (!userTableCheck || userTableCheck.length === 0) {
        throw new Error('ABORT_PRECONDITION_FAILED: Required table "control_users" does not exist in target database. Harness strictly requires authentic user registration; fallback synthetic identities are prohibited.');
    }

    const [insertRes] = await directConn.query(
        `INSERT INTO control_users (tenant_id, email, password_hash, role, status, created_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', NOW())`,
        [tenantId, email, passwordHash, role]
    );

    const insertId = insertRes.insertId || (Array.isArray(insertRes) && insertRes[0]?.insertId);
    if (!insertId) {
        throw new Error('ABORT_INSERT_FAILED: Failed to obtain valid auto-increment insertId from control_users insertion');
    }
    const userId = String(insertId);
    tracker.controlUserIds.add(insertId);

    // 2. Real session creation via official userSessionService.createSession
    const session = await userSessionService.createSession({
        userId,
        tenantId,
        role,
        ipAddress: '127.0.0.1',
        userAgent: 'PPOS-Connected-Harness/1.0',
        inactivityMinutes: 60,
        absoluteHours: 24
    });
    tracker.userSessionIds.add(session.sessionId);

    // 3. Issue authentic JWT with standard claims matching auth.js / requireAdmin
    const token = jwt.sign(
        {
            sub: userId,
            tenant_id: tenantId,
            role,
            jti: session.sessionId,
            email
        },
        JWT_SECRET,
        {
            issuer: process.env.JWT_ISSUER,
            audience: process.env.JWT_AUDIENCE,
            expiresIn: '1h'
        }
    );

    return { token, sessionId: session.sessionId, userId, tenantId, email };
}

function httpRequest(serverUrl, method, path, token, body = null, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, serverUrl);
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(
            {
                method,
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                headers,
                timeout: timeoutMs
            },
            (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    let json = {};
                    try { json = JSON.parse(data); } catch (e) { json = { raw: data }; }
                    resolve({ status: res.statusCode, headers: res.headers, body: json });
                });
            }
        );

        req.on('timeout', () => {
            req.destroy(new Error(`HTTP_TIMEOUT: Request timed out after ${timeoutMs}ms: ${method} ${path}`));
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function formatHttpDiagnostic(method, path, res) {
    if (!res) return `[${method} ${path}] No response object`;
    const status = res.status;
    const body = res.body || {};
    // Extract sanitized error fields, strictly suppressing any Authorization headers or tokens
    let reasons = body.reasons || body.details?.reasons || (Array.isArray(body.details) ? body.details : undefined);
    if (!reasons && typeof body.message === 'string') {
        const match = body.message.match(/\[([A-Z0-9_, ]+)\]/);
        if (match) {
            reasons = match[1].split(',').map(s => s.trim());
        }
    }
    const evaluatedQuantities = body.evaluatedQuantities || body.details?.evaluatedQuantities || undefined;
    const pointCount = body.details?.pointCount || undefined;
    const sanitized = {
        status,
        code: body.error?.code || body.code || (typeof body.error === 'string' ? body.error : undefined),
        message: body.error?.message || body.message || (typeof body.error === 'string' ? body.error : undefined),
        reasons,
        evaluatedQuantities,
        pointCount,
        details: body.error?.details || body.details || undefined
    };
    return `[${method} ${path} -> HTTP ${status}] ${JSON.stringify(sanitized)}`;
}

// ── 4. STRICT IDENTITY VERIFICATION ──
async function verifyMysqlIdentity(directConn, cpPool) {
    console.log(`\n[IDENTITY] Verifying positive identity on MySQL connections (Zero DDL)...`);

    // A. Direct Connection Check
    const [directRows] = await directConn.query('SELECT CURRENT_USER() AS currentUser, DATABASE() AS currentDb');
    const directUser = directRows[0]?.currentUser;
    const directDb = directRows[0]?.currentDb;

    console.log(`  Direct Connection: currentUser="${directUser}", currentDb="${directDb}"`);
    if (directUser !== 'ppos_rc_mdw0qd@127.0.0.1') {
        throw new Error(`Direct connection identity mismatch. Expected "ppos_rc_mdw0qd@127.0.0.1", got "${directUser}"`);
    }
    if (directDb !== REQUIRED_MYSQL.database) {
        throw new Error(`Direct connection database mismatch. Expected "${REQUIRED_MYSQL.database}", got "${directDb}"`);
    }
    assert(true, `Direct MySQL identity strictly verified as ${directUser} on ${directDb}`);

    // B. CP Service Pool Check: destructure [poolRows] from native mysql2 pool query
    const [poolRows] = await cpPool.query('SELECT CURRENT_USER() AS currentUser, DATABASE() AS currentDb');
    const poolUser = poolRows[0]?.currentUser;
    const poolDb = poolRows[0]?.currentDb;

    console.log(`  CP Service Pool  : currentUser="${poolUser}", currentDb="${poolDb}"`);
    if (poolUser !== 'ppos_rc_mdw0qd@127.0.0.1') {
        throw new Error(`CP service pool identity mismatch. Expected "ppos_rc_mdw0qd@127.0.0.1", got "${poolUser}"`);
    }
    if (poolDb !== REQUIRED_MYSQL.database) {
        throw new Error(`CP service pool database mismatch. Expected "${REQUIRED_MYSQL.database}", got "${poolDb}"`);
    }
    assert(true, `CP service pool identity strictly verified as ${poolUser} on ${poolDb}`);
}

// ── 5. DETERMINISTIC CLEANUP IN STRICT FK ORDER ACROSS ALL 8 TABLES ──
// Documented MySQL Foreign Keys & Dependency Order (Migrations 143, 146, 147, 148, 158, 160):
// 1. printhouse_pricing_calibration_acceptances:
//    - FK (pricing_revision_id) REFERENCES printhouse_pricing_revisions(id) ON DELETE CASCADE
//    - FK (calibration_run_id) REFERENCES printhouse_pricing_calibration_runs(id) ON DELETE CASCADE
//    - FK (calibration_session_id) REFERENCES printhouse_pricing_calibration_sessions(id) ON DELETE CASCADE
//    - FK (printer_node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
//    - FK (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
// 2. printhouse_pricing_revisions:
//    - FK (printer_node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
//    - FK (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
//    - Logical references to source_calibration_run_id and source_calibration_session_id
//      (MUST be purged BEFORE runs and sessions to prevent referential inconsistencies)
// 3. printhouse_pricing_calibration_runs:
//    - FK (calibration_session_id) REFERENCES printhouse_pricing_calibration_sessions(id) ON DELETE CASCADE
//    - FK (printer_node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
//    - FK (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
// 4. printhouse_pricing_calibration_sessions:
//    - FK (printer_node_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
//    - FK (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
// 5. user_sessions:
//    - Scoped to tenant_id; must be purged before tenants
// 6. control_users:
//    - Real user accounts created for test tenants; must be purged before tenants
// 7. printer_nodes:
//    - FK (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
// 8. tenants:
//    - Root tenant entity
async function performDeterministicCleanup(directConn) {
    console.log('\n[CLEANUP] Discovering and purging tracked test fixtures across all 8 affected tables...');
    let cleanupFailed = false;
    const residualErrors = [];

    try {
        const tenantList = Array.from(tracker.tenants);

        // Discovery step: find any entities created during execution under these test tenants
        if (tenantList.length > 0) {
            const [foundAcceptances] = await directConn.query(
                `SELECT id FROM printhouse_pricing_calibration_acceptances WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundAcceptances.forEach(r => tracker.acceptanceIds.add(r.id));

            const [foundRevisions] = await directConn.query(
                `SELECT id FROM printhouse_pricing_revisions WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundRevisions.forEach(r => tracker.revisionIds.add(r.id));

            const [foundSessions] = await directConn.query(
                `SELECT id FROM printhouse_pricing_calibration_sessions WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundSessions.forEach(r => tracker.sessionIds.add(r.id));

            const sessionList = Array.from(tracker.sessionIds);
            if (sessionList.length > 0) {
                const [foundRuns] = await directConn.query(
                    `SELECT id FROM printhouse_pricing_calibration_runs WHERE calibration_session_id IN (?)`,
                    [sessionList]
                );
                foundRuns.forEach(r => tracker.runIds.add(r.id));
            }

            const [foundUserSessions] = await directConn.query(
                `SELECT id FROM user_sessions WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundUserSessions.forEach(r => tracker.userSessionIds.add(r.id));

            const [foundUsers] = await directConn.query(
                `SELECT id FROM control_users WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundUsers.forEach(r => tracker.controlUserIds.add(r.id));

            const [foundNodes] = await directConn.query(
                `SELECT id FROM printer_nodes WHERE tenant_id IN (?)`,
                [tenantList]
            );
            foundNodes.forEach(r => tracker.printerNodes.add(r.id));
        }

        // Teardown step: delete in strict foreign key dependency order
        // 1. Calibration acceptances (references revisions, runs, sessions, nodes, tenants)
        if (tracker.acceptanceIds.size > 0) {
            const accIds = Array.from(tracker.acceptanceIds);
            await directConn.query(
                `DELETE FROM printhouse_pricing_calibration_acceptances WHERE id IN (?)`,
                [accIds]
            );
            console.log(`  ✓ Cleaned ${accIds.length} calibration acceptances`);
        }

        // 2. Pricing revisions (BEFORE runs and sessions)
        if (tracker.revisionIds.size > 0) {
            const revIds = Array.from(tracker.revisionIds);
            await directConn.query(
                `DELETE FROM printhouse_pricing_revisions WHERE id IN (?)`,
                [revIds]
            );
            console.log(`  ✓ Cleaned ${revIds.length} pricing revisions`);
        }

        // 3. Calibration runs (references sessions, nodes, tenants)
        if (tracker.runIds.size > 0) {
            const runIds = Array.from(tracker.runIds);
            await directConn.query(
                `DELETE FROM printhouse_pricing_calibration_runs WHERE id IN (?)`,
                [runIds]
            );
            console.log(`  ✓ Cleaned ${runIds.length} calibration runs`);
        }

        // 4. Calibration sessions (references nodes, tenants)
        if (tracker.sessionIds.size > 0) {
            const sessIds = Array.from(tracker.sessionIds);
            await directConn.query(
                `DELETE FROM printhouse_pricing_calibration_sessions WHERE id IN (?)`,
                [sessIds]
            );
            console.log(`  ✓ Cleaned ${sessIds.length} calibration sessions`);
        }

        // 5. User sessions (references tenant boundary)
        if (tracker.userSessionIds.size > 0) {
            const uSessIds = Array.from(tracker.userSessionIds);
            await directConn.query(
                `DELETE FROM user_sessions WHERE id IN (?)`,
                [uSessIds]
            );
            console.log(`  ✓ Cleaned ${uSessIds.length} user sessions`);
        }

        // 6. Control users (real user records created for test tenants)
        if (tracker.controlUserIds.size > 0) {
            const uIds = Array.from(tracker.controlUserIds);
            await directConn.query(
                `DELETE FROM control_users WHERE id IN (?)`,
                [uIds]
            );
            console.log(`  ✓ Cleaned ${uIds.length} control users`);
        }

        // 7. Printer nodes (references tenants)
        if (tracker.printerNodes.size > 0) {
            const nodeIds = Array.from(tracker.printerNodes);
            await directConn.query(
                `DELETE FROM printer_nodes WHERE id IN (?)`,
                [nodeIds]
            );
            console.log(`  ✓ Cleaned ${nodeIds.length} printer nodes`);
        }

        // 8. Tenants (root entity)
        if (tracker.tenants.size > 0) {
            const tIds = Array.from(tracker.tenants);
            await directConn.query(
                `DELETE FROM tenants WHERE id IN (?)`,
                [tIds]
            );
            console.log(`  ✓ Cleaned ${tIds.length} tenants`);
        }

        // Post-cleanup verification: assert zero remaining records in ALL 8 TABLES
        if (tracker.acceptanceIds.size > 0) {
            const [remAcc] = await directConn.query(
                `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_acceptances WHERE id IN (?)`,
                [Array.from(tracker.acceptanceIds)]
            );
            if (remAcc[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remAcc[0].count} calibration acceptances remained uncleaned`);
            }
        }

        if (tracker.revisionIds.size > 0) {
            const [remRevs] = await directConn.query(
                `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE id IN (?)`,
                [Array.from(tracker.revisionIds)]
            );
            if (remRevs[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remRevs[0].count} pricing revisions remained uncleaned`);
            }
        }

        if (tracker.runIds.size > 0) {
            const [remRuns] = await directConn.query(
                `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_runs WHERE id IN (?)`,
                [Array.from(tracker.runIds)]
            );
            if (remRuns[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remRuns[0].count} calibration runs remained uncleaned`);
            }
        }

        if (tracker.sessionIds.size > 0) {
            const [remSess] = await directConn.query(
                `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_sessions WHERE id IN (?)`,
                [Array.from(tracker.sessionIds)]
            );
            if (remSess[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remSess[0].count} calibration sessions remained uncleaned`);
            }
        }

        if (tracker.userSessionIds.size > 0) {
            const [remUserSess] = await directConn.query(
                `SELECT COUNT(*) as count FROM user_sessions WHERE id IN (?)`,
                [Array.from(tracker.userSessionIds)]
            );
            if (remUserSess[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remUserSess[0].count} user sessions remained uncleaned`);
            }
        }

        if (tracker.controlUserIds.size > 0) {
            const [remUsers] = await directConn.query(
                `SELECT COUNT(*) as count FROM control_users WHERE id IN (?)`,
                [Array.from(tracker.controlUserIds)]
            );
            if (remUsers[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remUsers[0].count} control users remained uncleaned`);
            }
        }

        if (tracker.printerNodes.size > 0) {
            const [remNodes] = await directConn.query(
                `SELECT COUNT(*) as count FROM printer_nodes WHERE id IN (?)`,
                [Array.from(tracker.printerNodes)]
            );
            if (remNodes[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remNodes[0].count} printer nodes remained uncleaned`);
            }
        }

        if (tracker.tenants.size > 0) {
            const [remTenants] = await directConn.query(
                `SELECT COUNT(*) as count FROM tenants WHERE id IN (?)`,
                [Array.from(tracker.tenants)]
            );
            if (remTenants[0]?.count > 0) {
                cleanupFailed = true;
                residualErrors.push(`${remTenants[0].count} tenants remained uncleaned`);
            }
        }

        if (!cleanupFailed) {
            console.log('  ✓ Verified 0 residuals across all 8 affected tables.');
        } else {
            console.error('  ✗ [CLEANUP-FAILURE] Residuals detected:', residualErrors.join('; '));
        }
    } catch (cleanErr) {
        cleanupFailed = true;
        console.error(`  ✗ [CLEANUP-ERROR] Exception during cleanup: ${cleanErr.message}`);
        residualErrors.push(cleanErr.message);
    }

    if (cleanupFailed) {
        throw new Error(`VERIFIED_CLEANUP_FAILED: Residual test records detected: ${residualErrors.join(', ')}`);
    }
}

async function seedPrinterNode(directConn, nodeId, tenantId, name, ratesJsonStr, nodeColSet) {
    const nodeFields = ['id', 'tenant_id', 'name'];
    const nodeVals = [nodeId, tenantId, name];
    if (nodeColSet.has('email')) {
        nodeFields.push('email');
        nodeVals.push(`${nodeId}@test-connected.local`);
    }
    if (nodeColSet.has('status')) {
        nodeFields.push('status');
        nodeVals.push('ACTIVE');
    }
    if (nodeColSet.has('rates_json')) {
        nodeFields.push('rates_json');
        nodeVals.push(ratesJsonStr);
    }
    await directConn.query(
        `INSERT INTO printer_nodes (${nodeFields.join(',')}) VALUES (${nodeVals.map(() => '?').join(',')})`,
        nodeVals
    );
    tracker.printerNodes.add(nodeId);
}

// ── 6. MAIN CONNECTED ONBOARDING VALIDATION ──
async function runConnectedSuite() {
    console.log(`\n================================================================`);
    console.log(`  PRINTPRICE OS: CONNECTED ONBOARDING & CALIBRATION SUITE (MYSQL) `);
    console.log(`================================================================`);
    console.log(`Execution Tag: ${EXECUTION_TAG}`);
    console.log(`Timestamp    : ${new Date().toISOString()}`);
    console.log(`MySQL Target : ${REQUIRED_MYSQL.user}@${REQUIRED_MYSQL.host}:${REQUIRED_MYSQL.port}/${REQUIRED_MYSQL.database}`);

    let directConn = null;
    let testServer = null;
    let mainError = null;
    let cleanupError = null;

    try {
        // Direct MySQL Connection: resolve and validate password scope before connecting
        const directConfig = getDirectMysqlConnectionConfig();
        directConn = await mysql.createConnection(directConfig);

        const cpPool = mysqlClient.getPool();
        await verifyMysqlIdentity(directConn, cpPool);

        // Express Server with Official Onboarding Routes
        const app = express();
        app.use(express.json());
        app.use('/api/printhouse/onboarding', printhouseOnboardingRoutes);

        testServer = http.createServer(app);
        await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
        const serverPort = testServer.address().port;
        const serverUrl = `http://127.0.0.1:${serverPort}`;
        console.log(`  ✓ Test Express Server listening at ${serverUrl}`);

        const FIXTURE_TENANT_A = `tenant_${EXECUTION_TAG}_a`;
        const FIXTURE_TENANT_B = `tenant_${EXECUTION_TAG}_b`;
        const FIXTURE_NODE_A = `node_${EXECUTION_TAG}_a`;

        // ── STEP 1: OFFICIAL SCHEMA SEEDING (TENANTS, PRINTER_NODES, USERS & AUTH SESSIONS) ──
        console.log(`\n[STEP 1] Seeding Fixtures into Official Schema`);

        // Check columns in tenants table
        const [tenantCols] = await directConn.query('SHOW COLUMNS FROM tenants');
        const tenantColSet = new Set(tenantCols.map(c => c.Field));

        for (const tid of [FIXTURE_TENANT_A, FIXTURE_TENANT_B]) {
            const tFields = ['id', 'name'];
            const tVals = [tid, `Tenant ${tid}`];
            if (tenantColSet.has('status')) { tFields.push('status'); tVals.push('ACTIVE'); }
            if (tenantColSet.has('tier')) { tFields.push('tier'); tVals.push('PRO'); }

            await directConn.query(
                `INSERT INTO tenants (${tFields.join(',')}) VALUES (${tVals.map(() => '?').join(',')})`,
                tVals
            );
            tracker.tenants.add(tid);
        }
        assert(true, `Created official tenants ${FIXTURE_TENANT_A} and ${FIXTURE_TENANT_B}`);

        // Check columns in printer_nodes table (NO updated_at, include email, status & initial valid rates_json ONLY)
        const [nodeCols] = await directConn.query('SHOW COLUMNS FROM printer_nodes');
        const nodeColSet = new Set(nodeCols.map(c => c.Field));

        await seedPrinterNode(directConn, FIXTURE_NODE_A, FIXTURE_TENANT_A, `Node ${EXECUTION_TAG}`, INITIAL_RATES_JSON_STR, nodeColSet);
        assert(true, `Created printer node ${FIXTURE_NODE_A} for ${FIXTURE_TENANT_A} with initial valid rates fixture`);

        // Generate authentic server sessions and valid JWTs with real user accounts
        const authA = await createRealUserAndSession(directConn, FIXTURE_TENANT_A, 'PRINTHOUSE_OPERATOR', 'user_op_a');
        const authB = await createRealUserAndSession(directConn, FIXTURE_TENANT_B, 'PRINTHOUSE_OPERATOR', 'user_op_b');
        const tokenA = authA.token;
        const tokenB = authB.token;

        // Accredited contract validation: userSessionService.validateSession() positive checks
        const sessionCheckA = await userSessionService.validateSession(authA.sessionId, FIXTURE_TENANT_A, authA.userId);
        assert(sessionCheckA.valid === true, `Session A tracked in user_sessions and validated with middleware contract`);
        const sessionCheckB = await userSessionService.validateSession(authB.sessionId, FIXTURE_TENANT_B, authB.userId);
        assert(sessionCheckB.valid === true, `Session B tracked in user_sessions and validated with middleware contract`);

        // Accredited contract validation: userSessionService.validateSession() negative & boundary checks
        const crossTenantCheck = await userSessionService.validateSession(authA.sessionId, FIXTURE_TENANT_B, authA.userId);
        assert(crossTenantCheck.valid === false && crossTenantCheck.reason === 'SESSION_TENANT_MISMATCH',
            `validateSession strictly rejects tenant mismatch (SESSION_TENANT_MISMATCH)`);

        const crossUserCheck = await userSessionService.validateSession(authA.sessionId, FIXTURE_TENANT_A, 'non-existent-user-id');
        assert(crossUserCheck.valid === false && crossUserCheck.reason === 'SESSION_USER_MISMATCH',
            `validateSession strictly rejects user mismatch (SESSION_USER_MISMATCH)`);

        const missingSessionCheck = await userSessionService.validateSession('non-existent-session-id', FIXTURE_TENANT_A, authA.userId);
        assert(missingSessionCheck.valid === false && missingSessionCheck.reason === 'SESSION_NOT_FOUND',
            `validateSession strictly rejects non-existent session (SESSION_NOT_FOUND)`);

        // ── STEP 2: INTAKE BASELINE CHECK ──
        console.log(`\n[STEP 2] Verifying Baseline Rates on Isolated Fixture`);
        const [baselineRevs] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE printer_node_id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(baselineRevs[0].count === 0, `Isolated node has exactly 0 baseline pricing revisions`);

        // Query rates_json exclusively (NO nonexistent printer_nodes.rates_checksum column)
        const [baselineNode] = await directConn.query(
            `SELECT rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(baselineNode.length === 1, `Printer node ${FIXTURE_NODE_A} found in database`);
        const baselineChecksum = computeCanonicalRatesChecksum(baselineNode[0].rates_json);
        const baselineIntegrity = verifyRatesChecksumIntegrity(baselineChecksum, INITIAL_RATES_CHECKSUM);
        assert(
            baselineIntegrity.valid === true,
            baselineIntegrity.valid
                ? `Baseline rates strictly match initial valid rates fixture (stored: "${baselineIntegrity.storedNormalized}", expected: "${baselineIntegrity.computedNormalized}")`
                : `Baseline rates checksum verification failed: ${baselineIntegrity.error}`
        );

        // ── STEP 3: CREATE CALIBRATION SESSION ──
        console.log(`\n[STEP 3] Creating Calibration Session with Canonical Integration Fixture`);
        // Technical specification defined explicitly for integration testing (Phase 193C canonical book spec).
        // Resolves no documentary ambiguity and is strictly identified as a synthetic integration fixture.
        const sessionPayload = {
            printerNodeId: FIXTURE_NODE_A,
            referenceBookName: 'Synthetic Integration Fixture (Perfect Bound 4/4)',
            bookSpec: {
                copies: 1500,
                interior_pages: 72,
                book_width_mm: 170,
                book_height_mm: 240,
                interior_print: '4/4',
                cover_print: '4/0',
                paper_type_interior: 'offset',
                paper_weight_interior: 150,
                paper_type_cover: 'mc',
                paper_weight_cover: 250,
                lamination: 'matt',
                binding_method: 'perfect bound',
                delivery_country: 'DE'
            },
            targetManufacturingPrice: 1792.00,
            currency: 'EUR',
            includesPaper: true,
            includesBinding: true,
            includesFinishing: true,
            includesPackaging: true
        };

        const createRes = await httpRequest(
            serverUrl,
            'POST',
            '/api/printhouse/onboarding/pricing/calibrations',
            tokenA,
            sessionPayload
        );
        assert(createRes.status === 201, `Calibration session created with HTTP 201`, formatHttpDiagnostic('POST', '/api/printhouse/onboarding/pricing/calibrations', createRes));
        assert(createRes.body && createRes.body.ok === true && createRes.body.data && typeof createRes.body.data.id === 'string',
            `Received valid session record in body.data: ${createRes.body?.data?.id}`);
        const sessionId = createRes.body.data.id;
        tracker.sessionIds.add(sessionId);

        // ── STEP 4: PREFLIGHT READINESS CHECK (CONTRACT: POST /pricing/calibrations/:id/ready) ──
        console.log(`\n[STEP 4] Checking Preflight Readiness (Official Contract: POST /:id/ready)`);
        const readyRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/ready`,
            tokenA
        );
        assert(readyRes.status === 200, `POST /ready returned HTTP 200`, formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/ready`, readyRes));
        assert(readyRes.body && readyRes.body.ok === true, `POST /ready returned ok: true`);
        assert(readyRes.body.data && readyRes.body.data.status === 'READY',
            `Session status in body.data is strictly READY: ${readyRes.body?.data?.status}`);

        // ── STEP 5: DETERMINISTIC SOLVER CALCULATION ──
        console.log(`\n[STEP 5] Executing Deterministic Solver Run (Official Contract: POST /:id/calculate -> HTTP 201)`);
        const calcRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/calculate`,
            tokenA,
            { targetPrice: 1792.00 }
        );
        assert(calcRes.status === 201, `Solver execution returned HTTP 201`, formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/calculate`, calcRes));
        assert(calcRes.body && calcRes.body.ok === true && calcRes.body.data,
            `Solver returned run data in body.data`);
        const runData = calcRes.body.data;
        assert(typeof runData.id === 'string' && runData.id.length > 0,
            `Run ID obtained from response: ${runData.id}`);
        const realRunId = runData.id;
        tracker.runIds.add(realRunId);

        const enginePriceAfter = typeof runData.enginePriceAfter === 'number' ? runData.enginePriceAfter : runData.engine_price_after;
        assert(typeof enginePriceAfter === 'number' && enginePriceAfter > 0,
            `Engine price after solver is positive: ${enginePriceAfter} EUR`);
        const proposedPatch = runData.proposedPatch || runData.proposed_patch_json;
        assert(proposedPatch && Object.keys(proposedPatch).length > 0,
            `Proposed patch contains deterministic rates`);

        // Verify Run in Database by EXACT runId from response and assert calibration_session_id & tenant_id
        const [runs] = await directConn.query(
            `SELECT id, calibration_session_id, tenant_id, absolute_residual, percent_residual 
             FROM printhouse_pricing_calibration_runs 
             WHERE id = ?`,
            [realRunId]
        );
        assert(runs.length === 1, `Calibration run record verified in MySQL by exact runId (${realRunId})`);
        assert(runs[0].id === realRunId, `Exact runId matched in database`);
        assert(runs[0].calibration_session_id === sessionId, `calibration_session_id strictly matches current session (${sessionId})`);
        assert(runs[0].tenant_id === FIXTURE_TENANT_A, `tenant_id strictly matches Tenant A (${FIXTURE_TENANT_A})`);
        assert(Number(runs[0].absolute_residual) >= 0, `Non-negative absolute residual stored in run`);

        // ── STEP 6: STRICT MULTI-TENANT ISOLATION USING REAL SESSION AND REAL RUN ID ──
        console.log(`\n[STEP 6] Testing Multi-Tenant Isolation using REAL Session and REAL Run ID`);

        // A. Cross-tenant Read with real sessionId
        const crossTenantRead = await httpRequest(
            serverUrl,
            'GET',
            `/api/printhouse/onboarding/pricing/calibrations/${sessionId}`,
            tokenB
        );
        assert(crossTenantRead.status === 403 || crossTenantRead.status === 404,
            `Cross-tenant read rejected with HTTP ${crossTenantRead.status}`,
            formatHttpDiagnostic('GET', `/api/printhouse/onboarding/pricing/calibrations/${sessionId}`, crossTenantRead));

        // B. Cross-tenant Calculate with real sessionId
        const crossTenantCalc = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/calculate`,
            tokenB,
            { targetPrice: 1792.00 }
        );
        assert(crossTenantCalc.status === 403 || crossTenantCalc.status === 404,
            `Cross-tenant calculate rejected with HTTP ${crossTenantCalc.status}`,
            formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/calculate`, crossTenantCalc));

        // C. Cross-tenant Accept with REAL sessionId AND REAL runId
        const crossTenantAccept = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/accept`,
            tokenB,
            { runId: realRunId, acceptanceNotes: 'Unauthorized tenant attempt with real runId' }
        );
        assert(crossTenantAccept.status === 403 || crossTenantAccept.status === 404,
            `Cross-tenant acceptance with real runId strictly rejected with HTTP ${crossTenantAccept.status}`,
            formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/accept`, crossTenantAccept));

        // Verify no revisions were created by the unauthorized cross-tenant attempt
        const [postCrossRevs] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE printer_node_id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(postCrossRevs[0].count === 0, `Zero pricing revisions created following rejected cross-tenant attempt`);

        // Verify node rates remain strictly untouched and match INITIAL_VALID_RATES
        // Query rates_json exclusively (NO nonexistent printer_nodes.rates_checksum column)
        const [postCrossNode] = await directConn.query(
            `SELECT rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_A]
        );
        const postCrossChecksum = computeCanonicalRatesChecksum(postCrossNode[0].rates_json);
        const postCrossIntegrity = verifyRatesChecksumIntegrity(postCrossChecksum, INITIAL_RATES_CHECKSUM);
        assert(
            postCrossIntegrity.valid === true,
            postCrossIntegrity.valid
                ? `Printer node rates strictly unchanged and identical to initial baseline after cross-tenant attempt (stored: "${postCrossIntegrity.storedNormalized}", expected: "${postCrossIntegrity.computedNormalized}")`
                : `Post cross-tenant rates checksum verification failed: ${postCrossIntegrity.error}`
        );

        // ── STEP 7: REAL CANCELLATION FLOW (POST /reject) VS ABANDONMENT ──
        console.log(`\n[STEP 7] Verifying Real Cancellation Flow (POST /reject) on Secondary Session`);
        // Synthetic cancellation fixture with explicit bookSpec & price semantics
        const cancelSessionPayload = {
            printerNodeId: FIXTURE_NODE_A,
            referenceBookName: 'Synthetic Cancellation Fixture (Perfect Bound 4/4)',
            bookSpec: {
                copies: 500,
                interior_pages: 96,
                book_width_mm: 148,
                book_height_mm: 210,
                interior_print: '4/4',
                cover_print: '4/0',
                paper_type_interior: 'offset',
                paper_weight_interior: 90,
                paper_type_cover: 'mc',
                paper_weight_cover: 250,
                lamination: 'gloss',
                binding_method: 'perfect bound',
                delivery_country: 'DE'
            },
            targetManufacturingPrice: 850.00,
            currency: 'EUR',
            includesPaper: true,
            includesBinding: true,
            includesFinishing: true,
            includesPackaging: true
        };

        const cancelCreateRes = await httpRequest(
            serverUrl,
            'POST',
            '/api/printhouse/onboarding/pricing/calibrations',
            tokenA,
            cancelSessionPayload
        );
        assert(cancelCreateRes.status === 201, `Secondary calibration session created with HTTP 201`, formatHttpDiagnostic('POST', '/api/printhouse/onboarding/pricing/calibrations', cancelCreateRes));
        assert(cancelCreateRes.body && cancelCreateRes.body.ok === true && cancelCreateRes.body.data && typeof cancelCreateRes.body.data.id === 'string',
            `Received valid secondary session record in body.data: ${cancelCreateRes.body?.data?.id}`);
        const cancelSessionId = cancelCreateRes.body.data.id;
        tracker.sessionIds.add(cancelSessionId);

        // Promote secondary session to ready
        const cancelReadyRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${cancelSessionId}/ready`,
            tokenA
        );
        assert(cancelReadyRes.status === 200, `POST /ready on secondary session returned HTTP 200`, formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${cancelSessionId}/ready`, cancelReadyRes));
        assert(cancelReadyRes.body && cancelReadyRes.body.ok === true && cancelReadyRes.body.data?.status === 'READY',
            `Secondary session status in body.data is strictly READY: ${cancelReadyRes.body?.data?.status}`);

        // Execute real cancellation via POST /reject endpoint
        const rejectRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${cancelSessionId}/reject`,
            tokenA,
            { reason: 'Calibration cancelled by operator during test' }
        );
        assert(rejectRes.status === 200, `POST /reject returned HTTP 200`, formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${cancelSessionId}/reject`, rejectRes));
        assert(rejectRes.body && rejectRes.body.ok === true, `POST /reject returned ok: true`);
        assert(rejectRes.body.data?.status === 'REJECTED', `Cancelled session status in body.data is strictly REJECTED`);

        // Verify that cancellation produces zero revisions and zero rate changes
        const [cancelledRevs] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE source_calibration_session_id = ?`,
            [cancelSessionId]
        );
        assert(cancelledRevs[0].count === 0, `Zero revisions created for cancelled/rejected session`);

        // Query rates_json exclusively (NO nonexistent printer_nodes.rates_checksum column)
        const [cancelledNode] = await directConn.query(
            `SELECT rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_A]
        );
        const cancelledChecksum = computeCanonicalRatesChecksum(cancelledNode[0].rates_json);
        const cancelledIntegrity = verifyRatesChecksumIntegrity(cancelledChecksum, INITIAL_RATES_CHECKSUM);
        assert(
            cancelledIntegrity.valid === true,
            cancelledIntegrity.valid
                ? `Node rates_json remains strictly identical to baseline fixture after cancellation (stored: "${cancelledIntegrity.storedNormalized}", expected: "${cancelledIntegrity.computedNormalized}")`
                : `Cancelled session rates checksum verification failed: ${cancelledIntegrity.error}`
        );

        // ── STEP 8: GOVERNED ACCEPTANCE ON PRIMARY SESSION ──
        console.log(`\n[STEP 8] Executing Governed Calibration Acceptance (Official Contract: POST /:id/accept -> HTTP 200)`);
        const acceptPayload = {
            runId: realRunId,
            acceptanceNotes: 'Verified under official MySQL isolated suite',
            acceptedBy: 'operator_connected_audit'
        };

        const acceptRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/accept`,
            tokenA,
            acceptPayload
        );
        assert(acceptRes.status === 200, `Acceptance registered with HTTP 200`, formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${sessionId}/accept`, acceptRes));
        assert(acceptRes.body && acceptRes.body.ok === true && acceptRes.body.data,
            `Acceptance returned valid data envelope in body.data`);
        const acceptData = acceptRes.body.data;
        assert(acceptData.status === 'ACCEPTED', `Acceptance status is strictly ACCEPTED: ${acceptData.status}`);
        const revisionId = acceptData.revisionId;
        assert(typeof revisionId === 'string' && revisionId.length > 0, `Immutable pricing revision created: ${revisionId}`);
        tracker.revisionIds.add(revisionId);

        const acceptanceId = acceptData.acceptanceId;
        assert(typeof acceptanceId === 'string' && acceptanceId.length > 0, `Acceptance record created: ${acceptanceId}`);
        tracker.acceptanceIds.add(acceptanceId);

        // ── STEP 9: CANONICAL CHECKSUM VERIFICATION & ABSENCE OF COMMERCIAL LEAKAGE ──
        console.log(`\n[STEP 9] Verifying Canonical SHA-256 Checksum and Commercial Invariance`);

        // Fetch stored revision and compute canonical SHA-256 from stored rates_json
        const [finalRevs] = await directConn.query(
            `SELECT id, printer_node_id, source_type, rates_json, rates_checksum, created_at 
             FROM printhouse_pricing_revisions 
             WHERE printer_node_id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(finalRevs.length === 1, `Exactly 1 revision created for isolated printer node`);
        assert(finalRevs[0].id === revisionId, `Revision matches accepted ID (${revisionId})`);
        assert(finalRevs[0].printer_node_id === FIXTURE_NODE_A, `Revision correctly references printer_node_id`);

        // Cryptographic check: calculate canonical SHA-256 of stored rates_json and compare
        const storedRates = finalRevs[0].rates_json;
        const expectedChecksum = computeCanonicalRatesChecksum(storedRates);
        const checksumIntegrity = verifyRatesChecksumIntegrity(finalRevs[0].rates_checksum, expectedChecksum);
        assert(
            checksumIntegrity.valid === true,
            checksumIntegrity.valid
                ? `rates_checksum strictly matches canonical SHA-256 (stored: "${checksumIntegrity.storedNormalized}", calculated: "${checksumIntegrity.computedNormalized}")`
                : `rates_checksum integrity verification failed: ${checksumIntegrity.error}`
        );

        // Verify that acceptances record is persisted in MySQL
        const [accRows] = await directConn.query(
            `SELECT id, target_manufacturing_price, verified_manufacturing_price 
             FROM printhouse_pricing_calibration_acceptances 
             WHERE pricing_revision_id = ?`,
            [revisionId]
        );
        assert(accRows.length === 1, `Acceptance record verified in MySQL table`);
        if (accRows[0]?.id) tracker.acceptanceIds.add(accRows[0].id);

        // Verify commercial isolation with strict fail-closed assertion (ZERO .catch error swallowing):
        // A. Zero records in bpe_pricing_publications
        const [bpePubs] = await directConn.query(
            `SELECT COUNT(*) as count FROM bpe_pricing_publications WHERE tenant_id = ? OR printer_node_id = ?`,
            [FIXTURE_TENANT_A, FIXTURE_NODE_A]
        );
        assert(bpePubs[0].count === 0, `Zero records in bpe_pricing_publications (no commercial leakage)`);

        // B. Zero activation grants in printhouse_activation_grants (checking all commercial dispatch and visibility flags)
        const [grants] = await directConn.query(
            `SELECT COUNT(*) as count 
             FROM printhouse_activation_grants 
             WHERE tenant_id = ? AND (
                 marketplace_visible = 1 OR 
                 live_quoting_allowed = 1 OR 
                 job_routing_allowed = 1 OR 
                 production_dispatch_allowed = 1
             )`,
            [FIXTURE_TENANT_A]
        );
        assert(grants[0].count === 0, `Zero active marketplace, routing, or production dispatch grants in printhouse_activation_grants`);

        // Also assert total activation grants for the tenant is strictly 0
        const [totalGrants] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_activation_grants WHERE tenant_id = ?`,
            [FIXTURE_TENANT_A]
        );
        assert(totalGrants[0].count === 0, `Zero total records in printhouse_activation_grants for isolated tenant`);

        // C. Node status is ACTIVE and rates_json is updated with accepted calibrated rates
        const [nodeState] = await directConn.query(
            `SELECT status, rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_A]
        );
        assert(nodeState[0].status === 'ACTIVE', `Node status preserved as ACTIVE`);
        const finalNodeChecksum = computeCanonicalRatesChecksum(nodeState[0].rates_json);
        const finalNodeIntegrity = verifyRatesChecksumIntegrity(finalNodeChecksum, expectedChecksum);
        assert(
            finalNodeIntegrity.valid === true,
            finalNodeIntegrity.valid
                ? `Node rates_json updated with calibrated document checksum (stored: "${finalNodeIntegrity.storedNormalized}", expected: "${finalNodeIntegrity.computedNormalized}")`
                : `Final node rates checksum verification failed: ${finalNodeIntegrity.error}`
        );
        assert(
            finalNodeIntegrity.storedNormalized !== normalizeSha256Hex(INITIAL_RATES_CHECKSUM),
            `Node rates_json successfully transitioned from baseline to calibrated`
        );
        console.log(`\n  [SCENARIO 1 COMPLETE] Single-Point Validated Onboarding Flow Passed Successfully (57 Assertions).\n`);

        // ══════════════════════════════════════════════════════════════════════════════
        // ══════════════════════════════════════════════════════════════════════════════
        // ── SCENARIO 2 (CASO A): MULTI-QUANTITY VALID CURVE ACCEPTANCE & CROSS-TENANT ISOLATION ──
        // ══════════════════════════════════════════════════════════════════════════════
        console.log(`\n================================================================`);
        console.log(`  SCENARIO 2 (CASO A): MULTI-QUANTITY VALID CURVE & ISOLATION    `);
        console.log(`================================================================`);

        const FIXTURE_NODE_CURVE_A = `node_${EXECUTION_TAG}_curve_a`;
        await seedPrinterNode(directConn, FIXTURE_NODE_CURVE_A, FIXTURE_TENANT_A, `Node Curve A ${EXECUTION_TAG}`, INITIAL_RATES_JSON_STR, nodeColSet);
        assert(true, `Created dedicated curve node ${FIXTURE_NODE_CURVE_A} seeded with initial valid rates baseline`);

        // Seed dedicated printer node for Tenant B using Tenant B's own fixture
        const FIXTURE_NODE_CURVE_B = `node_${EXECUTION_TAG}_curve_b`;
        await seedPrinterNode(directConn, FIXTURE_NODE_CURVE_B, FIXTURE_TENANT_B, `Node Curve B ${EXECUTION_TAG}`, TENANT_B_INITIAL_RATES_JSON_STR, nodeColSet);
        assert(true, `Created dedicated curve node ${FIXTURE_NODE_CURVE_B} for Tenant B seeded with dedicated rates fixture`);

        // Baseline rates check on FIXTURE_NODE_CURVE_A
        const [curveNodeBaselineA] = await directConn.query(
            `SELECT status, rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_CURVE_A]
        );
        assert(curveNodeBaselineA[0].status === 'ACTIVE', `Curve node A status initialized as ACTIVE`);
        const curveNodeChecksumA = computeCanonicalRatesChecksum(curveNodeBaselineA[0].rates_json);
        const curveNodeIntegrityA = verifyRatesChecksumIntegrity(curveNodeChecksumA, INITIAL_RATES_CHECKSUM);
        assert(curveNodeIntegrityA.valid === true, `Curve node A initialized with baseline rates checksum`);

        // Baseline rates check on FIXTURE_NODE_CURVE_B
        const [curveNodeBaselineB] = await directConn.query(
            `SELECT status, rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_CURVE_B]
        );
        assert(curveNodeBaselineB[0].status === 'ACTIVE', `Curve node B status initialized as ACTIVE`);
        const curveNodeChecksumB = computeCanonicalRatesChecksum(curveNodeBaselineB[0].rates_json);
        const curveNodeIntegrityB = verifyRatesChecksumIntegrity(curveNodeChecksumB, TENANT_B_RATES_CHECKSUM);
        assert(curveNodeIntegrityB.valid === true, `Curve node B initialized with dedicated Tenant B rates checksum`);

        // Canonical Industrial Book Spec (identical across all 8 points)
        const CURVE_BOOK_SPEC = {
            copies: 500,
            interior_pages: 96,
            book_width_mm: 148,
            book_height_mm: 210,
            interior_print: '4/4',
            cover_print: '4/0',
            paper_type_interior: 'offset',
            paper_weight_interior: 90,
            paper_type_cover: 'mc',
            paper_weight_cover: 250,
            binding_method: 'perfect bound',
            delivery_country: 'DE'
        };

        // Generate synthetic multi-targets for 8 distinct print runs from baseline rates
        // Requirements: >= 3 distinct print runs, exact forward evaluation parity
        // Synthetic integration fixture: validates end-to-end integration and invariants, not accuracy against independent external quotes.
        const CURVE_QUANTITIES = [100, 200, 300, 400, 500, 600, 700, 800];
        const validCurveTargets = CURVE_QUANTITIES.map(q => {
            const fwd = pricingAdapter.evaluateForwardPrice({ ...CURVE_BOOK_SPEC, copies: q }, INITIAL_VALID_RATES, {}, {});
            return {
                quantity: q,
                targetManufacturingPrice: Number(fwd.predictedManufacturingPrice.toFixed(2)),
                targetBasis: 'MANUFACTURING_PRICE',
                currency: 'EUR'
            };
        });
        assert(validCurveTargets.length === 8, `Generated synthetic curve targets with 8 distinct print runs (>= 3 required)`);
        assert(validCurveTargets.every(t => Number.isInteger(t.quantity) && t.quantity > 0), `All curve target quantities are strictly positive integers`);
        assert(validCurveTargets.every(t => Number.isFinite(t.targetManufacturingPrice) && t.targetManufacturingPrice > 0), `All curve target prices are finite strictly positive numbers`);

        // Create Curve Calibration Session (Contract: POST /pricing/calibrations -> HTTP 201)
        const curveSessionPayload = {
            printerNodeId: FIXTURE_NODE_CURVE_A,
            referenceBookName: 'Synthetic Multi-Quantity Calibration Curve (8 Points)',
            bookSpec: CURVE_BOOK_SPEC,
            multiTargets: validCurveTargets,
            currency: 'EUR',
            includesPaper: true,
            includesBinding: true,
            includesFinishing: true,
            includesPackaging: true
        };

        const curveCreateRes = await httpRequest(
            serverUrl,
            'POST',
            '/api/printhouse/onboarding/pricing/calibrations',
            tokenA,
            curveSessionPayload
        );
        assert(curveCreateRes.status === 201, `Curve calibration session created with HTTP 201`, formatHttpDiagnostic('POST', '/api/printhouse/onboarding/pricing/calibrations', curveCreateRes));
        assert(curveCreateRes.body && curveCreateRes.body.ok === true && curveCreateRes.body.data?.id, `Curve session ID received`);
        const curveSessionId = curveCreateRes.body.data.id;
        tracker.sessionIds.add(curveSessionId);
        assert(curveCreateRes.body.data.status === 'DRAFT', `Curve session status is strictly DRAFT`);

        // Promote Curve Session to READY (Contract: POST /:id/ready -> HTTP 200)
        const curveReadyRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${curveSessionId}/ready`,
            tokenA
        );
        assert(curveReadyRes.status === 200, `POST /ready on curve session returned HTTP 200`, formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${curveSessionId}/ready`, curveReadyRes));
        assert(curveReadyRes.body?.data?.status === 'READY', `Curve session status in body.data is strictly READY`);

        // Calculate Curve Run (Contract: POST /:id/calculate -> HTTP 201)
        const curveCalcRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${curveSessionId}/calculate`,
            tokenA
        );
        assert(curveCalcRes.status === 201, `Curve calculation returned HTTP 201`, formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${curveSessionId}/calculate`, curveCalcRes));
        const curveRunData = curveCalcRes.body?.data;
        assert(curveRunData && typeof curveRunData.id === 'string', `Valid curve run ID received: ${curveRunData?.id}`);
        const curveRunId = curveRunData.id;
        tracker.runIds.add(curveRunId);

        // Verification of solver contract: replace permissive list with canonical contract
        assert(CANONICAL_ACCEPTABLE_RUN_STATUSES.includes(curveRunData.status),
            `Curve run status (${curveRunData.status}) is in CANONICAL_ACCEPTABLE_RUN_STATUSES`);
        assert(curveRunData.status === 'ACCEPTABLE_CANDIDATE',
            `Curve run status for baseline-derived synthetic curve is strictly ACCEPTABLE_CANDIDATE`);
        assert(Array.isArray(curveRunData.pointResults) && curveRunData.pointResults.length === 8,
            `pointResults contains 8 evaluated points`);

        // Check individual point quantities, prices, residuals, and tolerances against official policy
        for (let i = 0; i < curveRunData.pointResults.length; i++) {
            const pt = curveRunData.pointResults[i];
            const expQ = CURVE_QUANTITIES[i];
            const expTarget = validCurveTargets[i].targetManufacturingPrice;
            const ptTarget = pt.targetManufacturingPrice ?? pt.targetPrice;

            assert(Number.isInteger(pt.quantity) && pt.quantity === expQ, `Point ${i} quantity matches expected ${expQ}`);
            assert(Number.isFinite(ptTarget) && Math.abs(ptTarget - expTarget) < 0.01,
                `Point ${i} (q=${expQ}) target price is finite and matches expected ${expTarget} EUR`);
            assert(Number.isFinite(pt.predictedManufacturingPrice) && pt.predictedManufacturingPrice > 0,
                `Point ${i} (q=${expQ}) predicted manufacturing price is finite and positive: ${pt.predictedManufacturingPrice} EUR`);

            // Recalculate unrounded absolute residual and ratio residual
            const recalculatedAbsRes = Math.abs(pt.predictedManufacturingPrice - ptTarget);
            const recalculatedRatioRes = ptTarget > 0 ? recalculatedAbsRes / ptTarget : 0;
            const effTol = computeGovernanceTolerance(ptTarget, DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE, DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT);

            assert(Number.isFinite(pt.absoluteResidual) && Math.abs(pt.absoluteResidual - recalculatedAbsRes) < 0.01,
                `Point ${i} absolute residual (${pt.absoluteResidual} EUR) verified against recalculated (${recalculatedAbsRes.toFixed(4)} EUR)`);
            assert(Number.isFinite(pt.percentageResidual) && Math.abs(pt.percentageResidual - recalculatedRatioRes) < 0.001,
                `Point ${i} percentage residual ratio (${pt.percentageResidual}) verified against recalculated (${recalculatedRatioRes.toFixed(6)})`);
            assert(recalculatedAbsRes <= effTol,
                `Point ${i} (q=${expQ}) absolute residual (${recalculatedAbsRes.toFixed(4)}) is within effective tolerance (${effTol.toFixed(4)} EUR)`);
            assert(pt.withinTolerance === true,
                `Point ${i} (q=${expQ}) withinTolerance flag is true and verified against governance tolerance`);
        }

        // Check aggregate residuals and curve metrics
        assert(curveRunData.curveMetrics && curveRunData.curveMetrics.pointCount === 8,
            `curveMetrics.pointCount is 8`);
        assert(curveRunData.curveMetrics.acceptedPointCount === 8 && curveRunData.curveMetrics.rejectedPointCount === 0,
            `All 8 points accepted in curveMetrics`);
        assert(typeof curveRunData.absoluteResidual === 'number' && Math.abs(curveRunData.absoluteResidual - curveRunData.curveMetrics.maxAbsoluteResidual) < 0.01,
            `run.absolute_residual (${curveRunData.absoluteResidual}) matches curveMetrics.maxAbsoluteResidual`);
        assert(typeof curveRunData.percentResidual === 'number' && Math.abs(curveRunData.percentResidual - curveRunData.curveMetrics.maxPercentageResidual) < 0.001,
            `run.percent_residual (${curveRunData.percentResidual}) matches curveMetrics.maxPercentageResidual (ratio [0..1])`);

        // Solver diagnostic state: EXACTLY_DETERMINED reported when targetPoints === freeParams === 8 (dof = 0)
        // Does not assert mathematical proof of matrix rank or global identifiability.
        assert(curveRunData.identifiabilityReport && curveRunData.identifiabilityReport.status === 'EXACTLY_DETERMINED',
            `identifiabilityReport status reported by solver is EXACTLY_DETERMINED (targetPoints=8, freeParams=8)`);
        assert(curveRunData.identifiabilityReport.degreesOfFreedom === 0,
            `identifiability degrees of freedom is 0`);

        // Direct DB verification of run record and contrast persisted point_results_json
        const [curveRunRows] = await directConn.query(
            `SELECT id, calibration_session_id, tenant_id, status, point_results_json, curve_metrics_json, identifiability_json 
             FROM printhouse_pricing_calibration_runs 
             WHERE id = ?`,
            [curveRunId]
        );
        assert(curveRunRows.length === 1, `Curve run record verified in MySQL by exact runId (${curveRunId})`);
        assert(curveRunRows[0].calibration_session_id === curveSessionId, `Run session ID matches`);
        assert(curveRunRows[0].tenant_id === FIXTURE_TENANT_A, `Run tenant ID matches Tenant A`);
        assert(curveRunRows[0].point_results_json !== null, `point_results_json persisted in MySQL`);
        assert(curveRunRows[0].curve_metrics_json !== null, `curve_metrics_json persisted in MySQL`);
        assert(curveRunRows[0].identifiability_json !== null, `identifiability_json persisted in MySQL`);

        const dbPointResults = JSON.parse(curveRunRows[0].point_results_json);
        assert(Array.isArray(dbPointResults) && dbPointResults.length === 8,
            `Persisted point_results_json contains exactly 8 points`);
        for (let i = 0; i < dbPointResults.length; i++) {
            const dbPt = dbPointResults[i];
            const expQ = CURVE_QUANTITIES[i];
            const httpPt = curveRunData.pointResults[i];
            assert(dbPt.quantity === expQ, `MySQL Point ${i} quantity matches ${expQ}`);
            assert(Number.isFinite(dbPt.predictedManufacturingPrice) && Math.abs(dbPt.predictedManufacturingPrice - httpPt.predictedManufacturingPrice) < 0.001,
                `MySQL Point ${i} predicted price matches HTTP response`);
            assert(Number.isFinite(dbPt.absoluteResidual) && Math.abs(dbPt.absoluteResidual - httpPt.absoluteResidual) < 0.001,
                `MySQL Point ${i} absolute residual matches HTTP response`);
            assert(dbPt.withinTolerance === true, `MySQL Point ${i} withinTolerance is true`);
        }

        // ──────────────────────────────────────────────────────────────────────────
        // ── CROSS-TENANT ATTEMPT ON UNACCEPTED VALID CURVE CANDIDATE ──
        // ──────────────────────────────────────────────────────────────────────────
        console.log(`\n  [AUDIT BEFORE CROSS-TENANT ATTEMPT] Verifying exact IDs before unauthorized attempt`);

        // 1. Owner node A: status and baseline rates untouched
        const [preNodeA] = await directConn.query(
            `SELECT status, rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_CURVE_A]
        );
        assert(preNodeA[0].status === 'ACTIVE', `Pre-attempt: Owner node A status is ACTIVE`);
        const preChecksumA = computeCanonicalRatesChecksum(preNodeA[0].rates_json);
        const preIntegrityA = verifyRatesChecksumIntegrity(preChecksumA, INITIAL_RATES_CHECKSUM);
        assert(preIntegrityA.valid === true, `Pre-attempt: Owner node A rates remain untouched baseline`);

        // 2. Tenant B node: status and dedicated rates untouched
        const [preNodeB] = await directConn.query(
            `SELECT status, rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_CURVE_B]
        );
        assert(preNodeB[0].status === 'ACTIVE', `Pre-attempt: Tenant B node status is ACTIVE`);
        const preChecksumB = computeCanonicalRatesChecksum(preNodeB[0].rates_json);
        const preIntegrityB = verifyRatesChecksumIntegrity(preChecksumB, TENANT_B_RATES_CHECKSUM);
        assert(preIntegrityB.valid === true, `Pre-attempt: Tenant B node rates match dedicated fixture`);

        // 3. Revisions and acceptances for both tenants: zero on curve node and session
        const [preRevsCurveA] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE printer_node_id = ?`,
            [FIXTURE_NODE_CURVE_A]
        );
        assert(preRevsCurveA[0].count === 0, `Pre-attempt: Zero pricing revisions on curve node A`);

        const [preAccsCurveA] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_acceptances WHERE calibration_session_id = ?`,
            [curveSessionId]
        );
        assert(preAccsCurveA[0].count === 0, `Pre-attempt: Zero calibration acceptances for curve session`);

        const [preRevsTenantB] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE tenant_id = ?`,
            [FIXTURE_TENANT_B]
        );
        assert(preRevsTenantB[0].count === 0, `Pre-attempt: Zero pricing revisions for Tenant B`);

        const [preAccsTenantB] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_acceptances WHERE tenant_id = ?`,
            [FIXTURE_TENANT_B]
        );
        assert(preAccsTenantB[0].count === 0, `Pre-attempt: Zero calibration acceptances for Tenant B`);

        // 4. Absence of BPE publications and activation grants
        const [preBpe] = await directConn.query(
            `SELECT COUNT(*) as count FROM bpe_pricing_publications WHERE tenant_id IN (?, ?) OR printer_node_id IN (?, ?)`,
            [FIXTURE_TENANT_A, FIXTURE_TENANT_B, FIXTURE_NODE_CURVE_A, FIXTURE_NODE_CURVE_B]
        );
        assert(preBpe[0].count === 0, `Pre-attempt: Zero BPE publications across tenants and curve nodes`);

        const [preGrants] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_activation_grants WHERE tenant_id IN (?, ?)`,
            [FIXTURE_TENANT_A, FIXTURE_TENANT_B]
        );
        assert(preGrants[0].count === 0, `Pre-attempt: Zero activation grants across both tenants`);

        // 5. Execute cross-tenant acceptance attempt by Tenant B on Tenant A's unaccepted curve run
        console.log(`\n  [CROSS-TENANT EXECUTION] Tenant B attempting to accept Tenant A's unaccepted curve candidate`);
        const crossTenantAttemptRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${curveSessionId}/accept`,
            tokenB,
            {
                runId: curveRunId,
                acceptanceNotes: 'Unauthorized cross-tenant attempt on unaccepted curve candidate'
            }
        );
        assert(crossTenantAttemptRes.status === 403 || crossTenantAttemptRes.status === 404,
            `Cross-tenant curve acceptance strictly rejected with HTTP ${crossTenantAttemptRes.status}`,
            formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${curveSessionId}/accept`, crossTenantAttemptRes));

        // 6. Post-attempt audit by exact IDs: verify zero mutations
        console.log(`\n  [AUDIT AFTER CROSS-TENANT ATTEMPT] Verifying zero mutations by exact IDs`);
        const [postNodeA] = await directConn.query(
            `SELECT status, rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_CURVE_A]
        );
        assert(postNodeA[0].status === 'ACTIVE', `Post-attempt: Owner node A status preserved as ACTIVE`);
        const postChecksumA = computeCanonicalRatesChecksum(postNodeA[0].rates_json);
        const postIntegrityA = verifyRatesChecksumIntegrity(postChecksumA, INITIAL_RATES_CHECKSUM);
        assert(postIntegrityA.valid === true, `Post-attempt: Owner node A rates strictly unmutated`);

        const [postNodeB] = await directConn.query(
            `SELECT status, rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_CURVE_B]
        );
        assert(postNodeB[0].status === 'ACTIVE', `Post-attempt: Tenant B node status preserved as ACTIVE`);
        const postChecksumB = computeCanonicalRatesChecksum(postNodeB[0].rates_json);
        const postIntegrityB = verifyRatesChecksumIntegrity(postChecksumB, TENANT_B_RATES_CHECKSUM);
        assert(postIntegrityB.valid === true, `Post-attempt: Tenant B node rates strictly unmutated`);

        const [postRevsCurveA] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE printer_node_id = ?`,
            [FIXTURE_NODE_CURVE_A]
        );
        assert(postRevsCurveA[0].count === 0, `Post-attempt: Zero pricing revisions created on curve node A`);

        const [postAccsCurveA] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_acceptances WHERE calibration_session_id = ?`,
            [curveSessionId]
        );
        assert(postAccsCurveA[0].count === 0, `Post-attempt: Zero calibration acceptances created for curve session`);

        const [postRevsTenantB] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE tenant_id = ?`,
            [FIXTURE_TENANT_B]
        );
        assert(postRevsTenantB[0].count === 0, `Post-attempt: Zero pricing revisions created for Tenant B`);

        const [postAccsTenantB] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_acceptances WHERE tenant_id = ?`,
            [FIXTURE_TENANT_B]
        );
        assert(postAccsTenantB[0].count === 0, `Post-attempt: Zero calibration acceptances created for Tenant B`);

        const [postBpe] = await directConn.query(
            `SELECT COUNT(*) as count FROM bpe_pricing_publications WHERE tenant_id IN (?, ?) OR printer_node_id IN (?, ?)`,
            [FIXTURE_TENANT_A, FIXTURE_TENANT_B, FIXTURE_NODE_CURVE_A, FIXTURE_NODE_CURVE_B]
        );
        assert(postBpe[0].count === 0, `Post-attempt: Zero BPE publications persisted`);

        const [postGrants] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_activation_grants WHERE tenant_id IN (?, ?)`,
            [FIXTURE_TENANT_A, FIXTURE_TENANT_B]
        );
        assert(postGrants[0].count === 0, `Post-attempt: Zero activation grants created`);

        // ──────────────────────────────────────────────────────────────────────────
        // ── LEGITIMATE ACCEPTANCE BY TENANT A ──
        // ──────────────────────────────────────────────────────────────────────────
        console.log(`\n  [LEGITIMATE ACCEPTANCE] Tenant A accepting valid curve run`);
        const curveAcceptRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${curveSessionId}/accept`,
            tokenA,
            {
                runId: curveRunId,
                acceptanceNotes: 'Multi-quantity curve verified under official MySQL isolated suite',
                acceptedBy: 'operator_connected_audit'
            }
        );
        assert(curveAcceptRes.status === 200, `Curve acceptance registered with HTTP 200`, formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${curveSessionId}/accept`, curveAcceptRes));
        assert(curveAcceptRes.body?.ok === true && curveAcceptRes.body?.data?.status === 'ACCEPTED',
            `Curve acceptance status is strictly ACCEPTED`);
        const curveRevId = curveAcceptRes.body.data.revisionId;
        assert(typeof curveRevId === 'string' && curveRevId.length > 0, `Curve revision created: ${curveRevId}`);
        tracker.revisionIds.add(curveRevId);
        const curveAccId = curveAcceptRes.body.data.acceptanceId;
        assert(typeof curveAccId === 'string' && curveAccId.length > 0, `Curve acceptance record created: ${curveAccId}`);
        tracker.acceptanceIds.add(curveAccId);

        // Post-acceptance audit by exact IDs in MySQL
        const [curveRevs] = await directConn.query(
            `SELECT id, printer_node_id, source_type, rates_json, rates_checksum 
             FROM printhouse_pricing_revisions 
             WHERE printer_node_id = ?`,
            [FIXTURE_NODE_CURVE_A]
        );
        assert(curveRevs.length === 1, `Exactly 1 revision created for curve node A`);
        assert(curveRevs[0].id === curveRevId, `Revision ID matches accepted ID`);
        const storedCurveRates = curveRevs[0].rates_json;
        const expectedCurveChecksum = computeCanonicalRatesChecksum(storedCurveRates);
        const curveChecksumIntegrity = verifyRatesChecksumIntegrity(curveRevs[0].rates_checksum, expectedCurveChecksum);
        assert(curveChecksumIntegrity.valid === true, `Curve revision rates_checksum strictly matches canonical SHA-256`);

        const [curveAccRows] = await directConn.query(
            `SELECT id, calibration_session_id, calibration_run_id, pricing_revision_id 
             FROM printhouse_pricing_calibration_acceptances 
             WHERE pricing_revision_id = ?`,
            [curveRevId]
        );
        assert(curveAccRows.length === 1, `Acceptance record verified in MySQL for curve revision`);
        if (curveAccRows[0]?.id) tracker.acceptanceIds.add(curveAccRows[0].id);

        // Verify curve node status and rates update in MySQL
        const [curveNodeFinal] = await directConn.query(
            `SELECT status, rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_CURVE_A]
        );
        assert(curveNodeFinal[0].status === 'ACTIVE', `Curve node A status preserved as ACTIVE`);
        const finalCurveNodeChecksum = computeCanonicalRatesChecksum(curveNodeFinal[0].rates_json);
        const finalCurveNodeIntegrity = verifyRatesChecksumIntegrity(finalCurveNodeChecksum, expectedCurveChecksum);
        assert(finalCurveNodeIntegrity.valid === true, `Curve node A rates_json updated to accepted calibrated document`);

        // Verify Tenant B node rates remain strictly untouched and match dedicated fixture
        const [curveNodeBFinal] = await directConn.query(
            `SELECT status, rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_CURVE_B]
        );
        assert(curveNodeBFinal[0].status === 'ACTIVE', `Tenant B node status preserved as ACTIVE`);
        const finalCurveNodeBChecksum = computeCanonicalRatesChecksum(curveNodeBFinal[0].rates_json);
        const finalCurveNodeBIntegrity = verifyRatesChecksumIntegrity(finalCurveNodeBChecksum, TENANT_B_RATES_CHECKSUM);
        assert(finalCurveNodeBIntegrity.valid === true, `Tenant B node rates strictly preserved following Tenant A acceptance`);

        // Verify zero revisions and zero acceptances created for Tenant B
        const [tenantBRevsAfter] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE tenant_id = ?`,
            [FIXTURE_TENANT_B]
        );
        assert(tenantBRevsAfter[0].count === 0, `Zero pricing revisions created for Tenant B after legitimate acceptance`);

        const [tenantBAccsAfter] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_acceptances WHERE tenant_id = ?`,
            [FIXTURE_TENANT_B]
        );
        assert(tenantBAccsAfter[0].count === 0, `Zero calibration acceptances created for Tenant B after legitimate acceptance`);

        // Assert zero commercial leakage on curve nodes and tenants
        const [curveBpe] = await directConn.query(
            `SELECT COUNT(*) as count FROM bpe_pricing_publications WHERE printer_node_id IN (?, ?)`,
            [FIXTURE_NODE_CURVE_A, FIXTURE_NODE_CURVE_B]
        );
        assert(curveBpe[0].count === 0, `Zero records in bpe_pricing_publications for curve nodes`);

        const [curveGrants] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_activation_grants WHERE tenant_id IN (?, ?)`,
            [FIXTURE_TENANT_A, FIXTURE_TENANT_B]
        );
        assert(curveGrants[0].count === 0, `Zero total activation grants for either tenant`);
        console.log(`\n  [SCENARIO 2 COMPLETE] Multi-Quantity Valid Curve Accepted & Cross-Tenant Isolation Verified.\n`);

        // ══════════════════════════════════════════════════════════════════════════════
        // ── SCENARIO 3 (CASO B): OUT-OF-TOLERANCE CURVE REJECTION GATE ──
        // ══════════════════════════════════════════════════════════════════════════════
        console.log(`\n================================================================`);
        console.log(`  SCENARIO 3 (CASO B): OUT-OF-TOLERANCE CURVE REJECTION GATE    `);
        console.log(`================================================================`);

        const FIXTURE_NODE_REJECT_A = `node_${EXECUTION_TAG}_reject_a`;
        await seedPrinterNode(directConn, FIXTURE_NODE_REJECT_A, FIXTURE_TENANT_A, `Node Reject ${EXECUTION_TAG}`, INITIAL_RATES_JSON_STR, nodeColSet);
        assert(true, `Created dedicated rejection node ${FIXTURE_NODE_REJECT_A} with baseline rates`);

        // Baseline rates check on FIXTURE_NODE_REJECT_A
        const [rejectNodeBaseline] = await directConn.query(
            `SELECT rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_REJECT_A]
        );
        const rejectNodeChecksum = computeCanonicalRatesChecksum(rejectNodeBaseline[0].rates_json);
        const rejectNodeIntegrity = verifyRatesChecksumIntegrity(rejectNodeChecksum, INITIAL_RATES_CHECKSUM);
        assert(rejectNodeIntegrity.valid === true, `Rejection node initialized with baseline rates checksum`);

        // Construct 8 targets with point 800 perturbed downward to 1320.00 EUR (baseline is ~1364.50 EUR, q=700 is 1267.00 EUR).
        // Total price is strictly monotonic (1320 > 1267) and unit cost is non-increasing (1320/800 = 1.65 < 1267/700 = 1.81).
        // Solver converges to SUCCEEDED, but point 800 residual (~42.50 EUR) exceeds governance tolerance (~6.60 EUR).
        const outOfToleranceTargets = CURVE_QUANTITIES.map(q => {
            const fwd = pricingAdapter.evaluateForwardPrice({ ...CURVE_BOOK_SPEC, copies: q }, INITIAL_VALID_RATES, {}, {});
            let p = Number(fwd.predictedManufacturingPrice.toFixed(2));
            if (q === 800) {
                p = 1320.00;
            }
            return {
                quantity: q,
                targetManufacturingPrice: p,
                targetBasis: 'MANUFACTURING_PRICE',
                currency: 'EUR'
            };
        });

        const rejectSessionPayload = {
            printerNodeId: FIXTURE_NODE_REJECT_A,
            referenceBookName: 'Synthetic Out-of-Tolerance Curve Fixture',
            bookSpec: CURVE_BOOK_SPEC,
            multiTargets: outOfToleranceTargets,
            currency: 'EUR',
            includesPaper: true,
            includesBinding: true,
            includesFinishing: true,
            includesPackaging: true
        };

        const rejectCreateRes = await httpRequest(
            serverUrl,
            'POST',
            '/api/printhouse/onboarding/pricing/calibrations',
            tokenA,
            rejectSessionPayload
        );
        assert(rejectCreateRes.status === 201, `Rejection session created with HTTP 201`, formatHttpDiagnostic('POST', '/api/printhouse/onboarding/pricing/calibrations', rejectCreateRes));
        const rejectSessionId = rejectCreateRes.body.data.id;
        tracker.sessionIds.add(rejectSessionId);

        const rejectReadyRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${rejectSessionId}/ready`,
            tokenA
        );
        assert(rejectReadyRes.status === 200, `POST /ready on rejection session returned HTTP 200`, formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${rejectSessionId}/ready`, rejectReadyRes));
        assert(rejectReadyRes.body?.data?.status === 'READY', `Rejection session promoted to READY`);

        const rejectCalcRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${rejectSessionId}/calculate`,
            tokenA
        );
        assert(rejectCalcRes.status === 201, `Solver calculated run for rejection session with HTTP 201`, formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${rejectSessionId}/calculate`, rejectCalcRes));
        const rejectRunData = rejectCalcRes.body?.data;
        assert(rejectRunData && typeof rejectRunData.id === 'string', `Valid run ID received for rejection session`);
        const rejectRunId = rejectRunData.id;
        tracker.runIds.add(rejectRunId);

        // Assert solver status SUCCEEDED (canonical status contract) and verify point 800 is outside tolerance
        assert(CANONICAL_ACCEPTABLE_RUN_STATUSES.includes(rejectRunData.status),
            `Perturbed run status (${rejectRunData.status}) is in CANONICAL_ACCEPTABLE_RUN_STATUSES`);
        assert(rejectRunData.status === 'SUCCEEDED', `Perturbed solver produced run with status SUCCEEDED`);

        const pt800 = rejectRunData.pointResults?.find(p => p.quantity === 800);
        assert(pt800 !== undefined, `Point q=800 present in solver pointResults`);
        assert(Number.isInteger(pt800.quantity) && pt800.quantity === 800, `Point q=800 quantity is integer 800`);
        const pt800Target = pt800.targetManufacturingPrice ?? pt800.targetPrice;
        assert(Number.isFinite(pt800Target) && pt800Target === 1320.00, `Point q=800 target price is finite 1320.00 EUR`);
        assert(Number.isFinite(pt800.predictedManufacturingPrice) && pt800.predictedManufacturingPrice > 0,
            `Point q=800 predicted price is finite: ${pt800.predictedManufacturingPrice} EUR`);

        // Recalculate unrounded residual and effective tolerance using official policy
        const pt800AbsRes = Math.abs(pt800.predictedManufacturingPrice - 1320.00);
        const pt800EffTol = computeGovernanceTolerance(1320.00, DEFAULT_ACCEPTANCE_TOLERANCE_ABSOLUTE, DEFAULT_ACCEPTANCE_TOLERANCE_PERCENT);
        assert(pt800AbsRes > 20.0, `Point q=800 recalculated absolute residual (${pt800AbsRes.toFixed(4)} EUR) strictly exceeds 20.00 EUR`);
        assert(pt800AbsRes > pt800EffTol, `Point q=800 absolute residual strictly exceeds effective tolerance (${pt800EffTol.toFixed(4)} EUR)`);
        assert(pt800.withinTolerance === false, `Point q=800 correctly marked as withinTolerance: false by solver`);

        // Direct DB verification of perturbed run record in MySQL
        const [rejectRunRows] = await directConn.query(
            `SELECT id, status, point_results_json FROM printhouse_pricing_calibration_runs WHERE id = ?`,
            [rejectRunId]
        );
        assert(rejectRunRows.length === 1, `Perturbed run record verified in MySQL by exact ID`);
        const dbRejectPts = JSON.parse(rejectRunRows[0].point_results_json);
        const dbPt800 = dbRejectPts.find(p => p.quantity === 800);
        assert(dbPt800 && dbPt800.withinTolerance === false, `MySQL persisted point q=800 has withinTolerance: false`);
        assert(Math.abs(dbPt800.predictedManufacturingPrice - pt800.predictedManufacturingPrice) < 0.001,
            `MySQL persisted point q=800 predicted price matches HTTP response`);

        // Attempt Governed Acceptance: MUST be rejected by curve tolerance gate with HTTP 422
        // Contract: wrapHandler serializes err.statusCode=422, error=err.code ('GOVERNANCE_CURVE_REJECTED'), message=err.message
        const rejectAcceptRes = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${rejectSessionId}/accept`,
            tokenA,
            {
                runId: rejectRunId,
                acceptanceNotes: 'Unauthorized attempt to accept out-of-tolerance curve'
            }
        );
        assert(rejectAcceptRes.status === 422, `Out-of-tolerance curve acceptance strictly rejected with HTTP 422`, formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${rejectSessionId}/accept`, rejectAcceptRes));

        // Assert error code from real Express wrapHandler serialization: body.error or body.code
        const receivedErrorCode = rejectAcceptRes.body?.error || rejectAcceptRes.body?.code;
        assert(receivedErrorCode === 'GOVERNANCE_CURVE_REJECTED',
            `Rejection error code is strictly GOVERNANCE_CURVE_REJECTED (received: ${receivedErrorCode})`);

        // Verify specific reason POINT_OUT_OF_TOLERANCE from response message or parsed reasons
        const responseMsg = typeof rejectAcceptRes.body?.message === 'string' ? rejectAcceptRes.body.message : '';
        const parsedReasons = rejectAcceptRes.body?.reasons || (responseMsg.match(/\[([A-Z0-9_, ]+)\]/)?.[1]?.split(',').map(s => s.trim())) || [];
        const hasPointOutOfTol = parsedReasons.includes('POINT_OUT_OF_TOLERANCE') || responseMsg.includes('POINT_OUT_OF_TOLERANCE');
        assert(hasPointOutOfTol === true, `Rejection diagnostic strictly contains POINT_OUT_OF_TOLERANCE: "${responseMsg}"`);
        console.log(`  ✓ Sanitized Governance Diagnostic: ${formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${rejectSessionId}/accept`, rejectAcceptRes)}`);

        // Verify zero revisions and zero acceptances created in MySQL
        const [noRevs] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE printer_node_id = ?`,
            [FIXTURE_NODE_REJECT_A]
        );
        assert(noRevs[0].count === 0, `Zero pricing revisions created following out-of-tolerance rejection`);

        const [noAccs] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_acceptances WHERE calibration_session_id = ?`,
            [rejectSessionId]
        );
        assert(noAccs[0].count === 0, `Zero calibration acceptances created for rejected session`);

        // Verify node rates remain strictly untouched and match INITIAL_RATES_CHECKSUM
        const [nodeRejectState] = await directConn.query(
            `SELECT rates_json FROM printer_nodes WHERE id = ?`,
            [FIXTURE_NODE_REJECT_A]
        );
        const nodeRejectChecksum = computeCanonicalRatesChecksum(nodeRejectState[0].rates_json);
        const nodeRejectIntegrity = verifyRatesChecksumIntegrity(nodeRejectChecksum, INITIAL_RATES_CHECKSUM);
        assert(nodeRejectIntegrity.valid === true, `Rejection node rates_json remains strictly identical to baseline fixture`);
        console.log(`\n  [SCENARIO 3 COMPLETE] Out-of-Tolerance Curve Rejected with Zero Residuals.\n`);

        // ══════════════════════════════════════════════════════════════════════════════
        // ── SCENARIO 4 (CASO C): CROSS-TENANT POST-ACCEPTANCE & REVISION ISOLATION ──
        // ══════════════════════════════════════════════════════════════════════════════
        console.log(`\n================================================================`);
        console.log(`  SCENARIO 4 (CASO C): CROSS-TENANT REVISION & AUDIT ISOLATION  `);
        console.log(`================================================================`);

        // Tenant B attempts to read Tenant A's revision via GET /pricing/revisions/:revisionId
        const crossRevRead = await httpRequest(
            serverUrl,
            'GET',
            `/api/printhouse/onboarding/pricing/revisions/${curveRevId}`,
            tokenB
        );
        assert(crossRevRead.status === 403 || crossRevRead.status === 404,
            `Cross-tenant read of Tenant A revision strictly rejected with HTTP ${crossRevRead.status}`);

        // Tenant B attempts to accept already-accepted session
        const crossCurveAccept = await httpRequest(
            serverUrl,
            'POST',
            `/api/printhouse/onboarding/pricing/calibrations/${curveSessionId}/accept`,
            tokenB,
            {
                runId: curveRunId,
                acceptanceNotes: 'Cross-tenant unauthorized acceptance attempt on curve run'
            }
        );
        assert(crossCurveAccept.status === 403 || crossCurveAccept.status === 404,
            `Cross-tenant curve acceptance on accepted session rejected with HTTP ${crossCurveAccept.status}`,
            formatHttpDiagnostic('POST', `/api/printhouse/onboarding/pricing/calibrations/${curveSessionId}/accept`, crossCurveAccept));

        // Verify zero revisions created for Tenant B across all scenarios
        const [finalTenantBRevs] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_revisions WHERE tenant_id = ?`,
            [FIXTURE_TENANT_B]
        );
        assert(finalTenantBRevs[0].count === 0, `Zero pricing revisions created for Tenant B across all scenarios`);

        // Verify zero acceptances created for Tenant B across all scenarios
        const [finalTenantBAccs] = await directConn.query(
            `SELECT COUNT(*) as count FROM printhouse_pricing_calibration_acceptances WHERE tenant_id = ?`,
            [FIXTURE_TENANT_B]
        );
        assert(finalTenantBAccs[0].count === 0, `Zero calibration acceptances created for Tenant B across all scenarios`);
        console.log(`\n  [SCENARIO 4 COMPLETE] Cross-Tenant Curve Isolation Verified with Zero Mutations.\n`);

    } catch (err) {
        mainError = err;
        console.error(`\n[TEST-ERROR] Suite encountered fatal error:`, err.message);
    } finally {
        // Shutdown test HTTP server
        if (testServer) {
            await new Promise((resolve) => testServer.close(resolve));
            console.log('\n[TEARDOWN] Closed test Express HTTP server');
        }

        // Execute verified cleanup across all 8 affected tables
        if (directConn) {
            try {
                await performDeterministicCleanup(directConn);
            } catch (cleanErr) {
                console.error('[TEARDOWN-CLEANUP-FAIL]', cleanErr.message);
                cleanupError = cleanErr;
            }
            await directConn.end();
            console.log('[TEARDOWN] Closed direct MySQL connection');
        }

        // Close CP MySQL pool
        try {
            await mysqlClient.closePool();
            console.log('[TEARDOWN] Closed CP MySQL pool');
        } catch (e) {
            console.error('[TEARDOWN] Error closing CP pool:', e.message);
        }

        // Report both mainError and cleanupError jointly if either occurred
        if (mainError || cleanupError) {
            console.error(`\n================================================================`);
            if (mainError) console.error(`  PRIMARY TEST ERROR: ${mainError.message}`);
            if (cleanupError) console.error(`  CLEANUP ERROR     : ${cleanupError.message}`);
            console.error(`================================================================\n`);
            const finalErr = mainError || cleanupError;
            if (mainError && cleanupError) {
                finalErr.cleanupError = cleanupError;
            }
            throw finalErr;
        }
    }

    console.log(`\n================================================================`);
    console.log(`  CONNECTED SUITE RESULTS: ${passedAssertions} ASSERTIONS PASSED | 0 FAILED `);
    console.log(`================================================================\n`);
}

module.exports = {
    runConnectedSuite,
    REQUIRED_MYSQL,
    resolveConnectedMysqlPassword,
    getDirectMysqlConnectionConfig,
    normalizeSha256Hex,
    describeInvalidChecksum,
    verifyRatesChecksumIntegrity,
    computeCanonicalRatesChecksum,
    canonicalStringify,
    runChecksumIntegrityRegressions,
    runCurveHarnessRegressions
};

if (require.main === module) {
    if (isRegressionMode) {
        try {
            runChecksumIntegrityRegressions();
            runCurveHarnessRegressions();
            process.exit(0);
        } catch (err) {
            console.error(`\n[FATAL] Regressions failed: ${err.message}`);
            process.exit(1);
        }
    } else {
        runConnectedSuite()
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    }
}
