const express = require('express');
const router = express.Router();
const BetaPaymentModeService = require('../services/betaPaymentModeService');
const BetaPaymentVerificationService = require('../services/betaPaymentVerificationService');
const BetaPaymentReversalService = require('../services/betaPaymentReversalService');

const paymentModeService = new BetaPaymentModeService();
const verificationService = new BetaPaymentVerificationService({ betaPaymentModeService: paymentModeService });
const reversalService = new BetaPaymentReversalService({ betaPaymentModeService: paymentModeService, betaPaymentVerificationService: verificationService });

router.use((req, res, next) => {
    req.actor = { role: 'OPS_ADMIN', userId: 'ops_1', tenantId: 't_1' }; // Mock actor
    next();
});

router.post('/payment-modes', async (req, res) => {
    try {
        const mode = await paymentModeService.createBetaPaymentMode({ cohortId: req.body.cohortId, tenantId: req.body.tenantId, payload: req.body.payload, actor: req.actor });
        res.json({ success: true, mode });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/payment-modes/:paymentModeId/activate', async (req, res) => {
    try {
        const mode = await paymentModeService.activateBetaPaymentMode({ paymentModeId: req.params.paymentModeId, actor: req.actor });
        res.json({ success: true, mode });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/payment-modes/:paymentModeId/pause', async (req, res) => {
    try {
        const mode = await paymentModeService.pauseBetaPaymentMode({ paymentModeId: req.params.paymentModeId, reason: req.body.reason, actor: req.actor });
        res.json({ success: true, mode });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/payments/:paymentRecordId/request-verification', async (req, res) => {
    try {
        const record = await verificationService.requestPaymentVerification({ betaPaymentRecordId: req.params.paymentRecordId, actor: req.actor });
        res.json({ success: true, record });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/payments/:paymentRecordId/approve-verification', async (req, res) => {
    try {
        const record = await verificationService.approvePaymentVerification({ betaPaymentRecordId: req.params.paymentRecordId, verificationPayload: req.body.payload, actor: req.actor });
        res.json({ success: true, record });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/payments/:paymentRecordId/reject-verification', async (req, res) => {
    try {
        const record = await verificationService.rejectPaymentVerification({ betaPaymentRecordId: req.params.paymentRecordId, reason: req.body.reason, actor: req.actor });
        res.json({ success: true, record });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/payments/:paymentRecordId/confirm', async (req, res) => {
    try {
        const record = await verificationService.confirmPaymentAfterVerification({ betaPaymentRecordId: req.params.paymentRecordId, amountReceived: req.body.amountReceived, currency: req.body.currency, actor: req.actor });
        res.json({ success: true, record });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/refunds/:refundRequestId/approve', async (req, res) => {
    try {
        const record = await reversalService.approveRefund({ refundRequestId: req.params.refundRequestId, actor: req.actor });
        res.json({ success: true, record });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/refunds/:refundRequestId/reject', async (req, res) => {
    try {
        const record = await reversalService.rejectRefund({ refundRequestId: req.params.refundRequestId, reason: req.body.reason, actor: req.actor });
        res.json({ success: true, record });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

router.post('/refunds/:refundRequestId/complete', async (req, res) => {
    try {
        const record = await reversalService.markRefundCompleted({ refundRequestId: req.params.refundRequestId, evidencePayload: req.body.evidencePayload, actor: req.actor });
        res.json({ success: true, record });
    } catch (e) {
        res.status(403).json({ success: false, error: e.message });
    }
});

module.exports = router;
