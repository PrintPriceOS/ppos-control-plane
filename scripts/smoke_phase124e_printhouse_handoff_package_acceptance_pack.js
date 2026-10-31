'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 124E: Printhouse Handoff Package Acceptance Pack ===\n');

// --- File existence checks ---

const requiredFiles = [
  'migrations/068_phase124_controlled_printhouse_handoff_file_package_pilot.sql',
  'src/api/services/controlledPrinthouseHandoffPackageService.js',
  'src/api/routes/controlledPrinthouseHandoffPackageAdmin.js',
  'src/ui/types/controlledPrinthouseHandoffPackage.ts',
  'src/ui/api/controlledPrinthouseHandoffPackageClient.ts',
  'src/ui/pages/production/ControlledPrinthouseHandoffPackage.tsx',
  'docs/phase124_controlled_printhouse_handoff_file_package_pilot.md',
];
for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(__dirname, '..', f)), `File exists: ${f}`);
}

// --- Service methods ---
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = 'true';

const ControlledPrinthouseHandoffPackageService = require('../src/api/services/controlledPrinthouseHandoffPackageService');
const FoundingPrinthousePilotGateService_forInit = require('../src/api/services/foundingPrinthousePilotGateService');
const svc = new ControlledPrinthouseHandoffPackageService({ phase123Service: new FoundingPrinthousePilotGateService_forInit() });

const requiredMethods = [
  'createHandoffPackage', 'evaluateHandoffReadiness', 'addPackageFileMetadata',
  'createScopedFileAccessGrant', 'revokeFileAccessGrant', 'submitPrinthouseHandoffReview',
  'acceptHandoffPackage', 'rejectHandoffPackage', 'recordHandoffFinding',
  'resolveHandoffFinding', 'buildHandoffEvidencePack', 'getHandoffAuditTimeline',
  'getReadiness',
];
for (const m of requiredMethods) {
  assert(typeof svc[m] === 'function', `Service method: ${m}`);
}

// --- Safety invariant checks across all source files ---
const sourceFiles = [
  'src/api/services/controlledPrinthouseHandoffPackageService.js',
  'src/api/routes/controlledPrinthouseHandoffPackageAdmin.js',
];
for (const f of sourceFiles) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert(src.includes('fullPublicEnabled: false'), `${f}: fullPublicEnabled=false`);
  assert(src.includes('paymentExecutionEnabled: false'), `${f}: paymentExecutionEnabled=false`);
  assert(src.includes('productionDispatchEnabled: false'), `${f}: productionDispatchEnabled=false`);
  assert(src.includes('unrestrictedFileAccess: false'), `${f}: unrestrictedFileAccess=false`);
  assert(src.includes('permanentPublicUrl: false'), `${f}: permanentPublicUrl=false`);
  assert(src.includes('openMarketplaceAccessEnabled: false') || src.includes('open_marketplace_enabled: false'), `${f}: openMarketplace=false`);
  assert(!src.includes('fullPublicEnabled: true'), `${f}: no fullPublicEnabled: true`);
  assert(!src.includes('paymentExecutionEnabled: true'), `${f}: no paymentExecutionEnabled: true`);
  assert(!src.includes('productionDispatchEnabled: true'), `${f}: no productionDispatchEnabled: true`);
  assert(!src.includes('unrestrictedFileAccess: true'), `${f}: no unrestrictedFileAccess: true`);
  assert(!src.includes('permanentPublicUrl: true'), `${f}: no permanentPublicUrl: true`);
  assert(!src.includes('charge('), `${f}: no charge(`);
  assert(!src.includes('capture('), `${f}: no capture(`);
  assert(!src.includes('sendToProvider'), `${f}: no sendToProvider`);
  assert(!src.includes('dispatchToMachine'), `${f}: no dispatchToMachine`);
  assert(!src.includes('submitTax'), `${f}: no submitTax`);
  assert(!src.includes('submitAccounting'), `${f}: no submitAccounting`);
}

