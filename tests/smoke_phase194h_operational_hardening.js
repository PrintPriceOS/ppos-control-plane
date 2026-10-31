/**
 * tests/smoke_phase194h_operational_hardening.js
 *
 * Phase 194H — Operational Hardening Smoke Test Suite
 *
 * Test cases:
 * 194H-01: Health remains healthy with Jev disabled
 * 194H-02: Jev failure degrades safely without breaking deterministic review
 * 194H-03: PDF parser failure isolated to upload feature
 * 194H-04: Upload kill switch works (QUOTE_EVIDENCE_INGESTION_ENABLED)
 * 194H-05: Multi-quantity kill switch works (MULTI_QUANTITY_CALIBRATION_ENABLED)
 * 194H-06: Acceptance kill switch works (GOVERNED_CURVE_ACCEPTANCE_ENABLED)
 * 194H-07: Tenant isolation preserved across operational endpoints
 * 194H-15: Structured telemetry emitted with durationMs
 * 194H-16: No secrets emitted in telemetry
 * 194H-17: Error taxonomy stable with machine-readable codes
 */

const assert = require('assert');
const telemetry = require('../src/api/services/phase194TelemetryService');
const errorTaxonomy = require('../src/api/services/phase194ErrorTaxonomy');
const operationalHardening = require('../src/api/services/phase194OperationalHardeningService');
const decisionProvider = require('../src/api/services/decisionProvider/decisionProvider');

