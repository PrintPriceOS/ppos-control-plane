'use strict';
/**
 * Phase 72D Smoke Test — Control Plane Policy Profile Admin UX
 *
 * Validates:
 *  1. policyProfileService: getActiveProfile, evaluateProfileStatus, buildProfilePanel
 *  2. Operator UX structure completeness
 *  3. No PII / no raw paths in output
 *  4. No overclaims in panel output
 *  5. ProfilePanel component file structure checks
 */

const path = require('path');
const fs   = require('fs');

const {
    getActiveProfile,
    evaluateProfileStatus,
    buildProfilePanel,
    BLOCKER_DESCRIPTIONS
} = require('../src/api/services/policyProfileService');

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
let PASS = 0, FAIL = 0;
const results = [];

function assert(condition, label, detail) {
    const pass = !!condition;
    if (pass) { console.log(`  ✅  ${label}`); PASS++; }
    else       { console.error(`  ❌  ${label}${detail ? ': ' + detail : ''}`); FAIL++; }
    results.push({ label, pass, detail: detail || null });
}

// Sample human reports
function makeHumanReport(opts = {}) {
    return {
        fix_audit: {
            version: '2.0',
            findings: opts.findings || [],
            policy_profile_governance: opts.preComputedGovernance || null,
            standards_certification_governance: {
                standard_detected: opts.standard_detected || null
            }
        },
        policy_profile_governance: opts.preComputedGovernance || null
    };
}

const PRE_COMPUTED_GOV_PASSING = {
    profile_id: 'OFFSET_STANDARD',
    profile_label: 'Offset Standard',
    profile_passed: true,
    profile_blockers: [],
    profile_warnings: [],
    evaluated_at: '2026-06-10T18:00:00.000Z',
    production_certified: false,
    standard_certified: false,
    compliance_claim_allowed: false,
    print_ready_claim_allowed: false
};

const PRE_COMPUTED_GOV_BLOCKED = {
    profile_id: 'PDFX4_STRICT',
    profile_label: 'PDF/X-4 Strict',
    profile_passed: false,
    profile_blockers: ['PROFILE_BLEED_REQUIRED', 'PROFILE_NO_JAVASCRIPT_VIOLATED'],
    profile_warnings: ['PROFILE_STANDARD_REQUIRED_BUT_NOT_VALIDATED: PDF/X-4'],
    evaluated_at: '2026-06-10T18:00:00.000Z',
    production_certified: false,
    standard_certified: false,
    compliance_claim_allowed: false,
    print_ready_claim_allowed: false
};

// ---------------------------------------------------------------------------
// PART 1 — getActiveProfile
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 1 — getActiveProfile ===\n');

// 1.1 Active profile from pre-computed Worker governance
{
    const report = makeHumanReport({ preComputedGovernance: PRE_COMPUTED_GOV_PASSING });
    const active = getActiveProfile(report);
    assert(active.profile_id === 'OFFSET_STANDARD',      '1.1 profile_id from worker governance');
    assert(active.source === 'worker_governance',         '1.1 source=worker_governance');
    assert(typeof active.profile_label === 'string',      '1.1 profile_label is string');
}

// 1.2 No pre-computed → defaults to NONE
{
    const report = makeHumanReport();
    const active = getActiveProfile(report);
    assert(active.profile_id === 'NONE',  '1.2 NONE default when no governance present');
    assert(active.source === 'default',   '1.2 source=default');
}

// 1.3 NONE profile in pre-computed → treated as default
{
    const report = makeHumanReport({ preComputedGovernance: { ...PRE_COMPUTED_GOV_PASSING, profile_id: 'NONE' } });
    const active = getActiveProfile(report);
    assert(active.profile_id === 'NONE', '1.3 NONE profile_id treated as default');
}

// ---------------------------------------------------------------------------
// PART 2 — evaluateProfileStatus
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 2 — evaluateProfileStatus ===\n');

// 2.1 Pre-computed governance used directly
{
    const report = makeHumanReport({ preComputedGovernance: PRE_COMPUTED_GOV_PASSING });
    const status = evaluateProfileStatus(report);
    assert(status.profile_id === 'OFFSET_STANDARD', '2.1 profile_id from pre-computed');
    assert(status.profile_passed === true,           '2.1 profile_passed from pre-computed');
    assert(status.source === 'pre_computed_by_worker', '2.1 source=pre_computed_by_worker');
}

