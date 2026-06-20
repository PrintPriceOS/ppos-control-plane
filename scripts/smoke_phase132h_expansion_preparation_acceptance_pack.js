'use strict';

const { spawnSync } = require('child_process');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 132 Expansion Preparation Acceptance Pack ===\n');

const smokes = [
  'smoke_phase132a_expansion_preparation_schema.js',
  'smoke_phase132b_expansion_preparation_service.js',
  'smoke_phase132c_expansion_preparation_readiness.js',
  'smoke_phase132d_safe_limits_scope_candidates.js',
  'smoke_phase132e_draft_invites_guardrails.js',
  'smoke_phase132f_expansion_preparation_admin_api_ui.js',
  'smoke_phase132g_expansion_preparation_evidence_pack.js',
  'smoke_phase132_0_1_readiness_evidence_dependency_repair.js',
  'smoke_phase132_0_2_fixture_idempotency_schema_alignment.js',
  'smoke_phase132_0_3_restart_cleanup_schema_alignment.js',
  'smoke_phase132_0_4_phase131_decision_hash_schema_alignment.js',
  'smoke_phase131h_operational_review_acceptance_pack.js'
];

const failedSmokes = [];

for (const script of smokes) {
  console.log(`Running ${script}...`);
  const res = spawnSync(process.execPath, ['-r', 'dotenv/config', `scripts/${script}`], { encoding: 'utf-8', env: { ...process.env } });
  
  // Print output so it's still visible
  if (res.stdout) console.log(res.stdout);
  if (res.stderr) console.error(res.stderr);

  if (res.status === 0) {
    assert(true, `${script} passed`);
  } else {
    assert(false, `${script} failed with exit code ${res.status}`);
    
    let reason = `exit code ${res.status}`;
    const failLines = (res.stdout + res.stderr).split('\n').filter(l => l.includes('FAIL:'));
    if (failLines.length > 0) {
        reason = failLines.map(l => l.trim().replace('FAIL:', '').trim()).join(' | ');
    } else {
        const errLines = (res.stderr || '').split('\n').filter(l => l.trim().length > 0);
        if (errLines.length > 0) reason = errLines[0];
    }
    
    failedSmokes.push({ script, reason });
  }
}

// Check for forbidden execution
const fs = require('fs');
const path = require('path');
const svcPath = path.join(__dirname, '../src/api/services/controlledBetaExpansionPreparationService.js');
let svcCode = fs.readFileSync(svcPath, 'utf8');

// Strip single and multi line comments to avoid false positives
svcCode = svcCode.replace(/\/\/.*/g, '');
svcCode = svcCode.replace(/\/\*[\s\S]*?\*\//g, '');

const forbidden = [
  'fullPublicEnabled: true',
  'openMarketplaceEnabled: true',
  'publicSignupEnabled: true',
  'publicBetaEnabled: true',
  'paymentExecutionEnabled: true',
  'refundExecutionEnabled: true',
  'payoutExecutionEnabled: true',
  'providerExternalSubmissionEnabled: true',
  'externalTaxSubmissionEnabled: true',
  'externalAccountingSubmissionEnabled: true',
  'sourceMutationEnabled: true',
  'autoExpansionEnabled: true',
  'inviteSendingEnabled: true',
  'activeInviteCreationEnabled: true',
  'participantAutoAddEnabled: true',
  'scopeAutoBroadenEnabled: true',
  'sendInvite(',
  'createActiveInvite(',
  'issueInvite(',
  'createInviteCode(',
  'addParticipant(',
  'grantRuntimeAccess(',
  'broadenScope(',
  'enablePublicBeta',
  'enableFullPublic',
  'enableOpenMarketplace',
  'charge(',
  'capture(',
  'refund(',
  'payout(',
  'sendToProvider',
  'submitTax',
  'submitVat',
  'submitAccounting',
  'console.log(process.env.DATABASE_URL)',
  'console.log(process.env.JWT_SECRET)'
];

for (const pattern of forbidden) {
  assert(!svcCode.includes(pattern), `Forbidden pattern scanner verifies ${pattern} is absent in executable paths`);
}

console.log(`\nSmoke 132H: Finished execution. ${passed} passed, ${failed} failed`);
if (failed > 0 || failedSmokes.length > 0) {
  if (failedSmokes.length > 0) {
    console.error('\nFAILED_SUBSMOKES:');
    for (const f of failedSmokes) {
      console.error(`* ${f.script}: ${f.reason}`);
    }
  }
  console.error('\nFATAL: Phase 132 Acceptance Pack Failed.');
  process.exit(1);
} else {
  console.log('\nSUCCESS: Phase 132 Acceptance Pack Passed.');
  process.exit(0);
}
