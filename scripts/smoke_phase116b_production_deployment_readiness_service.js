'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let PASS = 0, FAIL = 0;

function assert(condition, label) {
  if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
  else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
  return condition;
}

const ROOT = path.resolve(__dirname, '..');

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function src(relPath) {
  try { return fs.readFileSync(path.join(ROOT, relPath), 'utf-8'); }
  catch (_) { return ''; }
}

function has(relPath, ...patterns) {
  const content = src(relPath);
  return patterns.every(p => content.includes(p));
}

function notHas(relPath, ...patterns) {
  const content = src(relPath);
  return patterns.every(p => !content.includes(p));
}

function syntaxOk(relPath) {
  try {
    execSync(`node --check "${path.join(ROOT, relPath)}"`, { stdio: 'pipe' });
    return true;
  } catch (_) { return false; }
}

async function run() {
  console.log('\n━━━ Phase 116B — Production Deployment Readiness Service ━━━\n');

  const SVC = 'src/api/services/productionDeploymentReadinessChecklistService.js';

  console.log('[1] File existence and syntax');
  assert(exists(SVC), 'B1: Service file exists');
  assert(syntaxOk(SVC), 'B2: Service syntax valid');

  console.log('\n[2] Required methods');
  assert(has(SVC, 'evaluateEnvironmentReadiness'), 'B3: evaluateEnvironmentReadiness');
  assert(has(SVC, 'evaluateMigrationReadiness'), 'B4: evaluateMigrationReadiness');
  assert(has(SVC, 'evaluateBackupReadiness'), 'B5: evaluateBackupReadiness');
  assert(has(SVC, 'evaluateSecretsReadiness'), 'B6: evaluateSecretsReadiness');
  assert(has(SVC, 'evaluateObservabilityReadiness'), 'B7: evaluateObservabilityReadiness');
  assert(has(SVC, 'evaluateRollbackReadiness'), 'B8: evaluateRollbackReadiness');
  assert(has(SVC, 'evaluateSupportReadiness'), 'B9: evaluateSupportReadiness');
  assert(has(SVC, 'buildDeploymentReadinessEvidencePack'), 'B10: buildDeploymentReadinessEvidencePack');
  assert(has(SVC, 'recordFinding'), 'B11: recordFinding');
  assert(has(SVC, 'resolveFinding'), 'B12: resolveFinding');
  assert(has(SVC, 'getAuditTimeline'), 'B13: getAuditTimeline');

  console.log('\n[3] Safety constants');
  assert(has(SVC, 'checklist_only: true'), 'B14: checklist_only: true in safety flags');
  assert(has(SVC, 'deployment_executed: false'), 'B15: deployment_executed: false');
  assert(has(SVC, 'production_activation_enabled: false'), 'B16: production_activation_enabled: false');
  assert(has(SVC, 'full_public_enabled: false'), 'B17: full_public_enabled: false');
  assert(has(SVC, 'live_provider_connectivity_enabled: false'), 'B18: live_provider_connectivity_enabled: false');
  assert(has(SVC, 'payment_execution_enabled: false'), 'B19: payment_execution_enabled: false');
  assert(has(SVC, 'refund_execution_enabled: false'), 'B20: refund_execution_enabled: false');
  assert(has(SVC, 'payout_execution_enabled: false'), 'B21: payout_execution_enabled: false');
  assert(has(SVC, 'PHASE_116_CHECKLIST_ONLY'), 'B22: PHASE_116_CHECKLIST_ONLY string present');

  console.log('\n[4] No forbidden execution patterns');
  assert(notHas(SVC, 'charge(', 'capture(', 'submitTax', 'submitVat', 'sendToProvider'), 'B23: No payment/submission calls');
  assert(notHas(SVC, 'externalSubmission: true', 'sourceMutation: true', 'fullPublicEnabled: true',
    'liveProviderConnectivityEnabled: true', 'deploymentExecuted: true'), 'B24: No enabled production flags');

  console.log('\n[5] Runtime service method verification');
  let svc;
  try {
    const Svc = require(path.join(ROOT, SVC));
    svc = new Svc();
    assert(typeof svc.evaluateEnvironmentReadiness === 'function', 'B25: evaluateEnvironmentReadiness is a function');
    assert(typeof svc.evaluateMigrationReadiness === 'function', 'B26: evaluateMigrationReadiness is a function');
    assert(typeof svc.evaluateBackupReadiness === 'function', 'B27: evaluateBackupReadiness is a function');
    assert(typeof svc.evaluateSecretsReadiness === 'function', 'B28: evaluateSecretsReadiness is a function');
    assert(typeof svc.evaluateObservabilityReadiness === 'function', 'B29: evaluateObservabilityReadiness is a function');
    assert(typeof svc.evaluateRollbackReadiness === 'function', 'B30: evaluateRollbackReadiness is a function');
    assert(typeof svc.evaluateSupportReadiness === 'function', 'B31: evaluateSupportReadiness is a function');
    assert(typeof svc.buildDeploymentReadinessEvidencePack === 'function', 'B32: buildDeploymentReadinessEvidencePack is a function');
    assert(typeof svc.recordFinding === 'function', 'B33: recordFinding is a function');
    assert(typeof svc.resolveFinding === 'function', 'B34: resolveFinding is a function');
    assert(typeof svc.getAuditTimeline === 'function', 'B35: getAuditTimeline is a function');
  } catch (err) {
    assert(false, `B25-B35: Service instantiation failed: ${err.message}`);
  }

  if (svc) {
    console.log('\n[6] Runtime safety invariants');

    const envResult = await svc.evaluateEnvironmentReadiness({ actor: 'smoke-test' });
    assert(envResult.checklist_only === true, 'B36: evaluateEnvironmentReadiness returns checklist_only: true');
    assert(envResult.deployment_executed === false, 'B37: evaluateEnvironmentReadiness returns deployment_executed: false');
    assert(envResult.safety && envResult.safety.checklistOnly === true, 'B38: safety.checklistOnly: true');

    const migResult = await svc.evaluateMigrationReadiness({ actor: 'smoke-test' });
    assert(migResult.checklist_only === true, 'B39: evaluateMigrationReadiness returns checklist_only: true');

    const bkpResult = await svc.evaluateBackupReadiness({ actor: 'smoke-test', backup_timestamp: '2026-06-17T00:00:00Z' });
    assert(bkpResult.checklist_only === true, 'B40: evaluateBackupReadiness returns checklist_only: true');
    assert(bkpResult.deployment_executed === false, 'B41: evaluateBackupReadiness deployment_executed: false');

    const secResult = await svc.evaluateSecretsReadiness({ actor: 'smoke-test' });
    assert(secResult.checklist_only === true, 'B42: evaluateSecretsReadiness returns checklist_only: true');

    const obsResult = await svc.evaluateObservabilityReadiness({ actor: 'smoke-test' });
    assert(obsResult.checklist_only === true, 'B43: evaluateObservabilityReadiness returns checklist_only: true');

    const rolResult = await svc.evaluateRollbackReadiness({ actor: 'smoke-test', rollback_script_documented: true });
    assert(rolResult.checklist_only === true, 'B44: evaluateRollbackReadiness returns checklist_only: true');

    const supResult = await svc.evaluateSupportReadiness({ actor: 'smoke-test', escalation_contacts_documented: true });
    assert(supResult.checklist_only === true, 'B45: evaluateSupportReadiness returns checklist_only: true');

    const evidencePack = await svc.buildDeploymentReadinessEvidencePack({
      actor: 'smoke-test',
      backup_timestamp: '2026-06-17T00:00:00Z',
      rollback_script_documented: true,
      escalation_contacts_documented: true,
    });
    assert(evidencePack.checklist_only === true, 'B46: evidencePack checklist_only: true');
    assert(evidencePack.deployment_executed === false, 'B47: evidencePack deployment_executed: false');
    assert(evidencePack.production_activation_enabled === false, 'B48: evidencePack production_activation_enabled: false');
    assert(evidencePack.categories && typeof evidencePack.categories === 'object', 'B49: evidencePack has categories');
    assert(evidencePack.summary && typeof evidencePack.summary.total === 'number', 'B50: evidencePack has summary');
    assert(evidencePack.safety && evidencePack.safety.checklistOnly === true, 'B51: evidencePack safety.checklistOnly: true');
    assert(typeof evidencePack.phase_safety_string === 'string' &&
      evidencePack.phase_safety_string.includes('PHASE_116'), 'B52: phase_safety_string includes PHASE_116');

    const finding = await svc.recordFinding({
      check_id: evidencePack.check_id,
      severity: 'MINOR',
      category: 'ENVIRONMENT',
      title: 'Smoke test finding',
      raised_by: 'smoke-test',
    });
    assert(finding.finding_id && finding.checklist_only === true, 'B53: recordFinding returns checklist_only: true');

    const resolved = await svc.resolveFinding({
      finding_id: finding.finding_id,
      check_id: evidencePack.check_id,
      resolved_by: 'smoke-test',
      resolution_notes: 'Resolved in smoke test',
    });
    assert(resolved.status === 'RESOLVED', 'B54: resolveFinding returns RESOLVED status');

    const timeline = await svc.getAuditTimeline({ check_id: evidencePack.check_id });
    assert(Array.isArray(timeline.audit_timeline), 'B55: getAuditTimeline returns array');
    assert(timeline.audit_timeline.length > 0, 'B56: Audit timeline has events');
    assert(timeline.checklist_only === true, 'B57: getAuditTimeline returns checklist_only: true');
  }

  console.log(`\n━━━ Phase 116B RESULT: ${PASS} PASS / ${FAIL} FAIL ━━━\n`);
  if (FAIL > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
