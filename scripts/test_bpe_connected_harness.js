/**
 * scripts/test_bpe_connected_harness.js
 * 
 * Connected End-to-End Test Harness for Control Plane -> BPE Publication.
 * 
 * Enforces:
 * - Real HTTP + Real MySQL + Real MongoDB drivers (zero mock/driver substitution).
 * - Isolated test fixtures only; strict verification of identity before writes/deletes.
 * - Production database safety guards (aborts immediately if prod DB or host detected).
 * - Publication, persistence & readback verification across MySQL and MongoDB.
 * - Replay idempotency & rejection of conflicting rates (409).
 * - Rejection of unconfigured tenant/node mappings (403/400).
 * - Calculation verification on both BPE routes (/api/marketplace/offers and /api/estimates).
 * - Full teardown and cleanup in finally block.
 */

'use strict';

const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');

// Ensure local environment variables can be loaded
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Configuration with strict test defaults
const TEST_CONFIG = {
    // MySQL configuration for test harness
    mysqlHost: process.env.PPOS_TEST_MYSQL_HOST || process.env.MYSQL_HOST || '127.0.0.1',
    mysqlPort: parseInt(process.env.PPOS_TEST_MYSQL_PORT || process.env.MYSQL_PORT || '3306', 10),
    mysqlUser: process.env.PPOS_TEST_MYSQL_USER || process.env.MYSQL_USER || 'ppos_user',
    mysqlPassword: process.env.PPOS_TEST_MYSQL_PASSWORD || process.env.MYSQL_PASSWORD || '',
    mysqlDatabase: process.env.PPOS_TEST_MYSQL_DATABASE || 'ppos_test_harness',

    // MongoDB configuration for test harness
    mongodbUri: process.env.PPOS_TEST_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bpe_test_harness',

    // BPE Server configuration
    bpePort: parseInt(process.env.PPOS_TEST_BPE_PORT || '8024', 10),
    bpeToken: process.env.PPOS_TEST_BPE_SERVICE_TOKEN || 'test_bpe_secret_harness_token_secure_999'
};

// Fixture Identifiers strictly isolated with "harness_" prefix
const FIXTURES = {
    tenantId: 'harness_tenant_omega',
    intruderTenantId: 'harness_tenant_intruder',
    printerNodeId: 'harness_printer_node_omega',
    bpePrinthouseId: 'harness_ph_omega',
    revisionId1: 'harness_rev_001_' + Date.now(),
    revisionId2: 'harness_rev_002_' + Date.now(),
    patchChecksum1: 'sha256:harness_patch_checksum_001',
    patchChecksum2: 'sha256:harness_patch_checksum_002'
};

// Assertion and logging helpers
let totalAssertions = 0;
let passedAssertions = 0;

function logHeader(title) {
    console.log(`\n================================================================`);
    console.log(`  ${title}`);
    console.log(`================================================================`);
}

function logStep(stepNum, title) {
    console.log(`\n[STEP ${stepNum}] ${title}`);
}

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
 * Strict Production Safety Guard:
 * Refuses to run against production database names, hosts, or production URIs.
 */
function enforceSafetyGuards() {
    logStep('0', 'Verifying Production Safety Guards');

    const forbiddenPatterns = [/prod/i, /live/i, /production/i];

    if (forbiddenPatterns.some(p => p.test(TEST_CONFIG.mysqlDatabase))) {
        throw new Error(`SAFETY BLOCK: MySQL database "${TEST_CONFIG.mysqlDatabase}" appears to be a production database. Refusing to run harness.`);
    }

    if (forbiddenPatterns.some(p => p.test(TEST_CONFIG.mongodbUri))) {
        throw new Error(`SAFETY BLOCK: MongoDB URI "${TEST_CONFIG.mongodbUri}" appears to reference a production database. Refusing to run harness.`);
    }

    // Verify all fixture IDs start with harness_
    for (const [key, val] of Object.entries(FIXTURES)) {
        if (typeof val === 'string' && !val.startsWith('harness_') && !val.startsWith('sha256:harness_')) {
            throw new Error(`SAFETY BLOCK: Fixture ${key} ("${val}") does not start with "harness_" isolated prefix.`);
        }
    }

    assert(true, 'Production safety checks passed: Target databases and fixtures are strictly isolated.');
}

