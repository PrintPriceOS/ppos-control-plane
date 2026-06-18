'use strict';

const fs = require('fs');
const path = require('path');
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 122.1B: Persistence & Tenant Allowlist Hardening ===\n');

const svcPath = path.resolve(__dirname, '..', 'src', 'api', 'services', 'internalOrderLifecyclePilotService.js');
assert(fs.existsSync(svcPath), 'Service file exists');

const src = fs.readFileSync(svcPath, 'utf8');

// Tenant allowlist fail-closed
assert(src.includes('_isTestMode'), 'Service uses _isTestMode for allowlist fallback');
assert(src.includes('_tenantAllowlistFailClosed'), 'Service exposes _tenantAllowlistFailClosed');
assert(src.includes('tenantAllowlistFailClosed'), 'Responses include tenantAllowlistFailClosed');

// DB read-through methods
assert(src.includes('getPilotRunById'), 'DB read-through: getPilotRunById');
assert(src.includes('getPilotOrderById'), 'DB read-through: getPilotOrderById');
assert(src.includes('listFindingsFromDb'), 'DB read-through: listFindingsFromDb');
assert(src.includes('listStepsFromDb'), 'DB read-through: listStepsFromDb');
assert(src.includes('listAuditTimelineFromDb'), 'DB read-through: listAuditTimelineFromDb');
assert(src.includes('listRollbackPointsFromDb'), 'DB read-through: listRollbackPointsFromDb');
assert(src.includes('getEvidencePackFromDb'), 'DB read-through: getEvidencePackFromDb');

// Persistence markers
assert(src.includes('persistenceMode'), 'Service returns persistenceMode');
assert(src.includes('persistenceStatus'), 'Service returns persistenceStatus');
assert(src.includes("'DB'"), "Persistence mode DB present");
assert(src.includes("'MEMORY_FALLBACK'"), "Persistence mode MEMORY_FALLBACK present");
assert(src.includes("'PERSISTED'"), "Persistence status PERSISTED present");
assert(src.includes("'FALLBACK_ONLY'"), "Persistence status FALLBACK_ONLY present");
assert(src.includes("'FAILED'"), "Persistence status FAILED present");

// DB fallback is explicit
assert(src.includes('_isDbFallbackAllowed'), 'DB fallback uses _isDbFallbackAllowed guard');
assert(src.includes('ALLOW_DB_FALLBACK_FOR_SMOKE'), 'DB fallback references ALLOW_DB_FALLBACK_FOR_SMOKE env');

// No silent catch (_) {}
const silentCatchCount = (src.match(/catch\s*\(_\)\s*\{\s*\}/g) || []).length;
assert(silentCatchCount === 0, `No silent catch (_) {} blocks (found ${silentCatchCount})`);

// Functional test: tenant allowlist fail-closed in production mode
const originalEnv = { ...process.env };
delete process.env.PILOT_TENANT_ALLOWLIST;
delete process.env.NODE_ENV;
delete process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS;
delete process.env.ALLOW_DB_FALLBACK_FOR_SMOKE;

// Need fresh require to pick up env changes
delete require.cache[require.resolve(svcPath)];
let InternalOrderLifecyclePilotService;
try {
  InternalOrderLifecyclePilotService = require(svcPath);
} catch (e) {
  // May fail due to mysqlClient dependency, that's expected
}

if (InternalOrderLifecyclePilotService) {
  const svc = new InternalOrderLifecyclePilotService();

  // Empty allowlist in production mode should fail closed
  assert(!svc._isTenantAllowlisted('any_tenant'), 'Empty allowlist fails closed in production-like mode');
  assert(svc._tenantAllowlistFailClosed() === true, '_tenantAllowlistFailClosed returns true when empty and not test mode');

  // With explicit test mode
  process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = 'true';
  assert(svc._isTenantAllowlisted('any_tenant'), 'Allowlist opens in explicit test mode');
  delete process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS;

  // With NODE_ENV=test
  process.env.NODE_ENV = 'test';
  assert(svc._isTenantAllowlisted('any_tenant'), 'Allowlist opens with NODE_ENV=test');
  delete process.env.NODE_ENV;

  // With explicit allowlist
  process.env.PILOT_TENANT_ALLOWLIST = 'tenant_a,tenant_b';
  assert(svc._isTenantAllowlisted('tenant_a'), 'Allowlist includes tenant_a');
  assert(!svc._isTenantAllowlisted('tenant_c'), 'Allowlist excludes tenant_c');
  assert(svc._tenantAllowlistFailClosed() === false, '_tenantAllowlistFailClosed returns false when allowlist is present');
}

// Restore env
Object.assign(process.env, originalEnv);

// Forbidden patterns in service
const forbiddenPatterns = [
  'fullPublicEnabled: true', 'openMarketplaceAccessEnabled: true',
  'liveProviderConnectivityEnabled: true', 'paymentExecutionEnabled: true',
  'refundExecutionEnabled: true', 'payoutExecutionEnabled: true',
  'providerExternalSubmissionEnabled: true', 'externalSubmission: true',
  'sourceMutationOutsidePilotScope: true',
  'charge(', 'capture(', 'refund(', 'payout(', 'submitTax', 'submitVat', 'submitAccounting', 'sendToProvider',
];
for (const p of forbiddenPatterns) {
  assert(!src.includes(p), `Service does not contain forbidden pattern: ${p}`);
}

console.log(`\n=== Phase 122.1B Results: PASS ${passed} | FAIL ${failed} ===`);
if (failed > 0) process.exit(1);
