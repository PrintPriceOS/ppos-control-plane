'use strict';

const fs = require('fs');
const path = require('path');
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 122.1F: Internal Order Lifecycle Hardening Acceptance Pack ===\n');

// 1. All Phase 122.1 smoke scripts exist
const smokeScripts = [
  'smoke_phase122_1a_internal_order_lifecycle_hardening_schema.js',
  'smoke_phase122_1b_internal_order_lifecycle_persistence_and_allowlist.js',
  'smoke_phase122_1c_internal_order_lifecycle_blocker_enforcement.js',
  'smoke_phase122_1d_internal_order_lifecycle_prior_phase_evidence.js',
  'smoke_phase122_1e_internal_order_lifecycle_evidence_redaction.js',
  'smoke_phase122_1f_internal_order_lifecycle_hardening_acceptance_pack.js',
];
for (const s of smokeScripts) {
  assert(fs.existsSync(path.resolve(__dirname, s)), `Smoke script exists: ${s}`);
}

// 2. Migration 065 exists
assert(fs.existsSync(path.resolve(__dirname, '..', 'migrations', '065_phase122_1_internal_order_lifecycle_pilot_hardening.sql')), 'Migration 065 exists');

// 3. Phase 122 migration 064 still exists
assert(fs.existsSync(path.resolve(__dirname, '..', 'migrations', '064_phase122_internal_order_lifecycle_pilot.sql')), 'Migration 064 still exists');

// 4. Service and route files exist
const svcPath = path.resolve(__dirname, '..', 'src', 'api', 'services', 'internalOrderLifecyclePilotService.js');
const routePath = path.resolve(__dirname, '..', 'src', 'api', 'routes', 'internalOrderLifecyclePilotAdmin.js');
assert(fs.existsSync(svcPath), 'Service file exists');
assert(fs.existsSync(routePath), 'Route file exists');

// 5. UI files exist
assert(fs.existsSync(path.resolve(__dirname, '..', 'src', 'ui', 'types', 'internalOrderLifecyclePilot.ts')), 'UI types file exists');
assert(fs.existsSync(path.resolve(__dirname, '..', 'src', 'ui', 'api', 'internalOrderLifecyclePilotClient.ts')), 'UI client file exists');
assert(fs.existsSync(path.resolve(__dirname, '..', 'src', 'ui', 'pages', 'production', 'InternalOrderLifecyclePilot.tsx')), 'UI page file exists');

// 6. App.tsx route exists
const appTsx = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'App.tsx'), 'utf8');
assert(appTsx.includes('/admin/production/internal-order-lifecycle-pilot'), 'App.tsx has route');

// 7. Documentation exists
assert(fs.existsSync(path.resolve(__dirname, '..', 'docs', 'phase122_1_internal_order_lifecycle_pilot_hardening.md')), 'Phase 122.1 documentation exists');

// 8. Service hardening checks
const src = fs.readFileSync(svcPath, 'utf8');

// Tenant allowlist fail-closed
assert(src.includes('_tenantAllowlistFailClosed'), 'tenantAllowlistFailClosed marker present');
assert(src.includes('tenantAllowlistFailClosed'), 'Responses include tenantAllowlistFailClosed');

// DB read-through
assert(src.includes('getPilotRunById'), 'DB read-through: getPilotRunById');
assert(src.includes('getPilotOrderById'), 'DB read-through: getPilotOrderById');
assert(src.includes('listFindingsFromDb'), 'DB read-through: listFindingsFromDb');

// Persistence markers
assert(src.includes('persistenceMode'), 'persistenceMode in responses');
assert(src.includes('persistenceStatus'), 'persistenceStatus in responses');

// Blocker enforcement
assert(src.includes('BLOCKED_BY_FINDINGS'), 'BLOCKED_BY_FINDINGS status present');
assert(src.includes('INTERNAL_ORDER_LIFECYCLE_BLOCKED_BY_FINDINGS'), 'BLOCKED_BY_FINDINGS audit event present');

// pilot_run_id existence enforcement
assert(src.includes('does not exist'), 'pilot_run_id existence enforcement present');

// Prior phase evidence
assert(src.includes('_verifyPriorPhaseEvidence'), '_verifyPriorPhaseEvidence present');
assert(src.includes('PRIOR_PHASE_EVIDENCE_UNVERIFIED'), 'PRIOR_PHASE_EVIDENCE_UNVERIFIED status present');
assert(src.includes('priorPhaseEvidenceStatus'), 'priorPhaseEvidenceStatus in responses');

// Evidence integrity
assert(src.includes('evidence_integrity_hash'), 'evidence_integrity_hash present');
assert(src.includes('evidence_schema_version'), 'evidence_schema_version present');
assert(src.includes('_redactSensitiveFields'), 'Redaction method present');
assert(src.includes('redaction_classification'), 'redaction_classification present');

// No silent catch blocks
const silentCatchCount = (src.match(/catch\s*\(_\)\s*\{\s*\}/g) || []).length;
assert(silentCatchCount === 0, `No silent catch (_) {} blocks in service (found ${silentCatchCount})`);

// 9. UI hardening checks
const uiSrc = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'pages', 'production', 'InternalOrderLifecyclePilot.tsx'), 'utf8');
assert(uiSrc.includes('persistenceMode'), 'UI shows persistence mode');
assert(uiSrc.includes('persistenceStatus'), 'UI shows persistence status');
assert(uiSrc.includes('tenantAllowlistFailClosed'), 'UI shows tenant allowlist fail-closed status');
assert(uiSrc.includes('priorPhaseEvidenceStatus'), 'UI shows prior phase evidence status');
assert(uiSrc.includes('Hardening Status'), 'UI has Hardening Status section');
assert(uiSrc.includes('blocksLifecycle'), 'UI has blocks lifecycle checkbox');

// 10. Forbidden patterns across service and route
const routeSrc = fs.readFileSync(routePath, 'utf8');
const forbiddenPatterns = [
  'fullPublicEnabled: true', 'openMarketplaceAccessEnabled: true',
  'liveProviderConnectivityEnabled: true', 'paymentExecutionEnabled: true',
  'refundExecutionEnabled: true', 'payoutExecutionEnabled: true',
  'providerExternalSubmissionEnabled: true', 'externalSubmission: true',
  'sourceMutationOutsidePilotScope: true',
  'charge(', 'capture(', 'refund(', 'payout(', 'submitTax', 'submitVat', 'submitAccounting', 'sendToProvider',
];
for (const p of forbiddenPatterns) {
  assert(!src.includes(p), `Service: no forbidden pattern: ${p}`);
  assert(!routeSrc.includes(p), `Route: no forbidden pattern: ${p}`);
}

// 11. Safety markers still correct
assert(src.includes('fullPublicEnabled: false'), 'Safety: fullPublicEnabled false');
assert(src.includes('paymentExecutionEnabled: false'), 'Safety: paymentExecutionEnabled false');
assert(src.includes('sourceMutationOutsidePilotScope: false'), 'Safety: sourceMutationOutsidePilotScope false');

console.log(`\n=== Phase 122.1F Results: PASS ${passed} | FAIL ${failed} ===`);
if (failed > 0) process.exit(1);
