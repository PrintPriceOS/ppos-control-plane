/**
 * Federation Administration Routes
 * Phase 15 — Distributed Regional Federation
 */
const express = require('express');
const router = express.Router();

let registry, ingestor, auditLogger;
try {
    registry = require('../../../../../ppos-preflight-service/src/federation/instanceRegistry');
    ingestor = require('../../../../../ppos-preflight-service/src/federation/signalIngestor');
    auditLogger = require('../../../../../ppos-preflight-service/src/services/auditLogger');
} catch (e) {
    console.warn('[DEGRADED-MODE] Federation Admin routes using sharedMocks:', e.message);
    const mocks = require('../services/sharedMocks');
    mocks.markUsed();
    registry = mocks.instanceRegistry;
    ingestor = mocks.signalIngestor;
    auditLogger = mocks.auditLogger;
}

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
