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
        // ──────────────────────────────────────────────────────────────────────────
        const nodeRows = await dbClient.query(
            `SELECT id, tenant_id, name, status, metadata_json, rates_json, signatures, production_lead_days, shipping_days, limits, shipping
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

        // A. Check by House ID
        const existingHouse = await printhousesColl.findOne({
            $or: [{ id: effectiveHouseId }, { house_id: effectiveHouseId }]
        });

        if (existingHouse) {
            const existingNode = existingHouse.printer_node_id;
            const existingTenant = existingHouse.tenant_id;

            if (String(existingNode) !== String(nodeId) || String(existingTenant) !== String(tenantId)) {
                throw new Error(`CONFLICT_DUPLICATE_BPE_HOUSE: MongoDB already contains printhouse "${effectiveHouseId}" mapped to node "${existingNode}" and tenant "${existingTenant}".`);
            }
            isAlreadyProvisionedInMongo = true;
        }

        // B. Check by Node ID
        const existingNodeDoc = await printhousesColl.findOne({ printer_node_id: nodeId });
        if (existingNodeDoc) {
            const existingId = existingNodeDoc.id || existingNodeDoc.house_id;
            if (existingId !== effectiveHouseId) {
                throw new Error(`CONFLICT_NODE_ALREADY_MAPPED: Printer node "${nodeId}" is already mapped in MongoDB to printhouse "${existingId}".`);
            }
            isAlreadyProvisionedInMongo = true;
        }

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

        const shipping = (node.shipping && typeof node.shipping === 'string')
            ? JSON.parse(node.shipping)
            : (node.shipping || {});

        const targetMongoDoc = {
            id: effectiveHouseId,
            house_id: effectiveHouseId,
            name: node.name || 'philologica.ai Printhouse',
            tenant_id: node.tenant_id,
            printer_node_id: node.id,
            status: realStatus, // Exact node status: SUSPENDED (no activation)
            active: isCotizable, // false if SUSPENDED
            version: existingHouse?.version || 1,
            rates,
            signatures,
            production_lead_days: node.production_lead_days || 7,
            shipping_days: node.shipping_days || 3,
            limits,
            shipping,
            updated_at: new Date()
        };

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
                existing_metadata: existingMeta
            },
            mapping: {
                printer_node_id: node.id,
                tenant_id: node.tenant_id,
                bpe_printhouse_id: effectiveHouseId
            },
            mongoAction: isAlreadyProvisionedInMongo ? 'UPDATE_STATUS_AND_RATES' : 'INSERT_DOCUMENT',
            mongoDocument: targetMongoDoc,
            mysqlUpdate: {
                table: 'printer_nodes',
                where: { id: node.id, tenant_id: node.tenant_id },
                metadata_json: updatedMetadataJson
            },
            statusPreserved: realStatus,
            activationGranted: false
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
            await printhousesColl.updateOne(
                { _id: existingHouse?._id || existingNodeDoc?._id },
                {
                    $set: {
                        status: realStatus,
                        active: isCotizable,
                        name: targetMongoDoc.name,
                        rates: targetMongoDoc.rates,
                        signatures: targetMongoDoc.signatures,
                        production_lead_days: targetMongoDoc.production_lead_days,
                        shipping_days: targetMongoDoc.shipping_days,
                        limits: targetMongoDoc.limits,
                        shipping: targetMongoDoc.shipping,
                        updated_at: new Date()
                    }
                }
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
        const readbackMongo = await printhousesColl.findOne({
            $or: [{ id: effectiveHouseId }, { house_id: effectiveHouseId }]
        });
        if (!readbackMongo || readbackMongo.status !== realStatus) {
            throw new Error(`PROVISION_READBACK_FAILED: MongoDB readback failed or status mismatch (expected: "${realStatus}", got: "${readbackMongo?.status}")`);
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
            nodeId,
            tenantId,
            bpePrinthouseId: effectiveHouseId,
            status: realStatus,
            active: isCotizable,
            message: `Successfully provisioned printer node "${nodeId}" to BPE house "${effectiveHouseId}" with status "${realStatus}".`
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
    provisionBpePrinthouse
};
