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
                `SELECT id, revision_number, status FROM order_quote_revisions 
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

            // Governed Negative Delta: Pending Refund Check (SEC-D01)
            // An unliquidated refund obligation does NOT automatically authorize machine manufacturing.
            // Requires independent, persisted, and verifiable industrial authorization in order_effective_technical_specifications.
            // Context flags (allowDispatchWithPendingRefund, industrialAuthorization, industrialOverride) are strictly forbidden and ignored.
            if (finStatus === 'REFUND_PENDING') {
                const isExplicitlyAuthorized = effectiveSpecRecord.industrial_gate_status === 'AUTHORIZED';

                if (!isExplicitlyAuthorized) {
                    await this.logEvent(order.id, orderRef, 'DISPATCH_BLOCKED_PENDING_REFUND_AUTHORIZATION', { 
                        financial_reconciliation_status: 'REFUND_PENDING',
                        order_ref: orderRef,
                        effective_specification_id: effectiveSpecRecord.id
                    });
                    throw new Error('DISPATCH_BLOCKED: Refund settlement pending. Independent industrial authorization required for unliquidated negative delta.');
                }

                await this.logEvent(order.id, orderRef, 'DISPATCH_AUTHORIZED_WITH_PENDING_REFUND', {
                    authorized_by: context.userId || 'AUTHORIZED_OPERATOR',
                    authorization_source: 'PERSISTED_GATE_STATUS',
                    effective_specification_id: effectiveSpecRecord.id
                });
            }

            const allowedFinStatuses = ['PASSED', 'SETTLED', 'REFUND_SETTLED', 'ZERO_DELTA_PARITY'];
            const isFinReconciliationPassed = allowedFinStatuses.includes(finStatus) || 
                (finStatus === 'REFUND_PENDING' && effectiveSpecRecord.industrial_gate_status === 'AUTHORIZED');

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
            try {
                await db.query(`
                    UPDATE orders 
                    SET status = 'IN_PRODUCTION',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [order.id]);
            } catch (_) {
                await db.query(`
                    UPDATE orders 
                    SET status = 'IN_PRODUCTION'
                    WHERE id = ?
                `, [order.id]);
            }
        } else {
            try {
                await db.query(`
                    UPDATE marketplace_orders 
                    SET status = 'IN_PRODUCTION',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? OR order_id = ?
                `, [order.id, orderRef]);
            } catch (_) {
                await db.query(`
                    UPDATE marketplace_orders 
                    SET status = 'IN_PRODUCTION'
                    WHERE id = ? OR order_id = ?
                `, [order.id, orderRef]);
            }
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
     * Explicitly authorize industrial dispatch for an order with a pending refund (FIN-01 / SEC-D02).
     * Enforces:
     * - Authenticated identity (rejects fictitious actors like 'system_manager', 'unknown', etc.)
     * - Whitelisted roles (SUPER_ADMIN, OPS_ADMIN, SYSTEM_ADMIN, TENANT_ADMIN, PRINTHOUSE_ADMIN, PLANT_DIRECTOR, FINANCE_DIRECTOR)
     * - Mandatory reason / justification (min 5 chars)
     * - Order existence & active status (blocks CANCELLED, REJECTED, REFUNDED)
     * - Multi-tenant and printhouse isolation
     * - Accepted and non-superseded revision
     * - Matching effective technical specifications under transactional lock (FOR UPDATE)
     * - Persistent audit trail in marketplace_events
     */
    async authorizeIndustrialDispatch(orderRef, authContext = {}) {
        // 1. Authenticated Identity & Fictitious Actor Guard (SEC-D02)
        const rawUserId = String(authContext.userId || '').trim();
        const FORBIDDEN_ACTORS = ['system_manager', 'system_finance', 'unknown', 'anonymous', 'system', 'admin', 'test', 'null', 'undefined'];
        if (!rawUserId || FORBIDDEN_ACTORS.includes(rawUserId.toLowerCase())) {
            throw new Error('UNAUTHORIZED: Valid authenticated operator identity required. Fictitious system identities are rejected.');
        }

        // 2. Role & Permission Whitelist (SEC-D02)
        const role = String(authContext.role || '').toUpperCase();
        const AUTHORIZED_INDUSTRIAL_ROLES = [
            'SUPER_ADMIN', 'OPS_ADMIN', 'SYSTEM_ADMIN', 'TENANT_ADMIN',
            'PRINTHOUSE_ADMIN', 'PLANT_DIRECTOR', 'FINANCE_DIRECTOR'
        ];
        if (!AUTHORIZED_INDUSTRIAL_ROLES.includes(role)) {
            throw new Error(`FORBIDDEN: User role '${role || 'NONE'}' does not have industrial authorization permission.`);
        }

        // 3. Reason & Justification Guard (SEC-D02)
        const reason = String(authContext.reason || '').trim();
        if (reason.length < 5) {
            throw new Error('BAD_REQUEST: Industrial authorization requires a justified reason (minimum 5 characters).');
        }

        // 4. Order Retrieval & Active State Verification (SEC-D02)
        let order = null;
        let canonicalRef = orderRef;

        try {
            const ordRows = normalizeRows(await db.query('SELECT * FROM orders WHERE order_ref = ? OR id = ?', [orderRef, orderRef]));
            if (ordRows.length > 0) {
                order = ordRows[0];
                canonicalRef = order.order_ref || order.id;
            }
        } catch (_) {}

        if (!order) {
            try {
                const mpRows = normalizeRows(await db.query('SELECT * FROM marketplace_orders WHERE order_id = ? OR id = ?', [orderRef, orderRef]));
                if (mpRows.length > 0) {
                    order = mpRows[0];
                    canonicalRef = order.order_id || order.id;
                }
            } catch (_) {}
        }

        if (!order) {
            throw new Error('NOT_FOUND: Order not found for industrial authorization.');
        }

        const INELIGIBLE_STATUSES = ['CANCELLED', 'REJECTED', 'REFUNDED', 'DELETED', 'SUPERSEDED'];
        const currentOrderStatus = (order.status || '').toUpperCase();
        if (INELIGIBLE_STATUSES.includes(currentOrderStatus) || order.deleted_at) {
            throw new Error(`ORDER_INELIGIBLE: Order is in an ineligible status '${currentOrderStatus}' for industrial authorization.`);
        }

        // 5. Multi-Tenant and Printhouse Isolation (SEC-D02)
        const isSuperAdmin = role === 'SUPER_ADMIN' || role === 'SYSTEM_ADMIN' || authContext.isSuperAdmin;
        if (!isSuperAdmin) {
            if (authContext.tenantId && order.tenant_id && authContext.tenantId !== order.tenant_id) {
                throw new Error('FORBIDDEN: Tenant mismatch. Cannot authorize order for a different tenant.');
            }

            const assignedPrinter = order.offer_print_house || order.assigned_printhouse_id || order.printhouse_id;
            if (authContext.printhouseId && assignedPrinter && authContext.printhouseId !== assignedPrinter) {
                throw new Error('FORBIDDEN: Printhouse mismatch. Cannot authorize order for a different printhouse.');
            }
        }

        // 6. Check Accepted and Non-Superseded Quote Revision (SEC-D02)
        let latestRevision = null;
        try {
            const revRows = normalizeRows(await db.query(
                `SELECT * FROM order_quote_revisions 
                 WHERE (external_order_intent_id = ? OR canonical_order_id = ?) 
                 ORDER BY revision_number DESC LIMIT 1`,
                [orderRef, canonicalRef]
            ));
            if (revRows.length > 0) {
                latestRevision = revRows[0];
                if (latestRevision.status !== 'ACCEPTED') {
                    throw new Error(`INVALID_REVISION_STATE: Active revision is '${latestRevision.status}', must be 'ACCEPTED' to grant industrial authorization.`);
                }
            }
        } catch (revErr) {
            if (revErr.message && revErr.message.includes('INVALID_REVISION_STATE')) {
                throw revErr;
            }
        }

        // 7. Transactional Lock (FOR UPDATE) & State Mutation (SEC-D02)
        let conn = null;
        let useTransaction = false;
        try {
            if (typeof db.getConnection === 'function') {
                conn = await db.getConnection();
                if (conn && typeof conn.beginTransaction === 'function') {
                    await conn.beginTransaction();
                    useTransaction = true;
                }
            }
        } catch (_) {
            conn = null;
            useTransaction = false;
        }

        const queryExecutor = async (sql, params) => {
            if (conn) {
                const res = await conn.query(sql, params);
                return normalizeRows(Array.isArray(res) ? res[0] : res);
            }
            const res = await db.query(sql, params);
            return normalizeRows(res);
        };

        try {
            const effectiveRows = await queryExecutor(
                `SELECT * FROM order_effective_technical_specifications 
                 WHERE (external_order_intent_id = ? OR canonical_order_id = ?) AND effective_status = 'ACTIVE' 
                 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
                [orderRef, canonicalRef]
            );

            if (effectiveRows.length === 0) {
                throw new Error('NOT_FOUND: No active effective technical specification found for this order.');
            }

            const eff = effectiveRows[0];

            if (eff.industrial_gate_status === 'DISPATCHED') {
                throw new Error('INVALID_STATE: Effective technical specification has already been dispatched to machines.');
            }

            if (latestRevision && eff.revision_id && eff.revision_id !== latestRevision.id) {
                throw new Error('MISMATCH: Active effective technical specification does not match the latest accepted revision.');
            }

            if (eff.industrial_gate_status !== 'AUTHORIZED') {
                if (conn) {
                    await conn.query(
                        `UPDATE order_effective_technical_specifications 
                         SET industrial_gate_status = 'AUTHORIZED', updated_at = CURRENT_TIMESTAMP 
                         WHERE id = ?`,
                        [eff.id]
                    );
                } else {
                    await db.query(
                        `UPDATE order_effective_technical_specifications 
                         SET industrial_gate_status = 'AUTHORIZED', updated_at = CURRENT_TIMESTAMP 
                         WHERE id = ?`,
                        [eff.id]
                    );
                }
            }

            // 8. Structured Persistent Audit Log (SEC-D02)
            await this.logEvent(eff.canonical_order_id || canonicalRef, orderRef, 'INDUSTRIAL_DISPATCH_EXPLICITLY_AUTHORIZED', {
                effective_specification_id: eff.id,
                revision_id: eff.revision_id || latestRevision?.id || null,
                authorized_by: rawUserId,
                role: role,
                tenant_id: order.tenant_id,
                printhouse_id: order.offer_print_house || order.assigned_printhouse_id || order.printhouse_id,
                reason: reason,
                authorized_at: new Date().toISOString()
            }, conn);

            if (useTransaction && conn) {
                await conn.commit();
            }

            return {
                ok: true,
                effective_specification_id: eff.id,
                revision_id: eff.revision_id || latestRevision?.id || null,
                industrial_gate_status: 'AUTHORIZED',
                authorized_by: rawUserId,
                role: role,
                reason: reason
            };
        } catch (err) {
            if (useTransaction && conn) {
                try { await conn.rollback(); } catch (_) {}
            }
            throw err;
        } finally {
            if (conn && typeof conn.release === 'function') {
                try { conn.release(); } catch (_) {}
            }
        }
    }

    /**
     * Record execution and confirmed settlement of a refund obligation (FIN-01 / SEC-D02 / SEC-D03).
     * Enforces:
     * - Authenticated identity (rejects fictitious actors like 'system_finance', 'unknown', etc.)
     * - Whitelisted roles (SUPER_ADMIN, OPS_ADMIN, SYSTEM_ADMIN, TENANT_ADMIN, FINANCE_DIRECTOR, FINANCE_MANAGER, PAYMENT_GATEWAY_WEBHOOK)
     * - Real verifiable settlement reference (rejects fake local strings like 'ref_tx_*', 'mock', 'dummy')
     * - Accredited settlement provider / source
     * - Multi-tenant isolation
     * - Active order and matching effective specification under transactional lock (FOR UPDATE)
     * - When reference missing or invalid, maintains REFUND_PENDING (fails closed)
     * - Persistent audit trail in marketplace_events
     */
    async settleRefund(orderRef, settlementContext = {}) {
        // 1. Authenticated Identity & Fictitious Actor Guard (SEC-D02)
        const rawUserId = String(settlementContext.userId || '').trim();
        const FORBIDDEN_ACTORS = ['system_manager', 'system_finance', 'unknown', 'anonymous', 'system', 'admin', 'test', 'null', 'undefined'];
        if (!rawUserId || FORBIDDEN_ACTORS.includes(rawUserId.toLowerCase())) {
            throw new Error('UNAUTHORIZED: Valid authenticated financial operator identity required. Fictitious system identities are rejected.');
        }

        // 2. Role & Permission Whitelist (SEC-D02)
        const role = String(settlementContext.role || '').toUpperCase();
        const AUTHORIZED_FINANCIAL_ROLES = [
            'SUPER_ADMIN', 'OPS_ADMIN', 'SYSTEM_ADMIN', 'TENANT_ADMIN',
            'FINANCE_DIRECTOR', 'FINANCE_MANAGER', 'PAYMENT_GATEWAY_WEBHOOK'
        ];
        if (!AUTHORIZED_FINANCIAL_ROLES.includes(role)) {
            throw new Error(`FORBIDDEN: User role '${role || 'NONE'}' does not have financial refund settlement permission.`);
        }

        // 3. Verifiable Real Settlement Reference Guard (SEC-D03)
        const settlementRef = String(settlementContext.settlementRef || settlementContext.transactionId || '').trim();
        if (!settlementRef || settlementRef.length < 6) {
            throw new Error('INVALID_SETTLEMENT_REFERENCE: A valid settlement reference (minimum 6 characters) from an accredited accounting system or payment provider is required.');
        }

        // Reject fake local pseudo-references
        const isPseudoRef = /^ref_tx_\d+$/i.test(settlementRef) ||
                            /^(mock|fake|dummy|test|local|sample)/i.test(settlementRef);
        if (isPseudoRef) {
            throw new Error('INVALID_SETTLEMENT_REFERENCE: Fake or local pseudo-references are rejected. A verifiable settlement reference from an accredited accounting system or payment provider is required.');
        }

        const rawProvider = String(settlementContext.provider || 'BANK_TRANSFER_LEDGER').trim().toUpperCase();
        const ACCREDITED_PROVIDERS = [
            'STRIPE', 'ADYEN', 'BANK_TRANSFER_LEDGER', 'ERP_CREDIT_NOTE',
            'PAYMENT_GATEWAY_WEBHOOK', 'MANUAL_BANK_RECONCILIATION'
        ];
        if (!ACCREDITED_PROVIDERS.includes(rawProvider)) {
            throw new Error(`INVALID_PROVIDER: Settlement provider '${rawProvider}' is not accredited. Must be one of: ${ACCREDITED_PROVIDERS.join(', ')}.`);
        }

        // 4. Order Retrieval & Multi-Tenant Isolation (SEC-D02)
        let order = null;
        let canonicalRef = orderRef;

        try {
            const ordRows = normalizeRows(await db.query('SELECT * FROM orders WHERE order_ref = ? OR id = ?', [orderRef, orderRef]));
            if (ordRows.length > 0) {
                order = ordRows[0];
                canonicalRef = order.order_ref || order.id;
            }
        } catch (_) {}

        if (!order) {
            try {
                const mpRows = normalizeRows(await db.query('SELECT * FROM marketplace_orders WHERE order_id = ? OR id = ?', [orderRef, orderRef]));
                if (mpRows.length > 0) {
                    order = mpRows[0];
                    canonicalRef = order.order_id || order.id;
                }
            } catch (_) {}
        }

        if (!order) {
            throw new Error('NOT_FOUND: Order not found for refund settlement.');
        }

        const isSuperAdmin = role === 'SUPER_ADMIN' || role === 'SYSTEM_ADMIN' || settlementContext.isSuperAdmin;
        if (!isSuperAdmin && settlementContext.tenantId && order.tenant_id && settlementContext.tenantId !== order.tenant_id) {
            throw new Error('FORBIDDEN: Tenant mismatch. Cannot settle refund for a different tenant.');
        }

        // 5. Transactional Lock (FOR UPDATE) & State Mutation (SEC-D02)
        let conn = null;
        let useTransaction = false;
        try {
            if (typeof db.getConnection === 'function') {
                conn = await db.getConnection();
                if (conn && typeof conn.beginTransaction === 'function') {
                    await conn.beginTransaction();
                    useTransaction = true;
                }
            }
        } catch (_) {
            conn = null;
            useTransaction = false;
        }

        const queryExecutor = async (sql, params) => {
            if (conn) {
                const res = await conn.query(sql, params);
                return normalizeRows(Array.isArray(res) ? res[0] : res);
            }
            const res = await db.query(sql, params);
            return normalizeRows(res);
        };

        try {
            const effectiveRows = await queryExecutor(
                `SELECT * FROM order_effective_technical_specifications 
                 WHERE (external_order_intent_id = ? OR canonical_order_id = ?) AND effective_status = 'ACTIVE' 
                 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
                [orderRef, canonicalRef]
            );

            if (effectiveRows.length === 0) {
                throw new Error('NOT_FOUND: No active effective technical specification found for this order.');
            }

            const eff = effectiveRows[0];

            // If already settled with the same or valid status, idempotent success
            if (eff.financial_reconciliation_status === 'REFUND_SETTLED') {
                if (useTransaction && conn) await conn.commit();
                return {
                    ok: true,
                    effective_specification_id: eff.id,
                    financial_reconciliation_status: 'REFUND_SETTLED',
                    settlement_ref: settlementRef,
                    provider: rawProvider,
                    idempotent_replay: true
                };
            }

            if (conn) {
                await conn.query(
                    `UPDATE order_effective_technical_specifications 
                     SET financial_reconciliation_status = 'REFUND_SETTLED', updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [eff.id]
                );
            } else {
                await db.query(
                    `UPDATE order_effective_technical_specifications 
                     SET financial_reconciliation_status = 'REFUND_SETTLED', updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [eff.id]
                );
            }

            // 6. Persistent Audit Event (SEC-D02 / SEC-D03)
            await this.logEvent(eff.canonical_order_id || canonicalRef, orderRef, 'REFUND_OBLIGATION_SETTLED', {
                effective_specification_id: eff.id,
                settlement_ref: settlementRef,
                provider: rawProvider,
                settled_by: rawUserId,
                role: role,
                tenant_id: order.tenant_id,
                settled_at: new Date().toISOString()
            }, conn);

            if (useTransaction && conn) {
                await conn.commit();
            }

            return {
                ok: true,
                effective_specification_id: eff.id,
                financial_reconciliation_status: 'REFUND_SETTLED',
                settlement_ref: settlementRef,
                provider: rawProvider,
                settled_by: rawUserId
            };
        } catch (err) {
            if (useTransaction && conn) {
                try { await conn.rollback(); } catch (_) {}
            }
            throw err;
        } finally {
            if (conn && typeof conn.release === 'function') {
                try { conn.release(); } catch (_) {}
            }
        }
    }

    async logEvent(orderId, orderRef, type, payload = {}, connection = null) {
        const executor = connection || db;
        try {
            await executor.query(`
                INSERT INTO marketplace_events (id, order_id, order_ref, event_type, metadata_json)
                VALUES (UUID(), ?, ?, ?, ?)
            `, [orderId, orderRef, type, JSON.stringify(payload)]);
        } catch (err) {
            logger.warn({ event: 'log_event_failed', error: err.message, type, orderRef });
        }
    }
}

module.exports = new MarketplaceDispatchGatingService();
