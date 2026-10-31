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
const trustedFinancialAdapter = require('./TrustedFinancialSettlementAdapter');

function normalizeRows(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.rows)) return res.rows;
    return [];
}

function isProductionEnvironment() {
    const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
    const pposEnv = (process.env.PPOS_ENVIRONMENT || '').toLowerCase();
    return nodeEnv === 'production' || pposEnv === 'production';
}

class MarketplaceDispatchGatingService {
    constructor(financialAdapter = null) {
        this.trustedFinancialAdapter = financialAdapter || trustedFinancialAdapter;
    }

    setFinancialAdapter(adapter) {
        if (isProductionEnvironment()) {
            throw new Error('ADAPTER_SUBSTITUTION_FORBIDDEN_IN_PRODUCTION: Dynamic financial adapter substitution is strictly forbidden in production. Production adapter selection is immutable.');
        }
        this.trustedFinancialAdapter = adapter;
    }

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
     * Explicitly authorize industrial dispatch for an order with a pending refund (FIN-01 / SEC-D02R / SEC-D04R).
     * Enforces:
     * - Authenticated identity (rejects fictitious actors like 'system_manager', 'unknown', etc.)
     * - Whitelisted roles (SUPER_ADMIN, OPS_ADMIN, SYSTEM_ADMIN, TENANT_ADMIN, PRINTHOUSE_ADMIN, PLANT_DIRECTOR, FINANCE_DIRECTOR)
     * - Mandatory reason / justification (min 5 chars)
     * - Mandatory tenant & printhouse scope for non-global operators (no optional/bypassed tenancy)
     * - Mandatory fail-closed MySQL transactional connection (zero fallback to non-transactional db.query)
     * - State verification under transactional lock (FOR UPDATE): order status, tenancy, revision, effective specs
     * - Persistent audit trail in marketplace_events within the SAME transaction (fails closed on error)
     */
    async authorizeIndustrialDispatch(orderRef, authContext = {}) {
        // 1. Mandatory Authenticated Operator Identity (SEC-D02R)
        const rawUserId = String(authContext.userId || '').trim();
        const FORBIDDEN_ACTORS = ['system_manager', 'system_finance', 'unknown', 'anonymous', 'system', 'admin', 'test', 'null', 'undefined'];
        if (!rawUserId || FORBIDDEN_ACTORS.includes(rawUserId.toLowerCase())) {
            throw new Error('UNAUTHORIZED: Valid authenticated operator identity required. Fictitious system identities are rejected.');
        }

        // 2. Role & Specific Permission Whitelist (SEC-D02R)
        const role = String(authContext.role || '').toUpperCase();
        const AUTHORIZED_INDUSTRIAL_ROLES = [
            'SUPER_ADMIN', 'OPS_ADMIN', 'SYSTEM_ADMIN', 'TENANT_ADMIN',
            'PRINTHOUSE_ADMIN', 'PLANT_DIRECTOR', 'FINANCE_DIRECTOR'
        ];
        if (!AUTHORIZED_INDUSTRIAL_ROLES.includes(role)) {
            throw new Error(`FORBIDDEN: User role '${role || 'NONE'}' does not have industrial authorization permission.`);
        }

        // Self-declared privileges guard: Only authentic SUPER_ADMIN or SYSTEM_ADMIN role is global.
        // authContext.isSuperAdmin is strictly ignored unless role is genuinely a global admin role.
        const isGlobalAdmin = role === 'SUPER_ADMIN' || role === 'SYSTEM_ADMIN';

        // 3. Mandatory Tenant & Printhouse Scope for Non-Global Operators (SEC-D02R)
        const opTenantId = authContext.tenantId ? String(authContext.tenantId).trim() : '';
        const opPrinthouseId = authContext.printhouseId ? String(authContext.printhouseId).trim() : '';

        if (!isGlobalAdmin) {
            if (!opTenantId) {
                throw new Error('FORBIDDEN: Authenticated tenant context is mandatory for operator.');
            }
            if (['PRINTHOUSE_ADMIN', 'PLANT_DIRECTOR'].includes(role) && !opPrinthouseId) {
                throw new Error('FORBIDDEN: Authenticated printhouse context is mandatory for printhouse operator.');
            }
        }

        // 4. Mandatory Reason & Justification Guard (min 5 chars)
        const reason = String(authContext.reason || authContext.justification || '').trim();
        if (reason.length < 5) {
            throw new Error('BAD_REQUEST: Industrial authorization requires a justified reason (minimum 5 characters).');
        }

        // 5. Mandatory Fail-Closed MySQL Transaction Acquisition (SEC-D04R)
        if (!db || typeof db.getConnection !== 'function') {
            throw new Error('DATABASE_CONNECTION_ERROR: Transactional connection required. Database client does not support transactions.');
        }

        let conn = null;
        try {
            conn = await db.getConnection();
        } catch (connErr) {
            throw new Error(`DATABASE_CONNECTION_ERROR: Failed to acquire transactional connection: ${connErr.message}`);
        }

        if (!conn || typeof conn.beginTransaction !== 'function') {
            throw new Error('DATABASE_CONNECTION_ERROR: Acquired connection does not support transactions.');
        }

        await conn.beginTransaction();

        try {
            const runTxQuery = async (sql, params = []) => {
                const res = await conn.query(sql, params);
                if (!res) return [];
                if (Array.isArray(res)) {
                    return normalizeRows(Array.isArray(res[0]) ? res[0] : res);
                }
                return normalizeRows(res);
            };

            // 6. Query Order under Lock (SELECT ... FOR UPDATE) (SEC-D04R)
            let order = null;
            let canonicalRef = orderRef;

            try {
                let ordRows = await runTxQuery('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderRef]);
                if (ordRows.length > 0) {
                    order = ordRows[0];
                    canonicalRef = order.order_ref || order.id;
                }
            } catch (_) {}

            if (!order) {
                try {
                    let mpRows = await runTxQuery('SELECT * FROM marketplace_orders WHERE (order_id = ? OR id = ?) FOR UPDATE', [orderRef, orderRef]);
                    if (mpRows.length > 0) {
                        order = mpRows[0];
                        canonicalRef = order.order_id || order.id;
                    }
                } catch (_) {}
            }

            if (!order) {
                throw new Error('NOT_FOUND: Order not found for industrial authorization.');
            }

            // Verify order active state under lock
            const INELIGIBLE_STATUSES = ['CANCELLED', 'REJECTED', 'REFUNDED', 'DELETED', 'SUPERSEDED'];
            const currentOrderStatus = (order.status || '').toUpperCase();
            if (INELIGIBLE_STATUSES.includes(currentOrderStatus) || order.deleted_at) {
                throw new Error(`ORDER_INELIGIBLE: Order is in an ineligible status '${currentOrderStatus}' for industrial authorization.`);
            }

            // Verify Tenancy and Printhouse under lock against the order (SEC-D02R)
            if (!isGlobalAdmin) {
                if (order.tenant_id && opTenantId !== order.tenant_id) {
                    throw new Error('FORBIDDEN: Tenant mismatch. Cannot authorize order for a different tenant.');
                }
                const assignedPrinter = order.offer_print_house || order.assigned_printhouse_id || order.printhouse_id;
                if (opPrinthouseId && assignedPrinter && opPrinthouseId !== assignedPrinter) {
                    throw new Error('FORBIDDEN: Printhouse mismatch. Cannot authorize order for a different printhouse.');
                }
            }

            // 7. Verify Latest Revision under Lock (SEC-D04R)
            let latestRevision = null;
            const revRows = await runTxQuery(
                `SELECT * FROM order_quote_revisions 
                 WHERE (external_order_intent_id = ? OR canonical_order_id = ?) 
                 ORDER BY revision_number DESC LIMIT 1 FOR UPDATE`,
                [orderRef, canonicalRef]
            );
            if (revRows.length > 0) {
                latestRevision = revRows[0];
                if (latestRevision.status !== 'ACCEPTED') {
                    throw new Error(`INVALID_REVISION_STATE: Active revision is '${latestRevision.status}', must be 'ACCEPTED' to grant industrial authorization.`);
                }
            }

            // 8. Verify Active Effective Technical Specification under Lock (SEC-D04R)
            const effectiveRows = await runTxQuery(
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

            // State mutation under lock
            if (eff.industrial_gate_status !== 'AUTHORIZED') {
                await conn.query(
                    `UPDATE order_effective_technical_specifications 
                     SET industrial_gate_status = 'AUTHORIZED', updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [eff.id]
                );
            }

            // 9. Structured Audit Log in the SAME transaction (SEC-D04R)
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

            await conn.commit();

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
            if (conn) {
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
     * Record execution and confirmed settlement of a refund obligation (FIN-01 / SEC-D02R / SEC-D03R / SEC-D04R).
     * Enforces:
     * - Authenticated identity (rejects fictitious actors like 'system_finance', 'unknown', etc.)
     * - Whitelisted roles (SUPER_ADMIN, OPS_ADMIN, SYSTEM_ADMIN, TENANT_ADMIN, PRINTHOUSE_ADMIN, FINANCE_DIRECTOR, FINANCE_MANAGER, PAYMENT_GATEWAY_WEBHOOK)
     * - Mandatory tenant & printhouse scope for non-global operators
     * - Real verifiable settlement reference (rejects fake local strings like 'ref_tx_*', 'mock', 'dummy')
     * - Accredited settlement provider whitelist
     * - Mandatory fail-closed MySQL transactional connection (zero fallback)
     * - Active order and matching effective specification under transactional lock (FOR UPDATE)
     * - Verifiable external proof / evidence validation: obligation ID, amount, currency, status, provider-specific fields
     * - When reference or verifiable evidence is missing/invalid, maintains REFUND_PENDING (SETTLEMENT_INTEGRATION_PENDING fail-closed)
     * - Anti-collision reference idempotency check across marketplace events
     * - Atomic persistent audit trail in marketplace_events within the SAME transaction
     */
    async settleRefund(orderRef, settlementContext = {}) {
        // 1. Mandatory Authenticated Operator Identity (SEC-D02R)
        const rawUserId = String(settlementContext.userId || '').trim();
        const FORBIDDEN_ACTORS = ['system_manager', 'system_finance', 'unknown', 'anonymous', 'system', 'admin', 'test', 'null', 'undefined'];
        if (!rawUserId || FORBIDDEN_ACTORS.includes(rawUserId.toLowerCase())) {
            throw new Error('UNAUTHORIZED: Valid authenticated financial operator identity required. Fictitious system identities are rejected.');
        }

        // 2. Role & Specific Permission Whitelist (SEC-D02R)
        const role = String(settlementContext.role || '').toUpperCase();
        const AUTHORIZED_FINANCIAL_ROLES = [
            'SUPER_ADMIN', 'OPS_ADMIN', 'SYSTEM_ADMIN', 'TENANT_ADMIN',
            'PRINTHOUSE_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER', 'PAYMENT_GATEWAY_WEBHOOK'
        ];
        if (!AUTHORIZED_FINANCIAL_ROLES.includes(role)) {
            throw new Error(`FORBIDDEN: User role '${role || 'NONE'}' does not have financial refund settlement permission.`);
        }

        // Self-declared privileges guard: Only authentic SUPER_ADMIN or SYSTEM_ADMIN role is global
        const isGlobalAdmin = role === 'SUPER_ADMIN' || role === 'SYSTEM_ADMIN';

        // 3. Mandatory Tenant & Printhouse Scope for Non-Global Operators (SEC-D02R)
        const opTenantId = settlementContext.tenantId ? String(settlementContext.tenantId).trim() : '';
        const opPrinthouseId = settlementContext.printhouseId ? String(settlementContext.printhouseId).trim() : '';

        if (!isGlobalAdmin) {
            if (!opTenantId) {
                throw new Error('FORBIDDEN: Authenticated tenant context is mandatory for financial operator.');
            }
            if (['PRINTHOUSE_ADMIN'].includes(role) && !opPrinthouseId) {
                throw new Error('FORBIDDEN: Authenticated printhouse context is mandatory for printhouse financial operator.');
            }
        }

        // 4. Verifiable Settlement Reference Guard (SEC-D03R)
        const settlementRef = String(settlementContext.settlementRef || settlementContext.transactionId || '').trim();
        if (!settlementRef || settlementRef.length < 6) {
            throw new Error('INVALID_SETTLEMENT_REFERENCE: A valid settlement reference (minimum 6 characters) is required.');
        }

        // Reject fake local pseudo-references
        const isPseudoRef = /^ref_tx_\d+$/i.test(settlementRef) ||
                            /^(mock|fake|dummy|test|local|sample)/i.test(settlementRef);
        if (isPseudoRef) {
            throw new Error('INVALID_SETTLEMENT_REFERENCE: Fake or local pseudo-references are rejected. A verifiable settlement reference from an accredited accounting system or payment provider is required.');
        }

        // Accredited Provider Whitelist
        const rawProvider = String(settlementContext.provider || '').trim().toUpperCase();
        const ACCREDITED_PROVIDERS = [
            'STRIPE', 'ADYEN', 'BANK_TRANSFER_LEDGER', 'ERP_CREDIT_NOTE',
            'PAYMENT_GATEWAY_WEBHOOK', 'MANUAL_BANK_RECONCILIATION',
            'TEST_TRUSTED_SETTLEMENT_ADAPTER'
        ];
        if (!rawProvider || !ACCREDITED_PROVIDERS.includes(rawProvider)) {
            throw new Error(`INVALID_PROVIDER: Settlement provider '${rawProvider || 'NONE'}' is not accredited. Must be one of: ${ACCREDITED_PROVIDERS.join(', ')}.`);
        }

        // 5. Mandatory Fail-Closed MySQL Transaction Acquisition (SEC-D04R)
        if (!db || typeof db.getConnection !== 'function') {
            throw new Error('DATABASE_CONNECTION_ERROR: Transactional connection required. Database client does not support transactions.');
        }

        let conn = null;
        try {
            conn = await db.getConnection();
        } catch (connErr) {
            throw new Error(`DATABASE_CONNECTION_ERROR: Failed to acquire transactional connection: ${connErr.message}`);
        }

        if (!conn || typeof conn.beginTransaction !== 'function') {
            throw new Error('DATABASE_CONNECTION_ERROR: Acquired connection does not support transactions.');
        }

        await conn.beginTransaction();

        try {
            const runTxQuery = async (sql, params = []) => {
                const res = await conn.query(sql, params);
                if (!res) return [];
                if (Array.isArray(res)) {
                    return normalizeRows(Array.isArray(res[0]) ? res[0] : res);
                }
                return normalizeRows(res);
            };

            // 6. Query Order under Lock (SELECT ... FOR UPDATE) (SEC-D04R)
            let order = null;
            let canonicalRef = orderRef;

            try {
                let ordRows = await runTxQuery('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderRef]);
                if (ordRows.length > 0) {
                    order = ordRows[0];
                    canonicalRef = order.order_ref || order.id;
                }
            } catch (_) {}

            if (!order) {
                try {
                    let mpRows = await runTxQuery('SELECT * FROM marketplace_orders WHERE (order_id = ? OR id = ?) FOR UPDATE', [orderRef, orderRef]);
                    if (mpRows.length > 0) {
                        order = mpRows[0];
                        canonicalRef = order.order_id || order.id;
                    }
                } catch (_) {}
            }

            if (!order) {
                throw new Error('NOT_FOUND: Order not found for refund settlement.');
            }

            // Verify Tenancy and Printhouse under lock against the order (SEC-D02R)
            if (!isGlobalAdmin) {
                if (order.tenant_id && opTenantId !== order.tenant_id) {
                    throw new Error('FORBIDDEN: Tenant mismatch. Cannot settle refund for a different tenant.');
                }
                const assignedPrinter = order.offer_print_house || order.assigned_printhouse_id || order.printhouse_id;
                if (opPrinthouseId && assignedPrinter && opPrinthouseId !== assignedPrinter) {
                    throw new Error('FORBIDDEN: Printhouse mismatch. Cannot settle refund for a different printhouse.');
                }
            }

            // 7. Query Active Effective Technical Specification under Lock (SEC-D04R)
            const effectiveRows = await runTxQuery(
                `SELECT * FROM order_effective_technical_specifications 
                 WHERE (external_order_intent_id = ? OR canonical_order_id = ?) AND effective_status = 'ACTIVE' 
                 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
                [orderRef, canonicalRef]
            );

            if (effectiveRows.length === 0) {
                throw new Error('NOT_FOUND: No active effective technical specification found for this order.');
            }

            const eff = effectiveRows[0];

            // Idempotency & Replay Verification against Authoritative Table 171 (BUDGET-02D-01R5F)
            if (eff.financial_reconciliation_status === 'REFUND_SETTLED') {
                let persistentRecord = null;

                try {
                    const voucherRows = await runTxQuery(
                        `SELECT * FROM financial_settlement_vouchers 
                         WHERE (canonical_order_id = ? OR canonical_order_id = ? OR effective_specification_id = ?) 
                         ORDER BY settled_at DESC LIMIT 1 FOR UPDATE`,
                        [canonicalRef, order.id, eff.id]
                    );
                    if (voucherRows.length > 0) {
                        persistentRecord = voucherRows[0];
                    }
                } catch (dbErr) {
                    throw new Error(`DATABASE_CONNECTION_ERROR: Failed to retrieve settlement voucher for replay: ${dbErr.message}`);
                }

                // Strictly fail closed if table 171 record is missing; NO reconstruction from legacy JSON events (BUDGET-02D-01R5F)
                if (!persistentRecord) {
                    throw new Error('HISTORICAL_SETTLEMENT_RECONCILIATION_REQUIRED: Order is marked REFUND_SETTLED but lacks an authoritative financial_settlement_vouchers record. Automatic reconstruction from legacy JSON events is forbidden. Manual/verified migration required.');
                }

                // 1. Mandatory Settlement Reference Match
                const persistentRef = String(persistentRecord.settlement_ref || '').trim();
                if (!settlementRef || persistentRef !== settlementRef) {
                    throw new Error(`SETTLEMENT_MISMATCH: Order has already been settled with reference '${persistentRef}'. Cannot replay with different or missing reference '${settlementRef}'.`);
                }

                // 2. Mandatory Tenant Match
                const callerTenantId = String(settlementContext.tenantId || '').trim();
                const persistentTenantId = String(persistentRecord.tenant_id || order.tenant_id || '').trim();
                if (!callerTenantId || (persistentTenantId && callerTenantId !== persistentTenantId)) {
                    throw new Error(`SETTLEMENT_MISMATCH: Tenant mismatch for settled order ('${persistentTenantId}' vs '${callerTenantId}').`);
                }

                // 3. Mandatory Provider Match
                const persistentProvider = String(persistentRecord.provider || '').trim().toUpperCase();
                if (!rawProvider || persistentProvider !== rawProvider) {
                    throw new Error(`SETTLEMENT_MISMATCH: Provider mismatch for settled order ('${persistentProvider}' vs '${rawProvider}').`);
                }

                // 4. Mandatory Voucher ID (Comprobante) Match
                const callerVoucherId = String(
                    settlementContext.voucher_id || settlementContext.voucherId ||
                    (settlementContext.evidence && (settlementContext.evidence.voucher_id || settlementContext.evidence.voucherId)) ||
                    (settlementContext.proof && (settlementContext.proof.voucher_id || settlementContext.proof.voucherId)) ||
                    ''
                ).trim();
                const persistentVoucher = String(persistentRecord.provider_voucher_id || '').trim();
                if (!callerVoucherId) {
                    throw new Error('SETTLEMENT_MISMATCH: Voucher identifier is mandatory for replay verification. Absence of fields cannot be interpreted as a match.');
                }
                if (callerVoucherId !== persistentVoucher) {
                    throw new Error(`SETTLEMENT_MISMATCH: Voucher mismatch for settled order ('${persistentVoucher}' vs '${callerVoucherId}').`);
                }

                // 5. Mandatory Obligation ID Match
                const callerObligationId = String(settlementContext.obligationId || settlementContext.obligation_id || '').trim();
                const persistentObligation = String(persistentRecord.obligation_id || '').trim();
                if (!callerObligationId) {
                    throw new Error('SETTLEMENT_MISMATCH: Obligation ID is mandatory for replay verification. Absence of fields cannot be interpreted as a match.');
                }
                if (callerObligationId !== persistentObligation) {
                    throw new Error(`SETTLEMENT_MISMATCH: Obligation mismatch for settled order ('${persistentObligation}' vs '${callerObligationId}').`);
                }

                // 6. Mandatory Amount Match in minor units (cents)
                if (settlementContext.amount === undefined || settlementContext.amount === null || settlementContext.amount === '') {
                    throw new Error('SETTLEMENT_MISMATCH: Settlement amount is mandatory for replay verification. Absence of fields cannot be interpreted as a match.');
                }
                const callerAmount = Math.abs(Number(settlementContext.amount));
                if (isNaN(callerAmount)) {
                    throw new Error('SETTLEMENT_MISMATCH: Settlement amount is not a valid number.');
                }
                const callerMinor = Math.round(callerAmount * 100);
                const persistentMinor = Number(persistentRecord.amount_cents);
                if (callerMinor !== persistentMinor) {
                    throw new Error(`SETTLEMENT_MISMATCH: Settlement amount mismatch for settled order (${callerAmount} vs ${persistentMinor / 100}).`);
                }

                // 7. Mandatory Currency Match
                if (!settlementContext.currency || !String(settlementContext.currency).trim()) {
                    throw new Error('SETTLEMENT_MISMATCH: Settlement currency is mandatory for replay verification. Absence of fields cannot be interpreted as a match.');
                }
                const callerCurrency = String(settlementContext.currency).trim().toUpperCase();
                const persistentCurrency = String(persistentRecord.currency || '').trim().toUpperCase();
                if (callerCurrency !== persistentCurrency) {
                    throw new Error(`SETTLEMENT_MISMATCH: Settlement currency mismatch for settled order ('${persistentCurrency}' vs '${callerCurrency}').`);
                }

                // 8. Mandatory Beneficiary Match
                if (!settlementContext.beneficiary || !String(settlementContext.beneficiary).trim()) {
                    throw new Error('SETTLEMENT_MISMATCH: Settlement beneficiary is mandatory for replay verification. Absence of fields cannot be interpreted as a match.');
                }
                const callerBeneficiary = String(settlementContext.beneficiary).trim().toLowerCase();
                const persistentBeneficiary = String(persistentRecord.beneficiary || '').trim().toLowerCase();
                if (callerBeneficiary !== persistentBeneficiary) {
                    throw new Error(`SETTLEMENT_MISMATCH: Settlement beneficiary mismatch for settled order ('${persistentRecord.beneficiary}' vs '${settlementContext.beneficiary}').`);
                }

                await conn.commit();
                return {
                    ok: true,
                    order_id: canonicalRef,
                    effective_specification_id: eff.id,
                    financial_reconciliation_status: 'REFUND_SETTLED',
                    settlement_ref: persistentRef,
                    provider: persistentProvider,
                    voucher_id: persistentRecord.provider_voucher_id,
                    obligation_id: persistentRecord.obligation_id,
                    tenant_id: persistentRecord.tenant_id,
                    amount: Number(persistentRecord.amount_cents) / 100,
                    amount_cents: Number(persistentRecord.amount_cents),
                    currency: persistentRecord.currency,
                    beneficiary: persistentRecord.beneficiary,
                    idempotent_replay: true
                };
            }

            // 8. Mandatory Server-Side Economic Obligation Binding (TRUST-02)
            let pricingSummary = {};
            try {
                pricingSummary = typeof eff.pricing_summary_json === 'string'
                    ? JSON.parse(eff.pricing_summary_json)
                    : (eff.pricing_summary_json || {});
            } catch (_) {}

            const finRecon = pricingSummary.financial_reconciliation || {};
            const expectedObligationId = finRecon.refund_obligation_id || finRecon.obligation_id || eff.revision_id;
            if (!expectedObligationId) {
                throw new Error('MISSING_OBLIGATION_ID: Order has no recorded obligation_id on the server.');
            }

            // Strict server obligation retrieval without 30 EUR fallback (TRUST-02)
            const rawRefundAmount = finRecon.refund_amount !== undefined
                ? finRecon.refund_amount
                : (finRecon.delta_amount !== undefined ? finRecon.delta_amount : pricingSummary.delta_amount);

            if (rawRefundAmount === undefined || rawRefundAmount === null || Number(rawRefundAmount) === 0) {
                throw new Error('NO_REFUND_OBLIGATION: Order has no recorded negative delta or economic refund obligation on the server.');
            }

            const expectedAmount = Math.abs(Number(rawRefundAmount));
            if (isNaN(expectedAmount) || expectedAmount <= 0) {
                throw new Error('INVALID_OBLIGATION: Economic refund obligation is missing a valid refund amount on the server.');
            }

            const expectedCurrency = String(finRecon.currency || pricingSummary.currency || '').toUpperCase();
            if (!expectedCurrency) {
                throw new Error('INVALID_OBLIGATION: Economic refund obligation is missing a currency on the server.');
            }

            // Resolve economic beneficiary from server records (TRUST-02, TRUST-R4-02)
            let expectedBeneficiary = finRecon.beneficiary || order.customer_email || null;
            if (!expectedBeneficiary && order.customer_json) {
                try {
                    const c = typeof order.customer_json === 'string' ? JSON.parse(order.customer_json) : order.customer_json;
                    expectedBeneficiary = c.email || c.customer_email || null;
                } catch (_) {}
            }

            if (!expectedBeneficiary || !String(expectedBeneficiary).trim()) {
                throw new Error('MISSING_BENEFICIARY: Order refund obligation lacks an identifiable recipient/beneficiary on the server.');
            }

            // 8.1 Obligation ID Match Check
            const providedObligationId = settlementContext.obligationId || settlementContext.obligation_id;
            if (providedObligationId && expectedObligationId && providedObligationId !== expectedObligationId) {
                throw new Error(`OBLIGATION_MISMATCH: Provided obligation_id '${providedObligationId}' does not match active obligation '${expectedObligationId}'.`);
            }

            // 8.2 Amount Match Check in minor monetary units (cents) (TRUST-02)
            if (settlementContext.amount === undefined || settlementContext.amount === null || settlementContext.amount === '') {
                throw new Error('MISSING_AMOUNT: Settlement amount is mandatory.');
            }
            const providedAmount = Math.abs(Number(settlementContext.amount));
            const providedMinor = Math.round(providedAmount * 100);
            const expectedMinor = Math.round(expectedAmount * 100);
            if (providedMinor !== expectedMinor) {
                throw new Error(`AMOUNT_MISMATCH: Settlement amount ${providedAmount} does not match expected refund obligation amount ${expectedAmount}.`);
            }

            // 8.3 Currency Match Check (TRUST-02)
            if (!settlementContext.currency) {
                throw new Error('MISSING_CURRENCY: Settlement currency is mandatory.');
            }
            const providedCurrency = String(settlementContext.currency).trim().toUpperCase();
            if (providedCurrency !== expectedCurrency) {
                throw new Error(`CURRENCY_MISMATCH: Settlement currency '${providedCurrency}' does not match expected obligation currency '${expectedCurrency}'.`);
            }

            // 8.4 Beneficiary Match Check (TRUST-02, TRUST-R4-02)
            if (settlementContext.beneficiary) {
                if (String(settlementContext.beneficiary).trim().toLowerCase() !== String(expectedBeneficiary).trim().toLowerCase()) {
                    throw new Error(`BENEFICIARY_MISMATCH: Settlement beneficiary '${settlementContext.beneficiary}' does not match obligation recipient '${expectedBeneficiary}'.`);
                }
            }

            // 8.5 Authoritative Verification via Trusted Financial Settlement Adapter (TRUST-01, TRUST-R4-01..03, SEC-R5-01)
            const isProd = isProductionEnvironment();
            const effectiveFinancialAdapter = isProd ? trustedFinancialAdapter : this.trustedFinancialAdapter;

            const targetOrderId = order.order_id || order.order_ref || order.id;
            const adapterResult = await effectiveFinancialAdapter.verifySettlement({
                provider: rawProvider,
                settlementRef: settlementRef,
                obligationId: expectedObligationId,
                expectedAmount: expectedAmount,
                expectedCurrency: expectedCurrency,
                expectedBeneficiary: expectedBeneficiary,
                orderId: targetOrderId,
                alternateOrderId: order.id,
                tenantId: order.tenant_id,
                callerPayload: settlementContext,
                connection: conn
            });

            if (!adapterResult || !adapterResult.verified) {
                const code = adapterResult?.code || 'UNVERIFIED_SETTLEMENT_SOURCE';
                const reason = adapterResult?.reason || 'External settlement verification failed';
                if (code === 'SETTLEMENT_INTEGRATION_PENDING' || code === 'PROVIDER_UNREACHABLE') {
                    throw new Error(`SETTLEMENT_INTEGRATION_PENDING: ${reason} Status remains REFUND_PENDING.`);
                }
                throw new Error(`${code}: ${reason}. Status remains REFUND_PENDING (SETTLEMENT_INTEGRATION_PENDING).`);
            }

            // In production, mock sandbox settlement records are strictly forbidden (SEC-R5-01)
            if (isProd && adapterResult.is_mock_sandbox) {
                throw new Error('MOCK_ADAPTER_DISABLED_IN_PRODUCTION: Mock sandbox settlements cannot be used to settle refunds in production.');
            }

            // 8.6 Transactional Anti-Replay & Exclusive Voucher Consumption via Database Engine Constraint (SEC-R5-02)
            const voucherId = settlementContext.voucher_id || settlementContext.voucherId ||
                              (settlementContext.evidence && (settlementContext.evidence.voucher_id || settlementContext.evidence.voucherId)) ||
                              (settlementContext.proof && (settlementContext.proof.voucher_id || settlementContext.proof.voucherId)) ||
                              adapterResult.voucher_id ||
                              settlementRef;
            const voucherDbId = `vch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

            try {
                await conn.query(
                    `INSERT INTO financial_settlement_vouchers 
                     (id, provider, provider_voucher_id, settlement_ref, tenant_id, canonical_order_id, effective_specification_id, obligation_id, amount_cents, currency, beneficiary, status, is_mock_sandbox, proof_metadata_json, settled_by, settled_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))`,
                    [
                        voucherDbId,
                        rawProvider,
                        voucherId,
                        settlementRef,
                        order.tenant_id,
                        canonicalRef,
                        eff.id,
                        expectedObligationId,
                        expectedMinor,
                        expectedCurrency,
                        adapterResult.beneficiary || expectedBeneficiary,
                        adapterResult.status || 'SETTLED',
                        adapterResult.is_mock_sandbox ? 1 : 0,
                        JSON.stringify(adapterResult.proof_metadata || {}),
                        rawUserId
                    ]
                );
            } catch (insertErr) {
                if (insertErr.code === 'ER_DUP_ENTRY' || insertErr.errno === 1062 || String(insertErr.message).includes('Duplicate entry')) {
                    throw new Error(`EVIDENCE_ALREADY_CONSUMED: Settlement voucher '${voucherId}' from provider '${rawProvider}' has already been consumed. Replay attack rejected by transactional database constraint.`);
                }
                throw insertErr;
            }

            // 9. State Transition under Lock within the SAME transaction (TRUST-01, TRUST-02, TRUST-03, SEC-R5-02)
            await conn.query(
                `UPDATE order_effective_technical_specifications 
                 SET financial_reconciliation_status = 'REFUND_SETTLED', updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [eff.id]
            );

            // 10. Persistent Audit Event within the SAME transaction (TRUST-03, SEC-D04R)
            await this.logEvent(eff.canonical_order_id || canonicalRef, orderRef, 'REFUND_OBLIGATION_SETTLED', {
                effective_specification_id: eff.id,
                obligation_id: expectedObligationId || providedObligationId || null,
                settlement_ref: settlementRef,
                provider_voucher_id: adapterResult.voucher_id,
                provider: rawProvider,
                amount: expectedAmount,
                currency: expectedCurrency,
                beneficiary: adapterResult.beneficiary || expectedBeneficiary,
                settled_by: rawUserId,
                role: role,
                tenant_id: order.tenant_id,
                printhouse_id: order.offer_print_house || order.assigned_printhouse_id || order.printhouse_id,
                trusted_adapter: adapterResult.adapter_name,
                provenance: adapterResult.provenance,
                verified_at: adapterResult.verified_at,
                is_mock_sandbox: Boolean(adapterResult.is_mock_sandbox),
                evidence_summary: {
                    status: adapterResult.status,
                    proof_metadata: adapterResult.proof_metadata
                },
                settled_at: new Date().toISOString()
            }, conn);

            await conn.commit();

            return {
                ok: true,
                effective_specification_id: eff.id,
                obligation_id: expectedObligationId || providedObligationId || null,
                financial_reconciliation_status: 'REFUND_SETTLED',
                settlement_ref: settlementRef,
                provider_voucher_id: adapterResult.voucher_id,
                provider: rawProvider,
                amount: expectedAmount,
                currency: expectedCurrency,
                beneficiary: adapterResult.beneficiary || expectedBeneficiary,
                trusted_adapter: adapterResult.adapter_name,
                provenance: adapterResult.provenance,
                settled_by: rawUserId
            };
        } catch (err) {
            if (conn) {
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
        if (connection) {
            // When executing within a mandatory transaction, audit event persistence is strictly required.
            // Any failure MUST fail the transaction and trigger rollback (SEC-D04R).
            await executor.query(`
                INSERT INTO marketplace_events (id, order_id, order_ref, event_type, metadata_json)
                VALUES (UUID(), ?, ?, ?, ?)
            `, [orderId, orderRef, type, JSON.stringify(payload)]);
            return;
        }
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

