'use strict';

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { resolveKey, calculateFileHmac, verifyFileHmac } from '../scripts/lib/backupHmacUtil';

describe('backupHmacUtil: Dedicated Cryptographic HMAC Authenticity Tests', () => {
    const tempDir = path.join(__dirname, 'temp_hmac_test');

    beforeEach(() => {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
    });

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('1. Computes correct HMAC-SHA256 and verifies successfully with timingSafeEqual', () => {
        const testFile = path.join(tempDir, 'payload.bin');
        const keyFile = path.join(tempDir, 'key.txt');
        const sampleKey = 'c7a84e2a89df4b3ea1e028b12f4581c79a0b12c3d4e5f60718293a4b5c6d7e8f';
        const sampleContent = 'Sensitive database backup payload content for testing';

        fs.writeFileSync(testFile, sampleContent, 'utf8');
        fs.writeFileSync(keyFile, sampleKey, 'utf8');

        const key = resolveKey({ keyFile });
        const tag = calculateFileHmac(testFile, key);

        expect(tag).toHaveLength(64);
        expect(/^[0-9a-f]{64}$/.test(tag)).toBe(true);

        const isValid = verifyFileHmac(testFile, tag, key);
        expect(isValid).toBe(true);
    });

    it('2. Negative test: rejects tampered file payload', () => {
        const testFile = path.join(tempDir, 'payload.bin');
        const sampleKey = 'sample_secret_key_12345';
        fs.writeFileSync(testFile, 'Original Content', 'utf8');

        const tag = calculateFileHmac(testFile, sampleKey);

        // Tamper with payload
        fs.writeFileSync(testFile, 'Tampered Content!', 'utf8');

        const isValid = verifyFileHmac(testFile, tag, sampleKey);
        expect(isValid).toBe(false);
    });

    it('3. Negative test: rejects wrong HMAC key', () => {
        const testFile = path.join(tempDir, 'payload.bin');
        const correctKey = 'correct_key_12345';
        const wrongKey = 'wrong_key_67890';
        fs.writeFileSync(testFile, 'Important Content', 'utf8');

        const tag = calculateFileHmac(testFile, correctKey);
        const isValid = verifyFileHmac(testFile, tag, wrongKey);
        expect(isValid).toBe(false);
    });

    it('4. Negative test: rejects malformed or truncated HMAC tag', () => {
        const testFile = path.join(tempDir, 'payload.bin');
        const key = 'test_key';
        fs.writeFileSync(testFile, 'Test Content', 'utf8');

        expect(verifyFileHmac(testFile, 'short_tag', key)).toBe(false);
        expect(verifyFileHmac(testFile, '', key)).toBe(false);
        expect(verifyFileHmac(testFile, null, key)).toBe(false);
        expect(verifyFileHmac(testFile, 'g'.repeat(64), key)).toBe(false); // non-hex
    });

    it('5. Negative test: throws on missing key or empty key file', () => {
        const emptyKeyFile = path.join(tempDir, 'empty_key.txt');
        fs.writeFileSync(emptyKeyFile, '   \n', 'utf8');

        expect(() => resolveKey({ keyFile: emptyKeyFile })).toThrow(/HMAC key file is empty/);
        expect(() => resolveKey({ keyFile: 'non_existent_key_file.txt' })).toThrow(/HMAC key file does not exist/);
        expect(() => resolveKey({ keyString: '' })).toThrow(/HMAC key string is empty/);
        expect(() => resolveKey({})).toThrow(/No HMAC key provided/);
    });
});
