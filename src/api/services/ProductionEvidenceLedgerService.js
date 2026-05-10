/**
 * src/api/services/ProductionEvidenceLedgerService.js
 * 
 * Phase 34 - Live Federation Activation.
 * Provides an immutable, chained ledger for manufacturing dispatch evidence.
 */
const crypto = require('crypto');
const db = require('./mysqlClient');
const logger = require('./logger').child('evidence-ledger');

class ProductionEvidenceLedgerService {
    /**
     * Appends a new piece of evidence to the ledger, chaining it to the previous entry.
     */
    async appendEvidence(data) {
        const { dispatch_id, node_id, tenant_id, evidence_type, payload } = data;

        try {
            // 1. Get previous hash for this dispatch_id
            const prev = await db.query(`
                SELECT hash FROM production_evidence_ledger 
                WHERE dispatch_id = ? 
                ORDER BY id DESC LIMIT 1
            `, [dispatch_id]);
            
            const previous_hash = prev.length > 0 ? prev[0].hash : null;

            // 2. Hash payload deterministically
            const payloadStr = JSON.stringify(this._sortObject(payload));
            const contentToHash = `${dispatch_id}|${evidence_type}|${payloadStr}|${previous_hash || 'ROOT'}`;
            const hash = crypto.createHash('sha256').update(contentToHash).digest('hex');

            // 3. Persist to ledger
            await db.query(`
                INSERT INTO production_evidence_ledger (
                    dispatch_id, node_id, tenant_id, evidence_type, payload_json, hash, previous_hash
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                dispatch_id, 
                node_id || null, 
                tenant_id || null, 
                evidence_type, 
                JSON.stringify(payload), 
                hash, 
                previous_hash
            ]);

            logger.info({ event: 'evidence_appended', dispatch_id, evidence_type, hash });
            return { ok: true, hash };
        } catch (err) {
            logger.error({ event: 'evidence_append_failed', error: err.message, dispatch_id });
            throw err;
        }
    }

    /**
     * Verifies the integrity of the evidence chain for a specific dispatch.
     */
    async verifyChain(dispatch_id) {
        try {
            const entries = await db.query(`
                SELECT * FROM production_evidence_ledger 
                WHERE dispatch_id = ? 
                ORDER BY id ASC
            `, [dispatch_id]);

            if (entries.length === 0) return { ok: true, verified: true, message: 'EMPTY_CHAIN' };

            let expected_prev_hash = null;
            for (const entry of entries) {
                // Verify previous hash link
                if (entry.previous_hash !== expected_prev_hash) {
                    return { 
                        ok: true, 
                        verified: false, 
                        error: 'CHAIN_BROKEN', 
                        entry_id: entry.id,
                        expected: expected_prev_hash,
                        actual: entry.previous_hash
                    };
                }

                // Verify local hash
                const payloadStr = JSON.stringify(this._sortObject(entry.payload_json));
                const contentToHash = `${entry.dispatch_id}|${entry.evidence_type}|${payloadStr}|${entry.previous_hash || 'ROOT'}`;
                const calculatedHash = crypto.createHash('sha256').update(contentToHash).digest('hex');

                if (calculatedHash !== entry.hash) {
                    return { 
                        ok: true, 
                        verified: false, 
                        error: 'HASH_MISMATCH', 
                        entry_id: entry.id 
                    };
                }

                expected_prev_hash = entry.hash;
            }

            return { ok: true, verified: true, count: entries.length };
        } catch (err) {
            logger.error({ event: 'chain_verification_failed', error: err.message, dispatch_id });
            throw err;
        }
    }

    /**
     * Retrieves all evidence for a dispatch.
     */
    async getEvidence(dispatch_id) {
        return db.query(`
            SELECT * FROM production_evidence_ledger 
            WHERE dispatch_id = ? 
            ORDER BY id ASC
        `, [dispatch_id]);
    }

    /**
     * Internal utility for deterministic hashing.
     */
    _sortObject(obj) {
        if (typeof obj !== 'object' || obj === null) return obj;
        if (Array.isArray(obj)) return obj.map(this._sortObject.bind(this));
        
        return Object.keys(obj).sort().reduce((acc, key) => {
            acc[key] = this._sortObject(obj[key]);
            return acc;
        }, {});
    }
}

module.exports = new ProductionEvidenceLedgerService();
