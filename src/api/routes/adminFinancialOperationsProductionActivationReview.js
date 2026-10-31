const express = require('express');
const router = express.Router();
const GateService = require('../services/financialOperationsProductionActivationGateService');
const ReviewService = require('../services/financialOperationsProductionActivationGateReviewService');
const ApprovalService = require('../services/financialOperationsProductionActivationApprovalService');
const db = require('../services/mysqlClient');

const gateService = new GateService();
const reviewService = new ReviewService(gateService);
const approvalService = new ApprovalService(gateService);

// Helper for extracting actor
const getActor = (req) => {
    return req.user || {
        userId: req.headers['x-user-id'] || 'system-user',
        role: req.headers['x-user-role'] || 'CONTROL_PLANE_ADMIN'
    };
};

/**
 * GET /financial-operations/production-activation-review/reviews
 * List all production activation gates.
 */
router.get('/production-activation-review/reviews', async (req, res) => {
    try {
        const rows = await db.query('SELECT * FROM financial_operations_production_activation_gates ORDER BY created_at DESC');
        const formatted = rows.map(row => ({
            ...row,
            production_activation_enabled: !!row.production_activation_enabled,
            activation_execution_enabled: !!row.activation_execution_enabled,
            full_public_enabled: !!row.full_public_enabled,
            live_provider_connectivity_enabled: !!row.live_provider_connectivity_enabled,
            live_credentials_enabled: !!row.live_credentials_enabled,
            payment_execution_enabled: !!row.payment_execution_enabled,
            refund_execution_enabled: !!row.refund_execution_enabled,
            payout_execution_enabled: !!row.payout_execution_enabled,
            external_invoice_submission_enabled: !!row.external_invoice_submission_enabled,
            tax_filing_enabled: !!row.tax_filing_enabled,
            vat_return_submission_enabled: !!row.vat_return_submission_enabled,
            external_report_submission_enabled: !!row.external_report_submission_enabled,
            live_personal_data_export_enabled: !!row.live_personal_data_export_enabled,
            source_record_mutation_enabled: !!row.source_record_mutation_enabled,
            blockers_json: typeof row.blockers_json === 'string' ? JSON.parse(row.blockers_json) : (row.blockers_json || []),
            warnings_json: typeof row.warnings_json === 'string' ? JSON.parse(row.warnings_json) : (row.warnings_json || []),
            evidence_json: typeof row.evidence_json === 'string' ? JSON.parse(row.evidence_json) : (row.evidence_json || {})
        }));
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /financial-operations/production-activation-review/reviews/:activationReviewId
 * Get details of a specific gate.
 */
router.get('/production-activation-review/reviews/:activationReviewId', async (req, res) => {
    try {
        const gateId = req.params.activationReviewId;
        const rows = await db.query(
            'SELECT * FROM financial_operations_production_activation_gates WHERE production_activation_gate_id = ? OR id = ?',
            [gateId, gateId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Production activation gate not found' });
        }
        const row = rows[0];
        const formatted = {
            ...row,
            production_activation_enabled: !!row.production_activation_enabled,
            activation_execution_enabled: !!row.activation_execution_enabled,
            full_public_enabled: !!row.full_public_enabled,
            live_provider_connectivity_enabled: !!row.live_provider_connectivity_enabled,
            live_credentials_enabled: !!row.live_credentials_enabled,
            payment_execution_enabled: !!row.payment_execution_enabled,
            refund_execution_enabled: !!row.refund_execution_enabled,
            payout_execution_enabled: !!row.payout_execution_enabled,
            external_invoice_submission_enabled: !!row.external_invoice_submission_enabled,
            tax_filing_enabled: !!row.tax_filing_enabled,
            vat_return_submission_enabled: !!row.vat_return_submission_enabled,
            external_report_submission_enabled: !!row.external_report_submission_enabled,
            live_personal_data_export_enabled: !!row.live_personal_data_export_enabled,
            source_record_mutation_enabled: !!row.source_record_mutation_enabled,
            blockers_json: typeof row.blockers_json === 'string' ? JSON.parse(row.blockers_json) : (row.blockers_json || []),
            warnings_json: typeof row.warnings_json === 'string' ? JSON.parse(row.warnings_json) : (row.warnings_json || []),
            evidence_json: typeof row.evidence_json === 'string' ? JSON.parse(row.evidence_json) : (row.evidence_json || {})
        };
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /financial-operations/production-activation-review/reviews
 * Create a new gate.
 */
router.post('/production-activation-review/reviews', async (req, res) => {
    try {
        const actor = getActor(req);
        const result = await gateService.createGate(req.body, actor);
        res.status(201).json(result);
    } catch (error) {
        if (error.message.includes('Unauthorized')) {
            return res.status(403).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /financial-operations/production-activation-review/reviews/:activationReviewId/evaluate
 * Evaluate eligibility & checks for a gate.
 */
router.post('/production-activation-review/reviews/:activationReviewId/evaluate', async (req, res) => {
    try {
        const gateId = req.params.activationReviewId;
        const actor = getActor(req);
        const result = await gateService.evaluateGate(gateId, actor);
        res.json(result);
    } catch (error) {
        if (error.message.includes('Unauthorized')) {
            return res.status(403).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /financial-operations/production-activation-review/reviews/:activationReviewId/go-no-go
 * Cast go-no-go review decision (approve, reject, revoke).
 */
router.post('/production-activation-review/reviews/:activationReviewId/go-no-go', async (req, res) => {
    try {
        const gateId = req.params.activationReviewId;
        const actor = getActor(req);
        const action = req.body.action || 'approve';

        let result;
        if (action === 'approve') {
            result = await reviewService.approveForFutureActivationReview(gateId, actor);
        } else if (action === 'reject') {
            result = await reviewService.rejectGate(gateId, actor);
        } else if (action === 'revoke') {
            result = await reviewService.revokeGate(gateId, actor);
        } else {
            return res.status(400).json({ error: `Invalid action: ${action}` });
        }

        res.json(result);
    } catch (error) {
        if (error.message.includes('Unauthorized')) {
            return res.status(403).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /financial-operations/production-activation-review/reviews/:activationReviewId/checks
 * Get check statuses for a gate.
 */
router.get('/production-activation-review/reviews/:activationReviewId/checks', async (req, res) => {
    try {
        const gateId = req.params.activationReviewId;
        const rows = await db.query(
            'SELECT * FROM financial_operations_production_activation_gate_checks WHERE production_activation_gate_id = ? ORDER BY check_key ASC',
            [gateId]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /financial-operations/production-activation-review/reviews/:activationReviewId/findings
 * Get findings related to a gate.
 */
router.get('/production-activation-review/reviews/:activationReviewId/findings', async (req, res) => {
    try {
        const gateId = req.params.activationReviewId;
        const rows = await db.query(
            'SELECT * FROM financial_operations_production_activation_gate_findings WHERE production_activation_gate_id = ? ORDER BY created_at DESC',
            [gateId]
        );
        const formatted = rows.map(row => ({
            ...row,
            evidence_json: typeof row.evidence_json === 'string' ? JSON.parse(row.evidence_json) : (row.evidence_json || {})
        }));
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /financial-operations/production-activation-review/reviews/:activationReviewId/evidence-pack
 * Export evidence json.
 */
router.get('/production-activation-review/reviews/:activationReviewId/evidence-pack', async (req, res) => {
    try {
        const gateId = req.params.activationReviewId;
        const rows = await db.query(
            'SELECT evidence_json FROM financial_operations_production_activation_gates WHERE production_activation_gate_id = ? OR id = ?',
            [gateId, gateId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Production activation gate not found' });
        }
        const evidence = typeof rows[0].evidence_json === 'string' ? JSON.parse(rows[0].evidence_json) : (rows[0].evidence_json || {});
        res.json(evidence);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /financial-operations/production-activation-review/reviews/:activationReviewId/audit
 * Get audit logs/events for a gate.
 */
router.get('/production-activation-review/reviews/:activationReviewId/audit', async (req, res) => {
    try {
        const gateId = req.params.activationReviewId;
        const rows = await db.query(
            'SELECT * FROM financial_operations_production_activation_gate_audit_events WHERE production_activation_gate_id = ? ORDER BY created_at ASC',
            [gateId]
        );
        const formatted = rows.map(row => ({
            ...row,
            payload_json: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : (row.payload_json || {})
        }));
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /financial-operations/production-activation-review/reviews/:activationReviewId/export-preview
 * Get export preview.
 */
router.get('/production-activation-review/reviews/:activationReviewId/export-preview', async (req, res) => {
    try {
        const gateId = req.params.activationReviewId;
        const gateRows = await db.query(
            'SELECT * FROM financial_operations_production_activation_gates WHERE production_activation_gate_id = ? OR id = ?',
            [gateId, gateId]
        );
        if (gateRows.length === 0) {
            return res.status(404).json({ error: 'Gate not found' });
        }
        const checkRows = await db.query(
            'SELECT * FROM financial_operations_production_activation_gate_checks WHERE production_activation_gate_id = ?',
            [gateId]
        );
        const approvalRows = await db.query(
            'SELECT * FROM financial_operations_production_activation_gate_approvals WHERE production_activation_gate_id = ?',
            [gateId]
        );

        res.json({
            gate: gateRows[0],
            checks: checkRows,
            approvals: approvalRows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
