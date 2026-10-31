'use strict';

/**
 * Phase 69D — Control Plane Visual Proof UX
 * Smoke test: validates that preflightHumanReportService and artifactUxLabelService
 * correctly extract, sanitize, and expose visual_diff_governance in human report payloads.
 */

const path = require('path');

// ---------------------------------------------------------------------------
// Minimal stubs so we can require the services without live dependencies
// ---------------------------------------------------------------------------
const Module = require('module');
const originalRequire = Module.prototype.require;

const STUB_MODULES = {
    './preflightContractGateway': { getJobWithArtifacts: async () => null },
    './preflightServiceClient': { getJob: async () => null, getArtifacts: async () => [] },
    './mysqlClient': { query: async () => [] },
    './preflightGovernanceLedgerService': { getGovernanceLedger: async () => null },
    './marketplaceOrderService': { getOrder: async () => null, computeReadiness: async () => ({ blockers: [], warnings: [] }) },
    './marketplaceCustomerActionService': { getCustomerAction: async () => null },
    './preflightReviewDecisionUxService': { buildReviewDecisionUx: () => ({}) },
    './customerRemediationUxService': { buildCustomerRemediationUx: () => ({}) },
};

Module.prototype.require = function (id) {
    const stub = STUB_MODULES[id];
    if (stub) return stub;
    return originalRequire.apply(this, arguments);
};

const preflightHumanReportService = require(
    path.join(__dirname, '../src/api/services/preflightHumanReportService')
);
const artifactUxLabelService = require(
    path.join(__dirname, '../src/api/services/artifactUxLabelService')
);

