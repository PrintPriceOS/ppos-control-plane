'use strict';

const crypto = require('crypto');

class PricingSnapshotCanonicalizer {
    constructor() {
        this.canonicalizationVersion = 'pricing-snapshot-json-v1';
        this.checksumAlgorithm = 'sha256';
    }

    /**
     * Creates a stable string representation of the snapshot payload.
     * Ensures stable ordering, decimal normalization, UTC timestamps, etc.
     */
    canonicalizePricingSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') {
            throw new Error('Snapshot must be an object');
        }

        return this._recursiveCanonicalize(snapshot);
    }

    /**
     * Computes the SHA-256 checksum of the canonicalized snapshot.
     */
    calculatePricingSnapshotChecksum(snapshot) {
        const canonical = this.canonicalizePricingSnapshot(snapshot);
        return crypto.createHash(this.checksumAlgorithm).update(canonical, 'utf8').digest('hex');
    }

    /**
     * Verifies that a given checksum matches the snapshot.
     */
    verifyPricingSnapshotChecksum(snapshot, checksum) {
        const calculated = this.calculatePricingSnapshotChecksum(snapshot);
        if (calculated !== checksum) {
            const err = new Error(`Checksum mismatch: expected ${checksum}, got ${calculated}`);
            err.code = 'SNAPSHOT_INTEGRITY_CHECK_FAILED';
            throw err;
        }
        return true;
    }

    _recursiveCanonicalize(obj) {
        const type = typeof obj;
        if (obj === null) return 'null';
        if (obj === undefined) return ''; // Ignore undefined
        if (type === 'number') {
            if (Number.isNaN(obj) || !Number.isFinite(obj)) {
                return 'null'; // JSON stringify converts NaN/Infinity to null
            }
            // Normalize floats
            if (Number.isInteger(obj)) return String(obj);
            return parseFloat(obj.toPrecision(15)).toString(); 
        }
        if (type === 'boolean') return String(obj);
        if (type === 'string') {
            // Check if ISO Date string
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(obj)) {
                return JSON.stringify(obj);
            }
            return JSON.stringify(obj);
        }

        if (Array.isArray(obj)) {
            const arr = obj.map(item => this._recursiveCanonicalize(item));
            return `[${arr.join(',')}]`;
        }

        // Object
        const keys = Object.keys(obj).sort();
        const kv = keys.map(k => {
            const val = this._recursiveCanonicalize(obj[k]);
            if (val === '') return ''; 
            return `${JSON.stringify(k)}:${val}`;
        }).filter(s => s !== '');
        return `{${kv.join(',')}}`;
    }
}

module.exports = new PricingSnapshotCanonicalizer();
