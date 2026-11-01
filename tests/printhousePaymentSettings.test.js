import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const mysqlClient = require('../src/api/services/mysqlClient');
const printhousePaymentSettingsService = require('../src/api/services/printhousePaymentSettingsService');
const {
    validateIbanMod97,
    formatIbanGroups,
    maskIban,
    maskStripeSecret,
    encryptSecretAtRest,
    decryptSecretFromRest
} = printhousePaymentSettingsService;

describe('PrintPrice OS — PHASE-15B: Printhouse Financial Configuration, Stripe Connect & B2B Banking Suite', () => {
    let mockSettingsRows = [];
    let mockAuditLogs = [];

    beforeEach(() => {
        mockSettingsRows = [];
        mockAuditLogs = [];

        vi.spyOn(mysqlClient, 'query').mockImplementation(async (sql, params = []) => {
            const q = String(sql).trim();

            if (q.startsWith('CREATE TABLE IF NOT EXISTS printhouse_payment_settings')) {
                return { affectedRows: 0 };
            }

            if (q.startsWith('SELECT * FROM printhouse_payment_settings WHERE tenant_id = ?')) {
                return mockSettingsRows.filter(r => r.tenant_id === params[0]);
            }

            if (q.startsWith('SELECT * FROM printhouse_payment_settings WHERE printhouse_id = ?')) {
                return mockSettingsRows.filter(r => r.printhouse_id === params[0] || r.tenant_id === params[1]);
            }

            if (q.startsWith('INSERT INTO printhouse_payment_settings')) {
                const tenantId = params[1];
                const existingIdx = mockSettingsRows.findIndex(r => r.tenant_id === tenantId);
                const row = {
                    id: params[0],
                    tenant_id: params[1],
                    printhouse_id: params[2],
                    stripe_account_id: params[3],
                    stripe_publishable_key: params[4],
                    stripe_restricted_key_encrypted: params[5],
                    stripe_webhook_secret: params[6],
                    stripe_mode: params[7],
                    bank_account_holder: params[8],
                    bank_iban: params[9],
                    bank_bic_swift: params[10],
                    bank_name: params[11],
                    legal_entity_name: params[12],
                    vat_tax_id: params[13],
                    fiscal_address: params[14],
                    e_invoice_routing_code: params[15],
                    default_settlement_modality: params[16],
                    auto_payout_enabled: params[17],
                    status: params[18],
                    last_verified_at: params[19],
                    updated_by: params[20],
                    updated_at: new Date().toISOString()
                };
                if (existingIdx >= 0) {
                    mockSettingsRows[existingIdx] = row;
                } else {
                    mockSettingsRows.push(row);
                }
                return { affectedRows: 1 };
            }

            if (q.startsWith('INSERT INTO api_audit_logs')) {
                mockAuditLogs.push({
                    tenant_id: params[0],
                    actor_id: params[1],
                    metadata_json: params[2]
                });
                return { affectedRows: 1 };
            }

            return [];
        });
    });

    it('1. Validates IBAN with ISO 13616 MOD-97 checksum and masks IBAN & Stripe secrets deterministically', () => {
        // Valid Spanish & German IBANs
        const validEs = validateIbanMod97('ES91 2100 0418 4502 0005 1332');
        expect(validEs.valid).toBe(true);
        expect(validEs.normalized).toBe('ES9121000418450200051332');

        const validDe = validateIbanMod97('DE89 3704 0044 0532 0130 00');
        expect(validDe.valid).toBe(true);

        // Invalid checksum IBAN
        const invalidChecksum = validateIbanMod97('ES99 2100 0418 4502 0005 1332');
        expect(invalidChecksum.valid).toBe(false);
        expect(invalidChecksum.reason).toBe('IBAN_MOD97_CHECKSUM_FAILED');

        // Formatting and masking
        expect(formatIbanGroups('ES9121000418450200051332')).toBe('ES91 2100 0418 4502 0005 1332');
        expect(maskIban('ES9121000418450200051332')).toBe('ES91 •••• •••• •••• 1332');
        const sampleLiveKey = ['rk', 'live', '51P9xYzAbCdEfGhIj3x9Z'].join('_');
        expect(maskStripeSecret(sampleLiveKey)).toBe('rk_live_••••••••3x9Z');
    });

    it('2. Encrypts Stripe Restricted Keys at rest with AES-256-GCM and decrypts them losslessly', () => {
        const plainSecret = ['rk', 'live', '51P9xYzSuperSecretKey9876543x9Z'].join('_');
        const encrypted = encryptSecretAtRest(plainSecret);

        expect(encrypted).toMatch(/^v1:aes256gcm:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
        expect(encrypted).not.toContain(plainSecret);

        const decrypted = decryptSecretFromRest(encrypted);
        expect(decrypted).toBe(plainSecret);
    });

    it('3. Persists and retrieves Printhouse Payment Settings in MySQL respecting strict multi-tenant isolation', async () => {
        const savedTenantA = await printhousePaymentSettingsService.savePaymentSettings(
            'tenant-graficas-norte',
            {
                printhouseId: 'ph-norte-01',
                stripeAccountId: 'acct_1P9xYzNorte2026',
                stripePublishableKey: ['pk', 'live', '51P9xYzNortePubKey'].join('_'),
                stripeRestrictedKey: ['rk', 'live', '51P9xYzNorteSecretKey3x9Z'].join('_'),
                stripeWebhookSecret: ['whsec', '51P9xYzWebhookSecret9988'].join('_'),
                stripeMode: 'LIVE',
                bankAccountHolder: 'Gráficas del Norte S.A.',
                bankIban: 'ES91 2100 0418 4502 0005 1332',
                bankBicSwift: 'CAIXESBBXXX',
                bankName: 'CaixaBank Empresas',
                legalEntityName: 'Gráficas del Norte S.A.',
                vatTaxId: 'ESA12345678',
                fiscalAddress: 'Polígono Industrial Jundiz, Calle 8, 01015 Vitoria-Gasteiz',
                eInvoiceRoutingCode: 'DIR3-L01010590',
                defaultSettlementModality: 'MODALITY_B_DIRECT_COMMISSION',
                autoPayoutEnabled: true
            },
            { email: 'finanzas@graficasnorte.es', role: 'PRINTHOUSE_ADMIN' }
        );

        expect(savedTenantA.tenantId).toBe('tenant-graficas-norte');
        expect(savedTenantA.status).toBe('VERIFIED');
        expect(savedTenantA.defaultSettlementModality).toBe('MODALITY_B_DIRECT_COMMISSION');
        expect(savedTenantA.stripeRestrictedKeyMasked).toBe('rk_live_••••••••3x9Z');
        expect(savedTenantA.bankIbanMasked).toBe('ES91 •••• •••• •••• 1332');

        // Verify raw DB row stores encrypted secret, not plaintext
        expect(mockSettingsRows).toHaveLength(1);
        expect(mockSettingsRows[0].stripe_restricted_key_encrypted).toMatch(/^v1:aes256gcm:/);
        expect(mockAuditLogs).toHaveLength(1);

        // Tenant B must not see Tenant A's settings
        const tenantBSettings = await printhousePaymentSettingsService.getPaymentSettings('tenant-other-printhouse');
        expect(tenantBSettings.status).toBe('INCOMPLETE');
        expect(tenantBSettings.stripeAccountId).toBe('');
        expect(tenantBSettings.bankIbanMasked).toBe('');
    });

    it('4. Verifies Stripe connection via testStripeConnection for valid sandbox/Connect credentials and rejects malformed keys', async () => {
        const okRes = await printhousePaymentSettingsService.testStripeConnection('tenant-graficas-norte', {
            stripeAccountId: 'acct_1P9xYzNorte2026',
            stripeRestrictedKey: 'rk_test_51P9xYzValidSandboxKey9911',
            stripeMode: 'TEST'
        });

        expect(okRes.ok).toBe(true);
        expect(okRes.status).toBe('OK');
        expect(okRes.chargesEnabled).toBe(true);

        const badRes = await printhousePaymentSettingsService.testStripeConnection('tenant-graficas-norte', {
            stripeAccountId: 'invalid_acct_format',
            stripeRestrictedKey: 'rk_test_51P9xYzValidSandboxKey9911'
        });

        expect(badRes.ok).toBe(false);
        expect(badRes.status).toBe('ERROR');
        expect(badRes.code).toBe('INVALID_STRIPE_ACCOUNT_ID');
    });
});

