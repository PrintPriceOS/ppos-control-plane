'use strict';
// Phase 120C Smoke Test — Final Pre-Production Release Candidate Admin API & UI

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

console.log('\n=== Phase 120C — Final Pre-Production Release Candidate Admin API & UI ===\n');

// Route file
const routePath = path.join(__dirname, '../src/api/routes/finalPreproductionReleaseCandidateAdmin.js');
check('Route file exists', fs.existsSync(routePath));

if (fs.existsSync(routePath)) {
  const content = fs.readFileSync(routePath, 'utf8');
  check('Route requires FinalPreproductionReleaseCandidateService', content.includes('finalPreproductionReleaseCandidateService'));
  check('Route uses requireAdmin middleware', content.includes('requireAdmin'));
  check('POST /create endpoint defined', content.includes("'/create'") || content.includes('"/create"'));
  check('POST /aggregate endpoint defined', content.includes("'/aggregate'") || content.includes('"/aggregate"'));
  check('POST /evaluate endpoint defined', content.includes("'/evaluate'") || content.includes('"/evaluate"'));
  check('POST /finding endpoint defined', content.includes("'/finding'") || content.includes('"/finding"'));
  check('POST /resolve-finding endpoint defined', content.includes("'/resolve-finding'") || content.includes('"/resolve-finding"'));
  check('GET /evidence-pack endpoint defined', content.includes("'/evidence-pack'") || content.includes('"/evidence-pack"'));
  check('reviewOnly: true in route SAFETY_MARKERS', content.includes('reviewOnly: true'));
  check('externalSubmission: false in route SAFETY_MARKERS', content.includes('externalSubmission: false'));
  check('sourceMutation: false in route SAFETY_MARKERS', content.includes('sourceMutation: false'));
  check('productionActivationEnabled: false in route', content.includes('productionActivationEnabled: false'));
  check('paymentExecutionEnabled: false in route', content.includes('paymentExecutionEnabled: false'));
  check('SAFETY_MESSAGE present in route', content.includes('SAFETY_MESSAGE'));
}

// admin.js registration
const adminJs = fs.readFileSync(path.join(__dirname, '../src/api/routes/admin.js'), 'utf8');
check('admin.js requires finalPreproductionReleaseCandidateAdmin', adminJs.includes('finalPreproductionReleaseCandidateAdmin'));
check('admin.js mounts /preproduction/release-candidate', adminJs.includes("'/preproduction/release-candidate'"));

// UI types
check('UI types file exists',
  fs.existsSync(path.join(__dirname, '../src/ui/types/finalPreproductionReleaseCandidate.ts')));

// UI client
const clientPath = path.join(__dirname, '../src/ui/api/finalPreproductionReleaseCandidateClient.ts');
check('UI client file exists', fs.existsSync(clientPath));

if (fs.existsSync(clientPath)) {
  const content = fs.readFileSync(clientPath, 'utf8');
  check('createReleaseCandidate function in client', content.includes('createReleaseCandidate'));
  check('aggregateReadinessEvidence function in client', content.includes('aggregateReadinessEvidence'));
  check('evaluateReleaseCandidate function in client', content.includes('evaluateReleaseCandidate'));
  check('recordFinding function in client', content.includes('recordFinding'));
  check('resolveFinding function in client', content.includes('resolveFinding'));
  check('getFinalEvidencePack function in client', content.includes('getFinalEvidencePack'));
  check('Client uses /api/admin/preproduction/release-candidate base', content.includes('/api/admin/preproduction/release-candidate'));
}

// UI page
const pagePath = path.join(__dirname, '../src/ui/pages/preproduction/FinalPreproductionReleaseCandidate.tsx');
check('UI page file exists', fs.existsSync(pagePath));

if (fs.existsSync(pagePath)) {
  const content = fs.readFileSync(pagePath, 'utf8');
  check('UI page exports FinalPreproductionReleaseCandidate', content.includes('FinalPreproductionReleaseCandidate'));
  check('UI page imports from finalPreproductionReleaseCandidateClient', content.includes('finalPreproductionReleaseCandidateClient'));
  check('SAFETY_NOTICE present in UI', content.includes('SAFETY_NOTICE'));
  check('UI mentions no production deployment', content.includes('production deployment') || content.includes('PRODUCTION_DEPLOYMENT'));
  check('UI shows safety invariants', content.includes('NOT_ENABLED'));
  check('UI shows phase validation summary', content.includes('Phase Validation Summary') || content.includes('phase_validation'));
  check('UI has Create Candidate action', content.includes('Create') && content.includes('Candidate'));
  check('UI has Evaluate action', content.includes('Evaluate'));
  check('UI has Evidence Pack action', content.includes('Evidence Pack'));
}

// App.tsx registration
const appTsx = fs.readFileSync(path.join(__dirname, '../src/ui/App.tsx'), 'utf8');
check('App.tsx imports FinalPreproductionReleaseCandidate', appTsx.includes('FinalPreproductionReleaseCandidate'));
check('App.tsx registers /admin/preproduction/release-candidate', appTsx.includes('/admin/preproduction/release-candidate'));

// Static forbidden pattern scan on route
if (fs.existsSync(routePath)) {
  const content = fs.readFileSync(routePath, 'utf8');
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
  for (const p of FORBIDDEN) {
    check(`No "${p}" in route`, !content.includes(p));
  }
}

console.log(`\nPhase 120C: PASS=${pass} FAIL=${fail}`);
if (fail > 0) process.exit(1);