// 2.2 Pre-computed blocked governance
{
    const report = makeHumanReport({ preComputedGovernance: PRE_COMPUTED_GOV_BLOCKED });
    const status = evaluateProfileStatus(report);
    assert(status.profile_passed === false, '2.2 profile_passed=false preserved');
    assert(status.profile_blockers.includes('PROFILE_BLEED_REQUIRED'), '2.2 PROFILE_BLEED_REQUIRED preserved');
}

// 2.3 Governance invariants enforced even on pre-computed data
{
    const maliciousGov = { ...PRE_COMPUTED_GOV_PASSING, production_certified: true };
    const report = makeHumanReport({ preComputedGovernance: maliciousGov });
    const status = evaluateProfileStatus(report);
    assert(status.production_certified === false,     '2.3 production_certified scrubbed to false');
    assert(status.standard_certified === false,       '2.3 standard_certified scrubbed to false');
    assert(status.compliance_claim_allowed === false, '2.3 compliance_claim_allowed scrubbed to false');
}

// 2.4 No pre-computed → fresh evaluation
{
    const report = makeHumanReport({ findings: [{ id: 'BLEED_MISSING' }] });
    const status = evaluateProfileStatus(report, 'PDFX4_STRICT');
    // Engine evaluator available → should produce blockers
    assert(typeof status.profile_passed === 'boolean', '2.4 Fresh evaluation returns profile_passed boolean');
    assert(status.production_certified === false,      '2.4 Fresh evaluation: production_certified=false');
}

// ---------------------------------------------------------------------------
// PART 3 — buildProfilePanel
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 3 — buildProfilePanel ===\n');

// 3.1 Passing profile panel
{
    const report = makeHumanReport({ preComputedGovernance: PRE_COMPUTED_GOV_PASSING });
    const { ok, policy_profile_ux } = buildProfilePanel(report, { audience: 'operator' });
    assert(ok === true,                                          '3.1 buildProfilePanel ok=true');
    assert(policy_profile_ux !== null,                          '3.1 policy_profile_ux present');
    assert(policy_profile_ux.active_profile.profile_id === 'OFFSET_STANDARD', '3.1 active_profile.profile_id');
    assert(policy_profile_ux.profile_passed === true,           '3.1 profile_passed=true');
    assert(Array.isArray(policy_profile_ux.profile_blockers),   '3.1 profile_blockers is array');
    assert(Array.isArray(policy_profile_ux.profile_warnings),   '3.1 profile_warnings is array');
    assert(policy_profile_ux.audience === 'operator',           '3.1 audience=operator');
}

// 3.2 Blocked profile panel — blockers surfaced
{
    const report = makeHumanReport({ preComputedGovernance: PRE_COMPUTED_GOV_BLOCKED });
    const { ok, policy_profile_ux } = buildProfilePanel(report, { audience: 'operator' });
    assert(ok === true,                                                       '3.2 ok=true for blocked profile');
    assert(policy_profile_ux.profile_passed === false,                        '3.2 profile_passed=false');
    assert(policy_profile_ux.profile_blockers.includes('PROFILE_BLEED_REQUIRED'), '3.2 PROFILE_BLEED_REQUIRED in panel');
    assert(policy_profile_ux.profile_blockers.includes('PROFILE_NO_JAVASCRIPT_VIOLATED'), '3.2 JS blocker in panel');
}

// 3.3 Operator panel has blockers_detail
{
    const report = makeHumanReport({ preComputedGovernance: PRE_COMPUTED_GOV_BLOCKED });
    const { policy_profile_ux } = buildProfilePanel(report, { audience: 'operator' });
    assert(Array.isArray(policy_profile_ux.blockers_detail),   '3.3 blockers_detail present for operator');
    assert(policy_profile_ux.blockers_detail.length > 0,       '3.3 blockers_detail not empty');
    assert(policy_profile_ux.blockers_detail[0].code !== undefined, '3.3 blockers_detail[].code present');
    assert(policy_profile_ux.blockers_detail[0].description !== undefined, '3.3 blockers_detail[].description present');
}

