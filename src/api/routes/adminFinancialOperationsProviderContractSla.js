const express = require('express');
const router = express.Router();

// Contracts
router.get('/financial-operations/provider-contract-sla/contracts', (req, res) => res.json([]));
router.get('/financial-operations/provider-contract-sla/contracts/:providerContractId', (req, res) => res.json({}));
router.post('/financial-operations/provider-contract-sla/contracts', (req, res) => res.json({}));
router.post('/financial-operations/provider-contract-sla/contracts/:providerContractId/review', (req, res) => res.json({}));
router.post('/financial-operations/provider-contract-sla/contracts/:providerContractId/approve', (req, res) => res.json({}));
router.post('/financial-operations/provider-contract-sla/contracts/:providerContractId/revoke', (req, res) => res.json({}));
router.get('/financial-operations/provider-contract-sla/contracts/:providerContractId/checks', (req, res) => res.json({}));
router.get('/financial-operations/provider-contract-sla/contracts/:providerContractId/findings', (req, res) => res.json({}));

// SLAs
router.get('/financial-operations/provider-contract-sla/slas', (req, res) => res.json([]));
router.get('/financial-operations/provider-contract-sla/slas/:providerSlaId', (req, res) => res.json({}));
router.post('/financial-operations/provider-contract-sla/slas', (req, res) => res.json({}));
router.post('/financial-operations/provider-contract-sla/slas/:providerSlaId/review', (req, res) => res.json({}));
router.post('/financial-operations/provider-contract-sla/slas/:providerSlaId/approve', (req, res) => res.json({}));
router.post('/financial-operations/provider-contract-sla/slas/:providerSlaId/revoke', (req, res) => res.json({}));
router.get('/financial-operations/provider-contract-sla/slas/:providerSlaId/checks', (req, res) => res.json({}));
router.get('/financial-operations/provider-contract-sla/slas/:providerSlaId/findings', (req, res) => res.json({}));

// Global
router.get('/financial-operations/provider-contract-sla/audit', (req, res) => res.json([]));
router.get('/financial-operations/provider-contract-sla/export-preview', (req, res) => res.json({}));

module.exports = router;
