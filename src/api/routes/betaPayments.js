const express = require('express');
const router = express.Router();
const BetaPaymentVerificationService = require('../services/betaPaymentVerificationService');
const BetaPaymentReversalService = require('../services/betaPaymentReversalService');
const BetaPaymentModeService = require('../services/betaPaymentModeService');

const paymentModeService = new BetaPaymentModeService();
const verificationService = new BetaPaymentVerificationService({ betaPaymentModeService: paymentModeService });
const reversalService = new BetaPaymentReversalService({ betaPaymentModeService: paymentModeService, betaPaymentVerificationService: verificationService });

router.use((req, res, next) => {
    req.actor = { role: 'CUSTOMER', userId: 'c_1', tenantId: 't_1' }; // Mock actor
    next();
});

router.get('/:paymentRecordId/status', async (req, res) => {
    try {
        const status = await verificationService.buildCustomerSafePaymentStatus({ betaPaymentRecordId: req.params.paymentRecordId, actor: req.actor });
        res.json({ success: true, status });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/:paymentRecordId/reference', async (req, res) => {
    try {
        const record = await verificationService.submitCustomerPaymentReference({ betaPaymentRecordId: req.params.paymentRecordId, referencePayload: req.body.payload, actor: req.actor });
        res.json({ success: true, record });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/:paymentRecordId/evidence', async (req, res) => {
    try {
        const record = await verificationService.submitPaymentEvidence({ betaPaymentRecordId: req.params.paymentRecordId, evidencePayload: req.body.payload, actor: req.actor });
        res.json({ success: true, record });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/:paymentRecordId/refund-request', async (req, res) => {
    try {
        const request = await reversalService.requestRefund({ betaPaymentRecordId: req.params.paymentRecordId, amount: req.body.amount, reason: req.body.reason, actor: req.actor });
        res.json({ success: true, request });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

module.exports = router;
