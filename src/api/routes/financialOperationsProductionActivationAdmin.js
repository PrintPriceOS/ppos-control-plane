/**
 * src/api/routes/financialOperationsProductionActivationAdmin.js
 * 
 * Admin API router for Phase 113E Controlled Financial Operations Production Activation Gate.
 * Handles gate status, approval chain, review notes, audit timeline, and redacted previews.
 */

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const db = require('../services/mysqlClient');

const GateService = require('../services/financialOperationsProductionActivationGateService');
const ApprovalService = require('../services/financialOperationsProductionActivationApprovalService');
const ReviewService = require('../services/financialOperationsProductionActivationGateReviewService');

const gateService = new GateService();
const approvalService = new ApprovalService(gateService);
const reviewService = new ReviewService(gateService);

router.use(express.json());
router.use(requireAdmin);

const safetyMarkers = {
    production_activation_enabled: false,
    activation_execution_enabled: false,
    full_public_enabled: false,
    live_provider_connectivity_enabled: false,
    payment_execution_enabled: false,
    refund_execution_enabled: false,
    payout_execution_enabled: false,
    external_invoice_submission_enabled: false,
    tax_filing_enabled: false,
    vat_return_submission_enabled: false,
    external_report_submission_enabled: false,
    live_personal_data_export_enabled: false,
    source_record_mutation_enabled: false,
    is_review_only: true,
    safety_message: "PRE-PRODUCTION REVIEW ONLY. LIVE FINANCIAL OPERATIONS AND PRODUCTION ACTIVATION GATES ARE STRICTLY DISABLED."
};

// Helper: Ensure at least one gate is initialized
async function ensureGateInitialized(actor) {
    let gate = gateService._mockGates[0];
    if (!gate) {
        gate = await gateService.createGate({
            gateName: 'Controlled Production Activation Gate',
            finalReleaseCandidateId: 'rc_112_validated',
            preProductionRunbookId: 'runbook_111_validated',
            goLiveSimulationId: 'sim_110_validated',
            evidence: {
                final_release_candidate_approved: true,
                approval_chain_present: true,
                compliance_reporting_ready: true,
                provider_ready: true,
                production_activation_enabled: false,
                activation_execution_enabled: false,
                full_public_enabled: false,
                live_provider_connectivity_enabled: false,
                payment_execution_enabled: false
            }
        }, actor || { userId: 'system', role: 'CONTROL_PLANE_ADMIN' });
        
        // Populate checks and set status to APPROVED_FOR_FUTURE_ACTIVATION_REVIEW
        await gateService.evaluateGate(gate.production_activation_gate_id, actor || { userId: 'system', role: 'CONTROL_PLANE_ADMIN' });
        // Build the approval chain
        await approvalService.buildApprovalChain(gate.production_activation_gate_id, actor || { userId: 'system', role: 'CONTROL_PLANE_ADMIN' });
    }
    return gate;
}

/**
 * GET /api/admin/financials/activation/gate
 */
router.get('/gate', async (req, res) => {
    try {
        const actor = { userId: req.user?.id || 'admin', role: req.user?.role || 'CONTROL_PLANE_ADMIN' };
        const gate = await ensureGateInitialized(actor);
        
        // Refresh checks list
        const checks = gateService._mockChecks.filter(c => c.production_activation_gate_id === gate.production_activation_gate_id);
        const approvals = approvalService._mockApprovals.filter(a => a.production_activation_gate_id === gate.production_activation_gate_id);
        
        res.json({
            ok: true,
            gate,
            checks,
            approvals,
            safety: safetyMarkers
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, safety: safetyMarkers });
    }
});

/**
 * POST /api/admin/financials/activation/approve
 */
router.post('/approve', async (req, res) => {
    try {
        const { role, approverRef, notes, reject } = req.body;
        const actor = { userId: req.user?.id || 'admin', role: req.user?.role || 'CONTROL_PLANE_ADMIN' };
        const gate = await ensureGateInitialized(actor);
        const gateId = gate.production_activation_gate_id;

        if (reject) {
            const result = await approvalService.rejectApproval(gateId, role, actor);
            return res.json({ ok: true, approval: result, safety: safetyMarkers });
        }

        const result = await approvalService.grantApproval(gateId, role, approverRef || 'REF-DEFAULT', notes || '', actor);
        res.json({ ok: true, approval: result, safety: safetyMarkers });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, safety: safetyMarkers });
    }
});