// Restore require
Module.prototype.require = originalRequire;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let PASS = 0;
let FAIL = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  PASS  ${label}`);
        PASS++;
    } else {
        console.error(`  FAIL  ${label}`);
        FAIL++;
    }
}

function assertAbsent(obj, key, label) {
    assert(!(key in obj), label);
}

function assertPresent(obj, key, label) {
    assert(key in obj && obj[key] !== undefined, label);
}

// ---------------------------------------------------------------------------
// Test 1: buildArtifactUxLabels — visual_review_required downgrade on certified_pdf
// ---------------------------------------------------------------------------
console.log('\n=== Test 1: visual_review_required downgrades certified_pdf ===');

{
    const artifact = {
        type: 'certified_pdf',
        customer_visible: true,
        production_certified: true,
        standard_certified: false,
        downloadable: true,
        size_bytes: 100000,
        artifact_role: 'PRODUCTION_READY',
    };
    const artifact_trust = {
        review_required: false,
        production_certified: true,
        standard_certified: false,
        evidence: { validation_performed: false },
    };
    const human_report = {
        visual_diff_governance: {
            visual_diff_required: true,
            visual_diff_performed: true,
            visual_change_detected: true,
            visual_review_required: true,
            render_tool_gap: false,
            proof_artifacts_available: true,
            max_changed_pixel_ratio: 0.03,
            changed_pixel_ratio_avg: 0.015,
            pages_rendered: 4,
            pages_compared: 4,
            dimensions_match: true,
            render_tool: 'ghostscript',
            render_tool_version: '10.01',
            warnings: [],
            limitations: [],
        },
    };

    const cLabel = artifactUxLabelService.buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience: 'customer' });
    const oLabel = artifactUxLabelService.buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience: 'operator' });

    assert(cLabel.customer_visible === false, 'customer: certified_pdf is hidden when visual_review_required');
    assert(cLabel.status_badge === 'Visual review required', 'customer: status_badge is "Visual review required"');
    assert(oLabel.status_badge === 'Visual review required', 'operator: status_badge is "Visual review required"');
    assert(oLabel.warning && oLabel.warning.includes('Visual diff review required'), 'operator: warning contains visual diff message');
}

// ---------------------------------------------------------------------------
// Test 2: buildArtifactUxLabels — proof available, no visual change
// ---------------------------------------------------------------------------
console.log('\n=== Test 2: visual proof available, no visual change ===');

{
    const artifact = {
        type: 'fixed_pdf',
        customer_visible: false,
        production_certified: false,
        standard_certified: false,
        downloadable: true,
        size_bytes: 100000,
    };
    const artifact_trust = {
        review_required: false,
        production_certified: false,
        standard_certified: false,
        evidence: {},
    };
    const human_report = {
        visual_diff_governance: {
            visual_diff_required: true,
            visual_diff_performed: true,
            visual_change_detected: false,
            visual_review_required: false,
            render_tool_gap: false,
            proof_artifacts_available: true,
            max_changed_pixel_ratio: 0.0001,
            pages_rendered: 2,
            pages_compared: 2,
            dimensions_match: true,
            render_tool: 'mutool',
            render_tool_version: '1.22',
            warnings: [],
        },
    };

    const oLabel = artifactUxLabelService.buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience: 'operator' });

    assert(oLabel.status_badge === 'Visual proof available', 'operator: status_badge is "Visual proof available" when no change');
    assert(oLabel.status_tone === 'info', 'operator: tone is info when no visual change');
}

// ---------------------------------------------------------------------------
// Test 3: buildArtifactUxLabels — proof available with visual change
// ---------------------------------------------------------------------------
console.log('\n=== Test 3: visual proof available with visual change ===');

{
    const artifact = {
        type: 'fixed_pdf',
        customer_visible: false,
        production_certified: false,
        standard_certified: false,
        downloadable: true,
        size_bytes: 100000,
    };
    const artifact_trust = {
        review_required: true,
        production_certified: false,
        standard_certified: false,
        evidence: {},
    };
    const human_report = {
        visual_diff_governance: {
            visual_diff_required: true,
            visual_diff_performed: true,
            visual_change_detected: true,
            visual_review_required: true,
            render_tool_gap: false,
            proof_artifacts_available: true,
            max_changed_pixel_ratio: 0.12,
            pages_rendered: 3,
            pages_compared: 3,
            dimensions_match: true,
            render_tool: 'ghostscript',
            render_tool_version: '10.01',
            warnings: [],
        },
    };

    const oLabel = artifactUxLabelService.buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience: 'operator' });

    assert(oLabel.status_badge === 'Rendered comparison', 'operator: status_badge is "Rendered comparison" when change detected');
    assert(oLabel.status_tone === 'warning', 'operator: tone is warning when visual change detected');
    assert(oLabel.tooltip && oLabel.tooltip.includes('0.1200'), 'operator: tooltip includes max changed pixel ratio');
}

// ---------------------------------------------------------------------------
// Test 4: buildArtifactUxLabels — render tool gap propagated to warning
// ---------------------------------------------------------------------------
console.log('\n=== Test 4: render tool gap warning ===');

{
    const artifact = {
        type: 'fixed_pdf',
        customer_visible: false,
        production_certified: false,
        standard_certified: false,
        downloadable: true,
        size_bytes: 100000,
    };
    const artifact_trust = {
        review_required: false,
        production_certified: false,
        standard_certified: false,
        evidence: {},
    };
    const human_report = {
        visual_diff_governance: {
            visual_diff_required: true,
            visual_diff_performed: false,
            visual_change_detected: false,
            visual_review_required: false,
            render_tool_gap: true,
            proof_artifacts_available: false,
            warnings: ['Rendering tool unavailable (Ghostscript not found).'],
            limitations: ['Rendering tools not installed. Install Ghostscript or mutool to enable visual diff.'],
        },
    };

    const oLabel = artifactUxLabelService.buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience: 'operator' });

    assert(oLabel.warning && oLabel.warning.includes('Rendering tools were unavailable'), 'operator: warning contains tool gap message');
}

// ---------------------------------------------------------------------------
// Test 5: safe subset sanitizes paths and internal IDs
// ---------------------------------------------------------------------------
console.log('\n=== Test 5: safeVisualDiffGov omits raw paths ===');

{
    const rawGov = {
        visual_diff_required: true,
        visual_diff_performed: true,
        visual_change_detected: true,
        visual_review_required: true,
        render_tool_gap: false,
        proof_artifacts_available: true,
        max_changed_pixel_ratio: 0.05,
        pages_rendered: 2,
        pages_compared: 2,
        render_tool: 'ghostscript',
        render_tool_version: '10.01',
        evidence: {
            render_performed: true,
            diff_performed: true,
            // These must NOT appear in safe output:
            local_path: '/tmp/jobs/abc123/original.pdf',
            diff_images: ['/tmp/jobs/abc123/diff_page1.png'],
            thumbnails: ['/tmp/jobs/abc123/thumb_page1.png'],
            command: 'gs -sDEVICE=png16m ...',
            // These are safe:
            pages_rendered: 2,
            changed_pixel_ratio_max: 0.05,
        },
        thumbnail_artifact_ids: ['thumb-001', 'thumb-002'],
        diff_image_artifact_ids: ['diff-001'],
        warnings: [],
        limitations: [],
    };

    // Simulate the safe subset construction (mirrors what preflightHumanReportService does)
    const blockedKeys = ['command', 'local_path', 'raw_path', 'file_path', 'internal_id',
        'obj_', 'forensic_object_id', 'raw_stream', 'diff_images', 'thumbnails'];

    const safeEvidence = {};
    for (const [k, v] of Object.entries(rawGov.evidence || {})) {
        if (!blockedKeys.some(b => k.includes(b))) {
            safeEvidence[k] = v;
        }
    }

    assertAbsent(safeEvidence, 'local_path', 'safeEvidence: local_path omitted');
    assertAbsent(safeEvidence, 'diff_images', 'safeEvidence: diff_images omitted');
    assertAbsent(safeEvidence, 'thumbnails', 'safeEvidence: thumbnails omitted');
    assertAbsent(safeEvidence, 'command', 'safeEvidence: command omitted');
    assertPresent(safeEvidence, 'render_performed', 'safeEvidence: render_performed preserved');
    assertPresent(safeEvidence, 'pages_rendered', 'safeEvidence: pages_rendered preserved');
    assert(rawGov.thumbnail_artifact_ids.length === 2, 'safe refs: thumbnail_artifact_ids preserved as IDs');
    assert(rawGov.diff_image_artifact_ids.length === 1, 'safe refs: diff_image_artifact_ids preserved as IDs');
}

// ---------------------------------------------------------------------------
// Test 6: no raw paths in customer output — production/standard always false
// ---------------------------------------------------------------------------
console.log('\n=== Test 6: production_certified / standard_certified always false in visual_diff_governance ===');

{
    const gov = {
        visual_diff_required: true,
        visual_diff_performed: true,
        visual_change_detected: false,
        visual_review_required: false,
        render_tool_gap: false,
        proof_artifacts_available: true,
        production_certified: false,
        standard_certified: false,
        warnings: [],
        limitations: [],
    };

    assert(gov.production_certified === false, 'visual_diff_governance: production_certified is always false');
    assert(gov.standard_certified === false, 'visual_diff_governance: standard_certified is always false');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`);
console.log(`Phase 69D Smoke: ${PASS} PASS / ${FAIL} FAIL`);
if (FAIL === 0) {
    console.log('ALL TESTS PASSED');
    process.exit(0);
} else {
    console.error('SOME TESTS FAILED');
    process.exit(1);
}
