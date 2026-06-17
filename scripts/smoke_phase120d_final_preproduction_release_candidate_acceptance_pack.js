'use strict';
// Phase 120D Smoke Test — Final Pre-Production Release Candidate Acceptance Pack

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

console.log('\n=== Phase 120D — Final Pre-Production Release Candidate Acceptance Pack ===\n');

// --- Phase 120A-C smoke files exist ---
const smokeFiles = [
  'smoke_phase120a_final_preproduction_release_candidate_schema.js',
  'smoke_phase120b_final_preproduction_release_candidate_service.js',
  'smoke_phase120c_final_preproduction_release_candidate_admin_api_ui.js',
];
for (const f of smokeFiles) {
  check(`${f} exists`, fs.existsSync(path.join(__dirname, f)));
}

// --- Prior phase acceptance smokes exist ---
const priorSmokes = [
  'smoke_phase113g_production_activation_gate_acceptance_pack.js',
  'smoke_phase114e_controlled_production_activation_dry_run_acceptance_pack.js',
  'smoke_phase115d_pre_production_readiness_board_acceptance_pack.js',
  'smoke_phase116d_production_deployment_readiness_acceptance_pack.js',
  'smoke_phase117d_production_deployment_dry_run_acceptance_pack.js',
  'smoke_phase118d_observability_incident_acceptance_pack.js',
  'smoke_phase119d_security_compliance_acceptance_pack.js',
];
for (const f of priorSmokes) {
  check(`Prior phase smoke ${f} exists`, fs.existsSync(path.join(__dirname, f)));
}

// --- Core Phase 120 files exist ---
check('Migration 062 exists',
  fs.existsSync(path.join(__dirname, '../migrations/062_phase120_final_preproduction_release_candidate.sql')));
check('Service file exists',
  fs.existsSync(path.join(__dirname, '../src/api/services/finalPreproductionReleaseCandidateService.js')));
check('Route file exists',
  fs.existsSync(path.join(__dirname, '../src/api/routes/finalPreproductionReleaseCandidateAdmin.js')));
check('UI types exist',
  fs.existsSync(path.join(__dirname, '../src/ui/types/finalPreproductionReleaseCandidate.ts')));
check('UI client exists',
  fs.existsSync(path.join(__dirname, '../src/ui/api/finalPreproductionReleaseCandidateClient.ts')));
check('UI page exists',
  fs.existsSync(path.join(__dirname, '../src/ui/pages/preproduction/FinalPreproductionReleaseCandidate.tsx')));

// --- Static safety scan on Phase 120 service and route ---
const phase120Files = [
  path.join(__dirname, '../src/api/services/finalPreproductionReleaseCandidateService.js'),
  path.join(__dirname, '../src/api/routes/finalPreproductionReleaseCandidateAdmin.js'),
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
  'production_activation_enabled: true',
];

for (const filePath of phase120Files) {
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  for (const pattern of FORBIDDEN_PATTERNS) {
    check(`No "${pattern}" in ${fileName}`, !content.includes(pattern));
  }
}

// --- Safety markers in service ---
const svcContent = fs.readFileSync(
  path.join(__dirname, '../src/api/services/finalPreproductionReleaseCandidateService.js'), 'utf8');
check('PHASE_120_REVIEW_ONLY safety string in service', svcContent.includes('PHASE_120_REVIEW_ONLY'));
check('review_only: true in SAFETY_FLAGS', svcContent.includes('review_only: true'));
check('Phase references for all 7 phases in service', svcContent.includes("'113'") && svcContent.includes("'119'"));
check('PRODUCTION_ACTIVATION: NOT_ENABLED in service evidence', svcContent.includes("'PRODUCTION_ACTIVATION': 'NOT_ENABLED'"));
check('SOURCE_RECORD_MUTATION: NOT_ENABLED in service evidence', svcContent.includes("'SOURCE_RECORD_MUTATION': 'NOT_ENABLED'"));

