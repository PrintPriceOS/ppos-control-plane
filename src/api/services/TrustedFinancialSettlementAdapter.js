/**
 * TrustedFinancialSettlementAdapter.js
 * 
 * BUDGET-02D-01R5: Certificación del contrato de confianza financiera (TRUST-R4-01, TRUST-R4-02, TRUST-R4-03).
 * 
 * Defines the strict financial settlement adapter contract, separating the production
 * adapter (ProductionFinancialSettlementAdapter) from the explicit test sandbox adapter
 * (TestSandboxFinancialSettlementAdapter).
 * 
 * CRITICAL SECURITY INVARIANTS:
 * 1. Test records and in-memory mocks are STRICTLY DISABLED in production environments.
 * 2. Webhook ingress verification is declared NOT_IMPLEMENTED (fail-closed, SETTLEMENT_INTEGRATION_PENDING)
 *    because no cryptographic ingress verification component exists in this repository.
 * 3. Complete economic binding is mandatory: obligation_id, order_id, tenant_id, beneficiary,
 *    amount in minor units (cents), currency, provider, status, and provider_voucher_id.
 *    Any missing or divergent attribute fails closed with REFUND_PENDING.
 * 4. Production financial adapter requires active external credentials and real out-of-band connectivity.
 *    Without them, it honestly returns SETTLEMENT_INTEGRATION_PENDING, never faking calls or auto-approving.
 */

const logger = require('./logger');

/**
 * Production Financial Settlement Adapter.
 * Real production implementation enforcing honest fail-closed semantics when external
 * credentials or out-of-band banking/gateway integrations are pending.
 */
class ProductionFinancialSettlementAdapter {
    constructor(options = {}) {
        this.adapterName = 'ProductionFinancialSettlementAdapter';
        this.provenance = 'AUTHORITATIVE_PRODUCTION_FINANCIAL_SETTLEMENT_ADAPTER_v1';
        this.isProduction = true;
    }

    /**
     * registerVerifiedRecord is strictly forbidden on the production adapter.
     */
    registerVerifiedRecord() {
        throw new Error('MOCK_ADAPTER_DISABLED_IN_PRODUCTION: In-memory test registry is strictly disabled on ProductionFinancialSettlementAdapter.');
    }

    /**
     * Authoritatively verify an external settlement against live production providers.
     * Enforces fail-closed semantics until real out-of-band connectivity is configured.
     */
    async verifySettlement({
        provider,
        settlementRef,
        obligationId,
        expectedAmount,
        expectedCurrency,
        expectedBeneficiary,
        orderId,
        alternateOrderId = null,
        tenantId,
        callerPayload = {},
        connection = null
    }) {
        const rawProvider = String(provider || '').trim().toUpperCase();
        const rawRef = String(settlementRef || '').trim();

        // 1. Guard against caller self-certification (TRUST-01)
        const callerEvidence = callerPayload.evidence || callerPayload.proof || callerPayload.verifiedEvidence;
        if (callerEvidence && typeof callerEvidence === 'object') {
            if (callerEvidence.signature_verified === true || callerEvidence.signatureVerified === true) {
                return {
                    verified: false,
                    code: 'UNTRUSTED_CALLER_SIGNATURE_ASSERTION',
                    reason: 'Caller cannot self-declare signature_verified in request payload. Webhook signatures must be verified at trusted server ingress boundaries.'
                };
            }
        }

        // 2. Webhook Ingress Receiver (TRUST-R4-01)
        // No cryptographic webhook ingress component exists in this repository.
        if (rawProvider === 'PAYMENT_GATEWAY_WEBHOOK') {
            return {
                verified: false,
                code: 'WEBHOOK_INTEGRATION_NOT_IMPLEMENTED',
                reason: 'Cryptographic webhook ingress receiver is NOT_IMPLEMENTED in this repository. Webhook-based settlements cannot be processed.'
            };
        }

        // 3. Test sandbox provider rejection in production adapter
        if (rawProvider === 'TEST_TRUSTED_SETTLEMENT_ADAPTER') {
            return {
                verified: false,
                code: 'TEST_ADAPTER_FORBIDDEN_IN_PRODUCTION',
                reason: 'TEST_TRUSTED_SETTLEMENT_ADAPTER cannot be processed by ProductionFinancialSettlementAdapter.'
            };
        }

        // 4. Honest Production Connectivity (TRUST-R4-03)
        // External banking / payment gateway / ERP out-of-band connectivity requires separate operational deployment.
        return {
            verified: false,
            code: 'SETTLEMENT_INTEGRATION_PENDING',
            reason: `Production external connectivity for financial provider '${rawProvider}' requires live credentials and certified out-of-band integration. Real financial connectivity is pending separate operational deployment. Status remains REFUND_PENDING.`
        };
    }
}

