'use strict';

const fs = require('fs');
const path = require('path');
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 122.1E: Evidence Pack Redaction & Integrity ===\n');

const svcPath = path.resolve(__dirname, '..', 'src', 'api', 'services', 'internalOrderLifecyclePilotService.js');
const src = fs.readFileSync(svcPath, 'utf8');

// Evidence integrity hash
assert(src.includes('_computeEvidenceIntegrityHash'), 'Service has _computeEvidenceIntegrityHash method');
assert(src.includes('evidence_integrity_hash'), 'Evidence pack includes evidence_integrity_hash');
assert(src.includes('sha256'), 'Integrity hash uses sha256');

// Evidence schema version
assert(src.includes('evidence_schema_version'), 'Evidence pack includes evidence_schema_version');
assert(src.includes("EVIDENCE_SCHEMA_VERSION = '122.1'"), 'Evidence schema version is 122.1');

// Redaction
assert(src.includes('_redactSensitiveFields'), 'Service has _redactSensitiveFields method');
assert(src.includes('REDACTED_FIELDS'), 'Service defines REDACTED_FIELDS');
assert(src.includes('redaction_classification'), 'Redacted preview includes redaction_classification');
assert(src.includes("'INTERNAL_ONLY'"), 'Redaction classification INTERNAL_ONLY present');

// Redacted fields list
const redactedFields = [
  'internal_customer_reference',
  'raw_customer_data',
  'raw_file_package_url',
  'raw_preflight_artifact_path',
  'raw_invoice_data',
  'secret',
  'password',
  'token',
  'api_key',
  'credential',
];
for (const f of redactedFields) {
  assert(src.includes(f), `Redacted field list includes: ${f}`);
}

// Functional test
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.PILOT_TENANT_ALLOWLIST = '';

delete require.cache[require.resolve(svcPath)];
const InternalOrderLifecyclePilotService = require(svcPath);
const svc = new InternalOrderLifecyclePilotService();

(async () => {
  // Create run and build evidence pack
  const runResult = await svc.createPilotLifecycleRun({ tenant_id: 'test_tenant_redaction', requested_by: 'smoke_test' });
  const pilotRunId = runResult.pilot_run.pilot_run_id;

  const evidenceResult = await svc.buildInternalOrderLifecycleEvidencePack({ pilot_run_id: pilotRunId });
  const pack = evidenceResult.evidence_pack;
  const preview = evidenceResult.redacted_preview;

  // Integrity hash present
  assert(!!pack.evidence_integrity_hash, 'Evidence pack has integrity hash');
  assert(typeof pack.evidence_integrity_hash === 'string', 'Integrity hash is a string');
  assert(pack.evidence_integrity_hash.length === 64, 'Integrity hash is 64 chars (sha256 hex)');

  // Schema version
  assert(pack.evidence_schema_version === '122.1', 'Evidence schema version is 122.1');

  // Redacted preview
  assert(!!preview.redaction_classification, 'Redacted preview has redaction_classification');
  assert(preview.evidence_schema_version === '122.1', 'Redacted preview has schema version');
  assert(!!preview.evidence_integrity_hash, 'Redacted preview has integrity hash');
  assert(!!preview.safety_invariants, 'Redacted preview has safety_invariants');

  // Redacted preview should not contain sensitive fields
  const previewStr = JSON.stringify(preview);
  assert(!previewStr.includes('internal_customer_reference'), 'Preview does not include internal_customer_reference');
  assert(!previewStr.includes('raw_file_package_url'), 'Preview does not include raw_file_package_url');
  assert(!previewStr.includes('raw_preflight_artifact_path'), 'Preview does not include raw_preflight_artifact_path');
  assert(!previewStr.includes('raw_invoice_data'), 'Preview does not include raw_invoice_data');

  // Test _redactSensitiveFields directly
  const sensitiveObj = {
    pilot_run_id: 'test',
    internal_customer_reference: 'customer_123',
    raw_file_package_url: 'https://example.com/file.zip',
    secret: 'super_secret',
    password: 'p4ssw0rd',
    token: 'tok_123',
    api_key: 'ak_123',
    credential: 'cred_123',
    nested: {
      raw_invoice_data: { amount: 100 },
      raw_preflight_artifact_path: '/tmp/artifact',
    },
  };
  const redacted = svc._redactSensitiveFields(sensitiveObj);
  assert(redacted.internal_customer_reference === '[REDACTED]', 'internal_customer_reference is redacted');
  assert(redacted.secret === '[REDACTED]', 'secret is redacted');
  assert(redacted.password === '[REDACTED]', 'password is redacted');
  assert(redacted.token === '[REDACTED]', 'token is redacted');
  assert(redacted.api_key === '[REDACTED]', 'api_key is redacted');
  assert(redacted.credential === '[REDACTED]', 'credential is redacted');
  assert(redacted.pilot_run_id === 'test', 'Non-sensitive fields preserved');

  // Safety invariants in evidence
  assert(pack.safety_invariants.fullPublicEnabled === false, 'Evidence safety: fullPublicEnabled false');
  assert(pack.safety_invariants.paymentExecutionEnabled === false, 'Evidence safety: paymentExecutionEnabled false');
  assert(pack.safety_invariants.sourceMutationOutsidePilotScope === false, 'Evidence safety: sourceMutationOutsidePilotScope false');

  console.log(`\n=== Phase 122.1E Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('Smoke 122.1E failed:', err);
  process.exit(1);
});