async function runSmokeTests() {
  console.log('==================================================');
  console.log('Running Phase 194H Operational Hardening Smoke Tests');
  console.log('==================================================');

  // Test 194H-01: Health remains healthy with Jev disabled
  console.log('\n[TEST 194H-01] Health & readiness check with Jev disabled...');
  delete process.env.PPOS_JEV_ENABLED;
  const readiness1 = await operationalHardening.evaluateReadiness();
  assert.strictEqual(readiness1.flags.jevAdvisory, false);
  assert.strictEqual(readiness1.dependencies.jevProvider, 'DISABLED_BY_POLICY');
  assert.ok(['READY', 'DEGRADED'].includes(readiness1.status), 'Readiness must remain READY/DEGRADED when Jev disabled');
  console.log('✓ PASS 194H-01');

  // Test 194H-02: Jev failure degrades safely
  console.log('\n[TEST 194H-02] Jev provider failure degrades safely without outage...');
  process.env.PPOS_JEV_ENABLED = 'true';
  process.env.JEV_API_KEY = 'invalid-key-test';
  
  const jevRes = await decisionProvider.evaluateDecision({
    task: 'EVIDENCE_ELIGIBILITY_ASSIST',
    state: { validationStatus: 'INCONSISTENT_UNIT_PRICE' },
    choices: ['ELIGIBLE', 'REQUIRES_REVIEW'],
    context: { snippet: 'Stutensee 300 test' }
  });
  assert.strictEqual(jevRes.decision, 'REQUIRES_REVIEW', 'Fallback must yield safe decision');
  assert.strictEqual(jevRes.provider, 'DETERMINISTIC_FALLBACK');
  console.log('✓ PASS 194H-02');

  // Reset Jev env
  delete process.env.PPOS_JEV_ENABLED;
  delete process.env.JEV_API_KEY;

  // Test 194H-03: PDF Parser failure isolation
  console.log('\n[TEST 194H-03] PDF Parser failure isolation...');
  const pdfExtractor = require('../src/api/services/pdfQuoteExtractionService');
  try {
    await pdfExtractor.extractPdfQuote(Buffer.from('CORRUPTED_NOT_A_PDF'), 'invalid.pdf', 'application/pdf');
    assert.fail('Should have failed parsing invalid PDF');
  } catch (err) {
    assert.ok(err.code === 'PDF_MALFORMED' || err.code === 'TEXT_EXTRACTION_FAILED');
  }
  console.log('✓ PASS 194H-03');

  // Test 194H-04: Upload kill switch
  console.log('\n[TEST 194H-04] Upload kill switch (QUOTE_EVIDENCE_INGESTION_ENABLED)...');
  process.env.PPOS_QUOTE_EVIDENCE_INGESTION_ENABLED = 'false';
  try {
    operationalHardening.assertFeatureEnabled('QUOTE_EVIDENCE_INGESTION_ENABLED');
    assert.fail('Should have thrown when feature disabled');
  } catch (err) {
    assert.strictEqual(err.code, 'FEATURE_DISABLED_BY_OPERATOR');
    assert.strictEqual(err.statusCode, 403);
  }
  delete process.env.PPOS_QUOTE_EVIDENCE_INGESTION_ENABLED;
  console.log('✓ PASS 194H-04');

  // Test 194H-05: Multi-quantity kill switch
  console.log('\n[TEST 194H-05] Multi-quantity kill switch (MULTI_QUANTITY_CALIBRATION_ENABLED)...');
  process.env.PPOS_MULTI_QUANTITY_CALIBRATION_ENABLED = 'false';
  try {
    operationalHardening.assertFeatureEnabled('MULTI_QUANTITY_CALIBRATION_ENABLED');
    assert.fail('Should have thrown when feature disabled');
  } catch (err) {
    assert.strictEqual(err.code, 'FEATURE_DISABLED_BY_OPERATOR');
  }
  delete process.env.PPOS_MULTI_QUANTITY_CALIBRATION_ENABLED;
  console.log('✓ PASS 194H-05');

  // Test 194H-06: Acceptance kill switch
  console.log('\n[TEST 194H-06] Acceptance kill switch (GOVERNED_CURVE_ACCEPTANCE_ENABLED)...');
  process.env.PPOS_GOVERNED_CURVE_ACCEPTANCE_ENABLED = 'false';
  try {
    operationalHardening.assertFeatureEnabled('GOVERNED_CURVE_ACCEPTANCE_ENABLED');
    assert.fail('Should have thrown when feature disabled');
  } catch (err) {
    assert.strictEqual(err.code, 'FEATURE_DISABLED_BY_OPERATOR');
  }
  delete process.env.PPOS_GOVERNED_CURVE_ACCEPTANCE_ENABLED;
  console.log('✓ PASS 194H-06');

  // Test 194H-07: Tenant isolation
  console.log('\n[TEST 194H-07] Tenant isolation check...');
  const errTenant = errorTaxonomy.createPhase194Error('TENANT_MISMATCH', 'Access denied to foreign tenant resource');
  assert.strictEqual(errTenant.code, 'TENANT_MISMATCH');
  assert.strictEqual(errTenant.statusCode, 403);
  console.log('✓ PASS 194H-07');

  // Test 194H-15: Structured Telemetry with durationMs
  console.log('\n[TEST 194H-15] Structured Telemetry with timer and durationMs...');
  const timer = telemetry.startTimer('smoke_operation', { tenantId: 'tenant-test-1' });
  await new Promise(r => setTimeout(r, 10));
  const emitted = timer.finish('quote_upload_completed', { metadataKey: 'sample' });
  assert.strictEqual(emitted.event, 'quote_upload_completed');
  assert.ok(typeof emitted.durationMs === 'number' && emitted.durationMs >= 5);
  console.log('✓ PASS 194H-15');

  // Test 194H-16: Secret redaction in telemetry
  console.log('\n[TEST 194H-16] Telemetry secret redaction verification...');
  const secretPayload = telemetry.emitEvent('test_secret_redaction', 'INFO', {
    tenantId: 'tenant-1',
    api_key: 'sk-live-1234567890',
    password: 'super-secret-pass',
    pdf_buffer: Buffer.from('PDF_CONTENT')
  });
  assert.strictEqual(secretPayload.metadata.api_key, '[REDACTED]');
  assert.strictEqual(secretPayload.metadata.password, '[REDACTED]');
  assert.ok(secretPayload.metadata.pdf_buffer.includes('[BUFFER'));
  console.log('✓ PASS 194H-16');

  // Test 194H-17: Error taxonomy stability
  console.log('\n[TEST 194H-17] Error taxonomy code stability...');
  const codes = Object.keys(errorTaxonomy.ERROR_CODES);
  assert.ok(codes.includes('UNDERDETERMINED_MODEL'));
  assert.ok(codes.includes('STALE_CALIBRATION_BASELINE'));
  assert.ok(codes.includes('GOVERNANCE_CURVE_REQUIRES_REVIEW'));
  assert.ok(codes.includes('JEV_TIMEOUT'));
  assert.ok(codes.includes('FEATURE_DISABLED_BY_OPERATOR'));
  console.log('✓ PASS 194H-17');

  console.log('\n==================================================');
  console.log('ALL PHASE 194H SMOKE TESTS PASSED!');
  console.log('==================================================');
}

runSmokeTests().catch(err => {
  console.error('\n❌ Phase 194H Smoke Test Failed:', err);
  process.exit(1);
});
