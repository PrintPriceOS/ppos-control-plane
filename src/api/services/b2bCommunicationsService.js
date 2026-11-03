/**
 * src/api/services/b2bCommunicationsService.js
 * ==============================================================================
 * PrintPrice OS — Phase 10 / B2B Publisher Communications & Incident Bridge Service
 * 
 * Invariants:
 * 1. Strict Tenant Isolation: All queries and cache entries partitioned by `tenantId`.
 * 2. Database First with Resilient In-Memory Fallback: Operates whether MySQL table is
 *    provisioned or offline.
 * 3. Bidirectional Messaging: Messages posted by printhouse or publisher are immediately
 *    reflected in both portals.
 * ==============================================================================
 */

const { v4: uuidv4 } = require('uuid');
const mysqlClient = require('./mysqlClient');
const { recordOperationalEvent } = require('./telemetry/operationalActivityStreamService');

let tableSchemaEnsured = false;

// In-Memory store for fast lookup and tests: key = `${tenantId}:${orderId}` -> Array<message>
const inMemoryMessagesStore = new Map();
// Threads cache: key = `${tenantId}:${orderId}` -> thread object
const inMemoryThreadsStore = new Map();

async function ensureB2bCommsTable() {
    if (tableSchemaEnsured) return;
    try {
        await mysqlClient.query(`
            CREATE TABLE IF NOT EXISTS b2b_communications (
                id VARCHAR(64) PRIMARY KEY,
                tenant_id VARCHAR(191) NOT NULL,
                order_id VARCHAR(191) NOT NULL,
                sender_type ENUM('PRINTHOUSE_OPERATOR', 'PUBLISHER_USER', 'SYSTEM_PREFLIGHT') NOT NULL,
                sender_name VARCHAR(255) NOT NULL,
                message_body TEXT NOT NULL,
                attachments_json JSON NULL,
                action_trigger VARCHAR(64) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_b2b_tenant_order (tenant_id, order_id),
                INDEX idx_b2b_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        tableSchemaEnsured = true;
    } catch (_) {
        // Table creation fails gracefully if db is unconfigured or in tests
    }
}

/**
 * Creates or updates a thread metadata wrapper.
 */
function upsertThreadMetadata(tenantId, orderId, metadata = {}) {
    const key = `${tenantId}:${orderId}`;
    const existing = inMemoryThreadsStore.get(key) || {
        threadId: `MSG-TH-${orderId}`,
        orderId,
        tenantId,
        publisherName: metadata.publisherName || 'B2B Publisher Partner',
        publisherContact: metadata.publisherContact || 'prepress@publisher.com',
        title: metadata.title || `Order ${orderId}`,
        imprimaturStatus: metadata.imprimaturStatus || 'PENDING_REVIEW',
        preflightAlert: metadata.preflightAlert || 'NONE',
        unreadCount: 0,
        updatedAt: new Date().toISOString()
    };

    const updated = {
        ...existing,
        ...metadata,
        updatedAt: new Date().toISOString()
    };
    inMemoryThreadsStore.set(key, updated);
    return updated;
}

/**
 * Returns list of open threads for a tenant.
 * Real/clean tenants start with [] if no messages or active incidents exist.
 */
async function listTenantThreads(tenantId) {
    if (!tenantId) return [];
    await ensureB2bCommsTable();

    // 1. Gather all unique orderIds for this tenant from in-memory store
    const threadKeys = [];
    for (const [key, msgs] of inMemoryMessagesStore.entries()) {
        if (key.startsWith(`${tenantId}:`) && msgs.length > 0) {
            const orderId = key.substring(tenantId.length + 1);
            threadKeys.push(orderId);
        }
    }

    // 2. Also check MySQL if available
    try {
        const rows = await mysqlClient.query(
            `SELECT DISTINCT order_id FROM b2b_communications WHERE tenant_id = ? ORDER BY created_at DESC`,
            [tenantId]
        );
        if (Array.isArray(rows)) {
            for (const r of rows) {
                if (!threadKeys.includes(r.order_id)) {
                    threadKeys.push(r.order_id);
                }
            }
        }
    } catch (_) {}

    // 3. Build thread list
    const result = [];
    for (const orderId of threadKeys) {
        const key = `${tenantId}:${orderId}`;
        const threadMeta = inMemoryThreadsStore.get(key) || {
            threadId: `MSG-TH-${orderId}`,
            orderId,
            tenantId,
            publisherName: 'B2B Publisher Partner',
            publisherContact: 'prepress@publisher.com',
            title: `Order ${orderId}`,
            imprimaturStatus: 'PENDING_REVIEW',
            preflightAlert: 'NONE'
        };

        const messages = await getOrderMessages(tenantId, orderId);
        const unreadCount = messages.filter(m => m.sender_type !== 'PRINTHOUSE_OPERATOR').length;

        result.push({
            ...threadMeta,
            unreadCount,
            messages
        });
    }

    return result;
}

/**
 * Retrieves all messages for a specific order under tenant isolation.
 */
async function getOrderMessages(tenantId, orderId) {
    if (!tenantId || !orderId) return [];
    await ensureB2bCommsTable();

    const key = `${tenantId}:${orderId}`;
    const memMsgs = inMemoryMessagesStore.get(key) || [];

    try {
        const rows = await mysqlClient.query(
            `SELECT id, tenant_id, order_id, sender_type, sender_name, message_body, attachments_json, action_trigger, created_at 
             FROM b2b_communications 
             WHERE tenant_id = ? AND order_id = ? 
             ORDER BY created_at ASC`,
            [tenantId, orderId]
        );
        if (Array.isArray(rows) && rows.length > 0) {
            const dbMap = new Map();
            for (const r of rows) {
                dbMap.set(r.id, {
                    id: r.id,
                    tenantId: r.tenant_id,
                    orderId: r.order_id,
                    sender_type: r.sender_type,
                    senderRole: r.sender_type === 'PRINTHOUSE_OPERATOR' ? 'PRINTHOUSE' : (r.sender_type === 'SYSTEM_PREFLIGHT' ? 'SYSTEM_PREFLIGHT' : 'PUBLISHER'),
                    sender_name: r.sender_name,
                    senderName: r.sender_name,
                    message_body: r.message_body,
                    text: r.message_body,
                    attachments: typeof r.attachments_json === 'string' ? JSON.parse(r.attachments_json) : (r.attachments_json || []),
                    action_trigger: r.action_trigger,
                    created_at: r.created_at,
                    timestamp: r.created_at
                });
            }
            // Merge in-memory (in case pending save)
            for (const m of memMsgs) {
                if (!dbMap.has(m.id)) {
                    dbMap.set(m.id, m);
                }
            }
            return Array.from(dbMap.values());
        }
    } catch (_) {}

    return memMsgs;
}

/**
 * Appends a new message to a thread and persists it.
 */
async function postOrderMessage(tenantId, orderId, {
    senderType = 'PRINTHOUSE_OPERATOR',
    senderName,
    messageBody,
    attachments = [],
    actionTrigger = null,
    printhouseId = 'node-primary'
}) {
    if (!tenantId || !orderId) {
        throw new Error('TENANT_AND_ORDER_REQUIRED');
    }
    if (!messageBody || !String(messageBody).trim()) {
        throw new Error('MESSAGE_BODY_REQUIRED');
    }

    await ensureB2bCommsTable();

    const id = `b2b-${uuidv4()}`;
    const cleanBody = String(messageBody).trim();
    const cleanSenderName = senderName || (senderType === 'PRINTHOUSE_OPERATOR' ? 'Printhouse Operator' : 'Publisher User');
    const now = new Date();

    const record = {
        id,
        tenantId,
        orderId,
        sender_type: senderType,
        senderRole: senderType === 'PRINTHOUSE_OPERATOR' ? 'PRINTHOUSE' : (senderType === 'SYSTEM_PREFLIGHT' ? 'SYSTEM_PREFLIGHT' : 'PUBLISHER'),
        sender_name: cleanSenderName,
        senderName: cleanSenderName,
        message_body: cleanBody,
        text: cleanBody,
        attachments,
        action_trigger: actionTrigger,
        created_at: now.toISOString(),
        timestamp: now.toISOString()
    };

    // 1. In-Memory Store
    const key = `${tenantId}:${orderId}`;
    const existing = inMemoryMessagesStore.get(key) || [];
    existing.push(record);
    inMemoryMessagesStore.set(key, existing);

    // 2. MySQL Persistence
    try {
        await mysqlClient.query(
            `INSERT INTO b2b_communications 
             (id, tenant_id, order_id, sender_type, sender_name, message_body, attachments_json, action_trigger, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                tenantId,
                orderId,
                senderType,
                cleanSenderName,
                cleanBody,
                JSON.stringify(attachments),
                actionTrigger,
                now
            ]
        );
    } catch (_) {}

    // 3. Operational telemetry event
    try {
        const severity = actionTrigger === 'REJECT_SPINE_DELTA' ? 'WARNING' : (actionTrigger === 'APPROVE_IMPRIMATUR' ? 'SUCCESS' : 'INFO');
        await recordOperationalEvent({
            orderId: String(orderId),
            printhouseId: printhouseId || 'node-primary',
            tenantId,
            domain: 'COMMUNICATIONS',
            eventType: actionTrigger || (senderType === 'PRINTHOUSE_OPERATOR' ? 'B2B_MESSAGE_SENT' : 'B2B_MESSAGE_RECEIVED'),
            severity,
            title: `B2B Comms: Order ${orderId} (${senderType})`,
            description: cleanBody.slice(0, 150),
            metadata: {
                messageId: id,
                orderId,
                actionTrigger,
                drawerTarget: 'B2B'
            },
            actorId: cleanSenderName,
            actorRole: senderType
        });
    } catch (_) {}

    return record;
}

module.exports = {
    ensureB2bCommsTable,
    upsertThreadMetadata,
    listTenantThreads,
    getOrderMessages,
    postOrderMessage,
    _inMemoryMessagesStore: inMemoryMessagesStore,
    _inMemoryThreadsStore: inMemoryThreadsStore
};

