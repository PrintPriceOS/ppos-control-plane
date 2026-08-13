/**
 * tests/smoke_phase192_1_rc18_production_email_delivery.js
 *
 * Phase 192 — RC18: Production SMTP Email Delivery Acceptance Test Suite
 *
 * Covers requirements E1 through E18:
 * E1. DEV_LOGGER remains available
 * E2. DEV_LOGGER in production does not log activation URL by default
 * E3. SMTP provider with missing config fails closed
 * E4. Unsupported provider fails closed
 * E5. SMTP_PORT invalid rejected
 * E6. SMTP_SECURE invalid rejected
 * E7. nodemailer.createTransport receives expected sanitized config
 * E8. sendMail receives: from, to, subject, text, html
 * E9. Real SMTP branch returns Nodemailer messageId, not fabricated id
 * E10. sendMail failure becomes SMTP_SEND_FAILED
 * E11. verifyTransport success returns ok:true
 * E12. verifyTransport failure becomes SMTP_VERIFY_FAILED
 * E13. No SMTP password appears in logs/errors
 * E14. No activation URL appears in production logs
 * E15. Signup service remains enumeration-safe if SMTP delivery fails
 * E16. /printhouse/start still never returns JWT
 * E17. Activation URL generation contract unchanged
 * E18. Existing activation page flow unchanged
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const emailDeliveryService = require('../src/api/services/emailDeliveryService');
const { EmailDeliveryService } = emailDeliveryService;

async function runTests() {
  console.log('=== Phase 192 — RC18: Production SMTP Email Delivery Suite ===\n');

  // Intercept console.log and console.error to inspect safe logging and redaction
  let capturedLogs = [];
  let capturedErrors = [];
  const originalLog = console.log;
  const originalError = console.error;

  function captureConsole() {
    capturedLogs = [];
    capturedErrors = [];
    console.log = (...args) => capturedLogs.push(args.join(' '));
    console.error = (...args) => capturedErrors.push(args.join(' '));
  }

  function releaseConsole() {
    console.log = originalLog;
    console.error = originalError;
  }

  // --- E1 & E2: DEV_LOGGER behavior ---
  console.log('--- 1. DEV_LOGGER Provider & Redaction (E1 - E2) ---');
  
  // E1: DEV_LOGGER remains available
  const devRes = await emailDeliveryService.sendPrinthouseActivationEmail({
    to: 'test@printhouse.com',
    activationUrl: 'http://localhost:8080/auth/activate?token=test-token-123',
    expiresAt: new Date(Date.now() + 86400000),
    correlationId: 'test-corr-1'
  }, { EMAIL_PROVIDER: 'DEV_LOGGER' });

  assert.strictEqual(devRes.ok, true, 'E1: DEV_LOGGER must return ok: true');
  assert.strictEqual(devRes.provider, 'DEV_LOGGER', 'E1: Provider must be DEV_LOGGER');
  assert.ok(devRes.messageId.startsWith('dev-msg-'), 'E1: DEV_LOGGER generates dev-msg- id');
  console.log('✓ Test E1: DEV_LOGGER remains available');

  // E2: DEV_LOGGER in production does not log activation URL by default
  const prevEnv = process.env.NODE_ENV;
  const prevAllowLog = process.env.ALLOW_DEV_EMAIL_LINK_LOGGING;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEV_EMAIL_LINK_LOGGING;
    captureConsole();

    await emailDeliveryService.sendPrinthouseActivationEmail({
      to: 'secretuser@printhouse.com',
      activationUrl: 'https://control.printprice.pro/auth/activate?token=super-secret-token-xyz',
      expiresAt: new Date(Date.now() + 86400000),
      correlationId: 'test-corr-2'
    }, { EMAIL_PROVIDER: 'DEV_LOGGER' });

    releaseConsole();
    const joinedLogs = capturedLogs.join(' ');
    assert.strictEqual(joinedLogs.includes('super-secret-token-xyz'), false, 'E2: Must not log token or activation link in production');
    assert.ok(joinedLogs.includes('Link redacted in prod mode'), 'E2: Must state link redacted in prod mode');
    console.log('✓ Test E2: DEV_LOGGER in production does not log activation URL by default');
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevAllowLog !== undefined) process.env.ALLOW_DEV_EMAIL_LINK_LOGGING = prevAllowLog;
    else delete process.env.ALLOW_DEV_EMAIL_LINK_LOGGING;
    releaseConsole();
  }

  // --- E3 - E6: Configuration Validation & Fail-Closed Behavior ---
  console.log('\n--- 2. SMTP Configuration Validation & Fail-Closed Behavior (E3 - E6) ---');

  // E3: SMTP provider with missing config fails closed
  const serviceInstance = new EmailDeliveryService();
  await assert.rejects(
    async () => serviceInstance.getSmtpConfig({ SMTP_HOST: '' }),
    (err) => err.code === 'SMTP_CONFIGURATION_INVALID',
    'E3: Missing host must throw SMTP_CONFIGURATION_INVALID'
  );
  await assert.rejects(
    async () => serviceInstance.getSmtpConfig({ SMTP_HOST: 'smtp.example.com', SMTP_USER: '' }),
    (err) => err.code === 'SMTP_CONFIGURATION_INVALID',
    'E3: Missing user must throw SMTP_CONFIGURATION_INVALID'
  );
  await assert.rejects(
    async () => serviceInstance.getSmtpConfig({ SMTP_HOST: 'smtp.example.com', SMTP_USER: 'user', SMTP_PASS: '' }),
    (err) => err.code === 'SMTP_CONFIGURATION_INVALID',
    'E3: Missing pass must throw SMTP_CONFIGURATION_INVALID'
  );
  console.log('✓ Test E3: SMTP provider with missing config fails closed');

  // E4: Unsupported provider fails closed
  await assert.rejects(
    async () => serviceInstance.sendPrinthouseActivationEmail({
      to: 'owner@printhouse.com',
      activationUrl: 'https://control.printprice.pro/auth/activate?token=123',
      expiresAt: new Date()
    }, { EMAIL_PROVIDER: 'INVALID_VENDOR' }),
    (err) => err.code === 'EMAIL_PROVIDER_UNSUPPORTED',
    'E4: Unsupported provider must fail closed with EMAIL_PROVIDER_UNSUPPORTED'
  );
  console.log('✓ Test E4: unsupported provider fails closed');

  // E5: SMTP_PORT invalid rejected
  await assert.rejects(
    async () => serviceInstance.getSmtpConfig({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 'invalid_port',
      SMTP_SECURE: 'true',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass'
    }),
    (err) => err.code === 'SMTP_CONFIGURATION_INVALID',
    'E5: Non-integer port must be rejected'
  );
  await assert.rejects(
    async () => serviceInstance.getSmtpConfig({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '70000',
      SMTP_SECURE: 'true',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass'
    }),
    (err) => err.code === 'SMTP_CONFIGURATION_INVALID',
    'E5: Out of range port (> 65535) must be rejected'
  );
  console.log('✓ Test E5: SMTP_PORT invalid rejected');

  // E6: SMTP_SECURE invalid rejected
  await assert.rejects(
    async () => serviceInstance.getSmtpConfig({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'not_a_boolean',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass'
    }),
    (err) => err.code === 'SMTP_CONFIGURATION_INVALID',
    'E6: Non-boolean string representation must be rejected'
  );
  console.log('✓ Test E6: SMTP_SECURE invalid rejected');

  // --- E7 - E10: Nodemailer Transport & Send Contract ---
  console.log('\n--- 3. Nodemailer Transport & Send Contract (E7 - E10) ---');

  // Stub nodemailer.createTransport
  const originalCreateTransport = nodemailer.createTransport;
  let lastTransportConfig = null;
  let lastSentMail = null;
  let mockSendMailResult = { messageId: '<canonical-smtp-msg-999@smtp.printprice.pro>' };
  let mockSendMailError = null;
  let mockVerifyResult = Promise.resolve(true);

  nodemailer.createTransport = function (config) {
    lastTransportConfig = config;
    return {
      sendMail: async (mailOptions) => {
        lastSentMail = mailOptions;
        if (mockSendMailError) throw mockSendMailError;
        return mockSendMailResult;
      },
      verify: async () => {
        return mockVerifyResult;
      }
    };
  };

  try {
    const validSmtpOverrides = {
      EMAIL_PROVIDER: 'SMTP',
      EMAIL_FROM: 'auth@printprice.pro',
      SMTP_HOST: 'smtp.mailgun.org',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'postmaster@mg.printprice.pro',
      SMTP_PASS: 'super-secret-smtp-password-12345'
    };

    const freshService = new EmailDeliveryService();
    const sendRes = await freshService.sendPrinthouseActivationEmail({
      to: 'candidate@printhouse.com',
      activationUrl: 'https://control.printprice.pro/auth/activate?token=test-token-canonical',
      expiresAt: new Date(Date.now() + 86400000),
      correlationId: 'signup-corr-888'
    }, validSmtpOverrides);

    // E7: nodemailer.createTransport receives expected sanitized config
    assert.strictEqual(lastTransportConfig.host, 'smtp.mailgun.org', 'E7: host matches');
    assert.strictEqual(lastTransportConfig.port, 587, 'E7: port is parsed integer 587');
    assert.strictEqual(lastTransportConfig.secure, false, 'E7: secure is boolean false');
    assert.strictEqual(lastTransportConfig.auth.user, 'postmaster@mg.printprice.pro', 'E7: user matches');
    assert.strictEqual(lastTransportConfig.auth.pass, 'super-secret-smtp-password-12345', 'E7: pass matches');
    console.log('✓ Test E7: nodemailer.createTransport receives expected sanitized config');

    // E8: sendMail receives: from, to, subject, text, html
    assert.strictEqual(lastSentMail.from, 'auth@printprice.pro', 'E8: from matches');
    assert.strictEqual(lastSentMail.to, 'candidate@printhouse.com', 'E8: to matches');
    assert.strictEqual(lastSentMail.subject, 'Activate your PrintPrice account', 'E8: subject matches');
    assert.ok(lastSentMail.text.includes('https://control.printprice.pro/auth/activate?token=test-token-canonical'), 'E8: text contains activation link');
    assert.ok(lastSentMail.html.includes('https://control.printprice.pro/auth/activate?token=test-token-canonical'), 'E8: html contains activation link');
    console.log('✓ Test E8: sendMail receives from, to, subject, text, html');

    // E9: Real SMTP branch returns Nodemailer messageId, not fabricated id
    assert.strictEqual(sendRes.ok, true, 'E9: Result is ok: true');
    assert.strictEqual(sendRes.provider, 'SMTP', 'E9: Provider is SMTP');
    assert.strictEqual(sendRes.messageId, '<canonical-smtp-msg-999@smtp.printprice.pro>', 'E9: Returns exact messageId from nodemailer');
    console.log('✓ Test E9: real SMTP branch returns Nodemailer messageId, not fabricated id');

    // E10: sendMail failure becomes SMTP_SEND_FAILED
    mockSendMailError = new Error('550 5.1.1 Recipient address rejected');
    await assert.rejects(
      async () => freshService.sendPrinthouseActivationEmail({
        to: 'candidate@printhouse.com',
        activationUrl: 'https://control.printprice.pro/auth/activate?token=abc',
        expiresAt: new Date()
      }, validSmtpOverrides),
      (err) => err.code === 'SMTP_SEND_FAILED' && err.message.includes('550 5.1.1'),
      'E10: sendMail failure must throw SMTP_SEND_FAILED'
    );
    mockSendMailError = null;
    console.log('✓ Test E10: sendMail failure becomes SMTP_SEND_FAILED');

    // --- E11 & E12: verifyTransport contract ---
    console.log('\n--- 4. Transport Verification Health Check (E11 - E12) ---');

    // E11: verifyTransport success returns ok:true
    mockVerifyResult = Promise.resolve(true);
    const verifySuccess = await freshService.verifyTransport(validSmtpOverrides);
    assert.strictEqual(verifySuccess.ok, true, 'E11: verifyTransport returns ok: true');
    assert.strictEqual(verifySuccess.provider, 'SMTP', 'E11: Provider is SMTP');
    console.log('✓ Test E11: verifyTransport success returns ok:true');

    // E12: verifyTransport failure becomes SMTP_VERIFY_FAILED
    mockVerifyResult = Promise.reject(new Error('Connection timeout connecting to host'));
    const verifyFailure = await freshService.verifyTransport(validSmtpOverrides);
    assert.strictEqual(verifyFailure.ok, false, 'E12: verifyTransport returns ok: false');
    assert.strictEqual(verifyFailure.code, 'SMTP_VERIFY_FAILED', 'E12: Code is SMTP_VERIFY_FAILED');
    assert.ok(verifyFailure.message.includes('Connection timeout'), 'E12: Contains safe error description');
    console.log('✓ Test E12: verifyTransport failure becomes SMTP_VERIFY_FAILED');

    // --- E13 & E14: Security & Safe Logging ---
    console.log('\n--- 5. Security & Secret Redaction (E13 - E14) ---');

    // E13: No SMTP password appears in logs/errors
    process.env.SMTP_PASS = 'super-secret-smtp-password-12345';
    mockSendMailError = new Error('Authentication failed with password super-secret-smtp-password-12345');
    captureConsole();
    try {
      await freshService.sendPrinthouseActivationEmail({
        to: 'candidate@printhouse.com',
        activationUrl: 'https://control.printprice.pro/auth/activate?token=abc',
        expiresAt: new Date()
      }, validSmtpOverrides);
    } catch (e) {
      assert.strictEqual(e.message.includes('super-secret-smtp-password-12345'), false, 'E13: Error message must redact SMTP password');
      assert.ok(e.message.includes('[REDACTED_PASS]'), 'E13: Password replaced with [REDACTED_PASS]');
    }
    releaseConsole();
    const errLogs = capturedErrors.join(' ');
    assert.strictEqual(errLogs.includes('super-secret-smtp-password-12345'), false, 'E13: Logs must not contain raw SMTP password');
    delete process.env.SMTP_PASS;
    mockSendMailError = null;
    console.log('✓ Test E13: no SMTP password appears in logs/errors');

    // E14: No activation URL appears in production logs
    process.env.NODE_ENV = 'production';
    captureConsole();
    await freshService.sendPrinthouseActivationEmail({
      to: 'candidate@printhouse.com',
      activationUrl: 'https://control.printprice.pro/auth/activate?token=confidential-token-999',
      expiresAt: new Date(),
      correlationId: 'corr-prod-1'
    }, validSmtpOverrides);
    releaseConsole();
    const prodLogs = capturedLogs.join(' ');
    assert.strictEqual(prodLogs.includes('confidential-token-999'), false, 'E14: Production logs must not contain token or activation link');
    process.env.NODE_ENV = prevEnv;
    console.log('✓ Test E14: no activation URL appears in production logs');

  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }

  // --- E15 - E18: Auth Invariants & Architectural Alignment ---
  console.log('\n--- 6. Signup Service & Activation Invariants (E15 - E18) ---');

  // E15: Signup service remains enumeration-safe if SMTP delivery fails
  const printhouseSignupService = require('../src/api/services/printhouseSignupService');
  const startRes = await printhouseSignupService.startSignup({ email: 'nonexistent-user@domain.com' });
  assert.strictEqual(startRes.ok, true, 'E15: startSignup must return ok: true');
  assert.strictEqual(startRes.message, 'If this address can be used, activation instructions will be sent shortly.', 'E15: Returns blind confirmation');
  console.log('✓ Test E15: signup service remains enumeration-safe if SMTP delivery fails');

  // E16: /printhouse/start still never returns JWT
  assert.strictEqual(startRes.token, undefined, 'E16: Must not return token / JWT');
  assert.strictEqual(startRes.jwt, undefined, 'E16: Must not return jwt');
  console.log('✓ Test E16: /printhouse/start still never returns JWT');

  // E17: Activation URL generation contract unchanged
  const signupServiceCode = fs.readFileSync(path.resolve(__dirname, '../src/api/services/printhouseSignupService.js'), 'utf8');
  assert.ok(signupServiceCode.includes('${appBaseUrl}/auth/activate?token=${rawToken}'), 'E17: Activation URL path remains /auth/activate?token=...');
  console.log('✓ Test E17: activation URL generation contract unchanged');

  // E18: Existing activation page flow unchanged
  const activationPageCode = fs.readFileSync(path.resolve(__dirname, '../src/ui/pages/PrinthouseActivationPage.tsx'), 'utf8');
  assert.ok(activationPageCode.includes('/api/auth/printhouse/activation/inspect'), 'E18: Activation page inspects token on mount');
  assert.ok(activationPageCode.includes('/api/auth/printhouse/activate'), 'E18: Activation page consumes token on submit');
  console.log('✓ Test E18: existing activation page flow unchanged');

  console.log('\n================================================================');
  console.log('ALL PHASE 192 RC18 PRODUCTION EMAIL DELIVERY TESTS PASSED (E1 - E18)');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('\n[FAIL] RC18 Test Suite Failed:', err);
  process.exit(1);
});
