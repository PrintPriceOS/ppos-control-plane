/**
 * scripts/test_bpe_connected_harness.js
 * 
 * Connected End-to-End Test Harness for Control Plane -> BPE Publication.
 * 
 * Strict Isolation & Integrity Requirements:
 * 1. Zero dotenv loading. No fallback to generic MYSQL_* / MONGODB_URI.
 *    Clean DATABASE_URL and MYSQL_URL before importing services.
 * 2. MySQL exclusively: 127.0.0.1:3306, db: pposrcmdw0qdtest, user: ppos_rc_mdw0qd.
 *    Verify SELECT CURRENT_USER(), DATABASE() in direct connection and CP service pool.
 *    Exact identity required: ppos_rc_mdw0qd@127.0.0.1.
 * 3. MongoDB exclusively: mongodb://127.0.0.1:27017/bpe_test_harness.
 *    Verify effective databaseName before any write. No credential leakage.
 * 4. Zero CREATE TABLE / DDL statements. Conforms strictly to official migrated schema.
 * 5. Unique IDs per execution. Track all created IDs. No regex deleteMany.
 *    Cleanup strictly in finally block following FK order. Cleanup failures exit code 1.
 * 6. Explicit BPE checkout via PPOS_TEST_BPE_ROOT (/opt/printprice-os/release-candidates/bpe-publication).
 *    Verify and display git SHA. Zero dependency on Windows paths or npm packages.
 * 7. Real publishAcceptedRevision against real Fastify BPE receiver with ephemeral token.
 *    No mockHandler, no driver substitution. Clean shutdown of server and all pools.
 */

'use strict';

// -----------------------------------------------------------------------------
// STEP 1: Strict Environment Sanitization & Test Parameter Enforcement
// -----------------------------------------------------------------------------

// Explicitly remove any inherited connection strings that could point to production
delete process.env.DATABASE_URL;
delete process.env.MYSQL_URL;
delete process.env.MONGODB_URI;

// Enforce MySQL Parameters
const REQUIRED_MYSQL = {
    host: '127.0.0.1',
    port: 3306,
    user: 'ppos_rc_mdw0qd',
    database: 'pposrcmdw0qdtest'
};

const configuredMysqlHost = process.env.PPOS_TEST_MYSQL_HOST || REQUIRED_MYSQL.host;
const configuredMysqlPort = parseInt(process.env.PPOS_TEST_MYSQL_PORT || String(REQUIRED_MYSQL.port), 10);
const configuredMysqlUser = process.env.PPOS_TEST_MYSQL_USER || REQUIRED_MYSQL.user;
const configuredMysqlDb = process.env.PPOS_TEST_MYSQL_DATABASE || REQUIRED_MYSQL.database;

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

const mysqlPassword = process.env.PPOS_TEST_MYSQL_PASSWORD;
if (!mysqlPassword) {
    console.error('\n[FATAL] Missing required environment variable: PPOS_TEST_MYSQL_PASSWORD');
    console.error('Explicit test password must be supplied via PPOS_TEST_MYSQL_PASSWORD.');
    process.exit(1);
}

// Enforce MongoDB Parameters
const REQUIRED_MONGO_URI = 'mongodb://127.0.0.1:27017/bpe_test_harness';
const configuredMongoUri = process.env.PPOS_TEST_MONGODB_URI || REQUIRED_MONGO_URI;

if (configuredMongoUri !== REQUIRED_MONGO_URI) {
    console.error(`\n[FATAL] Configuration rejected: MongoDB URI must be strictly:`);
    console.error(`  ${REQUIRED_MONGO_URI}`);
    console.error(`Attempted URI: ${sanitizeUri(configuredMongoUri)}`);
    process.exit(1);
}

// Enforce BPE Root Checkout
const DEFAULT_BPE_ROOT = '/opt/printprice-os/release-candidates/bpe-publication';
const bpeRoot = process.env.PPOS_TEST_BPE_ROOT || DEFAULT_BPE_ROOT;

// Set CP environment variables strictly before importing CP services
process.env.MYSQL_HOST = REQUIRED_MYSQL.host;
process.env.MYSQL_PORT = String(REQUIRED_MYSQL.port);
process.env.MYSQL_USER = REQUIRED_MYSQL.user;
process.env.MYSQL_PASSWORD = mysqlPassword;
process.env.MYSQL_DATABASE = REQUIRED_MYSQL.database;
delete process.env.DATABASE_URL;
delete process.env.MYSQL_URL;

