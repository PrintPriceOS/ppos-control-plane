const express = require('express');
const router = express.Router();

router.get('/financial-operations/compliance-reporting/definitions', (req, res) => res.json([]));
router.get('/financial-operations/compliance-reporting/definitions/:complianceReportDefinitionId', (req, res) => res.json({}));
router.post('/financial-operations/compliance-reporting/definitions', (req, res) => res.json({}));
router.post('/financial-operations/compliance-reporting/definitions/:complianceReportDefinitionId/review', (req, res) => res.json({}));
router.post('/financial-operations/compliance-reporting/definitions/:complianceReportDefinitionId/approve', (req, res) => res.json({}));
router.post('/financial-operations/compliance-reporting/definitions/:complianceReportDefinitionId/revoke', (req, res) => res.json({}));

router.get('/financial-operations/compliance-reporting/runs', (req, res) => res.json([]));
router.get('/financial-operations/compliance-reporting/runs/:complianceReportRunId', (req, res) => res.json({}));
router.post('/financial-operations/compliance-reporting/runs', (req, res) => res.json({}));
router.post('/financial-operations/compliance-reporting/runs/:complianceReportRunId/build-preview', (req, res) => res.json({}));
router.post('/financial-operations/compliance-reporting/runs/:complianceReportRunId/review', (req, res) => res.json({}));
router.get('/financial-operations/compliance-reporting/runs/:complianceReportRunId/sections', (req, res) => res.json([]));
router.get('/financial-operations/compliance-reporting/runs/:complianceReportRunId/findings', (req, res) => res.json([]));
router.get('/financial-operations/compliance-reporting/runs/:complianceReportRunId/audit', (req, res) => res.json([]));
router.get('/financial-operations/compliance-reporting/runs/:complianceReportRunId/export-preview', (req, res) => res.json({}));

module.exports = router;
