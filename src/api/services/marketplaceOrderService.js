/**
 * src/api/services/marketplaceOrderService.js
 * 
 * Industrial Service for normalizing and managing Budget App marketplace order intents.
 */
const mysqlClient = require('./mysqlClient');
const logger = require('./logger').child('marketplace-order-service');

class MarketplaceOrderService {
    /**
     * Normalizes a marketplace order intent into the canonical Control Plane operational shape.
     */
    normalizeOrder(row) {
        const safeParse = (val) => {
            if (typeof val === 'object' && val !== null) return val;
            if (typeof val === 'string') {
                try { return JSON.parse(val); } catch (e) { return null; }
            }
            return null;
        };

        const payload = safeParse(row.payload) || {};
        const orderSnapshot = payload.order_snapshot || payload;
        const offer = safeParse(row.offer_json) || safeParse(row.offer) || {};
        const productionFiles = safeParse(row.production_files_json) || safeParse(row.production_files) || [];
        const totals = safeParse(row.totals_json) || safeParse(row.totals) || {};
        const lifecycleData = safeParse(row.lifecycle_json) || {};
        const preflight = safeParse(row.preflight_json) || safeParse(row.preflight) || {};
        const payment = safeParse(row.payment_json) || safeParse(row.payment) || {};
        const controlPlane = safeParse(row.control_plane_json) || safeParse(row.control_plane) || {};
        const printhouse = safeParse(row.printhouse_handoff_json) || safeParse(row.printhouse_handoff) || {};
        const customer = safeParse(row.customer_json) || safeParse(row.customer) || orderSnapshot.customer || {};

        // Normalization priority logic
        const specs = orderSnapshot.specs || orderSnapshot.book_specs || payload.specs || offer.specs || {};

        // Operational readiness & blockers
        const blockers = [];
        if (productionFiles.length < 2 && !row.production_files_json) blockers.push('MISSING_FILES');
        if (preflight.status !== 'PASSED' && preflight.status !== 'SUCCESS') blockers.push('PREFLIGHT_PENDING');
        if (payment.status !== 'PAID' && payment.status !== 'COMPLETED') blockers.push('PAYMENT_PENDING');

        const readiness = blockers.length === 0 ? 'READY' : 'BLOCKED';

        return {
            orderIntentId: row.id,
            publicRef: row.public_ref,
            status: row.status,
            lifecycle: row.lifecycle,
            createdAt: row.created_at,
            updatedAt: row.updated_at,

            customer: {
                name: customer.name || customer.full_name || 'Anonymous',
                email: customer.email || 'N/A',
                phone: customer.phone || 'N/A',
                shippingAddress: customer.shipping_address || customer.address || {},
                billingAddress: customer.billing_address || customer.address || {}
            },
            offer: {
                id: offer.id,
                printerId: offer.printer_id || offer.house_id,
                printerName: offer.printer_name || offer.print_house || 'Unknown House',
                totalPrice: offer.total_price || offer.amount || 0,
                currency: offer.currency || 'EUR',
                leadTimeDays: offer.lead_time_days || 0
            },
            specs,
            totals: {
                subtotal: totals.subtotal || 0,
                tax: totals.tax || 0,
                shipping: totals.shipping || 0,
                total: totals.total || 0,
                currency: totals.currency || 'EUR'
            },
            productionFiles: productionFiles.map(f => ({
                kind: f.kind,
                filename: f.filename || f.original_filename,
                status: f.status,
                checksum: f.checksum
            })),
            preflight: {
                status: preflight.status || 'NOT_STARTED',
                lastChecked: preflight.updated_at || preflight.last_checked,
                results: preflight.results || {}
            },
            payment: {
                status: payment.status || 'PENDING',
                method: payment.method,
                transactionId: payment.transaction_id,
                paidAt: payment.paid_at
            },
            controlPlane: {
                acknowledged: controlPlane.acknowledged || false,
                acknowledgedBy: controlPlane.acknowledged_by,
                acknowledgedAt: controlPlane.acknowledged_at,
                notes: controlPlane.notes || [],
                operationalStatus: controlPlane.operational_status || row.status
            },
            printhouse: {
                assignedPrinthouseId: printhouse.id || printhouse.assigned_printhouse_id,
                assignedAt: printhouse.assigned_at,
                handoffStatus: printhouse.status || 'PENDING'
            },
            audit: [], // Lazy loaded
            operationalStatus: controlPlane.operational_status || row.status,
            readiness,
            blockers
        };
    }