/**
 * POST /api/admin/financials/activation/review
 */
router.post('/review', async (req, res) => {
    try {
        const { action, note, noteType, findingCode, warningText } = req.body;
        const actor = { userId: req.user?.id || 'admin', role: req.user?.role || 'CONTROL_PLANE_ADMIN' };
        const gate = await ensureGateInitialized(actor);
        const gateId = gate.production_activation_gate_id;

        let result;
        if (action === 'APPROVE_GATE') {
            result = await reviewService.approveForFutureActivationReview(gateId, actor);
        } else if (action === 'REJECT_GATE') {
            result = await reviewService.rejectGate(gateId, actor);
        } else if (action === 'REVOKE_GATE') {
            result = await reviewService.revokeGate(gateId, actor);
        } else if (action === 'RESOLVE_FINDING') {
            result = await reviewService.resolveFinding(gateId, findingCode, actor);
        } else if (action === 'DISMISS_WARNING') {
            result = await reviewService.dismissWarning(gateId, warningText, actor);
        } else if (action === 'ADD_NOTE') {
            result = await reviewService.addReviewNote(gateId, noteType || 'GENERAL', note || '', actor);
        } else if (action === 'REQUEST_EVIDENCE') {
            result = await reviewService.requestAdditionalEvidence(gateId, note || '', actor);
        } else {
            return res.status(400).json({ ok: false, error: 'INVALID_ACTION', safety: safetyMarkers });
        }

        res.json({ ok: true, result, safety: safetyMarkers });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, safety: safetyMarkers });
    }
});

/**
 * GET /api/admin/financials/activation/audit-timeline
 */
router.get('/audit-timeline', async (req, res) => {
    try {
        const actor = { userId: req.user?.id || 'admin', role: req.user?.role || 'CONTROL_PLANE_ADMIN' };
        const gate = await ensureGateInitialized(actor);
        
        const events = reviewService._mockEvents.concat(gateService._mockEvents).concat(approvalService._mockEvents)
            .filter(e => e.production_activation_gate_id === gate.production_activation_gate_id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json({
            ok: true,
            timeline: events,
            safety: safetyMarkers
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, safety: safetyMarkers });
    }
});

/**
 * GET /api/admin/financials/activation/preview-redacted
 */
router.get('/preview-redacted', async (req, res) => {
    try {
        // Return a mock simulated export preview with all sensitive fields strictly redacted
        const mockPreview = {
            export_timestamp: new Date().toISOString(),
            export_scope: "FINOPS_LEDGER_PREVIEW",
            total_records: 128,
            integrity_hash: "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            records: [
                {
                    tx_id: "tx_9012384712",
                    tenant_id: "tenant_01a2b3c4d5",
                    amount_gross: "[REDACTED_PRE_PRODUCTION]",
                    amount_net: "[REDACTED_PRE_PRODUCTION]",
                    tax_vat_amount: "[REDACTED_PRE_PRODUCTION]",
                    routing_provider_id: "provider_mock_sandbox",
                    payout_reference: "[REDACTED_PRE_PRODUCTION]",
                    compliance_status: "VERIFIED"
                },
                {
                    tx_id: "tx_9012384713",
                    tenant_id: "tenant_09e8d7c6b5",
                    amount_gross: "[REDACTED_PRE_PRODUCTION]",
                    amount_net: "[REDACTED_PRE_PRODUCTION]",
                    tax_vat_amount: "[REDACTED_PRE_PRODUCTION]",
                    routing_provider_id: "provider_mock_sandbox",
                    payout_reference: "[REDACTED_PRE_PRODUCTION]",
                    compliance_status: "VERIFIED"
                }
            ]
        };

        res.json({
            ok: true,
            preview: mockPreview,
            safety: safetyMarkers
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message, safety: safetyMarkers });
    }
});

module.exports = router;
