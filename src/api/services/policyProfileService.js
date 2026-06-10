'use strict';
/**
 * Phase 72D — policyProfileService
 *
 * Control Plane service for policy profile evaluation and operator UX.
 *
 * Responsibilities:
 *  1. Resolve active profile for a job (from job data or default)
 *  2. Evaluate profile governance against a human report or fix_audit
 *  3. Build PolicyProfilePanel UX struct for operator display
 *
 * Governance:
 *  - profile_passed = true NEVER implies production_certified or standard_certified
 *  - No PII, no raw filesystem paths in output
 *  - Profiles can only DOWNGRADE package_ready, never upgrade it
 */

const path = require('path');

// Engine evaluator (loaded lazily to avoid hard dependency at module load)
function loadEvaluator() {
    try {
        const { evaluateFromFixAudit } = require('../../ppos-preflight-engine/policy/PolicyProfileEvaluator');
        const { resolveProfile } = require('../../ppos-preflight-engine/policy/PolicyProfileSchema');
        return { evaluateFromFixAudit, resolveProfile, available: true };
    } catch (e) {
        return { available: false, error: e.message };
    }
}

/**
 * Resolve the active policy profile for a job.
 *
 * Priority:
 *  1. humanReport.policy_profile_governance.profile_id (already evaluated)
 *  2. jobContext.policyProfile (explicit override)
 *  3. 'NONE' (default)
 *
 * @param {Object} humanReport - from preflightHumanReportService
 * @param {Object} [jobContext] - { policyProfile? }
 * @returns {Object} { profile_id, profile_label, source }
 */
function getActiveProfile(humanReport, jobContext = {}) {
    const reportObj = humanReport?.report || humanReport;
    // 1. Already evaluated by Worker
    const ppg = reportObj?.fix_audit?.policy_profile_governance ||
                reportObj?.policy_profile_governance;
    if (ppg?.profile_id && ppg.profile_id !== 'NONE') {
        return {
            profile_id:    ppg.profile_id,
            profile_label: ppg.profile_label || ppg.profile_id,
            source: 'worker_governance'
        };
    }

    // 2. Explicit context
    if (jobContext.policyProfile) {
        const { resolveProfile } = loadEvaluator();
        if (resolveProfile) {
            const resolved = resolveProfile(jobContext.policyProfile);
            return {
                profile_id:    resolved.profile_id,
                profile_label: resolved.label,
                source: 'job_context'
            };
        }
    }

    return { profile_id: 'NONE', profile_label: 'No policy profile', source: 'default' };
}

/**
 * Evaluate profile status from a human report.
 *
 * If the Worker already evaluated it (policy_profile_governance present in
 * fix_audit), we use that result directly. Otherwise we run the evaluator
 * against findings extracted from the report.
 *
 * @param {Object} humanReport
 * @param {string|Object} [profileOverride]
 * @returns {Object} policy_profile_governance
 */
function evaluateProfileStatus(humanReport, profileOverride = null) {
    const reportObj = humanReport?.report || humanReport;
    // Use pre-computed governance if available
    const existing = reportObj?.fix_audit?.policy_profile_governance ||
                     reportObj?.policy_profile_governance;
    if (existing && typeof existing === 'object' && 'profile_passed' in existing) {
        return {
            ...existing,
            // Enforce invariants even when reading pre-computed governance
            production_certified:     false,
            standard_certified:       false,
            compliance_claim_allowed: false,
            print_ready_claim_allowed: false,
            source: 'pre_computed_by_worker'
        };
    }

    // Compute fresh from findings
    const { evaluateFromFixAudit, resolveProfile, available } = loadEvaluator();
    if (!available) {
        return {
            profile_id: 'NONE',
            profile_label: 'No policy profile',
            profile_passed: true,
            profile_blockers: [],
            profile_warnings: ['PROFILE_EVALUATOR_UNAVAILABLE'],
            evaluated_at: new Date().toISOString(),
            production_certified: false,
            standard_certified: false,
            compliance_claim_allowed: false,
            print_ready_claim_allowed: false,
            source: 'fallback_evaluator_unavailable'
        };
    }

    const profile = profileOverride
        ? resolveProfile(profileOverride)
        : resolveProfile('NONE');

    // Extract findings from human report structure
    const findings = reportObj?.fix_audit?.findings ||
                     reportObj?.findings ||
                     reportObj?.issues || [];

    const standardDetected = reportObj?.fix_audit?.standards_certification_governance?.standard_detected ||
                             reportObj?.standards_certification_governance?.standard_detected || null;

    const governance = evaluateFromFixAudit(
        profile,
        { findings, plan: [], issues: [] },
        { detected_standard: standardDetected }
    );

    return { ...governance, source: 'computed_by_control_plane' };
}

