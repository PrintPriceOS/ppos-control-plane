'use strict';
// Phase 119C Smoke Test — Security/Compliance Admin API & UI

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

console.log('\n=== Phase 119C — Security Compliance Hardening Admin API & UI Smoke ===\n');

// Route file
const routePath = path.join(__dirname, '../src/api/routes/prelaunchSecurityComplianceHardeningAdmin.js');
check('Route file exists', fs.existsSync(routePath));

if (fs.existsSync(routePath)) {
  const route = fs.readFileSync(routePath, 'utf8');

  check('Route requires auth middleware', route.includes('requireAdmin'));
  check('Route uses PrelaunchSecurityComplianceHardeningService', route.includes('PrelaunchSecurityComplianceHardeningService'));

  // Endpoints
  check("GET /scan/env-exposure endpoint", route.includes("'/scan/env-exposure'"));
  check("GET /scan/admin-routes endpoint", route.includes("'/scan/admin-routes'"));
  check("GET /scan/secret-leakage endpoint", route.includes("'/scan/secret-leakage'"));
  check("GET /scan/redaction endpoint", route.includes("'/scan/redaction'"));
  check("GET /scan/role-boundaries endpoint", route.includes("'/scan/role-boundaries'"));
  check("GET /scan/compliance-guardrails endpoint", route.includes("'/scan/compliance-guardrails'"));
  check("POST /finding endpoint", route.includes("'/finding'"));
  check("POST /resolve-finding endpoint", route.includes("'/resolve-finding'"));
  check("GET /evidence-pack endpoint", route.includes("'/evidence-pack'"));

  // Safety response
  check('Route returns safety markers', route.includes('SAFETY_MARKERS'));
  check('Route returns safety message', route.includes('SAFETY_MESSAGE'));
  check('safeResponse wraps all responses', route.includes('safeResponse('));

  // Safety values
  check('reviewOnly: true in safety markers', route.includes('reviewOnly: true'));
  check('externalSubmission: false in safety markers', route.includes('externalSubmission: false'));
  check('sourceMutation: false in safety markers', route.includes('sourceMutation: false'));
  check('productionActivationEnabled: false in safety markers', route.includes('productionActivationEnabled: false'));
  check('paymentExecutionEnabled: false in safety markers', route.includes('paymentExecutionEnabled: false'));
  check('fullPublicEnabled: false in safety markers', route.includes('fullPublicEnabled: false'));

  // No forbidden execution
  check('No charge( in route', !route.includes('charge('));
  check('No refund( in route', !route.includes('refund('));
  check('No payout( in route', !route.includes('payout('));
  check('No externalSubmission: true in route', !route.includes('externalSubmission: true'));
  check('No sourceMutation: true in route', !route.includes('sourceMutation: true'));
  check('No fullPublicEnabled: true in route', !route.includes('fullPublicEnabled: true'));
  check('No paymentExecutionEnabled: true in route', !route.includes('paymentExecutionEnabled: true'));
}

// admin.js registration
const adminJsPath = path.join(__dirname, '../src/api/routes/admin.js');
if (fs.existsSync(adminJsPath)) {
  const adminJs = fs.readFileSync(adminJsPath, 'utf8');
  check('admin.js requires prelaunchSecurityComplianceHardeningAdmin', adminJs.includes('prelaunchSecurityComplianceHardeningAdmin'));
  check("admin.js mounts /prelaunch/security-compliance", adminJs.includes("'/prelaunch/security-compliance'"));
}

// UI types
const typesPath = path.join(__dirname, '../src/ui/types/prelaunchSecurityComplianceHardening.ts');
check('UI types file exists', fs.existsSync(typesPath));
if (fs.existsSync(typesPath)) {
  const types = fs.readFileSync(typesPath, 'utf8');
  check('SecurityScanStatus type defined', types.includes('SecurityScanStatus'));
  check('SecurityEvidencePack type defined', types.includes('SecurityEvidencePack'));
  check('RecordFindingPayload type defined', types.includes('RecordFindingPayload'));
  check('SecuritySafetyMarkers type has reviewOnly: true', types.includes('reviewOnly: true'));
}

// UI client
const clientPath = path.join(__dirname, '../src/ui/api/prelaunchSecurityComplianceHardeningClient.ts');
check('UI client file exists', fs.existsSync(clientPath));
if (fs.existsSync(clientPath)) {
  const client = fs.readFileSync(clientPath, 'utf8');
  check('scanEnvExposure function exported', client.includes('export async function scanEnvExposure'));
  check('scanAdminRouteProtection function exported', client.includes('export async function scanAdminRouteProtection'));
  check('scanSecretLeakagePatterns function exported', client.includes('export async function scanSecretLeakagePatterns'));
  check('evaluateComplianceGuardrails function exported', client.includes('export async function evaluateComplianceGuardrails'));
  check('recordSecurityFinding function exported', client.includes('export async function recordSecurityFinding'));
  check('resolveSecurityFinding function exported', client.includes('export async function resolveSecurityFinding'));
  check('getSecurityComplianceEvidencePack function exported', client.includes('export async function getSecurityComplianceEvidencePack'));
  check('Client uses BASE /api/admin/prelaunch/security-compliance', client.includes('/api/admin/prelaunch/security-compliance'));
}

// UI page
const pagePath = path.join(__dirname, '../src/ui/pages/prelaunch/SecurityComplianceHardening.tsx');
check('UI page file exists', fs.existsSync(pagePath));
if (fs.existsSync(pagePath)) {
  const page = fs.readFileSync(pagePath, 'utf8');
  check('SecurityComplianceHardening component exported', page.includes('export function SecurityComplianceHardening'));
  check('SAFETY_NOTICE present in page', page.includes('SAFETY_NOTICE'));
  check('Safety notice mentions no production activation', page.includes('No production activation'));
  check('Safety notice mentions no external submission', page.includes('no external submission'));
  check('Safety notice mentions no source commercial record mutation', page.includes('no source commercial record mutation'));
  check('Safety constraints footer present', page.includes('PRODUCTION_ACTIVATION: NOT_ENABLED'));
  check('PAYMENT_EXECUTION: NOT_ENABLED in footer', page.includes('PAYMENT_EXECUTION: NOT_ENABLED'));
  check('SOURCE_RECORD_MUTATION: NOT_ENABLED in footer', page.includes('SOURCE_RECORD_MUTATION: NOT_ENABLED'));
  check('scanEnvExposure imported', page.includes('scanEnvExposure'));
  check('getSecurityComplianceEvidencePack imported', page.includes('getSecurityComplianceEvidencePack'));
  check('recordSecurityFinding imported', page.includes('recordSecurityFinding'));
  check('resolveSecurityFinding imported', page.includes('resolveSecurityFinding'));
}

// App.tsx route registration
const appTsxPath = path.join(__dirname, '../src/ui/App.tsx');
if (fs.existsSync(appTsxPath)) {
  const appTsx = fs.readFileSync(appTsxPath, 'utf8');
  check('App.tsx imports SecurityComplianceHardening', appTsx.includes('SecurityComplianceHardening'));
  check('App.tsx registers /admin/prelaunch/security-compliance route', appTsx.includes('/admin/prelaunch/security-compliance'));
}

console.log(`\nPhase 119C Admin API & UI Smoke: PASS=${pass} FAIL=${fail}\n`);
if (fail > 0) process.exit(1);
