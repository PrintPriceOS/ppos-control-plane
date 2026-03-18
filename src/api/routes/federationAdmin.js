/**
 * Federation Administration Routes
 * Phase 15 — Distributed Regional Federation
 */
const express = require('express');
const router = express.Router();

const registry = require('../../../../../ppos-preflight-service/src/federation/instanceRegistry');
const ingestor = require('../../../../../ppos-preflight-service/src/federation/signalIngestor');
const auditLogger = require('../../../../../ppos-preflight-service/src/services/auditLogger');

router.get('/registry', (req, res) => {
    try {
        res.json({ ok: true, instances: registry.getAll() });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/signals', (req, res) => {
    try {
        res.json({ ok: true, signals: ingestor.getLatestSignals() });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/audit', (req, res) => {
    try {
        res.json({ ok: true, audit: auditLogger.getFederationLogs() });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
