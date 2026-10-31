'use strict';

/**
 * scripts/lib/backupHmacUtil.js
 *
 * Dedicated cryptographic HMAC utility for PPOS Control Plane backup snapshots.
 *
 * Security Invariants:
 * 1. Consumes HMAC key strictly via protected files or stdin descriptors.
 * 2. Zero process command-line argument exposure of secrets (prevents ps aux leaks).
 * 3. Never prints secret keys to stdout or stderr.
 * 4. Uses crypto.timingSafeEqual() with strict 64-char hex tag verification.
 * 5. Deterministic HMAC-SHA256 calculation byte-compatible with openssl dgst -sha256.
 */

const fs = require('fs');
const crypto = require('crypto');

function resolveKey({ keyFile, keyString, allowStdin = false }) {
  if (keyFile) {
    if (!fs.existsSync(keyFile)) {
      throw new Error(`HMAC key file does not exist: ${keyFile}`);
    }
    const content = fs.readFileSync(keyFile, 'utf8').trim();
    if (!content) {
      throw new Error(`HMAC key file is empty: ${keyFile}`);
    }
    return content;
  }

  if (typeof keyString === 'string') {
    const trimmed = keyString.trim();
    if (!trimmed) {
      throw new Error('HMAC key string is empty');
    }
    return trimmed;
  }

  if (allowStdin) {
    const content = fs.readFileSync(0, 'utf8').replace(/[\r\n]+$/, '');
    if (!content) {
      throw new Error('HMAC key from stdin is empty');
    }
    return content;
  }

  throw new Error('No HMAC key provided (keyFile or keyString is mandatory)');
}

function calculateFileHmac(targetFilePath, key) {
  if (!fs.existsSync(targetFilePath)) {
    throw new Error(`Target file for HMAC computation does not exist: ${targetFilePath}`);
  }

  const hmac = crypto.createHmac('sha256', key);
  const fileBuffer = fs.readFileSync(targetFilePath);
  hmac.update(fileBuffer);
  return hmac.digest('hex');
}

function verifyFileHmac(targetFilePath, expectedTag, key) {
  if (typeof expectedTag !== 'string') {
    return false;
  }
  const cleanExpected = expectedTag.trim().toLowerCase();
  if (cleanExpected.length !== 64 || !/^[0-9a-f]{64}$/.test(cleanExpected)) {
    return false;
  }

  const calculatedTag = calculateFileHmac(targetFilePath, key).toLowerCase();
  if (calculatedTag.length !== 64) {
    return false;
  }

  const bufExpected = Buffer.from(cleanExpected, 'utf8');
  const bufCalculated = Buffer.from(calculatedTag, 'utf8');

  if (bufExpected.length !== bufCalculated.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufExpected, bufCalculated);
}

module.exports = {
  resolveKey,
  calculateFileHmac,
  verifyFileHmac
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args[0]; // "compute" or "verify"

  try {
    if (mode === 'compute') {
      const targetFile = args[1];
      const keyFile = args[2] || process.env.BACKUP_HMAC_KEY_FILE;
      const keyEnv = process.env.BACKUP_HMAC_KEY;

      if (!targetFile) {
        console.error('[FATAL] Missing target file argument for HMAC compute');
        process.exit(1);
      }

      const key = resolveKey({ keyFile, keyString: keyEnv, allowStdin: false });
      const tag = calculateFileHmac(targetFile, key);
      process.stdout.write(tag + '\n');
      process.exit(0);

    } else if (mode === 'verify') {
      const targetFile = args[1];
      const tagFileOrTag = args[2];
      const keyFile = args[3] || process.env.BACKUP_HMAC_KEY_FILE;
      const keyEnv = process.env.BACKUP_HMAC_KEY;

      if (!targetFile || !tagFileOrTag) {
        console.error('[FATAL] Missing arguments for HMAC verify');
        process.exit(1);
      }

      let expectedTag = tagFileOrTag;
      if (fs.existsSync(tagFileOrTag)) {
        expectedTag = fs.readFileSync(tagFileOrTag, 'utf8').trim();
      }

      const key = resolveKey({ keyFile, keyString: keyEnv, allowStdin: false });
      const ok = verifyFileHmac(targetFile, expectedTag, key);

      if (ok) {
        process.exit(0);
      } else {
        console.error('[FATAL] HMAC-SHA256 authenticity verification failed');
        process.exit(1);
      }

    } else {
      console.error('Usage: node backupHmacUtil.js <compute|verify> <file> [tagFile] [keyFile]');
      process.exit(1);
    }
  } catch (err) {
    console.error(`[FATAL] HMAC cryptographic failure: ${err.message}`);
    process.exit(1);
  }
}
