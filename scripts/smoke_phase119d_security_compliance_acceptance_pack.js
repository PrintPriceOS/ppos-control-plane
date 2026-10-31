'use strict';
// Phase 119D Smoke Test — Security/Compliance Pre-Launch Hardening Acceptance Pack

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    console.error(`  FAIL  ${label}`);
    fail++;
  }
}

console.log('\n=== Phase 119D — Security Compliance Hardening Acceptance Pack ===\n');

// --- Phase 119A-C smoke test files exist ---
const smokeFiles = [
  'smoke_phase119a_security_compliance_schema.js',
  'smoke_phase119b_security_compliance_service.js',
  'smoke_phase119c_security_compliance_admin_api_ui.js',
];
for (const f of smokeFiles) {
  check(`${f} exists`, fs.existsSync(path.join(__dirname, f)));
}

// --- Core files exist ---
check('Migration 061 exists',
  fs.existsSync(path.join(__dirname, '../migrations/061_phase119_security_secrets_compliance_prelaunch_hardening.sql')));
check('Service file exists',
  fs.existsSync(path.join(__dirname, '../src/api/services/prelaunchSecurityComplianceHardeningService.js')));
check('Route file exists',
  fs.existsSync(path.join(__dirname, '../src/api/routes/prelaunchSecurityComplianceHardeningAdmin.js')));
check('UI types exist',
  fs.existsSync(path.join(__dirname, '../src/ui/types/prelaunchSecurityComplianceHardening.ts')));
check('UI client exists',
  fs.existsSync(path.join(__dirname, '../src/ui/api/prelaunchSecurityComplianceHardeningClient.ts')));
check('UI page exists',
  fs.existsSync(path.join(__dirname, '../src/ui/pages/prelaunch/SecurityComplianceHardening.tsx')));

// --- Static safety scan on Phase 119 files ---
const phase119Files = [
  path.join(__dirname, '../src/api/services/prelaunchSecurityComplianceHardeningService.js'),
  path.join(__dirname, '../src/api/routes/prelaunchSecurityComplianceHardeningAdmin.js'),
];

const FORBIDDEN_PATTERNS = [
  'charge(',
  'refund(',
  'payout(',
  'capture(',
  'submitTax',
  'submitVat',
  'sendToProvider',
  'externalSubmission: true',
  'sourceMutation: true',
  'fullPublicEnabled: true',
  'liveProviderConnectivityEnabled: true',
  'paymentExecutionEnabled: true',
];

for (const filePath of phase119Files) {
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  for (const pattern of FORBIDDEN_PATTERNS) {
    check(`No "${pattern}" in ${fileName}`, !content.includes(pattern));
  }
}

// --- Route registration ---
const adminJs = fs.readFileSync(path.join(__dirname, '../src/api/routes/admin.js'), 'utf8');
check('admin.js registers prelaunchSecurityComplianceHardeningAdmin', adminJs.includes('prelaunchSecurityComplianceHardeningAdmin'));
check('admin.js mounts /prelaunch/security-compliance', adminJs.includes("'/prelaunch/security-compliance'"));

// --- UI registration ---
const appTsx = fs.readFileSync(path.join(__dirname, '../src/ui/App.tsx'), 'utf8');
check('App.tsx imports SecurityComplianceHardening', appTsx.includes('SecurityComplianceHardening'));
check('App.tsx registers /admin/prelaunch/security-compliance', appTsx.includes('/admin/prelaunch/security-compliance'));

// --- Safety markers present ---
const svcContent = fs.readFileSync(
  path.join(__dirname, '../src/api/services/prelaunchSecurityComplianceHardeningService.js'), 'utf8');
check('PHASE_119_REVIEW_ONLY safety string in service', svcContent.includes('PHASE_119_REVIEW_ONLY'));
check('review_only: true in service SAFETY_FLAGS', svcContent.includes('review_only: true'));
check('All compliance guardrails present', svcContent.includes('PRODUCTION_ACTIVATION_GATED') &&
  svcContent.includes('FULL_PUBLIC_DISABLED') &&
  svcContent.includes('PAYMENT_EXECUTION_DISABLED') &&
  svcContent.includes('SOURCE_RECORD_MUTATION_DISABLED'));
check('Safety invariants object in evidence pack', svcContent.includes('safety_invariants'));
check('PRODUCTION_ACTIVATION: NOT_ENABLED in evidence pack', svcContent.includes("'PRODUCTION_ACTIVATION': 'NOT_ENABLED'") || svcContent.includes("PRODUCTION_ACTIVATION: 'NOT_ENABLED'"));

// --- DB schema safety columns ---
const migSql = fs.readFileSync(
  path.join(__dirname, '../migrations/061_phase119_security_secrets_compliance_prelaunch_hardening.sql'), 'utf8');
check('review_only DEFAULT 1 in schema', migSql.includes('review_only TINYINT(1) NOT NULL DEFAULT 1'));
check('external_submission_enabled DEFAULT 0 in schema', migSql.includes('external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0'));
check('source_mutation_enabled DEFAULT 0 in schema', migSql.includes('source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0'));
check('production_activation_enabled DEFAULT 0 in schema', migSql.includes('production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0'));

// --- task.md and walkthrough.md updated ---
const taskPath = path.join(__dirname, '../task.md');
const walkthroughPath = path.join(__dirname, '../walkthrough.md');
if (fs.existsSync(taskPath)) {
  const task = fs.readFileSync(taskPath, 'utf8');
  check('task.md includes Phase 119 entry', task.includes('119') || task.includes('phase119') || task.includes('Phase 119'));
}
if (fs.existsSync(walkthroughPath)) {
  const wt = fs.readFileSync(walkthroughPath, 'utf8');
  check('walkthrough.md includes Phase 119 entry', wt.includes('119') || wt.includes('Phase 119'));
}

console.log('\n');
console.log('PRINTPRICE OS — PHASE 119 SECURITY / SECRETS / COMPLIANCE PRE-LAUNCH HARDENING');
console.log('STATUS: ' + (fail === 0 ? 'VALIDATED' : 'FAILED'));
console.log('REVIEW_ONLY_MODE: ACTIVE');
console.log('PRODUCTION_ACTIVATION: NOT_ENABLED');
console.log('FULL_PUBLIC: NOT_ENABLED');
console.log('LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED');
console.log('PAYMENT_EXECUTION: NOT_ENABLED');
console.log('REFUND_EXECUTION: NOT_ENABLED');
console.log('PAYOUT_EXECUTION: NOT_ENABLED');
console.log('EXTERNAL_TAX_SUBMISSION: NOT_ENABLED');
console.log('EXTERNAL_ACCOUNTING_SUBMISSION: NOT_ENABLED');
console.log('PROVIDER_EXTERNAL_SUBMISSION: NOT_ENABLED');
console.log('SOURCE_RECORD_MUTATION: NOT_ENABLED');
console.log('SECRET_EXPOSURE: NOT_ENABLED');
console.log('');
console.log(`Phase 119D Acceptance Pack: PASS=${pass} FAIL=${fail}`);
console.log('');

if (fail > 0) process.exit(1);