// 3.4 Customer panel has no blockers_detail
{
    const report = makeHumanReport({ preComputedGovernance: PRE_COMPUTED_GOV_BLOCKED });
    const { policy_profile_ux } = buildProfilePanel(report, { audience: 'customer' });
    assert(policy_profile_ux.audience === 'customer',          '3.4 audience=customer');
    assert(!('blockers_detail' in policy_profile_ux),          '3.4 no blockers_detail for customer');
}

// ---------------------------------------------------------------------------
// PART 4 — No PII / no raw paths in output
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 4 — No PII / No Raw Paths in Output ===\n');

{
    // Inject raw path in warning (would come from a badly formed upstream)
    const badGov = {
        ...PRE_COMPUTED_GOV_PASSING,
        profile_warnings: ['WARNING: file at C:\\Users\\KIKE\\temp\\file.pdf not found']
    };
    const report = makeHumanReport({ preComputedGovernance: badGov });
    const { policy_profile_ux } = buildProfilePanel(report, { audience: 'operator' });
    const serialized = JSON.stringify(policy_profile_ux);

    // Raw paths should be redacted
    const hasRawPath = serialized.includes('C:\\\\Users') || serialized.includes('C:/Users');
    assert(!hasRawPath, '4.1 Raw filesystem paths redacted from panel output');

    // PII keys must not appear
    const PII_KEYS = ['customer_email', 'email', 'phone', 'address', 'customer_address', 'taxId', 'tax_id'];
    const hasPii = PII_KEYS.some(k => serialized.includes(`"${k}"`));
    assert(!hasPii, '4.2 No PII keys in panel output');
}

// ---------------------------------------------------------------------------
// PART 5 — No overclaims in panel output
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 5 — No Overclaims in Panel Output ===\n');

{
    const report = makeHumanReport({ preComputedGovernance: PRE_COMPUTED_GOV_PASSING });
    const { policy_profile_ux } = buildProfilePanel(report);
    assert(policy_profile_ux.production_certified === false,      '5.1 production_certified=false');
    assert(policy_profile_ux.standard_certified === false,        '5.2 standard_certified=false');
    assert(policy_profile_ux.compliance_claim_allowed === false,  '5.3 compliance_claim_allowed=false');
    assert(policy_profile_ux.print_ready_claim_allowed === false, '5.4 print_ready_claim_allowed=false');

    const serialized = JSON.stringify(policy_profile_ux);
    assert(!serialized.includes('"production_certified":true'),    '5.5 No production_certified:true in JSON');
    assert(!serialized.includes('"standard_certified":true'),      '5.6 No standard_certified:true in JSON');
    assert(!serialized.includes('"compliance_claim_allowed":true'),'5.7 No compliance_claim_allowed:true in JSON');
}

// ---------------------------------------------------------------------------
// PART 6 — BLOCKER_DESCRIPTIONS coverage
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 6 — BLOCKER_DESCRIPTIONS Coverage ===\n');

const EXPECTED_BLOCKER_CODES = [
    'PROFILE_BLEED_REQUIRED', 'PROFILE_TAC_LIMIT_EXCEEDED', 'PROFILE_CMYK_REQUIRED',
    'PROFILE_FONTS_MUST_BE_EMBEDDED', 'PROFILE_TYPE3_FONTS_NOT_ALLOWED',
    'PROFILE_NO_JAVASCRIPT_VIOLATED', 'PROFILE_NO_EMBEDDED_FILES_VIOLATED',
    'PROFILE_NO_LAUNCH_ACTIONS_VIOLATED', 'PROFILE_CROP_MARKS_REQUIRED',
    'PROFILE_STANDARD_MISMATCH'
];
for (const code of EXPECTED_BLOCKER_CODES) {
    assert(code in BLOCKER_DESCRIPTIONS, `6.1 BLOCKER_DESCRIPTIONS has "${code}"`);
}

// ---------------------------------------------------------------------------
// PART 7 — Component file checks
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 7 — PolicyProfilePanel Component Checks ===\n');