/**
 * Build the PolicyProfilePanel UX struct for operator display.
 *
 * Sanitization:
 *  - No PII keys (customer_email, phone, address, etc.)
 *  - No raw filesystem paths
 *  - profile_blockers and profile_warnings are safe string codes only
 *
 * @param {Object} humanReport
 * @param {Object} [options] - { audience: 'operator'|'customer', profileOverride? }
 * @returns {Object} policy_profile_ux
 */
function buildProfilePanel(humanReport, options = {}) {
    const { audience = 'operator', profileOverride = null } = options;
    const reportObj = humanReport?.report || humanReport;

    const governance = evaluateProfileStatus(reportObj, profileOverride);
    const activeProfile = getActiveProfile(reportObj, { policyProfile: profileOverride });

    // Sanitize: strip any strings containing raw paths or PII patterns
    const PATH_PATTERN = /[A-Za-z]:[/\\]|\/(tmp|var|home|storage)\//;
    const PII_KEYS = new Set(['customer_email', 'email', 'phone', 'address', 'customer_address', 'tax_id', 'taxId']);

    function sanitizeWarning(w) {
        if (typeof w !== 'string') return '[REDACTED]';
        if (PATH_PATTERN.test(w)) return '[PATH_REDACTED]';
        return w;
    }

    const safeBlockers  = (governance.profile_blockers || []).map(sanitizeWarning);
    const safeWarnings  = (governance.profile_warnings || []).map(sanitizeWarning);

    const panel = {
        active_profile: {
            profile_id:    activeProfile.profile_id,
            profile_label: activeProfile.profile_label,
            source:        activeProfile.source
        },
        profile_passed:    governance.profile_passed,
        profile_blockers:  safeBlockers,
        profile_warnings:  safeWarnings,
        evaluated_at:      governance.evaluated_at,
        // Governance invariants — always false in this layer
        production_certified:      false,
        standard_certified:        false,
        compliance_claim_allowed:  false,
        print_ready_claim_allowed: false,
        audience
    };

    // Operator-only: include full blocker details
    if (audience === 'operator') {
        panel.blockers_detail = safeBlockers.map(b => ({
            code: b,
            description: BLOCKER_DESCRIPTIONS[b] || 'Profile constraint violated'
        }));
    }

    return { ok: true, policy_profile_ux: panel };
}

// Human-readable descriptions for operator display
const BLOCKER_DESCRIPTIONS = {
    PROFILE_BLEED_REQUIRED:             'The active profile requires bleed but none was detected.',
    PROFILE_TAC_LIMIT_EXCEEDED:         'Total Area Coverage (TAC) exceeds the profile limit.',
    PROFILE_CMYK_REQUIRED:              'The active profile requires CMYK output but RGB content was detected.',
    PROFILE_FONTS_MUST_BE_EMBEDDED:     'The active profile requires all fonts to be embedded.',
    PROFILE_TYPE3_FONTS_NOT_ALLOWED:    'Type 3 fonts are not allowed by the active profile.',
    PROFILE_NO_JAVASCRIPT_VIOLATED:     'JavaScript is prohibited by the active profile.',
    PROFILE_NO_EMBEDDED_FILES_VIOLATED: 'Embedded files are prohibited by the active profile.',
    PROFILE_NO_LAUNCH_ACTIONS_VIOLATED: 'Launch actions are prohibited by the active profile.',
    PROFILE_CROP_MARKS_REQUIRED:        'Crop marks are required by the active profile but were not detected.',
    PROFILE_STANDARD_MISMATCH:          'The PDF standard does not match the required profile standard.',
    PROFILE_STANDARD_REQUIRED_BUT_NOT_VALIDATED: 'The required standard has not been validated by a certified validator.'
};

module.exports = {
    getActiveProfile,
    evaluateProfileStatus,
    buildProfilePanel,
    BLOCKER_DESCRIPTIONS
};
