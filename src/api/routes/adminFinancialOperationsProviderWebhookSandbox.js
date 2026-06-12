const express = require('express');
const router = express.Router();

router.get('/financial-operations/provider-webhook-sandbox/webhooks', (req, res) => res.json([]));
router.get('/financial-operations/provider-webhook-sandbox/webhooks/:webhookSandboxId', (req, res) => res.json({}));
router.post('/financial-operations/provider-webhook-sandbox/webhooks', (req, res) => res.json({}));
router.post('/financial-operations/provider-webhook-sandbox/webhooks/:webhookSandboxId/review', (req, res) => res.json({}));
router.post('/financial-operations/provider-webhook-sandbox/webhooks/:webhookSandboxId/approve', (req, res) => res.json({}));
router.post('/financial-operations/provider-webhook-sandbox/webhooks/:webhookSandboxId/activate', (req, res) => res.json({}));
router.post('/financial-operations/provider-webhook-sandbox/webhooks/:webhookSandboxId/suspend', (req, res) => res.json({}));
router.post('/financial-operations/provider-webhook-sandbox/webhooks/:webhookSandboxId/revoke', (req, res) => res.json({}));
router.get('/financial-operations/provider-webhook-sandbox/webhooks/:webhookSandboxId/tests', (req, res) => res.json([]));
router.post('/financial-operations/provider-webhook-sandbox/webhooks/:webhookSandboxId/tests', (req, res) => res.json({}));
router.post('/financial-operations/provider-webhook-sandbox/tests/:webhookEventTestId/mock', (req, res) => res.json({}));
router.post('/financial-operations/provider-webhook-sandbox/tests/:webhookEventTestId/stub', (req, res) => res.json({}));
router.post('/financial-operations/provider-webhook-sandbox/tests/:webhookEventTestId/dry-run', (req, res) => res.json({}));
router.get('/financial-operations/provider-webhook-sandbox/webhooks/:webhookSandboxId/replay', (req, res) => res.json({}));
router.post('/financial-operations/provider-webhook-sandbox/webhooks/:webhookSandboxId/replay', (req, res) => res.json({}));
router.get('/financial-operations/provider-webhook-sandbox/webhooks/:webhookSandboxId/audit', (req, res) => res.json([]));
router.get('/financial-operations/provider-webhook-sandbox/webhooks/:webhookSandboxId/export-preview', (req, res) => res.json({}));

module.exports = router;
