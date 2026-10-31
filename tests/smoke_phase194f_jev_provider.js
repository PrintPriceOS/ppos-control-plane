/**
 * tests/smoke_phase194f_jev_provider.js
 *
 * Phase 194F — Jev Decision Provider Architecture & Safety Smoke Tests
 *
 * Covers:
 * 194F-14: JEV_ENABLED=false works (falls back safely)
 * 194F-15: JEV_ENABLED=true adapter contract works
 * 194F-16: Jev timeout falls back safely
 * 194F-17: Jev low confidence -> REQUIRES_REVIEW
 * 194F-18: Jev cannot override deterministic inconsistency
 * 194F-19: Jev request does not contain API secrets
 * 194F-20: Jev receives minimized context
 * 194F-25: provider audit metadata recorded where configured
 */

const assert = require('assert');
const JevDecisionProvider = require('../src/api/services/decisionProvider/jevDecisionProvider');
const DeterministicDecisionProvider = require('../src/api/services/decisionProvider/deterministicDecisionProvider');
const decisionProvider = require('../src/api/services/decisionProvider/decisionProvider');

async function runJevTests() {
  console.log('==================================================');
  console.log('Running Phase 194F Jev Decision Provider Smoke Tests');
  console.log('==================================================');

  // Test 194F-14: JEV_ENABLED=false works
  console.log('\n[TEST 194F-14] JEV_ENABLED=false works...');
  process.env.JEV_ENABLED = 'false';
  const jevDisabled = new JevDecisionProvider();
  assert.strictEqual(jevDisabled.isAvailable(), false);

  const fallbackResult = await decisionProvider.evaluateDecision({
    task: 'QUOTE_FIELD_CLASSIFICATION',
    state: {},
    choices: ['manufacturing', 'transport', 'total'],
    context: { fieldHint: 'mfg costs' }
  });
  assert.strictEqual(fallbackResult.provider, 'DETERMINISTIC');
  assert.strictEqual(fallbackResult.decision, 'manufacturing');
  assert.strictEqual(fallbackResult.auditMetadata.fallbackUsed, true);
  console.log('✓ PASS 194F-14');

  // Test 194F-15: JEV_ENABLED=true adapter contract works
  console.log('\n[TEST 194F-15] JEV_ENABLED=true adapter contract works...');
  process.env.JEV_ENABLED = 'true';
  process.env.JEV_API_KEY = 'test-jev-key-123';
  const jevEnabled = new JevDecisionProvider({
    baseUrl: 'https://mock.jev.api',
    apiKey: 'test-jev-key-123'
  });
  assert.strictEqual(jevEnabled.isAvailable(), true);

  // Mock global fetch for testing Jev HTTP POST /v1/systemone
  global.fetch = async (url, options) => {
    assert.ok(url.endsWith('/v1/systemone'));
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.headers['Authorization'], 'Bearer test-jev-key-123');
    
    // Test 194F-19 & 194F-20: inspect payload minimization & absence of secrets
    const body = JSON.parse(options.body);
    assert.ok(!options.body.includes('test-jev-key-123'), 'Payload must not contain API key');
    assert.ok(body.context.snippet.length <= 500, 'Context snippet must be minimized <= 500 chars');

    return {
      ok: true,
      status: 200,
      json: async () => ({
        decision: 'manufacturing',
        confidence: 0.92,
        model: 'systemone-v1'
      })
    };
  };

  const jevRes = await jevEnabled.evaluateDecision({
    task: 'QUOTE_FIELD_CLASSIFICATION',
    state: {},
    choices: ['manufacturing', 'transport', 'total'],
    context: { snippet: 'Herstellungskosten €1283' }
  });

  assert.strictEqual(jevRes.provider, 'JEV');
  assert.strictEqual(jevRes.decision, 'manufacturing');
  assert.strictEqual(jevRes.confidence, 0.92);
  assert.strictEqual(jevRes.requiresReview, false);
  console.log('✓ PASS 194F-15');

  // Test 194F-16: Jev timeout falls back safely
  console.log('\n[TEST 194F-16] Jev timeout falls back safely...');
  global.fetch = async () => {
    const err = new Error('AbortError');
    err.name = 'AbortError';
    throw err;
  };

  const jevTimeoutProvider = new JevDecisionProvider({ enabled: true, apiKey: 'test' });
  try {
    await jevTimeoutProvider.evaluateDecision({ task: 'QUOTE_FIELD_CLASSIFICATION' });
    assert.fail('Should have thrown timeout error');
  } catch (err) {
    assert.strictEqual(err.code, 'JEV_TIMEOUT');
  }

  // Orchestrator fallback when Jev times out
  decisionProvider.jev = jevTimeoutProvider;
  const timeoutFallback = await decisionProvider.evaluateDecision({
    task: 'QUOTE_FIELD_CLASSIFICATION',
    choices: ['manufacturing'],
    context: { fieldHint: 'mfg' }
  });
  assert.strictEqual(timeoutFallback.provider, 'DETERMINISTIC');
  assert.strictEqual(timeoutFallback.auditMetadata.fallbackUsed, true);
  console.log('✓ PASS 194F-16');

  // Test 194F-17: Jev low confidence -> REQUIRES_REVIEW
  console.log('\n[TEST 194F-17] Jev low confidence -> REQUIRES_REVIEW...');
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      decision: 'manufacturing',
      confidence: 0.65, // Below 0.85 threshold
      model: 'systemone-v1'
    })
  });

  const lowConfProvider = new JevDecisionProvider({ enabled: true, apiKey: 'test', minConfidence: 0.85 });
  const lowConfRes = await lowConfProvider.evaluateDecision({
    task: 'QUOTE_FIELD_CLASSIFICATION',
    choices: ['manufacturing', 'total'],
    context: { snippet: 'Ambiguous text' }
  });
  assert.strictEqual(lowConfRes.confidence, 0.65);
  assert.strictEqual(lowConfRes.requiresReview, true, 'Low confidence Jev decision must require review');
  console.log('✓ PASS 194F-17');

  // Test 194F-18: Jev CANNOT override deterministic inconsistency
  console.log('\n[TEST 194F-18] Jev cannot override deterministic inconsistency...');
  decisionProvider.jev = new JevDecisionProvider({ enabled: true, apiKey: 'test' });
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      decision: 'ELIGIBLE',
      confidence: 0.99, // High Jev confidence
      model: 'systemone-v1'
    })
  });

  const vetoResult = await decisionProvider.evaluateDecision({
    task: 'EVIDENCE_ELIGIBILITY_ASSIST',
    state: { validationStatus: 'INCONSISTENT_UNIT_PRICE' }, // Deterministic arithmetic failure!
    choices: ['ELIGIBLE', 'REQUIRES_REVIEW'],
    context: { snippet: 'Stutensee 300 copies unit price mismatch' }
  });

  assert.strictEqual(vetoResult.vetoApplied, true, 'Deterministic veto must be applied');
  assert.strictEqual(vetoResult.decision, 'REQUIRES_REVIEW', 'Deterministic failure forces REQUIRES_REVIEW regardless of Jev 0.99 confidence');
  assert.strictEqual(vetoResult.requiresReview, true);
  console.log('✓ PASS 194F-18');

  // Test 194F-19 & 194F-20: Payload minimization & no secrets leak
  console.log('\n[TEST 194F-19 & 20] Payload minimization & secret safety...');
  const minimized = jevEnabled.minimizeContext({
    snippet: 'A'.repeat(2000), // 2000 chars text
    documentLanguage: 'de',
    secretKey: 'SUPERCALIFRAGILISTIC'
  });
  assert.strictEqual(minimized.snippet.length, 500, 'Snippet must be capped at 500 chars');
  assert.strictEqual(minimized.secretKey, undefined, 'Secrets must not be copied');
  console.log('✓ PASS 194F-19 & 194F-20');

  // Test 194F-25: Audit metadata recorded where configured
  console.log('\n[TEST 194F-25] Provider audit metadata recorded...');
  assert.ok(lowConfRes.auditMetadata, 'Audit metadata must exist');
  assert.strictEqual(lowConfRes.auditMetadata.provider, 'JEV');
  assert.strictEqual(lowConfRes.auditMetadata.confidence, 0.65);
  assert.ok(lowConfRes.auditMetadata.requestedAt);
  assert.ok(lowConfRes.auditMetadata.completedAt);
  console.log('✓ PASS 194F-25');

  console.log('\n==================================================');
  console.log('ALL PHASE 194F JEV PROVIDER TESTS PASSED!');
  console.log('==================================================');
}

runJevTests().catch(err => {
  console.error('\n❌ Jev Smoke Test Failed:', err);
  process.exit(1);
});
