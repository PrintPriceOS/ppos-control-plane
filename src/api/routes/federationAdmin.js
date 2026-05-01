/**
 * Federation Administration Routes
 * Phase 15 — Distributed Regional Federation
 */
const express = require('express');
const router = express.Router();

let registry = null, ingestor = null, auditLogger = null;
try {
    registry = require('../upstream/src/federation/instanceRegistry');
    ingestor = require('../upstream/src/federation/signalIngestor');
    auditLogger = require('../upstream/src/services/auditLogger');
} catch (e) {
    console.error('[CORE-ROUTING] Federation services unavailable:', e.message);
}

router.get('/registry', (req, res) => {
    try {
        res.json({ ok: true, instances: registry ? registry.getAll() : [], degraded: !registry });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/signals', (req, res) => {
    try {
        res.json({ ok: true, signals: ingestor ? ingestor.getLatestSignals() : [], degraded: !ingestor });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/audit', (req, res) => {
    try {
        res.json({ ok: true, audit: auditLogger ? auditLogger.getFederationLogs() : [], degraded: !auditLogger });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
