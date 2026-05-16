/**
 * src/api/services/marketplaceOrderService.js
 * 
 * Industrial Service for normalizing and managing Budget App marketplace order intents.
 */
const mysqlClient = require('./mysqlClient');
const logger = require('./logger').child('marketplace-order-service');
const marketplacePreflightService = require('./marketplacePreflightService');

/**
 * Robust JSON parsing helper.
 */
function safeParseJson(value, fallback = null) {
    if (typeof value === 'object' && value !== null) return value;
    if (typeof value !== 'string') return fallback;
    try {
        return JSON.parse(value);
    } catch (e) {
        return fallback;
    }
}

/**
 * Robust Order Intent ID resolution.
 */
function getOrderIntentId(row) {
    return row.order_intent_id || row.id || row.intent_id;
}

class MarketplaceOrderService {
    /**
     * Normalizes a marketplace order intent into the canonical Control Plane operational shape.
     */
    normalizeOrder(row) {
        const payload = safeParseJson(row.payload, {});
        const snapshot = payload.order_snapshot || payload || {};
        
        const snapshotControlPlane = snapshot.control_plane || payload.control_plane || {};
        const rowControlPlane = safeParseJson(row.control_plane_json, safeParseJson(row.control_plane, {}));
        const controlPlane = {
            ...snapshotControlPlane,
            ...rowControlPlane
        };

        // Prioritize Budget canonical snapshot components
        const offer = snapshot.offer || safeParseJson(row.offer_json, safeParseJson(row.offer, {}));
        const specs = snapshot.specs || snapshot.book_specs || payload.specs || offer.specs || {};
        const rawProductionFiles = snapshot.production_files || safeParseJson(row.production_files_json, safeParseJson(row.production_files, []));
        const totals = snapshot.totals || safeParseJson(row.totals_json, safeParseJson(row.totals, offer.totals || {}));
        const status = row.status || 'DECLARED';

        // Resolve Final Total with robust fallback
        const resolvedTotal = Number(
            totals.total ||
            totals.grand_total ||
            totals.amount ||
            offer.total_price ||
            offer.totalPrice ||
            offer.amount ||
            0
        );

        // Normalize Lifecycle into Stage and Data Object
        const lifecycleObject = typeof snapshot.lifecycle === 'object' 
            ? snapshot.lifecycle 
            : safeParseJson(snapshot.lifecycle, safeParseJson(row.lifecycle_json, {}));

        const lifecycleStage = typeof row.lifecycle === 'string'
            ? row.lifecycle
            : (lifecycleObject.marketplace || snapshot.status || status || 'UNKNOWN');

        // Extract operational segments with dynamic overrides prioritization
        const preflight = safeParseJson(row.preflight_json, safeParseJson(row.preflight, controlPlane.preflight || snapshot.preflight || {}));
        const payment = safeParseJson(row.payment_json, safeParseJson(row.payment, controlPlane.payment || snapshot.payment || {}));
        const handoff = safeParseJson(row.printhouse_handoff_json, safeParseJson(row.printhouse_handoff, controlPlane.printhouse || snapshot.printhouse || {}));
        const customer = snapshot.customer || safeParseJson(row.customer_json, safeParseJson(row.customer, {}));

        // Robust Production Files Normalization
        let normalizedFiles = [];
        if (Array.isArray(rawProductionFiles)) {
            normalizedFiles = rawProductionFiles.map(f => ({
                kind: f.kind || 'DOCUMENT',
                fileId: f.fileId || f.id || f.uuid,
                filename: f.filename || f.original_filename || f.name,
                status: f.status || 'UPLOADED',
                checksum: f.checksum
            }));
        } else if (typeof rawProductionFiles === 'object' && rawProductionFiles !== null) {
            // Support object mapping (interior/cover keys)
            const keys = Object.keys(rawProductionFiles);
            if (rawProductionFiles.interior_pdf_file_id || rawProductionFiles.interior) {
                normalizedFiles.push({
                    kind: 'INTERIOR_PDF',
                    fileId: rawProductionFiles.interior_pdf_file_id || rawProductionFiles.interior?.fileId || rawProductionFiles.interior,
                    filename: rawProductionFiles.interior?.filename || 'interior.pdf',
                    status: 'UPLOADED'
                });
            }
            if (rawProductionFiles.cover_pdf_file_id || rawProductionFiles.cover) {
                normalizedFiles.push({
                    kind: 'COVER_PDF',
                    fileId: rawProductionFiles.cover_pdf_file_id || rawProductionFiles.cover?.fileId || rawProductionFiles.cover,
                    filename: rawProductionFiles.cover?.filename || 'cover.pdf',
                    status: 'UPLOADED'
                });
            }
            // Fallback for other keys if not matched
            if (normalizedFiles.length === 0 && keys.length > 0) {
                keys.forEach(k => {
                    const f = rawProductionFiles[k];
                    normalizedFiles.push({
                        kind: k.toUpperCase(),
                        fileId: typeof f === 'string' ? f : (f?.fileId || f?.id),
                        filename: f?.filename || f?.name || `${k}.pdf`,
                        status: 'UPLOADED'
                    });
                });
            }
        }

        // Operational readiness & blockers
        const blockers = [];
        
        const hasInterior = normalizedFiles.some(f => f.kind === 'INTERIOR_PDF' || f.kind?.includes('INTERIOR'));
        const hasCover = normalizedFiles.some(f => f.kind === 'COVER_PDF' || f.kind?.includes('COVER'));

        if (!hasInterior || !hasCover) {
            blockers.push('MISSING_FILES');
        }

        // Preflight Blockers
        if (preflight.status === 'FAILED') {
            blockers.push('PREFLIGHT_FAILED');
        } else if (!['PASSED', 'WAIVED'].includes(preflight.status)) {
            blockers.push('PREFLIGHT_PENDING');
        }

        // Payment Blockers
        if (payment.status === 'BLOCKED') {
            blockers.push('PAYMENT_BLOCKED');
        } else if (!['PAID', 'COMPLETED', 'READY_MANUAL', 'READY'].includes(payment.status)) {
            blockers.push('PAYMENT_PENDING');
        }

        // Handoff Blockers - handoff not prepared only after preflight & payment are resolved
        const hasCriticalBlockers = blockers.length > 0;
        if (!hasCriticalBlockers) {
            const handoffStatus = handoff.status || handoff.handoffStatus || 'NOT_READY';
            if (!['READY', 'SENT'].includes(handoffStatus)) {
                blockers.push('HANDOFF_NOT_PREPARED');
            }
        }

        const readiness = blockers.length === 0 ? 'READY' : 'BLOCKED';

        return {
            orderIntentId: getOrderIntentId(row),
            publicRef: row.public_ref,
            status,
            lifecycle: lifecycleStage,
            lifecycleData: lifecycleObject,
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
                id: offer.offer_id || offer.id,
                printerId: offer.printer_id || offer.printerId || offer.house_id || offer.print_house_id,
                printerName: offer.printer_name || offer.printerName || offer.print_house || offer.print_house_name || 'Unknown House',
                totalPrice: Number(offer.total_price || offer.totalPrice || offer.amount || 0),
                currency: offer.currency || 'EUR',
                leadTimeDays: offer.lead_time_days || 0
            },
            specs,
            totals: {
                subtotal: Number(totals.subtotal || 0),
                tax: Number(totals.tax || 0),
                shipping: Number(totals.shipping || 0),
                total: resolvedTotal,
                currency: totals.currency || offer.currency || 'EUR'
            },
            productionFiles: normalizedFiles,
            preflight: {
                status: preflight.status || 'NOT_STARTED',
                lastChecked: preflight.updated_at || preflight.last_checked || preflight.updatedAt,
                results: preflight.results || preflight.result || {},
                simulated: Boolean(preflight.simulated),
                required: Boolean(preflight.required),
                nativeEnabled: Boolean(preflight.nativeEnabled),
                interiorJobId: preflight.interiorJobId,
                coverJobId: preflight.coverJobId,
                issues: preflight.issues || [],
                riskLevel: preflight.riskLevel || 'NONE',
                updatedBy: preflight.updatedBy
            },
            payment: {
                status: payment.status || 'NOT_STARTED',
                method: payment.method,
                transactionId: payment.transaction_id || payment.transactionId,
                paidAt: payment.paid_at || payment.paidAt,
                blockedReason: payment.blocked_reason || payment.blockedReason
            },
            controlPlane: {
                acknowledged: Boolean(controlPlane.acknowledged),
                acknowledgedBy: controlPlane.acknowledgedBy || controlPlane.acknowledged_by,
                acknowledgedAt: controlPlane.acknowledgedAt || controlPlane.acknowledged_at,
                notes: controlPlane.notes || [],
                operationalStatus: controlPlane.operationalStatus || controlPlane.operational_status || status
            },
            printhouse: {
                assignedPrinthouseId: handoff.printerId || handoff.printer_id || handoff.assignedPrinthouseId || handoff.assigned_printhouse_id || controlPlane.printhouse?.assignedPrinthouseId,
                assignedAt: handoff.preparedAt || handoff.assignedAt || handoff.assigned_at,
                handoffStatus: handoff.status || handoff.handoffStatus || 'NOT_READY',
                preparedBy: handoff.preparedBy,
                preparedAt: handoff.preparedAt,
                productionFiles: handoff.productionFiles
            },
            audit: [], 
            operationalStatus: controlPlane.operationalStatus || controlPlane.operational_status || status,
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

        logger.info({ event: 'MARKETPLACE_ORDERS_LIST_REQUEST', filters });

        let sql = `SELECT * FROM marketplace_order_intents WHERE 1=1`;
        const params = [];

        if (status) {
            sql += ` AND status = ?`;
            params.push(status);
        }
        
        if (lifecycle && typeof lifecycle === 'string') {
            sql += ` AND lifecycle = ?`;
            params.push(lifecycle);
        }

        if (printhouseId) {
            sql += ` AND (JSON_EXTRACT(printhouse_handoff_json, '$.id') = ? OR JSON_EXTRACT(printhouse_handoff_json, '$.assignedPrinthouseId') = ?)`;
            params.push(printhouseId, printhouseId);
        }

        if (search) {
            sql += ` AND (public_ref LIKE ? OR order_intent_id LIKE ? OR JSON_EXTRACT(customer_json, '$.email') LIKE ?)`;
            const s = `%${search}%`;
            params.push(s, s, s);
        }

        sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));

        try {
            const rows = await mysqlClient.query(sql, params);
            const orders = rows.map(r => this.normalizeOrder(r));

            // Compute counts in JS for robustness across schemas
            const counts = {
                total: orders.length,
                filesUploaded: orders.filter(o => o.productionFiles.length >= 2).length,
                preflightRequired: orders.filter(o => o.preflight.status === 'REQUIRED').length,
                preflightPending: orders.filter(o => o.preflight.status === 'PENDING' || o.preflight.status === 'NOT_STARTED').length,
                paymentPending: orders.filter(o => !['PAID', 'COMPLETED', 'READY_MANUAL'].includes(o.payment.status)).length,
                readyForHandoff: orders.filter(o => o.readiness === 'READY').length,
                blocked: orders.filter(o => o.readiness === 'BLOCKED').length
            };

            logger.info({ event: 'MARKETPLACE_ORDERS_LIST_RESULT', count: orders.length });
            return { ok: true, orders, counts };
        } catch (err) {
            logger.error({ event: 'list_orders_failed', error: err.message });
            throw err;
        }
    }

    async getOrderDetail(id) {
        logger.info({ event: 'MARKETPLACE_ORDER_DETAIL_REQUEST', id });
        try {
            const rows = await mysqlClient.query(`SELECT * FROM marketplace_order_intents WHERE order_intent_id = ? OR public_ref = ?`, [id, id]);
            if (!rows.length) return { ok: false, error: 'ORDER_NOT_FOUND' };

            const order = this.normalizeOrder(rows[0]);
            const orderIntentId = order.orderIntentId;

            // Fetch audit timeline
            const auditRows = await mysqlClient.query(`
                SELECT * FROM marketplace_audit_events 
                WHERE entity_type = 'MARKETPLACE_ORDER_INTENT' AND entity_id = ?
                ORDER BY created_at DESC
            `, [orderIntentId]);

            order.audit = auditRows.map(a => ({
                id: a.id,
                eventType: a.event_type,
                actorId: a.actor_id,
                payload: safeParseJson(a.payload, {}),
                createdAt: a.created_at
            }));

            // Fetch file metadata with fallback
            let fileRows = await mysqlClient.query(`
                SELECT * FROM marketplace_production_files WHERE order_intent_id = ?
            `, [orderIntentId]);
            
            if (fileRows.length === 0 && order.productionFiles.length > 0) {
                const fileIds = order.productionFiles.map(f => f.fileId).filter(Boolean);
                if (fileIds.length > 0) {
                    fileRows = await mysqlClient.query(`
                        SELECT * FROM marketplace_production_files WHERE id IN (?) OR file_id IN (?)
                    `, [fileIds, fileIds]);
                }
            }
            
            order.productionFileMetadata = fileRows.map(f => ({
                id: f.id || f.file_id,
                kind: f.kind,
                filename: f.original_filename || f.filename,
                sizeBytes: Number(f.size_bytes || f.size || 0),
                status: f.status || 'UPLOADED',
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
                INSERT INTO marketplace_audit_events (
                    entity_type,
                    entity_id,
                    event_type,
                    actor_id,
                    payload,
                    created_at
                )
                VALUES ('MARKETPLACE_ORDER_INTENT', ?, ?, ?, ?, NOW())
            `, [orderId, eventType, actorId, JSON.stringify(payload)]);
        } catch (err) {
            logger.error({ event: 'add_audit_event_failed', orderId, error: err.message });
        }
    }

    async acknowledgeOrder(id, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_ACTION', action: 'ACKNOWLEDGE', id });
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const cp = order.controlPlane;
        cp.acknowledged = true;
        cp.acknowledgedBy = actorId;
        cp.acknowledgedAt = new Date().toISOString();
        cp.operationalStatus = 'ACKNOWLEDGED';

        const orderIntentId = order.orderIntentId;
        const cpJson = JSON.stringify(cp);

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET control_plane_json = ?, control_plane = ?, status = 'ACKNOWLEDGED'
            WHERE order_intent_id = ?
        `, [cpJson, cpJson, orderIntentId]);

        await this.addAuditEvent(orderIntentId, 'ORDER_ACKNOWLEDGED', { actorId }, actorId);
        return { ok: true };
    }

    async assignPrinthouse(id, assignedPrinthouseId, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_ACTION', action: 'ASSIGN_PRINTHOUSE', id, assignedPrinthouseId });
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const cp = order.controlPlane;
        cp.printhouse = cp.printhouse || {};
        cp.printhouse.assignedPrinthouseId = assignedPrinthouseId;
        cp.printhouse.assignedAt = new Date().toISOString();
        cp.printhouse.assignedBy = actorId;

        const orderIntentId = order.orderIntentId;
        const cpJson = JSON.stringify(cp);

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET control_plane_json = ?, control_plane = ?
            WHERE order_intent_id = ?
        `, [cpJson, cpJson, orderIntentId]);

        await this.addAuditEvent(orderIntentId, 'PRINTHOUSE_ASSIGNED', { assignedPrinthouseId, actorId }, actorId);
        return { ok: true };
    }

    async addNote(id, noteText, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_ACTION', action: 'ADD_NOTE', id });
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const cp = order.controlPlane;
        cp.notes = cp.notes || [];
        cp.notes.push({
            text: noteText,
            authorId: actorId,
            createdAt: new Date().toISOString()
        });

        const orderIntentId = order.orderIntentId;
        const cpJson = JSON.stringify(cp);

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET control_plane_json = ?, control_plane = ?
            WHERE order_intent_id = ?
        `, [cpJson, cpJson, orderIntentId]);

        await this.addAuditEvent(orderIntentId, 'NOTE_ADDED', { noteText, actorId }, actorId);
        return { ok: true };
    }

    async listAuditEvents(filters = {}) {
        const {
            orderIntentId,
            publicRef,
            eventType,
            limit = 100,
            offset = 0
        } = filters;

        let sql = `SELECT * FROM marketplace_audit_events WHERE 1=1`;
        const params = [];

        if (orderIntentId) {
            sql += ` AND entity_id = ?`;
            params.push(orderIntentId);
        }
        if (publicRef) {
            sql += ` AND entity_id IN (SELECT order_intent_id FROM marketplace_order_intents WHERE public_ref = ?)`;
            params.push(publicRef);
        }
        if (eventType) {
            sql += ` AND event_type = ?`;
            params.push(eventType);
        }

        sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));

        try {
            const rows = await mysqlClient.query(sql, params);
            const events = rows.map(r => ({
                id: r.id,
                entityType: r.entity_type,
                entityId: r.entity_id,
                eventType: r.event_type,
                actorId: r.actor_id,
                payload: safeParseJson(r.payload, {}),
                createdAt: r.created_at
            }));
            return { ok: true, events };
        } catch (err) {
            logger.error({ event: 'list_audit_events_failed', error: err.message });
            throw err;
        }
    }

    async runPreflight(id, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_ACTION', action: 'RUN_PREFLIGHT', id });
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const orderIntentId = order.orderIntentId;

        // Delegate to marketplacePreflightService
        const runRes = await marketplacePreflightService.runPreflight(orderIntentId, actorId);
        if (!runRes.ok) {
            // Even if it failed or is not configured, we still want to store the preflight object status
            if (runRes.preflight) {
                const preflightJson = JSON.stringify(runRes.preflight);
                await mysqlClient.query(`
                    UPDATE marketplace_order_intents 
                    SET preflight_json = ?, preflight = ?
                    WHERE order_intent_id = ?
                `, [preflightJson, preflightJson, orderIntentId]);
            }
            await this.addAuditEvent(orderIntentId, 'PREFLIGHT_NOT_CONFIGURED', { error: runRes.error, message: runRes.message, actorId }, actorId);
            return runRes;
        }

        const preflight = runRes.preflight;
        const preflightJson = JSON.stringify(preflight);

        // Update preflight_json column
        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET preflight_json = ?, preflight = ?
            WHERE order_intent_id = ?
        `, [preflightJson, preflightJson, orderIntentId]);

        // Append Audit event
        const eventType = preflight.simulated ? 'PREFLIGHT_SIMULATED' : 'PREFLIGHT_RUN_REQUESTED';
        await this.addAuditEvent(orderIntentId, eventType, { preflight, actorId }, actorId);

        // If simulated, also trigger standard pass/fail logging and potential secondary events
        if (preflight.simulated) {
            const outcomeEvent = preflight.status === 'PASSED' ? 'PREFLIGHT_PASSED' : 'PREFLIGHT_FAILED';
            await this.addAuditEvent(orderIntentId, outcomeEvent, { result: preflight.result, actorId }, actorId);
        }

        return { ok: true, order: (await this.getOrderDetail(id)).order };
    }

    async markPreflightRequired(id, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_ACTION', action: 'MARK_PREFLIGHT_REQUIRED', id });
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const cp = order.controlPlane;
        cp.preflight = cp.preflight || {};
        cp.preflight.status = 'REQUIRED';
        cp.preflight.updatedAt = new Date().toISOString();

        const orderIntentId = order.orderIntentId;
        const cpJson = JSON.stringify(cp);

        // Also update preflight_json directly for robust synchronization
        const preflight = order.preflight;
        preflight.status = 'REQUIRED';
        preflight.updatedAt = new Date().toISOString();
        preflight.updatedBy = actorId;
        const preflightJson = JSON.stringify(preflight);

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET control_plane_json = ?, control_plane = ?, preflight_json = ?, preflight = ?
            WHERE order_intent_id = ?
        `, [cpJson, cpJson, preflightJson, preflightJson, orderIntentId]);

        await this.addAuditEvent(orderIntentId, 'PREFLIGHT_REQUIRED', { actorId }, actorId);
        return { ok: true, order: (await this.getOrderDetail(id)).order };
    }

    async markPreflightPassed(id, result = {}, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_ACTION', action: 'MARK_PREFLIGHT_PASSED', id });
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const orderIntentId = order.orderIntentId;

        // Build updated preflight status
        const preflight = order.preflight;
        preflight.status = 'PASSED';
        preflight.result = result.result || 'SUCCESS';
        preflight.issues = result.issues || [];
        preflight.riskLevel = result.riskLevel || 'LOW';
        preflight.updatedAt = new Date().toISOString();
        preflight.updatedBy = actorId;

        const preflightJson = JSON.stringify(preflight);

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET preflight_json = ?, preflight = ?
            WHERE order_intent_id = ?
        `, [preflightJson, preflightJson, orderIntentId]);

        await this.addAuditEvent(orderIntentId, 'PREFLIGHT_PASSED', { result, actorId }, actorId);
        return { ok: true, order: (await this.getOrderDetail(id)).order };
    }

    async markPreflightFailed(id, result = {}, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_ACTION', action: 'MARK_PREFLIGHT_FAILED', id });
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const orderIntentId = order.orderIntentId;

        // Build updated preflight status
        const preflight = order.preflight;
        preflight.status = 'FAILED';
        preflight.result = result.result || 'WARNINGS_FOUND';
        preflight.issues = result.issues || ['Manual preflight check failed by operator'];
        preflight.riskLevel = result.riskLevel || 'MEDIUM';
        preflight.updatedAt = new Date().toISOString();
        preflight.updatedBy = actorId;

        const preflightJson = JSON.stringify(preflight);

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET preflight_json = ?, preflight = ?
            WHERE order_intent_id = ?
        `, [preflightJson, preflightJson, orderIntentId]);

        await this.addAuditEvent(orderIntentId, 'PREFLIGHT_FAILED', { result, actorId }, actorId);
        return { ok: true, order: (await this.getOrderDetail(id)).order };
    }

    async markPaymentReady(id, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_ACTION', action: 'MARK_PAYMENT_READY', id });
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const orderIntentId = order.orderIntentId;

        const payment = order.payment;
        payment.status = 'READY_MANUAL';
        payment.paidAt = new Date().toISOString();
        payment.method = 'MANUAL';
        payment.updatedAt = new Date().toISOString();
        payment.updatedBy = actorId;

        const paymentJson = JSON.stringify(payment);

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET payment_json = ?, payment = ?
            WHERE order_intent_id = ?
        `, [paymentJson, paymentJson, orderIntentId]);

        await this.addAuditEvent(orderIntentId, 'PAYMENT_READY', { actorId }, actorId);
        return { ok: true, order: (await this.getOrderDetail(id)).order };
    }

    async markPaymentBlocked(id, reason = 'Payment verification pending', actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_ACTION', action: 'MARK_PAYMENT_BLOCKED', id, reason });
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const orderIntentId = order.orderIntentId;

        const payment = order.payment;
        payment.status = 'BLOCKED';
        payment.blockedReason = reason;
        payment.updatedAt = new Date().toISOString();
        payment.updatedBy = actorId;

        const paymentJson = JSON.stringify(payment);

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET payment_json = ?, payment = ?
            WHERE order_intent_id = ?
        `, [paymentJson, paymentJson, orderIntentId]);

        await this.addAuditEvent(orderIntentId, 'PAYMENT_BLOCKED', { reason, actorId }, actorId);
        return { ok: true, order: (await this.getOrderDetail(id)).order };
    }

    async prepareHandoff(id, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_ACTION', action: 'PREPARE_HANDOFF', id });
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const orderIntentId = order.orderIntentId;

        // Identify interior and cover
        const interior = order.productionFiles.find(f => f.kind === 'INTERIOR_PDF' || f.kind?.includes('INTERIOR'));
        const cover = order.productionFiles.find(f => f.kind === 'COVER_PDF' || f.kind?.includes('COVER'));

        const handoff = {
            status: 'READY',
            preparedAt: new Date().toISOString(),
            preparedBy: actorId,
            orderIntentId: orderIntentId,
            publicRef: order.publicRef,
            printerId: order.offer.printerId,
            printerName: order.offer.printerName,
            specs: order.specs,
            totals: order.totals,
            productionFiles: {
                interior: interior ? { fileId: interior.fileId, filename: interior.filename } : null,
                cover: cover ? { fileId: cover.fileId, filename: cover.filename } : null
            },
            preflight: {
                status: order.preflight.status,
                results: order.preflight.results
            },
            payment: {
                status: order.payment.status,
                method: order.payment.method
            },
            customerSnapshot: {
                name: order.customer.name,
                email: order.customer.email
            },
            auditRef: `audit_handoff_${Date.now()}`
        };

        const handoffJson = JSON.stringify(handoff);

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET printhouse_handoff_json = ?, printhouse_handoff = ?
            WHERE order_intent_id = ?
        `, [handoffJson, handoffJson, orderIntentId]);

        await this.addAuditEvent(orderIntentId, 'HANDOFF_PREPARED', { actorId }, actorId);
        return { ok: true, order: (await this.getOrderDetail(id)).order };
    }

    async markHandoffReady(id, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_ACTION', action: 'MARK_HANDOFF_READY', id });
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const orderIntentId = order.orderIntentId;

        // Fetch or create handoff
        let handoff = safeParseJson(order.printhouse?.handoffStatus === 'NOT_READY' ? null : order.printhouse);
        if (!handoff || Object.keys(handoff).length <= 4) {
            // Prepare it inline if not prepared yet
            const prepRes = await this.prepareHandoff(id, actorId);
            handoff = prepRes.order.printhouse;
        }

        const printhouseHandoff = {
            status: 'READY',
            printerId: order.offer.printerId,
            printerName: order.offer.printerName,
            preparedAt: new Date().toISOString(),
            preparedBy: actorId,
            productionFiles: order.productionFiles
        };

        const handoffJson = JSON.stringify(printhouseHandoff);

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET printhouse_handoff_json = ?, printhouse_handoff = ?
            WHERE order_intent_id = ?
        `, [handoffJson, handoffJson, orderIntentId]);

        await this.addAuditEvent(orderIntentId, 'HANDOFF_READY', { actorId }, actorId);
        return { ok: true, order: (await this.getOrderDetail(id)).order };
    }

    async requestCustomerAction(id, actionType, message, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_ACTION', action: 'REQUEST_CUSTOMER_ACTION', id, actionType });
        const { order } = await this.getOrderDetail(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const cp = order.controlPlane;
        cp.customer_action_requested = true;
        cp.last_requested_action = {
            type: actionType,
            message,
            requestedAt: new Date().toISOString(),
            requestedBy: actorId
        };

        const orderIntentId = order.orderIntentId;
        const cpJson = JSON.stringify(cp);

        await mysqlClient.query(`
            UPDATE marketplace_order_intents 
            SET control_plane_json = ?, control_plane = ?
            WHERE order_intent_id = ?
        `, [cpJson, cpJson, orderIntentId]);

        await this.addAuditEvent(orderIntentId, 'CUSTOMER_ACTION_REQUESTED', { actionType, message, actorId }, actorId);
        return { ok: true, order: (await this.getOrderDetail(id)).order };
    }
}

module.exports = new MarketplaceOrderService();