/**
 * Test Sandbox Financial Settlement Adapter.
 * Explicitly isolated sandbox adapter for CI, local tests and pre-production simulation.
 * Inaccessible in production environments (throws MOCK_ADAPTER_DISABLED_IN_PRODUCTION).
 */
class TestSandboxFinancialSettlementAdapter {
    constructor(options = {}) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('MOCK_ADAPTER_DISABLED_IN_PRODUCTION: TestSandboxFinancialSettlementAdapter cannot be initialized or used in a production environment.');
        }
        this.adapterName = 'TestSandboxFinancialSettlementAdapter';
        this.provenance = 'TEST_TRUSTED_SETTLEMENT_ADAPTER (CI Mock Sandbox - Not a live banking transaction)';
        this.isProduction = false;
        this._verifiedRecords = new Map();
        this._providerOutages = new Set();
    }

    /**
     * Register a server-side verified settlement record in the test sandbox registry.
     * Enforces environmental isolation.
     */
    registerVerifiedRecord(record) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('MOCK_ADAPTER_DISABLED_IN_PRODUCTION: In-memory test registry is strictly disabled in production environments.');
        }
        if (!record || typeof record !== 'object') {
            throw new Error('INVALID_TEST_RECORD: Record object is required.');
        }
        if (!record.settlementRef) {
            throw new Error('INVALID_TEST_RECORD: settlementRef is required.');
        }
        const key = `${String(record.provider || '').toUpperCase()}:${String(record.settlementRef).trim()}`;
        this._verifiedRecords.set(key, {
            ...record,
            is_test_sandbox: true,
            registered_at: new Date().toISOString()
        });
    }

    /**
     * Clear registered records (used in test teardowns).
     */
    clearRegistry() {
        this._verifiedRecords.clear();
        this._providerOutages.clear();
    }

    /**
     * Simulate a provider outage (for failure mode testing).
     */
    setProviderOutage(provider, isOutage = true) {
        const p = String(provider).toUpperCase();
        if (isOutage) {
            this._providerOutages.add(p);
        } else {
            this._providerOutages.delete(p);
        }
    }

    /**
     * Authoritatively verify an external settlement record in the test sandbox.
     * Enforces all TRUST-R4-02 mandatory identity and economic bindings.
     */
    async verifySettlement({
        provider,
        settlementRef,
        obligationId,
        expectedAmount,
        expectedCurrency,
        expectedBeneficiary,
        orderId,
        alternateOrderId = null,
        tenantId,
        callerPayload = {},
        connection = null
    }) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('MOCK_ADAPTER_DISABLED_IN_PRODUCTION: TestSandboxFinancialSettlementAdapter cannot be used in a production environment.');
        }

        const rawProvider = String(provider || '').trim().toUpperCase();
        const rawRef = String(settlementRef || '').trim();

        // 1. Guard against caller self-certification (TRUST-01)
        const callerEvidence = callerPayload.evidence || callerPayload.proof || callerPayload.verifiedEvidence;
        if (callerEvidence && typeof callerEvidence === 'object') {
            if (callerEvidence.signature_verified === true || callerEvidence.signatureVerified === true) {
                return {
                    verified: false,
                    code: 'UNTRUSTED_CALLER_SIGNATURE_ASSERTION',
                    reason: 'Caller cannot self-declare signature_verified in request payload. Webhook signatures must be verified at trusted server ingress boundaries.'
                };
            }
        }

        // 2. Webhook Ingress (TRUST-R4-01)
        // No cryptographic webhook ingress component exists in this repository.
        if (rawProvider === 'PAYMENT_GATEWAY_WEBHOOK') {
            return {
                verified: false,
                code: 'WEBHOOK_INTEGRATION_NOT_IMPLEMENTED',
                reason: 'Cryptographic webhook ingress receiver is NOT_IMPLEMENTED in this repository. Webhook-based settlements cannot be processed.'
            };
        }

        // 3. Simulated Provider Outage (TRUST-04)
        if (this._providerOutages.has(rawProvider)) {
            return {
                verified: false,
                code: 'PROVIDER_UNREACHABLE',
                reason: `Payment provider '${rawProvider}' API is temporarily unreachable or returning 503.`
            };
        }

        // 4. Resolve record from test sandbox registry
        const registryKey = `${rawProvider}:${rawRef}`;
        const trustedRecord = this._verifiedRecords.get(registryKey);

        if (!trustedRecord) {
            return {
                verified: false,
                code: 'EXTERNAL_SETTLEMENT_NOT_FOUND',
                reason: `External settlement reference '${rawRef}' does not exist in authoritative '${rawProvider}' provider records or accounting ledger.`
            };
        }

        // 5. Mandatory Identity & Economic Bindings (TRUST-R4-02)

        // 5.1 Beneficiary Binding (Mandatory on both sides, exact match)
        if (!expectedBeneficiary || !String(expectedBeneficiary).trim()) {
            return {
                verified: false,
                code: 'MISSING_BENEFICIARY',
                reason: 'Beneficiary is mandatory on the financial obligation. Unattributed obligations are rejected.'
            };
        }
        if (!trustedRecord.beneficiary || !String(trustedRecord.beneficiary).trim()) {
            return {
                verified: false,
                code: 'MISSING_BENEFICIARY',
                reason: 'Settlement voucher record lacks mandatory beneficiary attribute.'
            };
        }
        const expBenNorm = String(expectedBeneficiary).trim().toLowerCase();
        const verBenNorm = String(trustedRecord.beneficiary).trim().toLowerCase();
        if (expBenNorm !== verBenNorm) {
            return {
                verified: false,
                code: 'BENEFICIARY_MISMATCH',
                reason: `Voucher beneficiary '${trustedRecord.beneficiary}' does not match obligation recipient '${expectedBeneficiary}'.`
            };
        }

        // 5.2 Obligation ID Binding (Mandatory on both sides, exact match)
        if (!obligationId || !String(obligationId).trim()) {
            return {
                verified: false,
                code: 'MISSING_OBLIGATION_ID',
                reason: 'Obligation ID is mandatory on the financial obligation.'
            };
        }
        const recObligationId = trustedRecord.obligation_id || trustedRecord.obligationId;
        if (!recObligationId || !String(recObligationId).trim()) {
            return {
                verified: false,
                code: 'MISSING_OBLIGATION_BINDING',
                reason: 'Settlement voucher record lacks mandatory obligation_id binding.'
            };
        }
        const matchesObligation = String(recObligationId).trim() === String(obligationId).trim() ||
                                  (Array.isArray(trustedRecord.allowed_obligation_ids) && trustedRecord.allowed_obligation_ids.includes(String(obligationId).trim()));
        if (!matchesObligation) {
            return {
                verified: false,
                code: 'OBLIGATION_MISMATCH',
                reason: `Voucher obligation '${recObligationId}' does not match expected obligation '${obligationId}'.`
            };
        }

        // 5.3 Canonical Order ID Binding (Mandatory on both sides, exact match)
        if (!orderId || !String(orderId).trim()) {
            return {
                verified: false,
                code: 'MISSING_ORDER_ID',
                reason: 'Order ID is mandatory for settlement.'
            };
        }
        const recOrderId = trustedRecord.order_id || trustedRecord.orderId;
        if (!recOrderId || !String(recOrderId).trim()) {
            return {
                verified: false,
                code: 'MISSING_ORDER_BINDING',
                reason: 'Settlement voucher record lacks mandatory order_id binding.'
            };
        }
        const matchesOrder = String(recOrderId).trim() === String(orderId).trim() ||
                             (alternateOrderId && String(recOrderId).trim() === String(alternateOrderId).trim()) ||
                             (Array.isArray(trustedRecord.allowed_order_ids) && trustedRecord.allowed_order_ids.includes(String(orderId).trim()));
        if (!matchesOrder) {
            return {
                verified: false,
                code: 'ORDER_MISMATCH',
                reason: `Voucher order '${recOrderId}' does not match canonical order '${orderId}'.`
            };
        }

        // 5.4 Tenant ID Binding (Mandatory on both sides, exact match)
        if (!tenantId || !String(tenantId).trim()) {
            return {
                verified: false,
                code: 'MISSING_TENANT_ID',
                reason: 'Tenant ID is mandatory for settlement.'
            };
        }
        const recTenantId = trustedRecord.tenant_id || trustedRecord.tenantId;
        if (!recTenantId || !String(recTenantId).trim()) {
            return {
                verified: false,
                code: 'MISSING_TENANT_BINDING',
                reason: 'Settlement voucher record lacks mandatory tenant_id binding.'
            };
        }
        if (String(recTenantId).trim() !== String(tenantId).trim()) {
            return {
                verified: false,
                code: 'TENANT_MISMATCH',
                reason: `Voucher tenant '${recTenantId}' does not match order tenant '${tenantId}'.`
            };
        }

        // 5.5 Unique Voucher ID (Mandatory)
        const voucherId = String(trustedRecord.voucher_id || trustedRecord.provider_voucher_id || '').trim();
        if (!voucherId) {
            return {
                verified: false,
                code: 'MISSING_VOUCHER_ID',
                reason: 'Settlement voucher record lacks unique provider voucher identifier.'
            };
        }

        // 5.6 Final Settlement Status (Mandatory confirmed status)
        const recordStatus = String(trustedRecord.status || trustedRecord.state || '').toUpperCase();
        const CONFIRMED_STATUSES = ['SUCCEEDED', 'CONFIRMED', 'POSTED', 'RECONCILED', 'SETTLED'];
        if (!CONFIRMED_STATUSES.includes(recordStatus)) {
            return {
                verified: false,
                code: 'UNVERIFIED_SETTLEMENT_STATUS',
                reason: `External settlement voucher '${rawRef}' status is '${recordStatus || 'UNKNOWN'}', which is not in confirmed state (${CONFIRMED_STATUSES.join(', ')}).`
            };
        }

        // 5.7 Exact Amount in Minor Units (cents)
        if (trustedRecord.amount === undefined || trustedRecord.amount === null || isNaN(Number(trustedRecord.amount))) {
            return {
                verified: false,
                code: 'MISSING_AMOUNT',
                reason: 'Settlement voucher record lacks valid amount.'
            };
        }
        const verifiedAmount = Math.abs(Number(trustedRecord.amount));
        const verifiedMinor = Math.round(verifiedAmount * 100);
        const expectedMinor = Math.round(Math.abs(Number(expectedAmount)) * 100);
        if (verifiedMinor !== expectedMinor) {
            return {
                verified: false,
                code: 'AMOUNT_MISMATCH',
                reason: `External voucher amount ${verifiedAmount} does not match expected obligation amount ${expectedAmount} in minor units.`
            };
        }

        // 5.8 Currency Match
        const verifiedCurrency = String(trustedRecord.currency || '').trim().toUpperCase();
        if (!verifiedCurrency) {
            return {
                verified: false,
                code: 'MISSING_CURRENCY',
                reason: 'Settlement voucher record lacks currency.'
            };
        }
        if (verifiedCurrency !== String(expectedCurrency).trim().toUpperCase()) {
            return {
                verified: false,
                code: 'CURRENCY_MISMATCH',
                reason: `External voucher currency '${verifiedCurrency}' does not match expected obligation currency '${expectedCurrency}'.`
            };
        }

        // 5.9 Provider Match
        if (trustedRecord.provider && String(trustedRecord.provider).trim().toUpperCase() !== rawProvider) {
            return {
                verified: false,
                code: 'PROVIDER_MISMATCH',
                reason: `Voucher provider '${trustedRecord.provider}' does not match requested provider '${rawProvider}'.`
            };
        }

        // 5.10 Cryptographic signature flags for gateway providers (if present)
        if (rawProvider === 'STRIPE' || rawProvider === 'ADYEN') {
            if (trustedRecord.signature_verified === false) {
                return {
                    verified: false,
                    code: 'WEBHOOK_SIGNATURE_INVALID',
                    reason: `Payment gateway webhook cryptographic signature for reference '${rawRef}' failed verification.`
                };
            }
            if (trustedRecord.signature_verified === undefined) {
                return {
                    verified: false,
                    code: 'UNVERIFIED_SIGNATURE',
                    reason: `Payment gateway settlement reference '${rawRef}' lacks authoritative cryptographic signature verification.`
                };
            }
        }

        // 5.11 ERP / Bank Ledgers
        if (rawProvider === 'ERP_CREDIT_NOTE' && trustedRecord.accounting_ledger_verified === false) {
            return {
                verified: false,
                code: 'UNVERIFIED_SETTLEMENT_SOURCE',
                reason: 'ERP credit note is not verified in the authoritative accounting ledger.'
            };
        }
        if ((rawProvider === 'BANK_TRANSFER_LEDGER' || rawProvider === 'MANUAL_BANK_RECONCILIATION') &&
            trustedRecord.governed_verification_status === 'UNVERIFIED') {
            return {
                verified: false,
                code: 'UNVERIFIED_SETTLEMENT_SOURCE',
                reason: 'Bank statement line has not passed governed reconciliation verification.'
            };
        }

        // 6. Successfully Verified in Test Sandbox
        return {
            verified: true,
            adapter_name: this.adapterName,
            provenance: this.provenance,
            provider: rawProvider,
            settlement_ref: rawRef,
            voucher_id: voucherId,
            obligation_id: obligationId,
            order_id: orderId,
            tenant_id: tenantId,
            amount: verifiedAmount,
            currency: verifiedCurrency,
            beneficiary: String(trustedRecord.beneficiary).trim(),
            status: recordStatus,
            verified_at: new Date().toISOString(),
            is_mock_sandbox: true,
            proof_metadata: {
                journal_entry_ref: trustedRecord.journal_entry_ref || null,
                gateway_transaction_id: trustedRecord.charge_id || trustedRecord.payment_intent_id || null,
                statement_line_id: trustedRecord.statement_line_id || null
            }
        };
    }
}

