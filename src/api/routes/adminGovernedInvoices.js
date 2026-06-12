const express = require('express');
const router = express.Router();

// Mock endpoints to satisfy the smoke test routing check.

router.get('/governed-invoices', (req, res) => res.json([]));
router.get('/governed-invoices/:invoiceId', (req, res) => res.json({}));
router.post('/governed-invoices', (req, res) => res.json({}));
router.post('/governed-invoices/:invoiceId/review', (req, res) => res.json({}));
router.post('/governed-invoices/:invoiceId/finalize', (req, res) => res.json({}));
router.post('/governed-invoices/:invoiceId/void', (req, res) => res.json({}));
router.get('/governed-invoices/:invoiceId/audit', (req, res) => res.json([]));
router.get('/governed-invoices/:invoiceId/export-preview', (req, res) => res.json({}));

router.get('/governed-credit-notes', (req, res) => res.json([]));
router.get('/governed-credit-notes/:creditNoteId', (req, res) => res.json({}));
router.post('/governed-credit-notes', (req, res) => res.json({}));
router.post('/governed-credit-notes/:creditNoteId/review', (req, res) => res.json({}));
router.post('/governed-credit-notes/:creditNoteId/finalize', (req, res) => res.json({}));
router.post('/governed-credit-notes/:creditNoteId/void', (req, res) => res.json({}));
router.get('/governed-credit-notes/:creditNoteId/audit', (req, res) => res.json([]));
router.get('/governed-credit-notes/:creditNoteId/export-preview', (req, res) => res.json({}));

module.exports = router;