    async listOrders(filters = {}) {
        const {
            status,
            lifecycle,
            printhouseId,
            search,
            limit = 50,
            offset = 0
        } = filters;

        let sql = `SELECT * FROM marketplace_order_intents WHERE 1=1`;
        const params = [];

        if (status) {
            sql += ` AND status = ?`;
            params.push(status);
        }
        if (lifecycle) {
            sql += ` AND lifecycle = ?`;
            params.push(lifecycle);
        }
        if (printhouseId) {
            sql += ` AND (JSON_EXTRACT(printhouse_handoff_json, '$.id') = ? OR JSON_EXTRACT(printhouse_handoff_json, '$.assignedPrinthouseId') = ?)`;
            params.push(printhouseId, printhouseId);
        }

        if (search) {
            sql += ` AND (public_ref LIKE ? OR id LIKE ? OR JSON_EXTRACT(customer_json, '$.email') LIKE ?)`;
            const s = `%${search}%`;
            params.push(s, s, s);
        }

        sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));

        try {
            const rows = await mysqlClient.query(sql, params);
            const orders = rows.map(r => this.normalizeOrder(r));

            // Aggregate counts
            const countSql = `
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN lifecycle = 'FILES_UPLOADED' THEN 1 ELSE 0 END) as filesUploaded,
                    SUM(CASE WHEN status = 'DECLARED' THEN 1 ELSE 0 END) as declared,
                    SUM(CASE WHEN JSON_EXTRACT(preflight_json, '$.status') = 'PENDING' THEN 1 ELSE 0 END) as preflightPending,
                    SUM(CASE WHEN JSON_EXTRACT(payment_json, '$.status') = 'PENDING' THEN 1 ELSE 0 END) as paymentPending
                FROM marketplace_order_intents
            `;
            const countRows = await mysqlClient.query(countSql);
            const counts = countRows[0] || {};

            return { ok: true, orders, counts };
        } catch (err) {
            logger.error({ event: 'list_orders_failed', error: err.message });
            throw err;
        }
    }

    async getOrderDetail(id) {
        try {
            const rows = await mysqlClient.query(`SELECT * FROM marketplace_order_intents WHERE id = ? OR public_ref = ?`, [id, id]);
            if (!rows.length) return { ok: false, error: 'ORDER_NOT_FOUND' };

            const order = this.normalizeOrder(rows[0]);

            // Fetch audit timeline
            const auditRows = await mysqlClient.query(`
                SELECT * FROM marketplace_audit_events 
                WHERE entity_type = 'MARKETPLACE_ORDER_INTENT' AND entity_id = ?
                ORDER BY created_at DESC
            `, [order.orderIntentId]);

            order.audit = auditRows.map(a => ({
                id: a.id,
                eventType: a.event_type,
                actorId: a.actor_id,
                payload: typeof a.payload === 'string' ? JSON.parse(a.payload) : a.payload,
                createdAt: a.created_at
            }));

            // Fetch file metadata
            const fileRows = await mysqlClient.query(`
                SELECT * FROM marketplace_production_files WHERE order_intent_id = ?
            `, [order.orderIntentId]);
            
            order.productionFileMetadata = fileRows.map(f => ({
                id: f.id,
                kind: f.kind,
                filename: f.original_filename,
                sizeBytes: f.size_bytes,
                status: f.status,
                checksum: f.checksum,
                createdAt: f.created_at
            }));

            return { ok: true, order };
        } catch (err) {
            logger.error({ event: 'get_order_detail_failed', id, error: err.message });
            throw err;
        }
    }

    async addAuditEvent(orderId, eventType, payload = {}, actorId = 'SYSTEM') {
        try {
            await mysqlClient.query(`
                INSERT INTO marketplace_audit_events (entity_type, entity_id, event_type, actor_id, payload)
                VALUES ('MARKETPLACE_ORDER_INTENT', ?, ?, ?, ?)
            `, [orderId, eventType, actorId, JSON.stringify(payload)]);
        } catch (err) {
            logger.error({ event: 'add_audit_event_failed', orderId, error: err.message });
        }
    }

    async acknowledgeOrder(id, actorId) {
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const cp = order.controlPlane;
        cp.acknowledged = true;
        cp.acknowledgedBy = actorId;
        cp.acknowledgedAt = new Date().toISOString();
        cp.operationalStatus = 'ACKNOWLEDGED';

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET control_plane_json = ?, status = 'ACKNOWLEDGED'
            WHERE id = ?
        `, [JSON.stringify(cp), order.orderIntentId]);

        await this.addAuditEvent(order.orderIntentId, 'ORDER_ACKNOWLEDGED', { actorId }, actorId);
        return { ok: true };
    }

    async assignPrinthouse(id, printhouseId, actorId) {
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const ph = order.printhouse;
        ph.assignedPrinthouseId = printhouseId;
        ph.assignedAt = new Date().toISOString();
        ph.handoffStatus = 'ASSIGNED';

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET printhouse_handoff_json = ?
            WHERE id = ?
        `, [JSON.stringify(ph), order.orderIntentId]);

        await this.addAuditEvent(order.orderIntentId, 'PRINTHOUSE_ASSIGNED', { printhouseId, actorId }, actorId);
        return { ok: true };
    }

    async addNote(id, noteText, actorId) {
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const cp = order.controlPlane;
        cp.notes = cp.notes || [];
        cp.notes.push({
            text: noteText,
            authorId: actorId,
            createdAt: new Date().toISOString()
        });

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET control_plane_json = ?
            WHERE id = ?
        `, [JSON.stringify(cp), order.orderIntentId]);

        await this.addAuditEvent(order.orderIntentId, 'NOTE_ADDED', { noteText, actorId }, actorId);
        return { ok: true };
    }
}

module.exports = new MarketplaceOrderService();
