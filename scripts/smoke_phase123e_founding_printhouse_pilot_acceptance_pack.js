'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 123E: Founding Printhouse Pilot Acceptance Pack ===\n');

// --- File existence checks ---

const requiredFiles = [
  'migrations/067_phase123_founding_printhouse_pilot_gate.sql',
  'src/api/services/foundingPrinthousePilotGateService.js',
  'src/api/routes/foundingPrinthousePilotGateAdmin.js',
  'src/ui/types/foundingPrinthousePilotGate.ts',
  'src/ui/api/foundingPrinthousePilotGateClient.ts',
  'src/ui/pages/production/FoundingPrinthousePilotGate.tsx',
  'docs/phase123_founding_printhouse_pilot_gate.md',
];
for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(__dirname, '..', f)), `File exists: ${f}`);
}

// --- Service methods ---
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = 'true';

const FoundingPrinthousePilotGateService = require('../src/api/services/foundingPrinthousePilotGateService');
const svc = new FoundingPrinthousePilotGateService();

const requiredMethods = [
  'createPilotProgram', 'registerFoundingPrinthouse', 'evaluateParticipantReadiness',
  'approveParticipantForPilot', 'suspendParticipant', 'linkInternalPilotOrder',
  'evaluateOrderHandoffReadiness', 'submitPrinthouseReview', 'recordPilotFinding',
  'resolvePilotFinding', 'buildPrinthousePilotEvidencePack', 'getPrinthousePilotAuditTimeline',
  'getReadiness',
];
for (const m of requiredMethods) {
  assert(typeof svc[m] === 'function', `Service method: ${m}`);
}

// --- Safety invariant checks across all source files ---
const sourceFiles = [
  'src/api/services/foundingPrinthousePilotGateService.js',
  'src/api/routes/foundingPrinthousePilotGateAdmin.js',
];
for (const f of sourceFiles) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert(src.includes('fullPublicEnabled: false'), `${f}: fullPublicEnabled=false`);
  assert(src.includes('paymentExecutionEnabled: false'), `${f}: paymentExecutionEnabled=false`);
  assert(src.includes('openMarketplaceAccessEnabled: false') || src.includes('open_marketplace_enabled: false'), `${f}: openMarketplace=false`);
  assert(!src.includes('fullPublicEnabled: true'), `${f}: no fullPublicEnabled: true`);
  assert(!src.includes('paymentExecutionEnabled: true'), `${f}: no paymentExecutionEnabled: true`);
  assert(!src.includes('charge('), `${f}: no charge(`);
  assert(!src.includes('capture('), `${f}: no capture(`);
  assert(!src.includes('sendToProvider'), `${f}: no sendToProvider`);
  assert(!src.includes('submitTax'), `${f}: no submitTax`);
  assert(!src.includes('submitAccounting'), `${f}: no submitAccounting`);
}

// --- Migration safety ---
const migSrc = fs.readFileSync(path.join(__dirname, '..', 'migrations', '067_phase123_founding_printhouse_pilot_gate.sql'), 'utf8');
assert(migSrc.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: full_public_enabled defaults to 0');
assert(migSrc.includes('payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: payment_execution_enabled defaults to 0');
assert(migSrc.includes('production_handoff_allowed TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: production_handoff_allowed defaults to 0');

// --- E2E acceptance ---
(async () => {
  const prog = await svc.createPilotProgram({ tenant_id: 'acc-tenant', program_name: 'Acceptance Program', created_by: 'acceptance' });
  assert(prog.pilot_program.pilot_program_id, 'Acceptance: program created');
  assert(prog.safety.fullPublicEnabled === false, 'Acceptance: fullPublicEnabled=false');
  assert(prog.safety.paymentExecutionEnabled === false, 'Acceptance: paymentExecutionEnabled=false');
  assert(prog.safety.openMarketplaceAccessEnabled === false, 'Acceptance: openMarketplaceAccessEnabled=false');
  assert(prog.safety.providerExternalSubmissionEnabled === false, 'Acceptance: providerExternalSubmissionEnabled=false');
  assert(prog.safety.sourceMutationOutsidePilotScope === false, 'Acceptance: sourceMutationOutsidePilotScope=false');
  assert(prog.safety.productionActivationEnabled === false, 'Acceptance: productionActivationEnabled=false');
  assert(prog.safety.automaticProductionDispatch === false, 'Acceptance: automaticProductionDispatch=false');

  const reg = await svc.registerFoundingPrinthouse({
    pilot_program_id: prog.pilot_program.pilot_program_id, printhouse_tenant_id: 'acc-ph', printhouse_name: 'Acc PH',
    allowed_file_access_level: 'REDACTED_PREVIEW', created_by: 'acceptance',
  });
  assert(reg.participant.participant_status === 'REGISTERED', 'Acceptance: participant registered');

  const evidence = await svc.buildPrinthousePilotEvidencePack({ pilot_program_id: prog.pilot_program.pilot_program_id });
  assert(evidence.evidence_pack.integrity_hash, 'Acceptance: evidence has integrity hash');
  assert(evidence.evidence_pack.evidence_schema_version === '123.0', 'Acceptance: evidence schema version');
  assert(evidence.evidence_pack.redaction_classification === 'INTERNAL_ONLY', 'Acceptance: redaction classification');

  // Check no raw customer data values in evidence (field names in redacted_fields list are OK)
  const ep = evidence.evidence_pack;
  assert(ep.redacted_fields && ep.redacted_fields.includes('internal_customer_reference'), 'Acceptance: redacted_fields lists internal_customer_reference');
  assert(ep.redacted_fields && ep.redacted_fields.includes('raw_customer_data'), 'Acceptance: redacted_fields lists raw_customer_data');
  assert(ep.redacted_fields && ep.redacted_fields.includes('secrets'), 'Acceptance: redacted_fields lists secrets');
  assert(!ep.internal_customer_reference, 'Acceptance: no internal_customer_reference value in evidence');
  assert(!ep.raw_customer_data, 'Acceptance: no raw_customer_data value in evidence');
  assert(!ep.secrets, 'Acceptance: no secrets value in evidence');
  assert(!ep.raw_file_package_urls, 'Acceptance: no raw_file_package_urls value in evidence');
  assert(!ep.raw_invoice_data, 'Acceptance: no raw_invoice_data value in evidence');

  // App.tsx route check
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'App.tsx'), 'utf8');
  assert(appSrc.includes('/admin/production/founding-printhouse-pilot'), 'Acceptance: App.tsx route registered');

  // Admin mount check
  const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js'), 'utf8');
  assert(adminSrc.includes('/production/founding-printhouse-pilot'), 'Acceptance: admin.js mount');

  console.log(`\n=== Phase 123E Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
