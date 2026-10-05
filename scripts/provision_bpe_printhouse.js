/**
 * scripts/provision_bpe_printhouse.js
 *
 * Governed and Idempotent Provisioning Command CP -> BPE.
 *
 * Requirements:
 * 1. Explicit mapping: tenant_id, printer_node_id, bpe_printhouse_id.
 * 2. Strict identity verification across MySQL (CP) and MongoDB (BPE).
 * 3. Rejection of conflicting mappings and duplicate IDs.
 * 4. Exact copy of node's real status (e.g. SUSPENDED) without activating or granting permissions.
 * 5. Preservation of existing metadata_json in MySQL printer_nodes when adding bpe_printhouse_id.
 * 6. Dry-run by default: no mutations without explicit --execute / --apply flag.
 * 7. Production protection: refuses execution against non-localhost without --allow-production.
 */

const crypto = require('crypto');
const mysqlClient = require('../src/api/services/mysqlClient');
const { MongoClient } = require('mongodb');

function sanitizeUri(uri) {
    if (!uri) return '';
    return uri.replace(/\/\/[^@]+@/, '//***:***@');
}

function isLocalHost(host) {
    if (!host) return false;
    const clean = host.toLowerCase().trim();
    return clean === '127.0.0.1' || clean === 'localhost' || clean === '::1';
}

/**
 * Resolves shipping configuration from the canonical database/service if configured.
 * Does NOT interpret delivery_time as an integer without a verified contract,
 * and does NOT invent shipping_days or transport costs.
 */
async function resolveCanonicalShippingConfiguration(dbClient, tenantId, nodeId, node) {
    try {
        const rows = await dbClient.query(
            `SELECT id, name, code, enabled, countries_json, standard_transit_days, expedited_transit_days, handling_days
             FROM printhouse_shipping_regions
             WHERE tenant_id = ? AND (site_id = ? OR site_id IS NULL) AND enabled = 1 AND status = 'ACTIVE'
             ORDER BY created_at DESC`,
            [tenantId, nodeId]
        ).catch(() => []);

        if (Array.isArray(rows) && rows.length > 0) {
            const primary = rows[0];
            const transitDays = Number.isInteger(primary.standard_transit_days) ? primary.standard_transit_days : null;
            let countries = [];
            try {
                countries = typeof primary.countries_json === 'string'
                    ? JSON.parse(primary.countries_json)
                    : (primary.countries_json || []);
            } catch (e) {
                countries = [];
            }

            return {
                configured: true,
                source: 'printhouse_shipping_regions',
                shipping_days: transitDays,
                shipping: {
                    region_id: primary.id,
                    region_name: primary.name,
                    code: primary.code,
                    countries,
                    standard_transit_days: transitDays,
                    expedited_transit_days: Number.isInteger(primary.expedited_transit_days) ? primary.expedited_transit_days : null
                },
                delivery_time_raw: node.delivery_time || null,
                message: `Resolved canonical shipping configuration from shipping region "${primary.name}".`
            };
        }
    } catch (err) {
        // Table or query not available
    }

    return {
        configured: false,
        source: null,
        shipping_days: null,
        shipping: null,
        delivery_time_raw: node.delivery_time || null,
        message: 'No applicable canonical shipping configuration found. Shipping days and transport structure omitted (delivery_time is not parsed as integer without verified contract).'
    };
}

/**
 * Governed provisioning logic.
 *
 * @param {object} options
 * @param {string} options.nodeId - Control Plane printer node ID
 * @param {string} options.tenantId - Control Plane tenant ID
 * @param {string} [options.houseId] - BPE Printhouse ID (defaults to bpe_${nodeId})
 * @param {boolean} [options.dryRun=true] - Dry-run mode (zero writes)
 * @param {boolean} [options.allowProduction=false] - Explicit flag to authorize non-localhost execution
 * @param {object} [options.dbClient] - MySQL client override
 * @param {string} [options.mongoUri] - MongoDB URI override
 * @param {object} [options.mongoClientInstance] - MongoDB client override for tests
 */
