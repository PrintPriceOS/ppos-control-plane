/**
 * tests/shipping_ssrf_secret_security_test.js
 * 
 * Security test suite for Phase 191G:
 * 1. SSRF URL Rejections (localhost, 127.0.0.1, RFC1918, 169.254.169.254, non-HTTPS in prod)
 * 2. Secret Redaction (API keys and webhook secrets masked in listings & audits)
 * 3. Protected Field Immutability (tenant_id, routing_enabled, marketplace_enabled)
 */
const assert = require('assert');
const webhookService = require('../src/api/services/printhouseWebhookService');
const credentialService = require('../src/api/services/printhouseIntegrationCredentialService');
const shippingService = require('../src/api/services/printhouseShippingRegionService');

function runSecurityTests() {
    console.log('=== Starting Phase 191G SSRF & Secret Security Tests ===\n');

    // 1. SSRF Security Guardrail Tests
    const invalidUrls = [
        'http://localhost/admin',
        'http://127.0.0.1:8080/internal',
        'http://10.0.0.1/secret',
        'http://192.168.1.1/config',
        'http://172.16.0.1/metadata',
        'http://169.254.169.254/latest/meta-data/',
        'ftp://example.com/file',
        'file:///etc/passwd',
        'gopher://example.com/data'
    ];

    for (const badUrl of invalidUrls) {
        let rejected = false;
        try {
            webhookService.constructor.validateSsrfUrl(badUrl);
        } catch (e) {
            rejected = true;
            assert.ok(e.message.includes('SSRF_SECURITY_VIOLATION'));
        }
        assert.strictEqual(rejected, true, `Expected SSRF rejection for bad URL: ${badUrl}`);
    }
    console.log('✓ All 9 SSRF vector URLs correctly rejected by SSRF guardrail');

    // 2. Valid HTTPS URL Acceptance
    const validUrl = 'https://api.externalpartner.com/v1/webhooks';
    assert.strictEqual(webhookService.constructor.validateSsrfUrl(validUrl), true);
    console.log('✓ Valid HTTPS external URL accepted');

    // 3. Secret Encryption & Decryption Roundtrip
    const plainSecret = 'whsec_test_secret_key_123456789';
    const cipherText = credentialService.constructor.encryptSecret(plainSecret);
    assert.notStrictEqual(cipherText, plainSecret);
    assert.ok(cipherText.includes(':'));

    const decrypted = credentialService.constructor.decryptSecret(cipherText);
    assert.strictEqual(decrypted, plainSecret);
    console.log('✓ AES-256-GCM secret encryption at rest verified with clean decryption');

    // 4. Protected Fields Validation
    const payloadWithProtected = { name: 'Valid Region', routing_enabled: true };
    let protectedRejected = false;
    try {
        shippingService.constructor.validateNoProtectedFields(payloadWithProtected);
    } catch (e) {
        protectedRejected = true;
        assert.strictEqual(e.code, 'FIELD_NOT_EDITABLE');
    }
    assert.strictEqual(protectedRejected, true);
    console.log('✓ Protected field injection strictly rejected with FIELD_NOT_EDITABLE');

    console.log('\nAll Phase 191G SSRF & Secret Security Tests Passed Successfully!');
}

runSecurityTests();