// Node.js standard modules
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const child_process = require('child_process');
const axios = require('axios');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const fastify = require('fastify');

// Import Control Plane services with verified clean environment
const mysqlClient = require('../src/api/services/mysqlClient');
const bpePublicationService = require('../src/api/services/bpePublicationService');

// -----------------------------------------------------------------------------
// Helper Functions & Trackers
// -----------------------------------------------------------------------------

function sanitizeUri(uri) {
    if (!uri) return '';
    return uri.replace(/\/\/[^@]+@/, '//***:***@');
}

function canonicalStringify(obj) {
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(v => canonicalStringify(v)).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

function computeRatesChecksum(rates) {
    if (!rates) return null;
    const parsed = typeof rates === 'string' ? JSON.parse(rates) : rates;
    const canonical = canonicalStringify(parsed);
    return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

// Unique run identifier per execution
const runId = 'harness_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');

// Strict tracking of created fixture IDs for deterministic FK teardown
const tracker = {
    tenants: new Set(),
    printerNodes: new Set(),
    revisions: new Set(),
    publications: new Set(),
    mongoHouseIds: new Set()
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

// -----------------------------------------------------------------------------
// Main Connected Test Harness
// -----------------------------------------------------------------------------

async function runConnectedHarness() {
    console.log(`\n================================================================`);
    console.log(`  PRINTPRICE OS: CONTROL PLANE -> BPE CONNECTED TEST HARNESS`);
    console.log(`================================================================`);
    console.log(`Execution Run ID: ${runId}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`MySQL Target: ${REQUIRED_MYSQL.user}@${REQUIRED_MYSQL.host}:${REQUIRED_MYSQL.port}/${REQUIRED_MYSQL.database}`);
    console.log(`MongoDB Target: ${sanitizeUri(REQUIRED_MONGO_URI)}`);

    let directConn = null;
    let mongoClient = null;
    let bpeFastifyServer = null;
    let cleanupErrorOccurred = false;

    try {
        // ----------------------------------------------------------------------
        // 1. Verify BPE Checkout & SHA
        // ----------------------------------------------------------------------
        console.log(`\n[STEP 1] Verifying BPE Checkout at PPOS_TEST_BPE_ROOT`);
        if (!fs.existsSync(bpeRoot)) {
            throw new Error(`BPE root directory does not exist at "${bpeRoot}". Please check PPOS_TEST_BPE_ROOT.`);
        }

        let bpeSha = 'UNKNOWN';
        try {
            bpeSha = child_process.execSync('git rev-parse HEAD', {
                cwd: bpeRoot,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            }).trim();
        } catch (gitErr) {
            // Check if git commit exists in git files
            const headFile = path.join(bpeRoot, '.git', 'HEAD');
            if (fs.existsSync(headFile)) {
                bpeSha = fs.readFileSync(headFile, 'utf8').trim();
            } else {
                throw new Error(`Failed to determine git commit SHA in "${bpeRoot}": ${gitErr.message}`);
            }
        }

        console.log(`  [BPE CHECKOUT PATH]: ${bpeRoot}`);
        console.log(`  [BPE CHECKOUT SHA] : ${bpeSha}`);
        assert(bpeSha.length >= 7, `Verified BPE checkout SHA (${bpeSha})`);

        // Load route modules directly from the verified BPE checkout
        const estimatesRoutePath = path.join(bpeRoot, 'routes', 'estimates');
        const marketplaceRoutePath = path.join(bpeRoot, 'routes', 'marketplace-offers');

        const estimatesRoute = require(estimatesRoutePath);
        const marketplaceRoute = require(marketplaceRoutePath);
        assert(typeof estimatesRoute === 'function', 'Loaded estimatesRoute module from BPE checkout');
        assert(typeof marketplaceRoute === 'function', 'Loaded marketplaceRoute module from BPE checkout');

        // ----------------------------------------------------------------------
        // 2. Strict MySQL Identity Verification (Direct & CP Pool)
        // ----------------------------------------------------------------------
        console.log(`\n[STEP 2] Verifying MySQL Connection & Identity (Zero DDL)`);

        // A. Direct Connection Identity Check
        directConn = await mysql.createConnection({
            host: REQUIRED_MYSQL.host,
            port: REQUIRED_MYSQL.port,
            user: REQUIRED_MYSQL.user,
            password: mysqlPassword,
            database: REQUIRED_MYSQL.database
        });

        const [directIdentityRows] = await directConn.query('SELECT CURRENT_USER() AS currentUser, DATABASE() AS currentDb');
        const directUser = directIdentityRows[0]?.currentUser;
        const directDb = directIdentityRows[0]?.currentDb;

        console.log(`  -> Direct Connection: user="${directUser}", database="${directDb}"`);
        if (directUser !== 'ppos_rc_mdw0qd@127.0.0.1') {
            throw new Error(`Direct connection identity mismatch. Expected "ppos_rc_mdw0qd@127.0.0.1", got "${directUser}"`);
        }
        if (directDb !== REQUIRED_MYSQL.database) {
            throw new Error(`Direct connection database mismatch. Expected "${REQUIRED_MYSQL.database}", got "${directDb}"`);
        }
        assert(true, `Direct MySQL identity strictly verified as ${directUser} on ${directDb}`);

        // B. Control Plane Service Pool Identity Check
        const poolIdentityRows = await mysqlClient.query('SELECT CURRENT_USER() AS currentUser, DATABASE() AS currentDb');
        const poolUser = poolIdentityRows[0]?.currentUser;
        const poolDb = poolIdentityRows[0]?.currentDb;

        console.log(`  -> CP Service Pool  : user="${poolUser}", database="${poolDb}"`);
        if (poolUser !== 'ppos_rc_mdw0qd@127.0.0.1') {
            throw new Error(`CP service pool identity mismatch. Expected "ppos_rc_mdw0qd@127.0.0.1", got "${poolUser}"`);
        }
        if (poolDb !== REQUIRED_MYSQL.database) {
            throw new Error(`CP service pool database mismatch. Expected "${REQUIRED_MYSQL.database}", got "${poolDb}"`);
        }
        assert(true, `CP service pool identity strictly verified as ${poolUser} on ${poolDb}`);

        // ----------------------------------------------------------------------
        // 3. Strict MongoDB Identity Verification
        // ----------------------------------------------------------------------
        console.log(`\n[STEP 3] Verifying MongoDB Connection & Effective Database`);
        mongoClient = new MongoClient(REQUIRED_MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        await mongoClient.connect();
        const mongoDb = mongoClient.db();

        const effectiveDbName = mongoDb.databaseName;
        console.log(`  -> MongoDB Effective DB: "${effectiveDbName}"`);
        if (effectiveDbName !== 'bpe_test_harness') {
            throw new Error(`MongoDB effective database mismatch. Expected "bpe_test_harness", got "${effectiveDbName}"`);
        }
        assert(true, 'MongoDB effective databaseName strictly verified as bpe_test_harness');
        const printhousesColl = mongoDb.collection('printhouses');

        // ----------------------------------------------------------------------
        // 4. Inspect Official Migrated Schema & Seed Fixtures
        // ----------------------------------------------------------------------
        console.log(`\n[STEP 4] Seeding Fixtures into Official Migrated Tables`);

        // Generate unique IDs for this execution
        const fixtureTenantId = `${runId}_tenant`;
        const fixtureIntruderTenantId = `${runId}_intruder`;
        const fixtureNodeId = `${runId}_node`;
        const fixtureHouseId = `${runId}_house`;
        const fixtureRevId1 = `${runId}_rev_1`;
        const fixtureRevId2 = `${runId}_rev_2`;
        const fixturePatch1 = `sha256:${runId}_patch_1`;
        const fixturePatch2 = `sha256:${runId}_patch_2`;

        // 4.1 Seed Tenant into official `tenants` table
        const [tenantCols] = await mysqlClient.query('SHOW COLUMNS FROM tenants');
        const tenantColSet = new Set(tenantCols.map(c => c.Field));

        const tenantFields = ['id', 'name'];
        const tenantVals = [fixtureTenantId, `Harness Tenant ${runId}`];
        if (tenantColSet.has('type')) {
            tenantFields.push('type');
            tenantVals.push('ENTERPRISE');
        }
        if (tenantColSet.has('status')) {
            tenantFields.push('status');
            tenantVals.push('ACTIVE');
        }

        await mysqlClient.query(
            `INSERT INTO tenants (${tenantFields.join(',')}) VALUES (${tenantVals.map(() => '?').join(',')})`,
            tenantVals
        );
        tracker.tenants.add(fixtureTenantId);
        assert(true, `Seeded tenant in official table (${fixtureTenantId})`);

        // 4.2 Seed Printer Node into official `printer_nodes` table
        const [nodeCols] = await mysqlClient.query('SHOW COLUMNS FROM printer_nodes');
        const nodeColSet = new Set(nodeCols.map(c => c.Field));

        const nodeFields = ['id', 'tenant_id', 'name'];
        const nodeVals = [fixtureNodeId, fixtureTenantId, `Harness Node ${runId}`];
        if (nodeColSet.has('email')) {
            nodeFields.push('email');
            nodeVals.push(`${fixtureNodeId}@harness-test.local`);
        }
        if (nodeColSet.has('status')) {
            nodeFields.push('status');
            nodeVals.push('ACTIVE');
        }
        if (nodeColSet.has('metadata_json')) {
            nodeFields.push('metadata_json');
            nodeVals.push(JSON.stringify({ bpe_printhouse_id: fixtureHouseId }));
        }

        await mysqlClient.query(
            `INSERT INTO printer_nodes (${nodeFields.join(',')}) VALUES (${nodeVals.map(() => '?').join(',')})`,
            nodeVals
        );
        tracker.printerNodes.add(fixtureNodeId);
        assert(true, `Seeded printer node in official table (${fixtureNodeId} -> ${fixtureHouseId})`);

        // Base rate card definition for pricing tests
        const baseRates = {
            paper_price_cover_by_kilo: { mc: 1.50, offset: 1.30 },
            paper_price_interior_by_kilo: { mc: 1.20, offset: 1.10 },
            cover_fixed_by_colours: { '1': 25, '2': 35, '4': 65 },
            cover_var_per_1000_by_colours: { '1': 10, '2': 14, '4': 26 },
            interior_one_colour_fixed: { '16p': 18, '32p': 30 },
            interior_one_colour_var: { '16p': 7, '32p': 12 },
            lam_fixed: { matt: 40, gloss: 40 },
            lam_var_per_1000: { matt: 15, gloss: 15 },
            binding_hc_fixed_by_sections: { '1': 140, '2': 148, '8': 196 },
            binding_hc_var_per_1000_by_sections: { '1': 55, '2': 59, '8': 83 },
            endpapers_fixed: 50,
            endpapers_var_per_1000: 10
        };
        const initialRatesChecksum = computeRatesChecksum(baseRates);

        // 4.3 Seed Printhouse Document in MongoDB with established tenant and node mapping
        const initialHouseDoc = {
            id: fixtureHouseId,
            house_id: fixtureHouseId,
            name: `Harness House ${runId}`,
            tenant_id: fixtureTenantId,
            printer_node_id: fixtureNodeId,
            version: 1,
            accepted_patch_checksum: fixturePatch1,
            rates_checksum: initialRatesChecksum,
            published_revision_id: fixtureRevId1,
            rates: baseRates,
            signatures: [16, 32],
            production_lead_days: 7,
            shipping_days: 3,
            limits: { min_copies: 100, max_pages: 2000 },
            shipping: { per_kg: 0.95 },
            updated_at: new Date()
        };

        await printhousesColl.insertOne(initialHouseDoc);
        tracker.mongoHouseIds.add(fixtureHouseId);
        assert(true, `Seeded printhouse in MongoDB (${fixtureHouseId})`);

        // ----------------------------------------------------------------------
        // 5. Start Live BPE Fastify HTTP Server with Ephemeral Token
        // ----------------------------------------------------------------------
        console.log(`\n[STEP 5] Starting Live BPE Server from Checkout with Ephemeral Token`);

        const ephemeralToken = 'bpe_harness_tok_' + crypto.randomBytes(24).toString('hex');
        process.env.PPOS_BPE_SERVICE_TOKEN = ephemeralToken;
        process.env.MONGODB_URI = REQUIRED_MONGO_URI;

        bpeFastifyServer = fastify({ logger: false });
        await bpeFastifyServer.register(estimatesRoute, { prefix: '/api' });
        await bpeFastifyServer.register(marketplaceRoute, { prefix: '/api' });

        const bpePort = parseInt(process.env.PPOS_TEST_BPE_PORT || '8024', 10);
        await bpeFastifyServer.listen({ port: bpePort, host: '127.0.0.1' });
        const bpeBaseUrl = `http://127.0.0.1:${bpePort}`;
        console.log(`  ✓ Live BPE Fastify Server running at ${bpeBaseUrl}`);

        // Configure CP environment to point to this live BPE instance
        process.env.PPOS_PRICING_ENGINE_URL = bpeBaseUrl;
        process.env.PPOS_BPE_PUBLISH_PATH = '/api/marketplace/revisions/publish';
        process.env.PPOS_BPE_SERVICE_TOKEN = ephemeralToken;

        // ----------------------------------------------------------------------
        // 6. Test Unconfigured Mapping Rejections
        // ----------------------------------------------------------------------
        console.log(`\n[STEP 6] Testing BPE Mapping Rejections (Tenant & Node)`);

        // A. Unconfigured Tenant Mapping in BPE
        const unmappedTenantHouseId = `${runId}_unmapped_tenant`;
        await printhousesColl.insertOne({
            id: unmappedTenantHouseId,
            house_id: unmappedTenantHouseId,
            name: 'Unmapped Tenant House',
            printer_node_id: fixtureNodeId,
            version: 1,
            rates: baseRates
        });
        tracker.mongoHouseIds.add(unmappedTenantHouseId);

        try {
            await axios.post(`${bpeBaseUrl}/api/marketplace/revisions/publish`, {
                tenant_id: fixtureTenantId,
                printer_node_id: fixtureNodeId,
                bpe_printhouse_id: unmappedTenantHouseId,
                revision_id: 'rev_dummy',
                accepted_patch_checksum: 'sha256:dummy',
                rates: baseRates
            }, {
                headers: { 'X-BPE-Service-Token': ephemeralToken }
            });
            assert(false, 'Should have rejected unconfigured tenant mapping');
        } catch (err) {
            assert(err.response?.status === 403, 'Unconfigured tenant mapping rejected with HTTP 403');
            assert(err.response?.data?.error === 'TENANT_MAPPING_UNCONFIGURED', 'Error code is TENANT_MAPPING_UNCONFIGURED');
        }

        // B. Unconfigured Node Mapping in BPE
        const unmappedNodeHouseId = `${runId}_unmapped_node`;
        await printhousesColl.insertOne({
            id: unmappedNodeHouseId,
            house_id: unmappedNodeHouseId,
            name: 'Unmapped Node House',
            tenant_id: fixtureTenantId,
            version: 1,
            rates: baseRates
        });
        tracker.mongoHouseIds.add(unmappedNodeHouseId);

        try {
            await axios.post(`${bpeBaseUrl}/api/marketplace/revisions/publish`, {
                tenant_id: fixtureTenantId,
                printer_node_id: fixtureNodeId,
                bpe_printhouse_id: unmappedNodeHouseId,
                revision_id: 'rev_dummy',
                accepted_patch_checksum: 'sha256:dummy',
                rates: baseRates
            }, {
                headers: { 'X-BPE-Service-Token': ephemeralToken }
            });
            assert(false, 'Should have rejected unconfigured printer node mapping');
        } catch (err) {
            assert(err.response?.status === 400, 'Unconfigured printer node mapping rejected with HTTP 400');
            assert(err.response?.data?.error === 'PRINTER_NODE_MAPPING_UNCONFIGURED', 'Error code is PRINTER_NODE_MAPPING_UNCONFIGURED');
        }

        // C. Intruder Tenant Rejection
        try {
            await axios.post(`${bpeBaseUrl}/api/marketplace/revisions/publish`, {
                tenant_id: fixtureIntruderTenantId,
                printer_node_id: fixtureNodeId,
                bpe_printhouse_id: fixtureHouseId,
                revision_id: 'rev_dummy',
                accepted_patch_checksum: 'sha256:dummy',
                rates: baseRates
            }, {
                headers: { 'X-BPE-Service-Token': ephemeralToken }
            });
            assert(false, 'Should have rejected intruder tenant');
        } catch (err) {
            assert(err.response?.status === 403, 'Intruder tenant rejected with HTTP 403');
            assert(err.response?.data?.error === 'TENANT_MISMATCH', 'Error code is TENANT_MISMATCH');
        }

        // ----------------------------------------------------------------------
        // 7. Baseline Calculation on Both BPE Routes (Pre-Publication)
        // ----------------------------------------------------------------------
        console.log(`\n[STEP 7] Measuring Pre-Publication Baseline Pricing on Both BPE Routes`);

        const quotePayload = {
            book_size: 'A5',
            binding_method: 'hardcover',
            copies: 1000,
            interior_pages: 128,
            interior_print: '1/1',
            cover_print: '4/0',
            delivery_country: 'NL',
            paper_weight_interior: 135,
            paper_weight_cover: 250
        };

        // Route A: Marketplace Offers
        const initialMarketplaceRes = await axios.post(`${bpeBaseUrl}/api/marketplace/offers`, quotePayload);
        assert(initialMarketplaceRes.data.ok === true, 'Marketplace route baseline returned ok=true');
        const initialOffer = initialMarketplaceRes.data.offers.find(o => o.print_house_id === fixtureHouseId);
        assert(!!initialOffer, 'Found initial offer for harness house in marketplace offers');
        const initialPrice = Number(initialOffer.suggested_price);
        console.log(`  -> Initial Marketplace Suggested Price: ${initialPrice} €`);

        // Route B: Estimates Calculation
        const initialEstimatesRes = await axios.post(`${bpeBaseUrl}/api/estimates`, quotePayload);
        assert(initialEstimatesRes.data.ok === true, 'Estimates route baseline returned ok=true');
        const initialEstimateHouse = initialEstimatesRes.data.print_houses.find(h => h.id === fixtureHouseId);
        assert(!!initialEstimateHouse, 'Found initial estimate for harness house in estimates route');
        const initialCost = Number(initialEstimateHouse.total_cost);
        console.log(`  -> Initial Estimates Total Cost: ${initialCost} €`);

        // ----------------------------------------------------------------------
        // 8. Real publishAcceptedRevision CP -> BPE (HTTP + Real Drivers)
        // ----------------------------------------------------------------------
        console.log(`\n[STEP 8] Executing Real CP Rate Publication without MockHandler`);

        // Substantially raise cover paper rate (from 1.50 to 15.00)
        const updatedRates = JSON.parse(JSON.stringify(baseRates));
        updatedRates.paper_price_cover_by_kilo.mc = 15.00;
        updatedRates.cover_fixed_by_colours['4'] = 350;
        const expectedNewRatesChecksum = computeRatesChecksum(updatedRates);

        // Insert revision into official `printhouse_pricing_revisions` table
        const [revCols] = await mysqlClient.query('SHOW COLUMNS FROM printhouse_pricing_revisions');
        const revColSet = new Set(revCols.map(c => c.Field));

        const revFields = [
            'id', 'tenant_id', 'printer_node_id', 'source_type',
            'rates_json', 'rates_checksum', 'engine_package',
            'engine_version', 'engine_commit', 'created_by_json'
        ];
        const revVals = [
            fixtureRevId2,
            fixtureTenantId,
            fixtureNodeId,
            'MANUAL_EDIT',
            JSON.stringify(updatedRates),
            expectedNewRatesChecksum,
            '@ppos/pricing-engine',
            '1.0.0',
            bpeSha,
            JSON.stringify({ user: 'harness_connected', role: 'OPS_ADMIN' })
        ];

        if (revColSet.has('proposed_patch_checksum')) {
            revFields.push('proposed_patch_checksum');
            revVals.push(fixturePatch2);
        }
        if (revColSet.has('accepted_patch_checksum')) {
            revFields.push('accepted_patch_checksum');
            revVals.push(fixturePatch2);
        }
        if (revColSet.has('version')) {
            revFields.push('version');
            revVals.push(2);
        }

        await mysqlClient.query(
            `INSERT INTO printhouse_pricing_revisions (${revFields.join(',')}) VALUES (${revVals.map(() => '?').join(',')})`,
            revVals
        );
        tracker.revisions.add(fixtureRevId2);
        assert(true, `Inserted immutable revision in MySQL (${fixtureRevId2})`);

        // Execute publishAcceptedRevision through CP service directly over HTTP
        const pubResult = await bpePublicationService.publishAcceptedRevision(
            fixtureTenantId,
            fixtureNodeId,
            fixtureRevId2
        );
        tracker.publications.add(pubResult.publicationId);

        assert(pubResult.ok === true, 'CP publishAcceptedRevision returned ok=true');
        assert(pubResult.status === 'PUBLISHED', 'CP publication status is PUBLISHED');
        assert(pubResult.checksumMatched === true, 'CP checksumMatched is true');
        assert(pubResult.checksumReadback === fixturePatch2, 'Readback patch checksum matches published patch');
        assert(pubResult.ratesChecksum === expectedNewRatesChecksum, 'Readback rates checksum matches canonical rates checksum');

        // Verify MySQL persistence of publication record
        const [pubRows] = await mysqlClient.query(
            `SELECT id, status, bpe_response_checksum, revision_id FROM bpe_pricing_publications WHERE id = ?`,
            [pubResult.publicationId]
        );
        assert(pubRows.length === 1, 'Publication record found in MySQL');
        assert(pubRows[0].status === 'PUBLISHED', 'MySQL publication status is PUBLISHED');
        assert(pubRows[0].bpe_response_checksum === fixturePatch2, 'MySQL response checksum matches');

        // Verify MongoDB persistence and readback
        const verifiedMongoHouse = await printhousesColl.findOne({ id: fixtureHouseId });
        assert(!!verifiedMongoHouse, 'Verified house exists in MongoDB');
        assert(verifiedMongoHouse.version === 2, 'MongoDB version bumped to 2');
        assert(verifiedMongoHouse.published_revision_id === fixtureRevId2, 'MongoDB published_revision_id matches');
        assert(verifiedMongoHouse.accepted_patch_checksum === fixturePatch2, 'MongoDB accepted_patch_checksum matches');
        assert(verifiedMongoHouse.rates_checksum === expectedNewRatesChecksum, 'MongoDB rates_checksum matches');
        assert(verifiedMongoHouse.rates.paper_price_cover_by_kilo.mc === 15.00, 'MongoDB rates reflected in document');

        // ----------------------------------------------------------------------
        // 9. Replay Idempotency & Conflicting Rates Rejection
        // ----------------------------------------------------------------------
        console.log(`\n[STEP 9] Testing Replay Idempotency & Conflicting Rates Protection`);

        // CP Fast-path alreadyPublished
        const fastPathResult = await bpePublicationService.publishAcceptedRevision(
            fixtureTenantId,
            fixtureNodeId,
            fixtureRevId2
        );
        assert(fastPathResult.ok === true, 'Fast-path returned ok=true');
        assert(fastPathResult.alreadyPublished === true, 'Fast-path returned alreadyPublished=true');
        assert(fastPathResult.ratesChecksum === expectedNewRatesChecksum, 'Fast-path verified rates checksum');

        // Direct BPE Replay with conflicting rates
        const tamperedRates = JSON.parse(JSON.stringify(updatedRates));
        tamperedRates.paper_price_cover_by_kilo.mc = 999.00; // Tampered!
        try {
            await axios.post(`${bpeBaseUrl}/api/marketplace/revisions/publish`, {
                tenant_id: fixtureTenantId,
                printer_node_id: fixtureNodeId,
                bpe_printhouse_id: fixtureHouseId,
                revision_id: fixtureRevId2,
                accepted_patch_checksum: fixturePatch2,
                version: 2,
                rates: tamperedRates
            }, {
                headers: { 'X-BPE-Service-Token': ephemeralToken }
            });
            assert(false, 'BPE should have rejected conflicting rates replay with HTTP 409');
        } catch (err) {
            assert(err.response?.status === 409, 'Conflicting rates replay rejected with HTTP 409');
            assert(err.response?.data?.error === 'RATES_CHECKSUM_MISMATCH', 'Error code is RATES_CHECKSUM_MISMATCH');
        }

        // ----------------------------------------------------------------------
        // 10. Post-Publication Pricing Calculation Verification
        // ----------------------------------------------------------------------
        console.log(`\n[STEP 10] Verifying Effective Calculation Reflection on Both Routes`);

        // Route A: Marketplace Offers
        const updatedMarketplaceRes = await axios.post(`${bpeBaseUrl}/api/marketplace/offers`, quotePayload);
        const updatedOffer = updatedMarketplaceRes.data.offers.find(o => o.print_house_id === fixtureHouseId);
        const updatedPrice = Number(updatedOffer.suggested_price);
        console.log(`  -> Updated Marketplace Suggested Price: ${updatedPrice} € (Initial: ${initialPrice} €)`);
        assert(updatedPrice > initialPrice, 'Marketplace price increased reflecting 10x cover paper rate');

        // Route B: Estimates Calculation
        const updatedEstimatesRes = await axios.post(`${bpeBaseUrl}/api/estimates`, quotePayload);
        const updatedEstimateHouse = updatedEstimatesRes.data.print_houses.find(h => h.id === fixtureHouseId);
        const updatedCost = Number(updatedEstimateHouse.total_cost);
        console.log(`  -> Updated Estimates Total Cost: ${updatedCost} € (Initial: ${initialCost} €)`);
        assert(updatedCost > initialCost, 'Estimates total cost increased reflecting published rate card');

        console.log(`\n================================================================`);
        console.log(`  CONNECTED HARNESS EXECUTION COMPLETE: ALL ${passedAssertions}/${totalAssertions} PASSED`);
        console.log(`================================================================`);
        return true;

    } catch (err) {
        console.error(`\n[FATAL HARNESS ERROR]: ${err.message}`);
        if (err.stack) console.error(err.stack);
        throw err;
    } finally {
        console.log(`\n[TEARDOWN] Cleaning up fixtures by exact tracked IDs in strict FK order`);

        // 1. MySQL Teardown in strict FK order
        try {
            if (tracker.publications.size > 0) {
                const pubIds = Array.from(tracker.publications);
                await mysqlClient.query(
                    `DELETE FROM bpe_pricing_publications WHERE id IN (${pubIds.map(() => '?').join(',')})`,
                    pubIds
                );
                console.log(`  ✓ Cleaned ${pubIds.length} publication records from MySQL`);
            }
            if (tracker.revisions.size > 0) {
                const revIds = Array.from(tracker.revisions);
                await mysqlClient.query(
                    `DELETE FROM printhouse_pricing_revisions WHERE id IN (${revIds.map(() => '?').join(',')})`,
                    revIds
                );
                console.log(`  ✓ Cleaned ${revIds.length} revision records from MySQL`);
            }
            if (tracker.printerNodes.size > 0) {
                const nodeIds = Array.from(tracker.printerNodes);
                await mysqlClient.query(
                    `DELETE FROM printer_nodes WHERE id IN (${nodeIds.map(() => '?').join(',')})`,
                    nodeIds
                );
                console.log(`  ✓ Cleaned ${nodeIds.length} printer node records from MySQL`);
            }
            if (tracker.tenants.size > 0) {
                const tenantIds = Array.from(tracker.tenants);
                await mysqlClient.query(
                    `DELETE FROM tenants WHERE id IN (${tenantIds.map(() => '?').join(',')})`,
                    tenantIds
                );
                console.log(`  ✓ Cleaned ${tenantIds.length} tenant records from MySQL`);
            }
        } catch (sqlCleanErr) {
            cleanupErrorOccurred = true;
            console.error(`  ✗ Error cleaning MySQL fixtures: ${sqlCleanErr.message}`);
        }

        // 2. MongoDB Teardown
        try {
            if (mongoClient && tracker.mongoHouseIds.size > 0) {
                const houseIds = Array.from(tracker.mongoHouseIds);
                const printhousesColl = mongoClient.db('bpe_test_harness').collection('printhouses');
                const deleteRes = await printhousesColl.deleteMany({ id: { $in: houseIds } });
                console.log(`  ✓ Cleaned ${deleteRes.deletedCount} printhouse documents from MongoDB`);
            }
        } catch (mongoCleanErr) {
            cleanupErrorOccurred = true;
            console.error(`  ✗ Error cleaning MongoDB fixtures: ${mongoCleanErr.message}`);
        }

        // 3. Close BPE Fastify Server
        if (bpeFastifyServer) {
            try {
                await bpeFastifyServer.close();
                console.log('  ✓ Closed BPE Fastify server');
            } catch (serverErr) {
                cleanupErrorOccurred = true;
                console.error(`  ✗ Error closing BPE Fastify server: ${serverErr.message}`);
            }
        }

        // 4. Close Direct MySQL Connection
        if (directConn) {
            try {
                await directConn.end();
                console.log('  ✓ Closed direct MySQL connection');
            } catch (directConnErr) {
                cleanupErrorOccurred = true;
                console.error(`  ✗ Error closing direct MySQL connection: ${directConnErr.message}`);
            }
        }

        // 5. Close MongoDB Client
        if (mongoClient) {
            try {
                await mongoClient.close();
                console.log('  ✓ Closed MongoDB client');
            } catch (mongoCloseErr) {
                cleanupErrorOccurred = true;
                console.error(`  ✗ Error closing MongoDB client: ${mongoCloseErr.message}`);
            }
        }

        // 6. Close CP MySQL Pool
        try {
            await mysqlClient.closePool();
            console.log('  ✓ Closed CP MySQL connection pool');
        } catch (poolCloseErr) {
            cleanupErrorOccurred = true;
            console.error(`  ✗ Error closing CP MySQL pool: ${poolCloseErr.message}`);
        }

        if (cleanupErrorOccurred) {
            console.error('\n[FATAL] One or more errors occurred during cleanup teardown.');
            process.exit(1);
        }
    }
}

// Execute if run directly
if (require.main === module) {
    runConnectedHarness()
        .then(() => {
            console.log('\n[RESULT] PASS: Connected Publication Contract Verified End-to-End.\n');
            process.exit(0);
        })
        .catch((err) => {
            console.error(`\n[RESULT] FAIL: Connected Publication Harness Failed: ${err.message || err}\n`);
            process.exit(1);
        });
}

module.exports = { runConnectedHarness, REQUIRED_MYSQL, REQUIRED_MONGO_URI };
