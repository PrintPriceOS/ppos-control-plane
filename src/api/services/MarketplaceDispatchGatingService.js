/**
 * src/api/services/MarketplaceDispatchGatingService.js
 * 
 * MES Dispatch Sentinel for Marketplace Orders.
 * Enforces forensic and financial gates before allowing production dispatch.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('dispatch-gating');
const manufacturingDispatch = require('./ManufacturingDispatchService');
const manufacturingPackage = require('./ManufacturingPackageService');
const persistence = require('./ManufacturingPersistenceService');

function normalizeRows(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.rows)) return res.rows;
    return [];
}

class MarketplaceDispatchGatingService {
    /**
     * Dispatch a marketplace order to a specific machine.
     */
    async dispatchOrder(orderRef, machineId, context) {
        logger.info({ event: 'marketplace_dispatch_attempt', order_ref: orderRef, machine_id: machineId });

        // 1. Fetch Order and Verify Context
        let order = null;
        let orderModel = 'orders';

        try {
            const ordRows = normalizeRows(await db.query('SELECT * FROM orders WHERE order_ref = ? OR id = ?', [orderRef, orderRef]));
            if (ordRows.length > 0) {
                order = ordRows[0];
                orderModel = 'orders';
            }
        } catch (_) {}

        if (!order) {
            try {
                const mpRows = normalizeRows(await db.query('SELECT * FROM marketplace_orders WHERE order_id = ? OR id = ?', [orderRef, orderRef]));
                if (mpRows.length > 0) {
                    order = mpRows[0];
                    orderModel = 'marketplace_orders';
                }
            } catch (_) {}
        }

        if (!order) throw new Error('ORDER_NOT_FOUND');

        const assignedPrinter = order.offer_print_house || order.assigned_printhouse_id || order.printhouse_id;
        if (!context.isSuperAdmin && assignedPrinter !== context.printhouseId) {
            throw new Error('FORBIDDEN: You do not have permission to dispatch this order');
        }

        const canonicalRef = order.order_ref || order.order_id || order.id;

        // Gate 0: Block dispatch if an unresolved quote revision is pending (BLK-03)
        try {
            const pendingRevs = normalizeRows(await db.query(
                `SELECT id FROM order_quote_revisions 
                 WHERE (external_order_intent_id = ? OR canonical_order_id = ?) AND status = 'PENDING' LIMIT 1`,
                [orderRef, canonicalRef]
            ));
            if (pendingRevs.length > 0) {
                throw new Error('DISPATCH_BLOCKED: Order has pending quote revision awaiting customer decision.');
            }
        } catch (revErr) {
            if (revErr.message && revErr.message.includes('DISPATCH_BLOCKED')) throw revErr;
        }

        // 2. Gate 1: Asset Readiness (Forensic Validation)
        let files = [];
        try {
            files = normalizeRows(await db.query('SELECT validation_status FROM production_files WHERE order_ref = ? OR order_id = ?', [orderRef, canonicalRef]));
        } catch (_) {}

        let allValidated = false;
        if (files.length >= 2) {
            allValidated = files.every(f => f.validation_status === 'VALIDATED');
        } else {
            try {
                const mpFiles = normalizeRows(await db.query(
                    'SELECT status, preflight_status FROM marketplace_order_files WHERE order_id = ?',
                    [canonicalRef]
                ));
                if (mpFiles.length >= 2) {
                    allValidated = mpFiles.every(f => f.status === 'VALIDATED' || f.preflight_status === 'PASSED');
                }
            } catch (_) {}
        }
        
        if (files.length > 0 && !allValidated) {
            await this.logEvent(order.id, orderRef, 'DISPATCH_BLOCKED_PENDING_FILES', { count: files.length });
            throw new Error('DISPATCH_BLOCKED: Production files must be validated before dispatch.');
        }

        // 3. Gate 2: Financial Readiness & Authoritative Effective Specifications (BLK-03 & BLK-06)
        let effectiveSpecRecord = null;
        try {
            const effectiveRows = normalizeRows(await db.query(
                `SELECT * FROM order_effective_technical_specifications 
                 WHERE (external_order_intent_id = ? OR canonical_order_id = ?) AND effective_status = 'ACTIVE' 
                 ORDER BY created_at DESC LIMIT 1`,
                [orderRef, canonicalRef]
            ));
            if (effectiveRows.length > 0) {
                effectiveSpecRecord = effectiveRows[0];
            }
        } catch (_) {}

        if (effectiveSpecRecord) {
            if (effectiveSpecRecord.financial_reconciliation_status === 'PAYMENT_PENDING') {
                await this.logEvent(order.id, orderRef, 'DISPATCH_BLOCKED_PENDING_PAYMENT', { reason: 'REVISION_PAYMENT_PENDING' });
                throw new Error('DISPATCH_BLOCKED: Revised quote payment is pending customer settlement.');
            }
            if (effectiveSpecRecord.industrial_gate_status === 'BLOCKED') {
                throw new Error('DISPATCH_BLOCKED: Industrial gate is blocked for effective specification.');
            }
        }

        let invoicePayment = {};
        try {
            invoicePayment = typeof order.invoice_payment === 'string'
                ? JSON.parse(order.invoice_payment || '{}')
                : (order.invoice_payment || {});
        } catch (e) {}

        const isPaid = invoicePayment.payment_status === 'PAID' || 
                       invoicePayment.admin_override === true || 
                       order.status === 'PAID' ||
                       (effectiveSpecRecord && ['PASSED', 'REFUND_PENDING', 'ZERO_DELTA_PARITY'].includes(effectiveSpecRecord.financial_reconciliation_status));

        if (!isPaid) {
            await this.logEvent(order.id, orderRef, 'DISPATCH_BLOCKED_PENDING_PAYMENT', { status: invoicePayment.payment_status });
            throw new Error('DISPATCH_BLOCKED: Order must be PAID before dispatch.');
        }

        // 4. MES Transition: Consume Effective Technical Specifications (BLK-03)
        let specs = {};
        if (effectiveSpecRecord && effectiveSpecRecord.specs_json) {
            try {
                specs = typeof effectiveSpecRecord.specs_json === 'string'
                    ? JSON.parse(effectiveSpecRecord.specs_json)
                    : effectiveSpecRecord.specs_json;
            } catch (_) {}
        } else {
            try {
                specs = typeof order.specs === 'string'
                    ? JSON.parse(order.specs || '{}')
                    : (order.specs || (order.book_spec_json ? (typeof order.book_spec_json === 'string' ? JSON.parse(order.book_spec_json) : order.book_spec_json) : {}));
            } catch (_) {}
        }

        const packageData = {
            tenantId: order.tenant_id,
            createdByUserId: context.userId,
            source: 'MARKETPLACE',
            sourceRef: orderRef,
            bookSpec: {
                trimSize: specs.trim_size || (specs.width_mm && specs.height_mm ? `${specs.width_mm}x${specs.height_mm}mm` : '210x297mm'),
                pageCount: specs.page_count || 0,
                binding: specs.binding_type || specs.binding || 'PERFECT_BOUND',
                interiorPaper: specs.paper_name || (specs.gsm ? `${specs.gsm}gsm_${specs.finish || specs.paper_finish || 'silk'}` : (specs.interior_paper || '80gsm_white')),
                coverPaper: specs.cover_paper || '250gsm_silk_lam',
                color: specs.color_mode || 'CMYK',
                variantId: specs.variant_id || null,
                effectiveSpecificationId: effectiveSpecRecord ? effectiveSpecRecord.id : null
            },
            status: 'READY_FOR_DISPATCH'
        };

        // Industrial: Ensure we use the persistence layer to create the package record
        const pkg = await persistence.createPackage(packageData);

        // 5. Trigger Dispatch
        const dispatch = await manufacturingDispatch.createDispatch(pkg.id, machineId, {
            message: `Marketplace Order #${orderRef} dispatched for production.`
        }, {
            userId: context.userId,
            tenantId: order.tenant_id,
            role: context.role
        });

        // 6. Update Order & Effective Specs Status
        if (orderModel === 'orders') {
            await db.query(`
                UPDATE orders 
                SET status = 'IN_PRODUCTION',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? OR order_ref = ?
            `, [order.id, orderRef]);
        } else {
            await db.query(`
                UPDATE marketplace_orders 
                SET status = 'IN_PRODUCTION',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? OR order_id = ?
            `, [order.id, orderRef]);
        }

        if (effectiveSpecRecord) {
            try {
                await db.query(
                    `UPDATE order_effective_technical_specifications 
                     SET industrial_gate_status = 'DISPATCHED', updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [effectiveSpecRecord.id]
                );
            } catch (_) {}
        }

        await this.logEvent(order.id, orderRef, 'ORDER_DISPATCHED_TO_MACHINE', { 
            machine_id: machineId, 
            dispatch_id: dispatch.id,
            package_id: pkg.id,
            effective_specification_id: effectiveSpecRecord ? effectiveSpecRecord.id : null
        });

        return {
            ok: true,
            dispatch_id: dispatch.id,
            package_id: pkg.id,
            effective_specification_id: effectiveSpecRecord ? effectiveSpecRecord.id : null,
            status: 'IN_PRODUCTION'
        };
    }

    async logEvent(orderId, orderRef, type, payload = {}) {
        await db.query(`
            INSERT INTO marketplace_events (id, order_id, order_ref, event_type, metadata_json)
            VALUES (UUID(), ?, ?, ?, ?)
        `, [orderId, orderRef, type, JSON.stringify(payload)]);
    }
}

module.exports = new MarketplaceDispatchGatingService();
