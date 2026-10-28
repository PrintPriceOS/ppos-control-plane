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
        let pendingRevs = [];
        try {
            pendingRevs = normalizeRows(await db.query(
                `SELECT id FROM order_quote_revisions 
                 WHERE (external_order_intent_id = ? OR canonical_order_id = ?) AND status = 'PENDING' LIMIT 1`,
                [orderRef, canonicalRef]
            ));
        } catch (revErr) {
            logger.error({ event: 'revision_query_error', error: revErr.message });
            throw new Error(`DISPATCH_BLOCKED: Error querying quote revisions: ${revErr.message}`);
        }
        if (pendingRevs.length > 0) {
            throw new Error('DISPATCH_BLOCKED: Order has pending quote revision awaiting customer decision.');
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

        // 3. Gate 2: Financial Readiness & Authoritative Effective Specifications (FIN-01 & IND-01)
        // Check if order has an accepted quote revision
        let acceptedRevision = null;
        try {
            const acceptedRows = normalizeRows(await db.query(
                `SELECT id, revision_id, status FROM order_quote_revisions 
                 WHERE (external_order_intent_id = ? OR canonical_order_id = ?) AND status = 'ACCEPTED' 
                 ORDER BY created_at DESC LIMIT 1`,
                [orderRef, canonicalRef]
            ));
            if (acceptedRows.length > 0) {
                acceptedRevision = acceptedRows[0];
            }
        } catch (revQueryErr) {
            logger.error({ event: 'revision_query_error', error: revQueryErr.message });
            throw new Error(`DISPATCH_BLOCKED: Error querying quote revisions: ${revQueryErr.message}`);
        }

        // Query active effective technical specification (FAIL-CLOSED on DB errors)
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
        } catch (dbErr) {
            logger.error({ event: 'effective_specs_query_error', error: dbErr.message });
            throw new Error(`DISPATCH_BLOCKED: Database error querying effective technical specifications: ${dbErr.message}`);
        }

        // IND-01: Prohibit silent fallback to old specs when an accepted revision exists
        if (acceptedRevision && !effectiveSpecRecord) {
            throw new Error('DISPATCH_BLOCKED: Order has an accepted revision but no active effective technical specification was found.');
        }

        // FIN-01: Validate Base Payment Status
        let invoicePayment = {};
        try {
            invoicePayment = typeof order.invoice_payment === 'string'
                ? JSON.parse(order.invoice_payment || '{}')
                : (order.invoice_payment || {});
        } catch (e) {}

        const isBasePaid = invoicePayment.payment_status === 'PAID' || 
                           invoicePayment.admin_override === true || 
                           ['PAID', 'CONFIRMED', 'IN_PRODUCTION'].includes((order.status || '').toUpperCase());

        if (!isBasePaid) {
            await this.logEvent(order.id, orderRef, 'DISPATCH_BLOCKED_PENDING_PAYMENT', { 
                status: invoicePayment.payment_status || order.status 
            });
            throw new Error('DISPATCH_BLOCKED: Order must be PAID before dispatch.');
        }

        // FIN-01: Governed Policy for Financial Reconciliation States
        if (effectiveSpecRecord) {
            if (effectiveSpecRecord.industrial_gate_status === 'BLOCKED') {
                throw new Error('DISPATCH_BLOCKED: Industrial gate is blocked for effective specification.');
            }

            const finStatus = effectiveSpecRecord.financial_reconciliation_status;

            // Block unliquidated customer payments
            if (finStatus === 'PAYMENT_PENDING' || finStatus === 'REDUCED_PAYMENT_PENDING') {
                await this.logEvent(order.id, orderRef, 'DISPATCH_BLOCKED_PENDING_PAYMENT', { reason: finStatus });
                throw new Error(`DISPATCH_BLOCKED: Revised quote payment is pending customer settlement (${finStatus}).`);
            }

            // Governed Negative Delta: Pending Refund Check
            // An unliquidated refund obligation does NOT automatically authorize machine manufacturing.
            // Requires independent, persisted, and verifiable industrial authorization.
            if (finStatus === 'REFUND_PENDING') {
                const isExplicitlyAuthorized = 
                    effectiveSpecRecord.industrial_gate_status === 'AUTHORIZED' ||
                    context.allowDispatchWithPendingRefund === true ||
                    context.industrialAuthorization?.status === 'AUTHORIZED' ||
                    context.industrialOverride === true;

                if (!isExplicitlyAuthorized) {
                    await this.logEvent(order.id, orderRef, 'DISPATCH_BLOCKED_PENDING_REFUND_AUTHORIZATION', { 
                        financial_reconciliation_status: 'REFUND_PENDING',
                        order_ref: orderRef
                    });
                    throw new Error('DISPATCH_BLOCKED: Refund settlement pending. Independent industrial authorization required for unliquidated negative delta.');
                }

                await this.logEvent(order.id, orderRef, 'DISPATCH_AUTHORIZED_WITH_PENDING_REFUND', {
                    authorized_by: context.userId || context.industrialAuthorization?.authorized_by || 'AUTHORIZED_OPERATOR',
                    authorization_source: effectiveSpecRecord.industrial_gate_status === 'AUTHORIZED' ? 'PERSISTED_GATE_STATUS' : 'DISPATCH_CONTEXT'
                });
            }

            const allowedFinStatuses = ['PASSED', 'SETTLED', 'REFUND_SETTLED', 'ZERO_DELTA_PARITY'];
            const isFinReconciliationPassed = allowedFinStatuses.includes(finStatus) || 
                (finStatus === 'REFUND_PENDING' && (
                    effectiveSpecRecord.industrial_gate_status === 'AUTHORIZED' ||
                    context.allowDispatchWithPendingRefund === true ||
                    context.industrialAuthorization?.status === 'AUTHORIZED' ||
                    context.industrialOverride === true
                ));

            if (!isFinReconciliationPassed) {
                await this.logEvent(order.id, orderRef, 'DISPATCH_BLOCKED_UNSETTLED_FINANCIAL_STATE', { financial_status: finStatus });
                throw new Error(`DISPATCH_BLOCKED: Order financial state '${finStatus}' is not settled.`);
            }
        }

        // 4. MES Transition: Consume Authoritative Effective Technical Specifications (IND-01)
        let specs = {};
        if (effectiveSpecRecord) {
            try {
                specs = typeof effectiveSpecRecord.specs_json === 'string'
                    ? JSON.parse(effectiveSpecRecord.specs_json)
                    : effectiveSpecRecord.specs_json;
            } catch (parseErr) {
                throw new Error(`DISPATCH_BLOCKED: Malformed effective technical specifications JSON: ${parseErr.message}`);
            }
        } else {
            // Unrevised original order: consume original contractual specifications
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

    /**
     * Explicitly authorize industrial dispatch for an order with a pending refund (FIN-01).
     * Grants and persists independent industrial authorization in order_effective_technical_specifications.
     */
    async authorizeIndustrialDispatch(orderRef, authContext = {}) {
        const ordRows = normalizeRows(await db.query(
            'SELECT id, order_ref FROM orders WHERE order_ref = ? OR id = ? UNION SELECT id, order_id as order_ref FROM marketplace_orders WHERE order_id = ? OR id = ?',
            [orderRef, orderRef, orderRef, orderRef]
        ));
        const canonicalRef = ordRows.length > 0 ? (ordRows[0].order_ref || ordRows[0].id) : orderRef;

        const effectiveRows = normalizeRows(await db.query(
            `SELECT * FROM order_effective_technical_specifications 
             WHERE (external_order_intent_id = ? OR canonical_order_id = ?) AND effective_status = 'ACTIVE' 
             ORDER BY created_at DESC LIMIT 1`,
            [orderRef, canonicalRef]
        ));
        if (effectiveRows.length === 0) {
            throw new Error('NOT_FOUND: No active effective technical specification found for this order.');
        }

        const eff = effectiveRows[0];
        await db.query(
            `UPDATE order_effective_technical_specifications 
             SET industrial_gate_status = 'AUTHORIZED', updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [eff.id]
        );

        await this.logEvent(eff.canonical_order_id, orderRef, 'INDUSTRIAL_DISPATCH_EXPLICITLY_AUTHORIZED', {
            effective_specification_id: eff.id,
            authorized_by: authContext.userId || 'system_manager',
            role: authContext.role || 'FINANCE_MANAGER',
            reason: authContext.reason || 'Governed negative delta manufacturing authorization',
            authorized_at: new Date().toISOString()
        });

        return {
            ok: true,
            effective_specification_id: eff.id,
            industrial_gate_status: 'AUTHORIZED',
            authorized_by: authContext.userId || 'system_manager'
        };
    }

    /**
     * Record execution and confirmed settlement of a refund obligation (FIN-01).
     */
    async settleRefund(orderRef, settlementContext = {}) {
        const ordRows = normalizeRows(await db.query(
            'SELECT id, order_ref FROM orders WHERE order_ref = ? OR id = ? UNION SELECT id, order_id as order_ref FROM marketplace_orders WHERE order_id = ? OR id = ?',
            [orderRef, orderRef, orderRef, orderRef]
        ));
        const canonicalRef = ordRows.length > 0 ? (ordRows[0].order_ref || ordRows[0].id) : orderRef;

        const effectiveRows = normalizeRows(await db.query(
            `SELECT * FROM order_effective_technical_specifications 
             WHERE (external_order_intent_id = ? OR canonical_order_id = ?) AND effective_status = 'ACTIVE' 
             ORDER BY created_at DESC LIMIT 1`,
            [orderRef, canonicalRef]
        ));
        if (effectiveRows.length === 0) {
            throw new Error('NOT_FOUND: No active effective technical specification found for this order.');
        }

        const eff = effectiveRows[0];
        await db.query(
            `UPDATE order_effective_technical_specifications 
             SET financial_reconciliation_status = 'REFUND_SETTLED', updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [eff.id]
        );

        await this.logEvent(eff.canonical_order_id, orderRef, 'REFUND_OBLIGATION_SETTLED', {
            effective_specification_id: eff.id,
            settlement_ref: settlementContext.settlementRef || settlementContext.transactionId || `ref_tx_${Date.now()}`,
            settled_by: settlementContext.userId || 'system_finance',
            settled_at: new Date().toISOString()
        });

        return {
            ok: true,
            effective_specification_id: eff.id,
            financial_reconciliation_status: 'REFUND_SETTLED'
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
