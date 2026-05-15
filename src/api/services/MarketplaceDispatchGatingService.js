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

class MarketplaceDispatchGatingService {
    /**
     * Dispatch a marketplace order to a specific machine.
     */
    async dispatchOrder(orderRef, machineId, context) {
        logger.info({ event: 'marketplace_dispatch_attempt', order_ref: orderRef, machine_id: machineId });

        // 1. Fetch Order and Verify Context
        const { rows: [order] } = await db.query('SELECT * FROM orders WHERE order_ref = ?', [orderRef]);
        if (!order) throw new Error('ORDER_NOT_FOUND');

        if (!context.isSuperAdmin && order.offer_print_house !== context.printhouseId) {
            throw new Error('FORBIDDEN: You do not have permission to dispatch this order');
        }

        // 2. Gate 1: Asset Readiness (Forensic Validation)
        const { rows: files } = await db.query('SELECT validation_status FROM production_files WHERE order_ref = ?', [orderRef]);
        const allValidated = files.length >= 2 && files.every(f => f.validation_status === 'VALIDATED');
        
        if (!allValidated) {
            await this.logEvent(order.id, orderRef, 'DISPATCH_BLOCKED_PENDING_FILES', { count: files.length });
            throw new Error('DISPATCH_BLOCKED: Production files must be validated before dispatch.');
        }

        // 3. Gate 2: Financial Readiness (Payment Status)
        let invoicePayment = {};
        try {
            invoicePayment = JSON.parse(order.invoice_payment || '{}');
        } catch (e) {}

        const isPaid = invoicePayment.payment_status === 'PAID' || invoicePayment.admin_override === true;
        if (!isPaid) {
            await this.logEvent(order.id, orderRef, 'DISPATCH_BLOCKED_PENDING_PAYMENT', { status: invoicePayment.payment_status });
            throw new Error('DISPATCH_BLOCKED: Order must be PAID before dispatch.');
        }

        // 4. MES Transition: Create Manufacturing Package
        // We map BPE specs to Manufacturing specs
        let specs = {};
        try {
            specs = JSON.parse(order.specs || '{}');
        } catch (e) {}

        const packageData = {
            tenantId: order.tenant_id,
            createdByUserId: context.userId,
            source: 'MARKETPLACE',
            sourceRef: orderRef,
            bookSpec: {
                trimSize: specs.trim_size || '210x297mm',
                pageCount: specs.page_count || 0,
                binding: specs.binding_type || 'PERFECT_BOUND',
                interiorPaper: specs.interior_paper || '80gsm_white',
                coverPaper: specs.cover_paper || '250gsm_silk_lam',
                color: specs.color_mode || 'CMYK'
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

        // 6. Update Order Status
        await db.query(`
            UPDATE orders 
            SET status = 'IN_PRODUCTION',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [order.id]);

        await this.logEvent(order.id, orderRef, 'ORDER_DISPATCHED_TO_MACHINE', { 
            machine_id: machineId, 
            dispatch_id: dispatch.id,
            package_id: pkg.id
        });

        return {
            ok: true,
            dispatch_id: dispatch.id,
            package_id: pkg.id,
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