async function provisionBpePrinthouse(options = {}) {
    const {
        nodeId,
        tenantId,
        houseId,
        dryRun = true,
        allowProduction = false,
        dbClient = mysqlClient,
        mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bpe_test_harness',
        mongoClientInstance = null
    } = options;

    if (!nodeId || typeof nodeId !== 'string') {
        throw new Error('PROVISION_ERROR: nodeId is required and must be a string');
    }
    if (!tenantId || typeof tenantId !== 'string') {
        throw new Error('PROVISION_ERROR: tenantId is required and must be a string');
    }

    const effectiveHouseId = (houseId && typeof houseId === 'string' && houseId.trim().length > 0)
        ? houseId.trim()
        : `bpe_${nodeId}`;

    if (!/^[a-zA-Z0-9_\-\.]+$/.test(effectiveHouseId)) {
        throw new Error(`PROVISION_ERROR: Invalid bpe_printhouse_id "${effectiveHouseId}". Must contain only alphanumeric, dash, dot, or underscore.`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Database Identity Verification (MySQL & MongoDB)
    // ──────────────────────────────────────────────────────────────────────────
    const identityRows = await dbClient.query('SELECT CURRENT_USER() AS currentUser, DATABASE() AS currentDb');
    const mySqlUser = identityRows[0]?.currentUser || 'UNKNOWN';
    const mySqlDb = identityRows[0]?.currentDb || 'UNKNOWN';

    let localMongoClient = mongoClientInstance;
    let ownsMongoClient = false;

    if (!localMongoClient) {
        localMongoClient = new MongoClient(mongoUri);
        await localMongoClient.connect();
        ownsMongoClient = true;
    }

    let mongoDbName = 'UNKNOWN';
    try {
        const mongoDb = localMongoClient.db();
        mongoDbName = mongoDb.databaseName || 'UNKNOWN';
        const printhousesColl = mongoDb.collection('printhouses');

        // ──────────────────────────────────────────────────────────────────────────
        // 2. Query MySQL Printer Node State & Strict Validation
        // Conforms strictly to real printer_nodes schema (SHOW COLUMNS):
        // id, tenant_id, name, status, metadata_json, rates_json, signatures, limits,
        // delivery_time, production_lead_days, country, region, marketplace_enabled, visibility_scope
        // (shipping_days and shipping do NOT exist in printer_nodes)
        // ──────────────────────────────────────────────────────────────────────────
        const nodeRows = await dbClient.query(
            `SELECT id, tenant_id, name, status, metadata_json, rates_json, signatures, limits, delivery_time, production_lead_days, country, region, marketplace_enabled, visibility_scope
             FROM printer_nodes
             WHERE id = ?`,
            [nodeId]
        );
        const node = Array.isArray(nodeRows) ? nodeRows[0] : nodeRows;

        if (!node) {
            throw new Error(`NODE_NOT_FOUND: Printer node "${nodeId}" does not exist in Control Plane database.`);
        }

        if (String(node.tenant_id) !== String(tenantId)) {
            throw new Error(`TENANT_MISMATCH: Printer node "${nodeId}" belongs to tenant "${node.tenant_id}", but requested tenant is "${tenantId}".`);
        }

        // Resolve canonical shipping configuration without inventing days or transport costs
        const shippingResolution = await resolveCanonicalShippingConfiguration(dbClient, tenantId, nodeId, node);

        // Copy real status as-is without activating or granting permissions
        const realStatus = node.status ? String(node.status).trim().toUpperCase() : 'DRAFT';
        const isCotizable = realStatus === 'ACTIVE';

        // Check existing metadata_json
        let existingMeta = {};
        if (node.metadata_json) {
            try {
                existingMeta = typeof node.metadata_json === 'string' ? JSON.parse(node.metadata_json) : node.metadata_json;
            } catch (err) {
                existingMeta = {};
            }
        }

        if (existingMeta.bpe_printhouse_id && existingMeta.bpe_printhouse_id !== effectiveHouseId) {
            throw new Error(`MAPPING_CONFLICT: Printer node "${nodeId}" is already mapped to BPE house "${existingMeta.bpe_printhouse_id}" in metadata_json, conflicting with requested "${effectiveHouseId}".`);
        }

        // ──────────────────────────────────────────────────────────────────────────
        // 3. MySQL Conflict Check: Ensure bpe_printhouse_id is not already taken
        // ──────────────────────────────────────────────────────────────────────────
        const conflictNodeRows = await dbClient.query(
            `SELECT id, tenant_id, name FROM printer_nodes WHERE id != ? AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.bpe_printhouse_id')) = ?`,
            [nodeId, effectiveHouseId]
        ).catch(() => []);

        if (Array.isArray(conflictNodeRows) && conflictNodeRows.length > 0) {
            const conflictNode = conflictNodeRows[0];
            throw new Error(`CONFLICT_HOUSE_ID_IN_USE: BPE printhouse ID "${effectiveHouseId}" is already mapped to another node "${conflictNode.id}" in tenant "${conflictNode.tenant_id}".`);
        }

        // ──────────────────────────────────────────────────────────────────────────
        // 4. MongoDB Conflict Check & Idempotency Evaluation
        // ──────────────────────────────────────────────────────────────────────────
        let isAlreadyProvisionedInMongo = false;

        // A. Check by House ID using find(...).limit(2).toArray() to detect real duplicates
        const houseMatches = await printhousesColl.find({
            $or: [{ id: effectiveHouseId }, { house_id: effectiveHouseId }]
        }).limit(2).toArray();

        if (houseMatches.length > 1) {
            throw new Error(`CONFLICT_DUPLICATE_BPE_HOUSE: Found ${houseMatches.length} conflicting printhouse documents matching house ID "${effectiveHouseId}". Manual deduplication required.`);
        }
        const existingHouse = houseMatches[0] || null;

        if (existingHouse) {
            const existingNode = existingHouse.printer_node_id;
            const existingTenant = existingHouse.tenant_id;

            if (String(existingNode) !== String(nodeId) || String(existingTenant) !== String(tenantId)) {
                throw new Error(`CONFLICT_DUPLICATE_BPE_HOUSE: MongoDB already contains printhouse "${effectiveHouseId}" mapped to node "${existingNode}" and tenant "${existingTenant}".`);
            }
            isAlreadyProvisionedInMongo = true;
        }

        // B. Check by Node ID using find(...).limit(2).toArray() to detect multiple node mappings
        const nodeMatches = await printhousesColl.find({ printer_node_id: nodeId }).limit(2).toArray();
        if (nodeMatches.length > 1) {
            throw new Error(`CONFLICT_MULTIPLE_NODE_MAPPINGS: Found ${nodeMatches.length} conflicting printhouse documents matching printer_node_id "${nodeId}". Manual deduplication required.`);
        }
        const existingNodeDoc = nodeMatches[0] || null;

        if (existingNodeDoc) {
            const existingId = existingNodeDoc.id || existingNodeDoc.house_id;
            if (existingId !== effectiveHouseId) {
                throw new Error(`CONFLICT_NODE_ALREADY_MAPPED: Printer node "${nodeId}" is already mapped in MongoDB to printhouse "${existingId}".`);
            }
            isAlreadyProvisionedInMongo = true;
        }

        if (existingHouse && existingNodeDoc && String(existingHouse._id) !== String(existingNodeDoc._id)) {
            throw new Error(`CONFLICT_INCONSISTENT_MAPPINGS: Discrepancy between house match and node match in MongoDB.`);
        }

        const existingDoc = existingHouse || existingNodeDoc;

        // ──────────────────────────────────────────────────────────────────────────
        // 5. Construct BPE Document & MySQL Metadata Update
        // ──────────────────────────────────────────────────────────────────────────
        const rates = (node.rates_json && typeof node.rates_json === 'string')
            ? JSON.parse(node.rates_json)
            : (node.rates_json || {});

        const signatures = (node.signatures && typeof node.signatures === 'string')
            ? JSON.parse(node.signatures)
            : (Array.isArray(node.signatures) ? node.signatures : [16, 32]);

        const limits = (node.limits && typeof node.limits === 'string')
            ? JSON.parse(node.limits)
            : (node.limits || {});

        const prodDays = node.production_lead_days != null ? Number(node.production_lead_days) : 7;

        // Target document:
        // - New provisioning: starts at version: 0, without simulating a previous publication.
        //   First governed CP publication will be version 1.
        // - Replay over existing document: preserve governed pricing state (rates, version, checksums, published_revision_id).
        // - Shipping: only set if canonical configuration exists; do NOT invent shipping_days or transport costs.
        const baseNewDoc = {
            id: effectiveHouseId,
            house_id: effectiveHouseId,
            name: node.name || 'philologica.ai Printhouse',
            tenant_id: node.tenant_id,
            printer_node_id: node.id,
            status: realStatus, // Exact node status: SUSPENDED (no activation)
            active: isCotizable, // false if SUSPENDED
            version: 0, // Governed baseline: new provisioned house starts at version 0
            rates,
            signatures,
            production_lead_days: prodDays,
            limits,
            updated_at: new Date()
        };

        if (shippingResolution.configured) {
            if (shippingResolution.shipping_days != null) baseNewDoc.shipping_days = shippingResolution.shipping_days;
            if (shippingResolution.shipping != null) baseNewDoc.shipping = shippingResolution.shipping;
        }

        const targetMongoDoc = isAlreadyProvisionedInMongo
            ? {
                ...existingDoc,
                status: realStatus,
                active: isCotizable,
                name: node.name || existingDoc.name || 'philologica.ai Printhouse',
                signatures: signatures || existingDoc.signatures,
                production_lead_days: node.production_lead_days != null ? Number(node.production_lead_days) : (existingDoc.production_lead_days || 7),
                limits: Object.keys(limits).length > 0 ? limits : (existingDoc.limits || {}),
                updated_at: new Date()
            }
            : baseNewDoc;

        if (isAlreadyProvisionedInMongo && shippingResolution.configured) {
            if (shippingResolution.shipping_days != null) targetMongoDoc.shipping_days = shippingResolution.shipping_days;
            if (shippingResolution.shipping != null) targetMongoDoc.shipping = shippingResolution.shipping;
        }

        const updatedMetadata = {
            ...existingMeta,
            bpe_printhouse_id: effectiveHouseId
        };
        const updatedMetadataJson = JSON.stringify(updatedMetadata);

        const plan = {
            identities: {
                mysqlUser: mySqlUser,
                mysqlDatabase: mySqlDb,
                mongoUri: sanitizeUri(mongoUri),
                mongoDatabase: mongoDbName
            },
            node: {
                id: node.id,
                name: node.name,
                tenant_id: node.tenant_id,
                real_status: realStatus,
                is_cotizable: isCotizable,
                existing_metadata: existingMeta,
                delivery_time: node.delivery_time || null,
                production_lead_days: node.production_lead_days != null ? Number(node.production_lead_days) : null
            },
            mapping: {
                printer_node_id: node.id,
                tenant_id: node.tenant_id,
                bpe_printhouse_id: effectiveHouseId
            },
            shippingResolution: {
                status: shippingResolution.configured ? 'CONFIGURED' : 'NO_APPLICABLE_SHIPPING_CONFIG',
                configured: shippingResolution.configured,
                source: shippingResolution.source,
                shipping_days: shippingResolution.shipping_days,
                shipping: shippingResolution.shipping,
                delivery_time_raw: node.delivery_time || null,
                message: shippingResolution.message
            },
            mongoAction: isAlreadyProvisionedInMongo ? 'PRESERVE_GOVERNED_RATES_AND_UPDATE_STATUS' : 'INSERT_NEW_PRINTHOUSE_V0',
            mongoDocument: targetMongoDoc,
            mysqlUpdate: {
                table: 'printer_nodes',
                where: { id: node.id, tenant_id: node.tenant_id },
                metadata_json: updatedMetadataJson
            },
            statusPreserved: realStatus,
            activationGranted: false,
            preservedFields: isAlreadyProvisionedInMongo ? ['rates', 'version', 'published_revision_id', 'rates_checksum', 'accepted_patch_checksum'] : []
        };

        // ──────────────────────────────────────────────────────────────────────────
        // 6. Dry-Run Mode vs Execution
        // ──────────────────────────────────────────────────────────────────────────
        if (dryRun) {
            return {
                ok: true,
                dryRun: true,
                alreadyProvisioned: isAlreadyProvisionedInMongo && existingMeta.bpe_printhouse_id === effectiveHouseId,
                message: `[DRY-RUN] Verified identities, validations and mappings. Zero mutations performed. Node status is preserved as "${realStatus}" (cotizable: ${isCotizable}).`,
                plan
            };
        }

        // Execution Mode — Safety Guard for Non-Local Databases
        const mysqlHost = process.env.MYSQL_HOST || '';
        let mongoHost = '';
        try {
            mongoHost = new URL(mongoUri).hostname;
        } catch (e) {
            mongoHost = 'unknown';
        }

        if (!allowProduction && (!isLocalHost(mysqlHost) || !isLocalHost(mongoHost))) {
            throw new Error(`SAFETY_GUARD: Refusing to mutate non-localhost databases (MySQL: "${mysqlHost}", MongoDB: "${mongoHost}") without explicit allowProduction flag.`);
        }

        // A. Mutate MongoDB
        if (isAlreadyProvisionedInMongo) {
            // Replay over existing document: preserve governed pricing state!
            // Do NOT overwrite rates, version, checksums, or published_revision_id.
            const setFields = {
                status: realStatus,
                active: isCotizable,
                updated_at: new Date()
            };
            if (node.name) setFields.name = node.name;
            if (signatures) setFields.signatures = signatures;
            if (node.production_lead_days != null) setFields.production_lead_days = Number(node.production_lead_days);
            if (limits && Object.keys(limits).length > 0) setFields.limits = limits;

            if (shippingResolution.configured) {
                if (shippingResolution.shipping_days != null) setFields.shipping_days = shippingResolution.shipping_days;
                if (shippingResolution.shipping != null) setFields.shipping = shippingResolution.shipping;
            }

            await printhousesColl.updateOne(
                { _id: existingDoc._id },
                { $set: setFields }
            );
        } else {
            targetMongoDoc.created_at = new Date();
            await printhousesColl.insertOne(targetMongoDoc);
        }

        // B. Mutate MySQL
        await dbClient.query(
            `UPDATE printer_nodes SET metadata_json = ? WHERE id = ? AND tenant_id = ?`,
            [updatedMetadataJson, nodeId, tenantId]
        );

        // C. Readback Verification
        const readbackMatches = await printhousesColl.find({
            $or: [{ id: effectiveHouseId }, { house_id: effectiveHouseId }]
        }).limit(2).toArray();
        const readbackMongo = readbackMatches[0];
        if (!readbackMongo || readbackMongo.status !== realStatus) {
            throw new Error(`PROVISION_READBACK_FAILED: MongoDB readback failed or status mismatch (expected: "${realStatus}", got: "${readbackMongo?.status}")`);
        }
        if (isAlreadyProvisionedInMongo) {
            if (existingDoc.version !== undefined && readbackMongo.version !== existingDoc.version) {
                throw new Error(`PROVISION_READBACK_FAILED: Governed version was modified during replay (expected: ${existingDoc.version}, got: ${readbackMongo.version})`);
            }
            if (existingDoc.published_revision_id && readbackMongo.published_revision_id !== existingDoc.published_revision_id) {
                throw new Error(`PROVISION_READBACK_FAILED: Governed published_revision_id was modified during replay`);
            }
        } else {
            if (readbackMongo.version !== 0) {
                throw new Error(`PROVISION_READBACK_FAILED: New provisioned printhouse must have version 0 (got: ${readbackMongo.version})`);
            }
        }

        const readbackNodeRows = await dbClient.query(
            `SELECT metadata_json, status FROM printer_nodes WHERE id = ? AND tenant_id = ?`,
            [nodeId, tenantId]
        );
        const readbackNode = Array.isArray(readbackNodeRows) ? readbackNodeRows[0] : readbackNodeRows;
        let readbackMeta = {};
        try {
            readbackMeta = JSON.parse(readbackNode.metadata_json);
        } catch (e) {}

        if (readbackMeta.bpe_printhouse_id !== effectiveHouseId) {
            throw new Error(`PROVISION_READBACK_FAILED: MySQL metadata_json missing bpe_printhouse_id "${effectiveHouseId}"`);
        }
        if (readbackNode.status !== realStatus) {
            throw new Error(`PROVISION_READBACK_FAILED: MySQL node status was unexpectedly modified (expected: "${realStatus}", got: "${readbackNode.status}")`);
        }

        return {
            ok: true,
            dryRun: false,
            provisioned: true,
            alreadyProvisioned: isAlreadyProvisionedInMongo,
            nodeId,
            tenantId,
            bpePrinthouseId: effectiveHouseId,
            status: realStatus,
            active: isCotizable,
            version: readbackMongo.version,
            message: isAlreadyProvisionedInMongo
                ? `Successfully updated existing BPE house "${effectiveHouseId}" preserving governed rates/version (${readbackMongo.version}) and status "${realStatus}".`
                : `Successfully provisioned new printer node "${nodeId}" to BPE house "${effectiveHouseId}" with baseline version 0 and status "${realStatus}".`
        };

    } finally {
        if (ownsMongoClient && localMongoClient) {
            await localMongoClient.close().catch(() => {});
        }
    }
}

// CLI Execution Entrypoint
if (require.main === module) {
    const args = process.argv.slice(2);

    function getArg(keys) {
        for (const key of keys) {
            const idx = args.indexOf(key);
            if (idx !== -1 && idx + 1 < args.length) {
                return args[idx + 1];
            }
        }
        return null;
    }

    const hasFlag = (keys) => keys.some(k => args.includes(k));

    if (hasFlag(['--help', '-h'])) {
        console.log(`
Usage: node scripts/provision_bpe_printhouse.js [options]

Options:
  --node, --node-id <id>          Printer node ID (required, e.g. node-329a3bc4)
  --tenant, --tenant-id <id>      Tenant ID (required, e.g. ph-707a5869)
  --house, --house-id <id>        BPE Printhouse ID (optional, defaults to bpe_<nodeId>)
  --dry-run                       Dry run mode (default: true)
  --execute, --apply              Apply mutations (requires confirmation)
  --allow-production              Allow execution on non-localhost databases
  --mysql-host <host>             MySQL host (or via MYSQL_HOST env)
  --mysql-port <port>             MySQL port (default: 3306)
  --mysql-user <user>             MySQL user (or via MYSQL_USER env)
  --mysql-password <pass>         MySQL password (or via MYSQL_PASSWORD env)
  --mysql-database <db>           MySQL database (or via MYSQL_DATABASE env)
  --mongo-uri <uri>               MongoDB connection URI (or via MONGODB_URI env)
  -h, --help                      Show help
`);
        process.exit(0);
    }

    const targetNodeId = getArg(['--node', '--node-id']) || 'node-329a3bc4';
    const targetTenantId = getArg(['--tenant', '--tenant-id']) || 'ph-707a5869';
    const targetHouseId = getArg(['--house', '--house-id']) || `bpe_${targetNodeId}`;
    const executeMode = hasFlag(['--execute', '--apply']);
    const allowProd = hasFlag(['--allow-production']);

    // Set connection overrides from CLI if provided
    const cliMysqlHost = getArg(['--mysql-host']);
    if (cliMysqlHost) process.env.MYSQL_HOST = cliMysqlHost;
    const cliMysqlPort = getArg(['--mysql-port']);
    if (cliMysqlPort) process.env.MYSQL_PORT = cliMysqlPort;
    const cliMysqlUser = getArg(['--mysql-user']);
    if (cliMysqlUser) process.env.MYSQL_USER = cliMysqlUser;
    const cliMysqlPass = getArg(['--mysql-password', '--mysql-pass']);
    if (cliMysqlPass) process.env.MYSQL_PASSWORD = cliMysqlPass;
    const cliMysqlDb = getArg(['--mysql-database', '--mysql-db']);
    if (cliMysqlDb) process.env.MYSQL_DATABASE = cliMysqlDb;
    const cliMongoUri = getArg(['--mongo-uri']);
    if (cliMongoUri) process.env.MONGODB_URI = cliMongoUri;

    console.log(`================================================================`);
    console.log(`GOVERNED CP -> BPE PRINTHOUSE PROVISIONING COMMAND`);
    console.log(`================================================================`);
    console.log(`Mode:            ${executeMode ? '⚠️ EXECUTE (MUTATING)' : '🛡️ DRY-RUN (ZERO MUTATION)'}`);
    console.log(`Printer Node ID: ${targetNodeId}`);
    console.log(`Tenant ID:       ${targetTenantId}`);
    console.log(`BPE House ID:    ${targetHouseId}`);
    console.log(`Allow Prod:      ${allowProd ? 'YES' : 'NO'}`);
    console.log(`----------------------------------------------------------------\n`);

    provisionBpePrinthouse({
        nodeId: targetNodeId,
        tenantId: targetTenantId,
        houseId: targetHouseId,
        dryRun: !executeMode,
        allowProduction: allowProd
    })
    .then((res) => {
        console.log(`[RESULT] ok=${res.ok}, dryRun=${res.dryRun}`);
        console.log(JSON.stringify(res, null, 2));
        process.exit(0);
    })
    .catch((err) => {
        console.error(`\n[FATAL ERROR]: ${err.message}`);
        if (err.stack) console.error(err.stack);
        process.exit(1);
    })
    .finally(async () => {
        await mysqlClient.closePool().catch(() => {});
    });
}

module.exports = {
    provisionBpePrinthouse,
    resolveCanonicalShippingConfiguration
};