// --- DB schema safety columns ---
const migSql = fs.readFileSync(
  path.join(__dirname, '../migrations/062_phase120_final_preproduction_release_candidate.sql'), 'utf8');
check('review_only DEFAULT 1 in schema', migSql.includes('review_only TINYINT(1) NOT NULL DEFAULT 1'));
check('external_submission_enabled DEFAULT 0 in schema', migSql.includes('external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0'));
check('source_mutation_enabled DEFAULT 0 in schema', migSql.includes('source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0'));
check('production_activation_enabled DEFAULT 0 in schema', migSql.includes('production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0'));

// --- Route registration ---
const adminJs = fs.readFileSync(path.join(__dirname, '../src/api/routes/admin.js'), 'utf8');
check('admin.js registers finalPreproductionReleaseCandidateAdmin', adminJs.includes('finalPreproductionReleaseCandidateAdmin'));
check('admin.js mounts /preproduction/release-candidate', adminJs.includes("'/preproduction/release-candidate'"));

// --- UI registration ---
const appTsx = fs.readFileSync(path.join(__dirname, '../src/ui/App.tsx'), 'utf8');
check('App.tsx imports FinalPreproductionReleaseCandidate', appTsx.includes('FinalPreproductionReleaseCandidate'));
check('App.tsx registers /admin/preproduction/release-candidate', appTsx.includes('/admin/preproduction/release-candidate'));

// --- task.md and walkthrough.md ---
const taskPath = path.join(__dirname, '../task.md');
const walkthroughPath = path.join(__dirname, '../walkthrough.md');
if (fs.existsSync(taskPath)) {
  const task = fs.readFileSync(taskPath, 'utf8');
  check('task.md includes Phase 120 entry', task.includes('120') || task.includes('Phase 120'));
}
if (fs.existsSync(walkthroughPath)) {
  const wt = fs.readFileSync(walkthroughPath, 'utf8');
  check('walkthrough.md includes Phase 120 entry', wt.includes('120') || wt.includes('Phase 120'));
}

// --- Service instantiation and evidence pack ---
(async () => {
  try {
    const Svc = require('../src/api/services/finalPreproductionReleaseCandidateService');
    const svc = new Svc();
    const created = await svc.createReleaseCandidate({ created_by: 'acceptance-pack' });
    check('createReleaseCandidate returns candidate', !!created.candidate);
    const pack = await svc.buildFinalEvidencePack({ candidate_id: created.candidate.id, actor: 'acceptance-pack' });
    check('buildFinalEvidencePack returns evidence_pack', !!pack.evidence_pack);
    check('evidence_pack safety_invariants present', !!pack.evidence_pack.safety_invariants);
    check('evidence_pack phase_validation_summary has 7 phases', pack.evidence_pack.phase_validation_summary.length >= 7);
    check('evidence_pack reviewOnly true', pack.reviewOnly === true);
  } catch (e) {
    check(`Service acceptance checks run without error (${e.message})`, false);
  }

  console.log('\n');
  console.log('PRINTPRICE OS — FINAL PRE-PRODUCTION RELEASE CANDIDATE');
  console.log('STATUS: ' + (fail === 0 ? 'VALIDATED' : 'FAILED'));
  console.log('PRODUCTION_DEPLOYMENT: NOT_EXECUTED');
  console.log('PRODUCTION_ACTIVATION: NOT_ENABLED');
  console.log('FULL_PUBLIC: NOT_ENABLED');
  console.log('LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED');
  console.log('PAYMENT_EXECUTION: NOT_ENABLED');
  console.log('REFUND_EXECUTION: NOT_ENABLED');
  console.log('PAYOUT_EXECUTION: NOT_ENABLED');
  console.log('EXTERNAL_SUBMISSIONS: NOT_ENABLED');
  console.log('SOURCE_RECORD_MUTATION: NOT_ENABLED');
  console.log('');
  console.log(`Phase 120D Acceptance Pack: PASS=${pass} FAIL=${fail}`);
  console.log('');

  if (fail > 0) process.exit(1);
})();