// --- Migration safety ---
const migSrc = fs.readFileSync(path.join(__dirname, '..', 'migrations', '068_phase124_controlled_printhouse_handoff_file_package_pilot.sql'), 'utf8');
assert(migSrc.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: full_public_enabled defaults to 0');
assert(migSrc.includes('payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: payment_execution_enabled defaults to 0');
assert(migSrc.includes('production_dispatch_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: production_dispatch_enabled defaults to 0');
assert(migSrc.includes('unrestricted_file_access TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: unrestricted_file_access defaults to 0');
assert(migSrc.includes('permanent_public_url TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: permanent_public_url defaults to 0');
assert(migSrc.includes('file_download_audit_required TINYINT(1) NOT NULL DEFAULT 1'), 'Migration: file_download_audit_required defaults to 1');

// --- E2E acceptance ---
const FoundingPrinthousePilotGateService = require('../src/api/services/foundingPrinthousePilotGateService');

(async () => {
  const p123 = new FoundingPrinthousePilotGateService();
  const svcE2E = new ControlledPrinthouseHandoffPackageService({ phase123Service: p123 });

  // Setup Phase 123 participant
  const prog = await p123.createPilotProgram({ tenant_id: 'acc-tenant-124', program_name: 'Acceptance 124', created_by: 'acceptance' });
  const programId = prog.pilot_program.pilot_program_id;
  const reg = await p123.registerFoundingPrinthouse({
    pilot_program_id: programId, printhouse_tenant_id: 'acc-ph-124', printhouse_name: 'Acc PH 124',
    allowed_file_access_level: 'REDACTED_PREVIEW', created_by: 'acceptance',
  });
  const participantId = reg.participant.participant_id;
  await p123.approveParticipantForPilot({ participant_id: participantId, approved_by: 'acceptance' });

  // Create package
  const pkg = await svcE2E.createHandoffPackage({
    pilot_program_id: programId, participant_id: participantId, printhouse_tenant_id: 'acc-ph-124',
    file_access_scope: 'REDACTED_PREVIEW', created_by: 'acceptance',
  });
  assert(pkg.handoff_package.handoff_package_id, 'Acceptance: package created');
  assert(pkg.safety.fullPublicEnabled === false, 'Acceptance: fullPublicEnabled=false');
  assert(pkg.safety.paymentExecutionEnabled === false, 'Acceptance: paymentExecutionEnabled=false');
  assert(pkg.safety.productionDispatchEnabled === false, 'Acceptance: productionDispatchEnabled=false');
  assert(pkg.safety.unrestrictedFileAccess === false, 'Acceptance: unrestrictedFileAccess=false');
  assert(pkg.safety.permanentPublicUrl === false, 'Acceptance: permanentPublicUrl=false');
  assert(pkg.safety.openMarketplaceAccessEnabled === false, 'Acceptance: openMarketplaceAccessEnabled=false');
  assert(pkg.safety.providerExternalSubmissionEnabled === false, 'Acceptance: providerExternalSubmissionEnabled=false');
  assert(pkg.safety.sourceMutationOutsidePilotScope === false, 'Acceptance: sourceMutationOutsidePilotScope=false');

  const packageId = pkg.handoff_package.handoff_package_id;

  // Access grant
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const grant = await svcE2E.createScopedFileAccessGrant({
    handoff_package_id: packageId, participant_id: participantId, printhouse_tenant_id: 'acc-ph-124',
    access_scope: 'REDACTED_PREVIEW', expires_at: expires, created_by: 'acceptance',
  });
  assert(grant.access_grant.expires_at, 'Acceptance: grant has expiration');
  assert(grant.access_grant.download_audit_required === true, 'Acceptance: download audit required');
  assert(grant.access_grant.unrestricted_file_access === false, 'Acceptance: no unrestricted access');
  assert(grant.access_grant.permanent_public_url === false, 'Acceptance: no permanent URL');

  // Revoke grant
  const revoked = await svcE2E.revokeFileAccessGrant({ access_grant_id: grant.access_grant.access_grant_id, revoked_by: 'acceptance' });
  assert(revoked.access_grant.grant_status === 'REVOKED', 'Acceptance: revocation works');

  // Evidence pack
  const evidence = await svcE2E.buildHandoffEvidencePack({ handoff_package_id: packageId });
  assert(evidence.evidence_pack.integrity_hash, 'Acceptance: evidence has integrity hash');
  assert(evidence.evidence_pack.evidence_schema_version === '124.0', 'Acceptance: evidence schema version');
  assert(evidence.evidence_pack.redaction_classification === 'INTERNAL_ONLY', 'Acceptance: redaction classification');

  // Check no raw data in evidence
  const ep = evidence.evidence_pack;
  assert(ep.redacted_fields && ep.redacted_fields.includes('internal_customer_reference'), 'Acceptance: redacted_fields lists internal_customer_reference');
  assert(ep.redacted_fields && ep.redacted_fields.includes('raw_customer_data'), 'Acceptance: redacted_fields lists raw_customer_data');
  assert(ep.redacted_fields && ep.redacted_fields.includes('secrets'), 'Acceptance: redacted_fields lists secrets');
  assert(ep.redacted_fields && ep.redacted_fields.includes('raw_file_package_urls'), 'Acceptance: redacted_fields lists raw_file_package_urls');
  assert(ep.redacted_fields && ep.redacted_fields.includes('internal_file_paths'), 'Acceptance: redacted_fields lists internal_file_paths');
  assert(!ep.internal_customer_reference, 'Acceptance: no internal_customer_reference value in evidence');
  assert(!ep.raw_customer_data, 'Acceptance: no raw_customer_data value in evidence');
  assert(!ep.secrets, 'Acceptance: no secrets value in evidence');
  assert(!ep.raw_file_package_urls, 'Acceptance: no raw_file_package_urls value in evidence');
  assert(!ep.internal_file_paths, 'Acceptance: no internal_file_paths value in evidence');

  // App.tsx route check
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'App.tsx'), 'utf8');
  assert(appSrc.includes('/admin/production/printhouse-handoff-package'), 'Acceptance: App.tsx route registered');

  // Admin mount check
  const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js'), 'utf8');
  assert(adminSrc.includes('/production/printhouse-handoff-package'), 'Acceptance: admin.js mount');

  console.log(`\n=== Phase 124E Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