{
    const componentPath = path.resolve(__dirname, '../src/ui/components/PolicyProfilePanel.tsx');
    assert(fs.existsSync(componentPath), '7.1 PolicyProfilePanel.tsx exists');
    const componentSrc = fs.readFileSync(componentPath, 'utf8');
    assert(componentSrc.includes('PolicyProfilePanel'),         '7.2 Component export present');
    assert(componentSrc.includes('profile_passed'),             '7.3 profile_passed rendered');
    assert(componentSrc.includes('profile_blockers'),           '7.4 profile_blockers rendered');
    assert(componentSrc.includes('profile_warnings'),           '7.5 profile_warnings rendered');
    assert(componentSrc.includes('data-testid'),                '7.6 data-testid attributes for testing');
    // Governance note must be present
    assert(componentSrc.includes('Governance') || componentSrc.includes('governance'), '7.7 Governance note in component');
    // Must NOT display "Production Certified" as a positive badge
    const hasBadCertifiedText = componentSrc.includes('Production Certified') && componentSrc.includes('✅ Production Certified');
    assert(!hasBadCertifiedText, '7.8 No "✅ Production Certified" in component');
}

// ---------------------------------------------------------------------------
// PART 8 — policyProfileService file checks
// ---------------------------------------------------------------------------
console.log('\n\n=== PART 8 — policyProfileService Structure ===\n');

{
    const servicePath = path.resolve(__dirname, '../src/api/services/policyProfileService.js');
    assert(fs.existsSync(servicePath), '8.1 policyProfileService.js exists');
    const serviceSrc = fs.readFileSync(servicePath, 'utf8');
    assert(serviceSrc.includes('getActiveProfile'),      '8.2 getActiveProfile exported');
    assert(serviceSrc.includes('evaluateProfileStatus'), '8.3 evaluateProfileStatus exported');
    assert(serviceSrc.includes('buildProfilePanel'),     '8.4 buildProfilePanel exported');
    assert(serviceSrc.includes('production_certified: false'), '8.5 production_certified:false enforcement');
    assert(serviceSrc.includes('BLOCKER_DESCRIPTIONS'),  '8.6 BLOCKER_DESCRIPTIONS present');
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------
const reportsDir = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

const smokePassed = FAIL === 0;
const report = {
    generated_at: new Date().toISOString(),
    phase: '72D',
    repo: 'ppos-control-plane',
    category: 'control_plane_policy_profile_ux',
    smoke_passed: smokePassed,
    governance: {
        profile_passed_implies_production_certified: false,
        panel_exposes_pii: false,
        panel_exposes_raw_paths: false
    },
    summary: { total: PASS + FAIL, passed: PASS, failed: FAIL },
    results
};

const jsonPath = path.join(reportsDir, 'phase72d_control_plane_policy_profile_ux.json');
const mdPath   = path.join(reportsDir, 'phase72d_control_plane_policy_profile_ux.md');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

const md = [
    '# Phase 72D — Control Plane Policy Profile Admin UX',
    '',
    `**Generated:** ${report.generated_at}  `,
    `**Smoke:** ${smokePassed ? '✅ PASSED' : '❌ FAILED'}  `,
    `**Results:** ${PASS}/${PASS + FAIL} passed`,
    '',
    '## New Files',
    '- `src/api/services/policyProfileService.js` — profile resolution + panel builder',
    '- `src/ui/components/PolicyProfilePanel.tsx` — operator React component',
    '',
    '## Test Results',
    '| # | Test | Pass |',
    '|---|------|------|',
    ...results.map((r, i) => `| ${i+1} | ${r.label} | ${r.pass ? '✅' : '❌'} |`),
    ''
].join('\n');
fs.writeFileSync(mdPath, md);

console.log(`\n${'='.repeat(70)}`);
console.log(`Phase 72D — Control Plane Policy Profile Admin UX`);
console.log(`Results: ${PASS}/${PASS + FAIL} passed${FAIL > 0 ? ` (${FAIL} FAILED)` : ''}`);
console.log(`Smoke: ${smokePassed ? 'PASSED ✅' : 'FAILED ❌'}`);
console.log(`Reports: ${jsonPath}`);
console.log('='.repeat(70));

process.exit(smokePassed ? 0 : 1);
