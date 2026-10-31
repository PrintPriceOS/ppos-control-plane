'use strict';

/**
 * scripts/lib/stream_quota_limiter.js
 *
 * In-flight streaming quota byte counter and circuit breaker.
 * Reads from process.stdin and writes to process.stdout.
 *
 * If accumulated bytes exceed maxBytes, immediately emits a fatal error,
 * unpipes, and terminates the process with exit code 1.
 *
 * In bash pipelines (e.g. mysqldump ... | node stream_quota_limiter.js $MAX_BYTES > dump.sql),
 * this causes an immediate SIGPIPE on upstream producers and failure of the pipeline under `set -eo pipefail`,
 * preventing disk saturation BEFORE writing excessive bytes to storage.
 */

const maxBytesArg = process.argv[2];
if (!maxBytesArg) {
  process.stderr.write('[FATAL] stream_quota_limiter: Missing maxBytes argument.\n');
  process.exit(1);
}

const maxBytes = parseInt(maxBytesArg, 10);
if (isNaN(maxBytes) || maxBytes <= 0) {
  process.stderr.write(`[FATAL] stream_quota_limiter: Invalid maxBytes value: ${maxBytesArg}\n`);
  process.exit(1);
}

let totalBytes = 0;

process.stdin.on('data', (chunk) => {
  totalBytes += chunk.length;
  if (totalBytes > maxBytes) {
    const mbTotal = (totalBytes / (1024 * 1024)).toFixed(2);
    const mbMax = (maxBytes / (1024 * 1024)).toFixed(2);
    process.stderr.write(`\n[FATAL] In-flight quota breached: Stream reached ${totalBytes} bytes (${mbTotal} MB), exceeding hard ceiling of ${maxBytes} bytes (${mbMax} MB). Aborting pipeline immediately.\n`);
    process.stdin.pause();
    process.stdin.destroy();
    process.exit(1);
  }
  process.stdout.write(chunk);
});

process.stdin.on('end', () => {
  process.exit(0);
});

process.stdin.on('error', (err) => {
  process.stderr.write(`[FATAL] stream_quota_limiter stdin error: ${err.message}\n`);
  process.exit(1);
});

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {
    process.exit(1);
  }
  process.stderr.write(`[FATAL] stream_quota_limiter stdout error: ${err.message}\n`);
  process.exit(1);
});