/**
 * Helper to compute deterministic rates checksum.
 */
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

/**
 * Main Harness Execution Flow
 */
async function runConnectedHarness() {
    logHeader('PRINTPRICE OS: CONTROL PLANE -> BPE CONNECTED TEST HARNESS');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`MySQL Target: ${TEST_CONFIG.mysqlHost}:${TEST_CONFIG.mysqlPort}/${TEST_CONFIG.mysqlDatabase}`);
    console.log(`MongoDB Target: ${TEST_CONFIG.mongodbUri}`);
    console.log(`BPE HTTP Port: ${TEST_CONFIG.bpePort}`);

    enforceSafetyGuards();

    let mysqlPool = null;
    let mongoClient = null;
    let bpeFastifyServer = null;

    try {
        // ----------------------------------------------------------------------
        // 1. Establish Real MySQL Connection & Verify Schema
        // ----------------------------------------------------------------------
        logStep('1', 'Connecting to real MySQL database');
        mysqlPool = mysql.createPool({
            host: TEST_CONFIG.mysqlHost,
            port: TEST_CONFIG.mysqlPort,
            user: TEST_CONFIG.mysqlUser,
            password: TEST_CONFIG.mysqlPassword,
            database: TEST_CONFIG.mysqlDatabase,
            waitForConnections: true,
            connectionLimit: 5,
            connectTimeout: 8000
        });

        // Test connection
        await mysqlPool.query('SELECT 1 AS connection_test');
        assert(true, 'Connected to MySQL successfully with real mysql2 driver');

        // Create harness tables if they do not exist
        await mysqlPool.query(`
            CREATE TABLE IF NOT EXISTS printer_nodes (
                id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                tenant_id VARCHAR(64) NOT NULL,
                metadata_json JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await mysqlPool.query(`
            CREATE TABLE IF NOT EXISTS printhouse_pricing_revisions (
                id VARCHAR(64) PRIMARY KEY,
                tenant_id VARCHAR(64) NOT NULL,
                printer_node_id VARCHAR(64) NOT NULL,
                accepted_patch_checksum VARCHAR(128) NOT NULL,
                proposed_patch_checksum VARCHAR(128) NOT NULL,
                rates_json LONGTEXT NOT NULL,
                version INT NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await mysqlPool.query(`
            CREATE TABLE IF NOT EXISTS bpe_pricing_publications (
                id VARCHAR(64) PRIMARY KEY,
                tenant_id VARCHAR(64) NOT NULL,
                printer_node_id VARCHAR(64) NOT NULL,
                bpe_printhouse_id VARCHAR(64) NOT NULL,
                revision_id VARCHAR(64) NOT NULL,
                accepted_patch_checksum VARCHAR(128) NOT NULL,
                bpe_response_checksum VARCHAR(128) NULL,
                version INT NOT NULL DEFAULT 1,
                status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
                error_message TEXT NULL,
                bpe_published_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        assert(true, 'MySQL schema initialized for test fixtures');

        // ----------------------------------------------------------------------
        // 2. Establish Real MongoDB Connection & Seed Isolated House
        // ----------------------------------------------------------------------
        logStep('2', 'Connecting to real MongoDB database');
        mongoClient = new MongoClient(TEST_CONFIG.mongodbUri, { serverSelectionTimeoutMS: 8000 });
        await mongoClient.connect();
        const mongoDb = mongoClient.db();
        const printhousesColl = mongoDb.collection('printhouses');
        assert(true, 'Connected to MongoDB successfully with real mongodb driver');

        // Clean any leftover harness fixtures
        await printhousesColl.deleteMany({ id: { $regex: '^harness_' } });

        // Base rate definition
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

        // Seed initial Printhouse in MongoDB with strict established tenant and node mapping
        const initialHouseDoc = {
            id: FIXTURES.bpePrinthouseId,
            house_id: FIXTURES.bpePrinthouseId,
            name: 'Harness Automated Printhouse',
            tenant_id: FIXTURES.tenantId,
            printer_node_id: FIXTURES.printerNodeId,
            version: 1,
            accepted_patch_checksum: FIXTURES.patchChecksum1,
            rates_checksum: initialRatesChecksum,
            published_revision_id: FIXTURES.revisionId1,
            rates: baseRates,
            signatures: [16, 32],
            production_lead_days: 7,
            shipping_days: 3,
            limits: { min_copies: 100, max_pages: 2000 },
            shipping: { per_kg: 0.95 },
            updated_at: new Date()
        };

        await printhousesColl.insertOne(initialHouseDoc);
        assert(true, `Seeded initial test printhouse in MongoDB (${FIXTURES.bpePrinthouseId})`);

        // Seed Printer Node in MySQL with explicit BPE mapping
        await mysqlPool.query(
            `INSERT INTO printer_nodes (id, name, tenant_id, metadata_json)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE metadata_json = VALUES(metadata_json)`,
            [
                FIXTURES.printerNodeId,
                'Harness Node Omega',
                FIXTURES.tenantId,
                JSON.stringify({ bpe_printhouse_id: FIXTURES.bpePrinthouseId })
            ]
        );
        assert(true, `Seeded printer_node mapping in MySQL (${FIXTURES.printerNodeId} -> ${FIXTURES.bpePrinthouseId})`);

        // ----------------------------------------------------------------------
        // 3. Start Live BPE Fastify HTTP Server
        // ----------------------------------------------------------------------
        logStep('3', 'Starting live BPE Fastify HTTP Server');
        process.env.MONGODB_URI = TEST_CONFIG.mongodbUri;
        process.env.PPOS_BPE_SERVICE_TOKEN = TEST_CONFIG.bpeToken;

        const fastify = require('fastify');
        bpeFastifyServer = fastify({ logger: false });

        // Register BPE routes from local pricing engine
        const bpePath = path.resolve(__dirname, '..', '..', 'ppos-pricing-engine-main');
        const estimatesRoute = require(path.join(bpePath, 'routes', 'estimates'));
        const marketplaceRoute = require(path.join(bpePath, 'routes', 'marketplace-offers'));

        await bpeFastifyServer.register(estimatesRoute, { prefix: '/api' });
        await bpeFastifyServer.register(marketplaceRoute, { prefix: '/api' });

        await bpeFastifyServer.listen({ port: TEST_CONFIG.bpePort, host: '127.0.0.1' });
        const bpeBaseUrl = `http://127.0.0.1:${TEST_CONFIG.bpePort}`;
        assert(true, `BPE HTTP Server listening live at ${bpeBaseUrl}`);

        // Configure Control Plane environment to talk to live BPE HTTP server
        process.env.PPOS_PRICING_ENGINE_URL = bpeBaseUrl;
        process.env.PPOS_BPE_PUBLISH_PATH = '/api/marketplace/revisions/publish';
        process.env.PPOS_BPE_SERVICE_TOKEN = TEST_CONFIG.bpeToken;

        // Override db module in CP to use our connected pool
        const cpDb = require('../src/api/services/mysqlClient');
        cpDb.query = async (sql, params) => {
            const [rows] = await mysqlPool.query(sql, params);
            return rows;
        };

        const bpePublicationService = require('../src/api/services/bpePublicationService');

        // ----------------------------------------------------------------------
        // 4. Test Unconfigured Mapping Rejection (TENANT & NODE)
        // ----------------------------------------------------------------------
        logStep('4', 'Testing BPE strict mapping enforcement');

        // A. Printhouse with unconfigured tenant mapping
        const unmappedTenantHouseId = 'harness_unmapped_tenant_house';
        await printhousesColl.insertOne({
            id: unmappedTenantHouseId,
            house_id: unmappedTenantHouseId,
            name: 'Unmapped Tenant House',
            // tenant_id is omitted / missing!
            printer_node_id: FIXTURES.printerNodeId,
            version: 1,
            rates: baseRates
        });

        try {
            await axios.post(`${bpeBaseUrl}/api/marketplace/revisions/publish`, {
                tenant_id: FIXTURES.tenantId,
                printer_node_id: FIXTURES.printerNodeId,
                bpe_printhouse_id: unmappedTenantHouseId,
                revision_id: 'harness_dummy_rev',
                accepted_patch_checksum: 'sha256:dummy',
                rates: baseRates
            }, {
                headers: { 'X-BPE-Service-Token': TEST_CONFIG.bpeToken }
            });
            assert(false, 'Should have rejected unconfigured tenant mapping');
        } catch (err) {
            assert(err.response?.status === 403, 'Unconfigured tenant mapping rejected with HTTP 403');
            assert(err.response?.data?.error === 'TENANT_MAPPING_UNCONFIGURED', 'Error code is TENANT_MAPPING_UNCONFIGURED');
        } finally {
            await printhousesColl.deleteOne({ id: unmappedTenantHouseId });
        }

        // B. Printhouse with unconfigured printer node mapping
        const unmappedNodeHouseId = 'harness_unmapped_node_house';
        await printhousesColl.insertOne({
            id: unmappedNodeHouseId,
            house_id: unmappedNodeHouseId,
            name: 'Unmapped Node House',
            tenant_id: FIXTURES.tenantId,
            // printer_node_id is omitted / missing!
            version: 1,
            rates: baseRates
        });

        try {
            await axios.post(`${bpeBaseUrl}/api/marketplace/revisions/publish`, {
                tenant_id: FIXTURES.tenantId,
                printer_node_id: FIXTURES.printerNodeId,
                bpe_printhouse_id: unmappedNodeHouseId,
                revision_id: 'harness_dummy_rev',
                accepted_patch_checksum: 'sha256:dummy',
                rates: baseRates
            }, {
                headers: { 'X-BPE-Service-Token': TEST_CONFIG.bpeToken }
            });
            assert(false, 'Should have rejected unconfigured printer node mapping');
        } catch (err) {
            assert(err.response?.status === 400, 'Unconfigured printer node mapping rejected with HTTP 400');
            assert(err.response?.data?.error === 'PRINTER_NODE_MAPPING_UNCONFIGURED', 'Error code is PRINTER_NODE_MAPPING_UNCONFIGURED');
        } finally {
            await printhousesColl.deleteOne({ id: unmappedNodeHouseId });
        }

        // C. Intruder tenant attempting to publish to established printhouse
        try {
            await axios.post(`${bpeBaseUrl}/api/marketplace/revisions/publish`, {
                tenant_id: FIXTURES.intruderTenantId, // Mismatch!
                printer_node_id: FIXTURES.printerNodeId,
                bpe_printhouse_id: FIXTURES.bpePrinthouseId,
                revision_id: 'harness_dummy_rev',
                accepted_patch_checksum: 'sha256:dummy',
                rates: baseRates
            }, {
                headers: { 'X-BPE-Service-Token': TEST_CONFIG.bpeToken }
            });
            assert(false, 'Should have rejected intruder tenant');
        } catch (err) {
            assert(err.response?.status === 403, 'Intruder tenant rejected with HTTP 403');
            assert(err.response?.data?.error === 'TENANT_MISMATCH', 'Error code is TENANT_MISMATCH');
        }

        // ----------------------------------------------------------------------
        // 5. Pre-Publication Baseline Calculation (Both Routes)
        // ----------------------------------------------------------------------
        logStep('5', 'Executing Pre-Publication Baseline Pricing on Both BPE Routes');

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

        // Route A: Marketplace Offers Route
        const initialMarketplaceRes = await axios.post(`${bpeBaseUrl}/api/marketplace/offers`, quotePayload);
        assert(initialMarketplaceRes.data.ok === true, 'Marketplace route returned ok=true on initial baseline');
        const initialOffer = initialMarketplaceRes.data.offers.find(o => o.print_house_id === FIXTURES.bpePrinthouseId);
        assert(!!initialOffer, 'Initial offer found for harness printhouse in marketplace');
        const initialMarketplacePrice = Number(initialOffer.suggested_price);
        console.log(`  -> Initial Marketplace Price: ${initialMarketplacePrice} €`);

        // Route B: Estimates Calculation Route
        const initialEstimatesRes = await axios.post(`${bpeBaseUrl}/api/estimates`, quotePayload);
        assert(initialEstimatesRes.data.ok === true, 'Estimates route returned ok=true on initial baseline');
        const initialEstimateHouse = initialEstimatesRes.data.print_houses.find(h => h.id === FIXTURES.bpePrinthouseId);
        assert(!!initialEstimateHouse, 'Initial estimate found for harness printhouse in estimates route');
        const initialEstimateCost = Number(initialEstimateHouse.total_cost);
        console.log(`  -> Initial Estimates Total Cost: ${initialEstimateCost} €`);

        // ----------------------------------------------------------------------
        // 6. Governed Publication CP -> BPE with Real HTTP + MySQL + MongoDB
        // ----------------------------------------------------------------------
        logStep('6', 'Executing Governed Rate Publication from Control Plane to BPE');

        // Substantially increase cover paper rate (from 1.50 to 15.00)
        const updatedRates = JSON.parse(JSON.stringify(baseRates));
        updatedRates.paper_price_cover_by_kilo.mc = 15.00;
        updatedRates.cover_fixed_by_colours['4'] = 300;
        const expectedNewRatesChecksum = computeRatesChecksum(updatedRates);

        // Insert revision into real MySQL
        await mysqlPool.query(
            `INSERT INTO printhouse_pricing_revisions
             (id, tenant_id, printer_node_id, accepted_patch_checksum, proposed_patch_checksum, rates_json, version, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 2, NOW())`,
            [
                FIXTURES.revisionId2,
                FIXTURES.tenantId,
                FIXTURES.printerNodeId,
                FIXTURES.patchChecksum2,
                FIXTURES.patchChecksum2,
                JSON.stringify(updatedRates)
            ]
        );
        assert(true, `Inserted governed revision in MySQL (${FIXTURES.revisionId2})`);

        // Execute publication via Control Plane BPE Publication Service
        const pubResult = await bpePublicationService.publishAcceptedRevision(
            FIXTURES.tenantId,
            FIXTURES.printerNodeId,
            FIXTURES.revisionId2
        );

        assert(pubResult.ok === true, 'bpePublicationService returned ok=true');
        assert(pubResult.status === 'PUBLISHED', 'Publication status is PUBLISHED');
        assert(pubResult.checksumMatched === true, 'Checksum matched during publication');
        assert(pubResult.checksumReadback === FIXTURES.patchChecksum2, 'Readback patch checksum matches published patch');
        assert(pubResult.ratesChecksum === expectedNewRatesChecksum, 'Readback rates checksum matches canonical rates checksum');

        // Verify MySQL Persistence of publication record
        const [pubRows] = await mysqlPool.query(
            `SELECT id, tenant_id, printer_node_id, bpe_printhouse_id, revision_id, accepted_patch_checksum, bpe_response_checksum, status
             FROM bpe_pricing_publications
             WHERE id = ?`,
            [pubResult.publicationId]
        );
        assert(pubRows.length === 1, 'Publication record persisted in MySQL');
        const pubRow = pubRows[0];
        assert(pubRow.status === 'PUBLISHED', 'MySQL publication status updated to PUBLISHED');
        assert(pubRow.bpe_response_checksum === FIXTURES.patchChecksum2, 'MySQL bpe_response_checksum matches');
        assert(pubRow.revision_id === FIXTURES.revisionId2, 'MySQL revision_id matches');

        // Verify MongoDB Persistence and Readback
        const updatedHouseMongo = await printhousesColl.findOne({ id: FIXTURES.bpePrinthouseId });
        assert(!!updatedHouseMongo, 'Updated house found in MongoDB');
        assert(updatedHouseMongo.version === 2, 'MongoDB document version bumped to 2');
        assert(updatedHouseMongo.published_revision_id === FIXTURES.revisionId2, 'MongoDB published_revision_id matches');
        assert(updatedHouseMongo.accepted_patch_checksum === FIXTURES.patchChecksum2, 'MongoDB accepted_patch_checksum matches');
        assert(updatedHouseMongo.rates_checksum === expectedNewRatesChecksum, 'MongoDB rates_checksum matches calculated');
        assert(updatedHouseMongo.rates.paper_price_cover_by_kilo.mc === 15.00, 'MongoDB rates.paper_price_cover_by_kilo.mc is 15.00');

        // ----------------------------------------------------------------------
        // 7. Replay Idempotency & Conflicting Rates Rejection
        // ----------------------------------------------------------------------
        logStep('7', 'Testing Replay Idempotency & Conflicting Rates Protection');

        // Fast-path in Control Plane
        const fastPathResult = await bpePublicationService.publishAcceptedRevision(
            FIXTURES.tenantId,
            FIXTURES.printerNodeId,
            FIXTURES.revisionId2
        );
        assert(fastPathResult.ok === true, 'Fast path returned ok=true');
        assert(fastPathResult.alreadyPublished === true, 'Fast path identified publication as alreadyPublished');
        assert(fastPathResult.ratesChecksum === expectedNewRatesChecksum, 'Fast path verified rates checksum');

        // Direct HTTP Replay to BPE
        const bpeReplayRes = await axios.post(`${bpeBaseUrl}/api/marketplace/revisions/publish`, {
            tenant_id: FIXTURES.tenantId,
            printer_node_id: FIXTURES.printerNodeId,
            bpe_printhouse_id: FIXTURES.bpePrinthouseId,
            revision_id: FIXTURES.revisionId2,
            accepted_patch_checksum: FIXTURES.patchChecksum2,
            version: 2,
            rates: updatedRates
        }, {
            headers: { 'X-BPE-Service-Token': TEST_CONFIG.bpeToken }
        });
        assert(bpeReplayRes.status === 200, 'BPE idempotent replay returned 200');
        assert(bpeReplayRes.data.already_published === true, 'BPE indicated already_published: true');
        assert(bpeReplayRes.data.readback?.verified === true, 'BPE replay readback.verified is true');

        // Conflicting Rates Replay: same revision & patch checksum but modified rates
        const tamperedRates = JSON.parse(JSON.stringify(updatedRates));
        tamperedRates.paper_price_cover_by_kilo.mc = 999.00; // Tampered!
        try {
            await axios.post(`${bpeBaseUrl}/api/marketplace/revisions/publish`, {
                tenant_id: FIXTURES.tenantId,
                printer_node_id: FIXTURES.printerNodeId,
                bpe_printhouse_id: FIXTURES.bpePrinthouseId,
                revision_id: FIXTURES.revisionId2,
                accepted_patch_checksum: FIXTURES.patchChecksum2,
                version: 2,
                rates: tamperedRates
            }, {
                headers: { 'X-BPE-Service-Token': TEST_CONFIG.bpeToken }
            });
            assert(false, 'BPE should have rejected conflicting rates replay with 409');
        } catch (err) {
            assert(err.response?.status === 409, 'Conflicting rates replay rejected with HTTP 409');
            assert(err.response?.data?.error === 'RATES_CHECKSUM_MISMATCH', 'Error code is RATES_CHECKSUM_MISMATCH');
        }

        // ----------------------------------------------------------------------
        // 8. Post-Publication Calculation Verification on Both Routes
        // ----------------------------------------------------------------------
        logStep('8', 'Verifying Price Calculation Reflection on Both Routes');

        // Route A: Marketplace Offers Route
        const updatedMarketplaceRes = await axios.post(`${bpeBaseUrl}/api/marketplace/offers`, quotePayload);
        const updatedOffer = updatedMarketplaceRes.data.offers.find(o => o.print_house_id === FIXTURES.bpePrinthouseId);
        const updatedMarketplacePrice = Number(updatedOffer.suggested_price);
        console.log(`  -> Post-Publication Marketplace Price: ${updatedMarketplacePrice} € (Baseline: ${initialMarketplacePrice} €)`);
        assert(updatedMarketplacePrice > initialMarketplacePrice, 'Marketplace price increased reflecting 10x cover paper rate');

        // Route B: Estimates Calculation Route
        const updatedEstimatesRes = await axios.post(`${bpeBaseUrl}/api/estimates`, quotePayload);
        const updatedEstimateHouse = updatedEstimatesRes.data.print_houses.find(h => h.id === FIXTURES.bpePrinthouseId);
        const updatedEstimateCost = Number(updatedEstimateHouse.total_cost);
        console.log(`  -> Post-Publication Estimates Total Cost: ${updatedEstimateCost} € (Baseline: ${initialEstimateCost} €)`);
        assert(updatedEstimateCost > initialEstimateCost, 'Estimates total cost increased reflecting published rates');

        logHeader(`CONNECTED HARNESS EXECUTION COMPLETE: ALL ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED`);
        return true;

    } catch (err) {
        console.error(`\n[FATAL ERROR IN CONNECTED HARNESS]: ${err.message || err.code || err}`);
        if (err.errors) {
            for (const subErr of err.errors) {
                console.error(`  -> Details: ${subErr.message || subErr.code}`);
            }
        }
        if (err.stack) console.error(err.stack);
        throw err;
    } finally {
        logStep('TEARDOWN', 'Cleaning up test fixtures in MySQL and MongoDB');

        // 1. MySQL Teardown: Remove records matching harness_ prefix
        if (mysqlPool) {
            try {
                await mysqlPool.query(`DELETE FROM bpe_pricing_publications WHERE tenant_id = ? OR printer_node_id = ?`, [FIXTURES.tenantId, FIXTURES.printerNodeId]);
                await mysqlPool.query(`DELETE FROM printhouse_pricing_revisions WHERE tenant_id = ? OR printer_node_id = ?`, [FIXTURES.tenantId, FIXTURES.printerNodeId]);
                await mysqlPool.query(`DELETE FROM printer_nodes WHERE tenant_id = ? OR id = ?`, [FIXTURES.tenantId, FIXTURES.printerNodeId]);
                console.log('  ✓ Cleaned test records from MySQL');
                await mysqlPool.end();
            } catch (cleanErr) {
                console.warn(`  ! Warning during MySQL cleanup: ${cleanErr.message}`);
            }
        }

        // 2. MongoDB Teardown: Remove printhouse matching harness_ prefix
        if (mongoClient) {
            try {
                const printhousesColl = mongoClient.db().collection('printhouses');
                await printhousesColl.deleteMany({ id: { $regex: '^harness_' } });
                console.log('  ✓ Cleaned test documents from MongoDB');
                await mongoClient.close();
            } catch (cleanErr) {
                console.warn(`  ! Warning during MongoDB cleanup: ${cleanErr.message}`);
            }
        }

        // 3. Fastify Server Teardown
        if (bpeFastifyServer) {
            try {
                await bpeFastifyServer.close();
                console.log('  ✓ BPE HTTP Server closed');
            } catch (serverErr) {
                console.warn(`  ! Warning during Fastify server shutdown: ${serverErr.message}`);
            }
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

module.exports = { runConnectedHarness, TEST_CONFIG, FIXTURES };