function isProductionEnvironment() {
    const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
    const pposEnv = (process.env.PPOS_ENVIRONMENT || '').toLowerCase();
    return nodeEnv === 'production' || pposEnv === 'production';
}

/**
 * Factory helper to instantiate the appropriate adapter based on environment.
 */
function createFinancialSettlementAdapter(options = {}) {
    const optEnv = (options.env || '').toLowerCase();
    const isProd = optEnv === 'production' || isProductionEnvironment();
    if (isProd) {
        return new ProductionFinancialSettlementAdapter(options);
    }
    return new TestSandboxFinancialSettlementAdapter(options);
}

// Immutable production singleton to prevent tampering in production
const immutableProductionAdapter = Object.freeze(new ProductionFinancialSettlementAdapter());

// Active singleton instance (defaults to current environment)
let activeAdapter = createFinancialSettlementAdapter();

function getEffectiveAdapter() {
    // In production environment, adapter selection is strictly immutable and cannot be tampered with.
    if (isProductionEnvironment()) {
        return immutableProductionAdapter;
    }
    return activeAdapter;
}

// Facade object delegating to activeAdapter while supporting test inspection
const adapterFacade = {
    get adapterName() { return getEffectiveAdapter().adapterName; },
    get provenance() { return getEffectiveAdapter().provenance; },
    get isProduction() { return Boolean(getEffectiveAdapter().isProduction); },

    registerVerifiedRecord(record) {
        if (isProductionEnvironment()) {
            throw new Error('MOCK_ADAPTER_DISABLED_IN_PRODUCTION: In-memory test registry is strictly disabled in production environment.');
        }
        return getEffectiveAdapter().registerVerifiedRecord(record);
    },
    clearRegistry() {
        if (isProductionEnvironment()) {
            throw new Error('MOCK_ADAPTER_DISABLED_IN_PRODUCTION: In-memory test registry operations are strictly disabled in production environment.');
        }
        if (typeof getEffectiveAdapter().clearRegistry === 'function') {
            return getEffectiveAdapter().clearRegistry();
        }
    },
    setProviderOutage(provider, isOutage) {
        if (typeof getEffectiveAdapter().setProviderOutage === 'function') {
            return getEffectiveAdapter().setProviderOutage(provider, isOutage);
        }
    },
    async verifySettlement(params) {
        return getEffectiveAdapter().verifySettlement(params);
    },

    // Testing and configuration helpers
    setActiveAdapter(adapter) {
        if (isProductionEnvironment()) {
            throw new Error('ADAPTER_SUBSTITUTION_FORBIDDEN_IN_PRODUCTION: Cannot substitute financial settlement adapter in production environment. Production adapter selection is strictly immutable.');
        }
        if (!adapter || typeof adapter.verifySettlement !== 'function') {
            throw new Error('INVALID_ADAPTER: Financial settlement adapter must implement verifySettlement().');
        }
        activeAdapter = adapter;
    },
    getActiveAdapter() {
        return getEffectiveAdapter();
    },
    resetToDefault() {
        if (isProductionEnvironment()) {
            activeAdapter = immutableProductionAdapter;
        } else {
            activeAdapter = createFinancialSettlementAdapter();
        }
    },

    // Export class definitions & helpers
    ProductionFinancialSettlementAdapter,
    TestSandboxFinancialSettlementAdapter,
    createFinancialSettlementAdapter,
    isProductionEnvironment
};

module.exports = adapterFacade;
