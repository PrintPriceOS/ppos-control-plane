'use strict';
// Phase 120B Smoke Test — Final Pre-Production Release Candidate Service

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

console.log('\n=== Phase 120B — Final Pre-Production Release Candidate Service ===\n');

const svcPath = path.join(__dirname, '../src/api/services/finalPreproductionReleaseCandidateService.js');
check('Service file exists', fs.existsSync(svcPath));

if (!fs.existsSync(svcPath)) {
  console.log(`\nPhase 120B: PASS=${pass} FAIL=${fail}`);
  process.exit(1);
}

// Syntax check via require
let svc;
try {
  const Svc = require(svcPath);
  svc = new Svc();
  check('Service instantiates without error', true);
} catch (e) {
  check(`Service instantiates without error (${e.message})`, false);
  console.log(`\nPhase 120B: PASS=${pass} FAIL=${fail}`);
  process.exit(1);
}

// Method existence
const methods = [
  'createReleaseCandidate',
  'aggregateReadinessEvidence',
  'evaluateReleaseCandidate',
  'recordFinding',
  'resolveFinding',
  'buildFinalEvidencePack',
  'getSafetyMarkers',
];
for (const m of methods) {
  check(`method ${m} exists`, typeof svc[m] === 'function');
}

// Safety markers
const markers = svc.getSafetyMarkers();
check('reviewOnly: true in safety markers', markers.reviewOnly === true);
check('externalSubmission: false in safety markers', markers.externalSubmission === false);
check('sourceMutation: false in safety markers', markers.sourceMutation === false);
check('productionActivationEnabled: false in safety markers', markers.productionActivationEnabled === false);
check('paymentExecutionEnabled: false in safety markers', markers.paymentExecutionEnabled === false);
check('refundExecutionEnabled: false in safety markers', markers.refundExecutionEnabled === false);
check('payoutExecutionEnabled: false in safety markers', markers.payoutExecutionEnabled === false);
check('fullPublicEnabled: false in safety markers', markers.fullPublicEnabled === false);
check('liveProviderConnectivityEnabled: false in safety markers', markers.liveProviderConnectivityEnabled === false);
check('phase_safety string contains PHASE_120_REVIEW_ONLY', markers.phase_safety.includes('PHASE_120_REVIEW_ONLY'));

// createReleaseCandidate
(async () => {
  try {
    const created = await svc.createReleaseCandidate({ created_by: 'smoke-test' });
    check('createReleaseCandidate returns reviewOnly: true', created.reviewOnly === true);
    check('createReleaseCandidate returns externalSubmission: false', created.externalSubmission === false);
    check('createReleaseCandidate returns sourceMutation: false', created.sourceMutation === false);
    check('createReleaseCandidate returns productionActivationEnabled: false', created.productionActivationEnabled === false);
    check('createReleaseCandidate.candidate has id', !!created.candidate && !!created.candidate.id);
    check('createReleaseCandidate.candidate review_only true', created.candidate.review_only === true);
    check('createReleaseCandidate.candidate production_activation_enabled false', created.candidate.production_activation_enabled === false);
    check('createReleaseCandidate.candidate payment_execution_enabled false', created.candidate.payment_execution_enabled === false);

    const candidateId = created.candidate.id;

    // aggregateReadinessEvidence
    const agg = await svc.aggregateReadinessEvidence({ candidate_id: candidateId, actor: 'smoke' });
    check('aggregateReadinessEvidence returns reviewOnly: true', agg.reviewOnly === true);
    check('aggregateReadinessEvidence returns phase_evidence array', Array.isArray(agg.phase_evidence));
    check('aggregateReadinessEvidence includes all 7 phases', agg.phase_evidence.length >= 7);
    check('aggregateReadinessEvidence has safety_invariants', !!agg.safety_invariants);
    check('PRODUCTION_ACTIVATION: NOT_ENABLED in safety invariants', agg.safety_invariants['PRODUCTION_ACTIVATION'] === 'NOT_ENABLED');

    // evaluateReleaseCandidate
    const evaluated = await svc.evaluateReleaseCandidate({ candidate_id: candidateId, actor: 'smoke' });
    check('evaluateReleaseCandidate returns reviewOnly: true', evaluated.reviewOnly === true);
    check('evaluateReleaseCandidate returns checks array', Array.isArray(evaluated.checks));
    check('evaluateReleaseCandidate production_deployment NOT_EXECUTED', evaluated.production_deployment === 'NOT_EXECUTED');
    check('evaluateReleaseCandidate production_activation NOT_ENABLED', evaluated.production_activation === 'NOT_ENABLED');

    // recordFinding
    const finding = await svc.recordFinding({
      candidate_id: candidateId,
      severity: 'MINOR',
      category: 'SMOKE_TEST',
      description: 'Smoke test finding',
      created_by: 'smoke',
    });
    check('recordFinding returns reviewOnly: true', finding.reviewOnly === true);
    check('recordFinding.finding has id', !!finding.finding && !!finding.finding.id);
    check('recordFinding.finding status OPEN', finding.finding.status === 'OPEN');

    // resolveFinding
    const resolved = await svc.resolveFinding({
      finding_id: finding.finding.id,
      candidate_id: candidateId,
      resolved_by: 'smoke',
    });
    check('resolveFinding returns reviewOnly: true', resolved.reviewOnly === true);

    // buildFinalEvidencePack
    const pack = await svc.buildFinalEvidencePack({ candidate_id: candidateId, actor: 'smoke' });
    check('buildFinalEvidencePack returns reviewOnly: true', pack.reviewOnly === true);
    check('buildFinalEvidencePack has evidence_pack', !!pack.evidence_pack);
    check('evidence_pack has safety_invariants', !!pack.evidence_pack.safety_invariants);
    check('evidence_pack PRODUCTION_ACTIVATION NOT_ENABLED',
      pack.evidence_pack.safety_invariants['PRODUCTION_ACTIVATION'] === 'NOT_ENABLED');
    check('evidence_pack SOURCE_RECORD_MUTATION NOT_ENABLED',
      pack.evidence_pack.safety_invariants['SOURCE_RECORD_MUTATION'] === 'NOT_ENABLED');
    check('evidence_pack phase_validation_summary present', Array.isArray(pack.evidence_pack.phase_validation_summary));

  } catch (e) {
    check(`Service async methods run without error (${e.message})`, false);
  }

  // Static source scan for forbidden patterns
  const content = fs.readFileSync(svcPath, 'utf8');
  const FORBIDDEN = [
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
  for (const pattern of FORBIDDEN) {
    check(`No "${pattern}" in service`, !content.includes(pattern));
  }

  console.log(`\nPhase 120B: PASS=${pass} FAIL=${fail}`);
  if (fail > 0) process.exit(1);
})();
