/**
 * tests/smoke_phase195j_ai_provider_timeout_hotfix.js
 *
 * Phase 195J — AI Provider Timeout & Environment Configuration Hotfix Test Suite.
 *
 * Coverage:
 * 1. Default timeout (15000ms) preserved when PPOS_AI_TIMEOUT_MS is unset/empty.
 * 2. Valid PPOS_AI_TIMEOUT_MS integer values between 1000 and 120000 ms.
 * 3. Strict rejection of invalid configurations (<1000, >120000, non-integer, negative).
 * 4. Axios timeout translation to AI_PROVIDER_TIMEOUT / HTTP 504 with sanitized diagnostics.
 * 5. Verification that secrets (API key, headers, prompts, raw Axios error) are never logged.
 */
const assert = require('assert');
const axios = require('axios');
const aiProviderAdapter = require('../src/api/services/aiProviderAdapter');
const loggerModule = require('../src/api/services/logger');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

function test(description, fn) {
    try {
        fn();
        console.log(`  ${PASS} ${description}`);
        passed++;
    } catch (err) {
        console.log(`  ${FAIL} ${description}`);
        console.log(`    → ${err.message}`);
        failed++;
    }
}

async function asyncTest(description, fn) {
    try {
        await fn();
        console.log(`  ${PASS} ${description}`);
        passed++;
    } catch (err) {
        console.log(`  ${FAIL} ${description}`);
        console.log(`    → ${err.message}`);
        failed++;
    }
}

(async () => {
    console.log('\n═══ Phase 195J: AI Provider Timeout Hotfix Acceptance Suite ═══\n');

    const ORIGINAL_ENV_TIMEOUT = process.env.PPOS_AI_TIMEOUT_MS;
    const ORIGINAL_API_KEY = process.env.GEMINI_API_KEY;

    function cleanupEnv() {
        if (ORIGINAL_ENV_TIMEOUT !== undefined) {
            process.env.PPOS_AI_TIMEOUT_MS = ORIGINAL_ENV_TIMEOUT;
        } else {
            delete process.env.PPOS_AI_TIMEOUT_MS;
        }
        if (ORIGINAL_API_KEY !== undefined) {
            process.env.GEMINI_API_KEY = ORIGINAL_API_KEY;
        } else {
            delete process.env.GEMINI_API_KEY;
        }
        aiProviderAdapter.timeoutMs = undefined;
    }

    try {
        // 1. Default timeout
        test('J.1: Preserves default timeout of 15000ms when PPOS_AI_TIMEOUT_MS is omitted', () => {
            cleanupEnv();
            delete process.env.PPOS_AI_TIMEOUT_MS;
            assert.strictEqual(aiProviderAdapter.getTimeoutMs(), 15000);
            assert.strictEqual(aiProviderAdapter.timeoutMs, 15000);
        });

        test('J.2: Preserves default timeout of 15000ms when PPOS_AI_TIMEOUT_MS is empty string', () => {
            cleanupEnv();
            process.env.PPOS_AI_TIMEOUT_MS = '   ';
            assert.strictEqual(aiProviderAdapter.getTimeoutMs(), 15000);
        });

        // 2. Valid configuration
        test('J.3: Accepts valid PPOS_AI_TIMEOUT_MS integer values within [1000, 120000]', () => {
            cleanupEnv();

            process.env.PPOS_AI_TIMEOUT_MS = '30000';
            assert.strictEqual(aiProviderAdapter.getTimeoutMs(), 30000);

            process.env.PPOS_AI_TIMEOUT_MS = '1000';
            assert.strictEqual(aiProviderAdapter.getTimeoutMs(), 1000);

            process.env.PPOS_AI_TIMEOUT_MS = '120000';
            assert.strictEqual(aiProviderAdapter.getTimeoutMs(), 120000);
        });

        // 3. Invalid configuration rejection
        test('J.4: Rejects PPOS_AI_TIMEOUT_MS below 1000ms with clear error', () => {
            cleanupEnv();
            process.env.PPOS_AI_TIMEOUT_MS = '500';
            assert.throws(() => {
                aiProviderAdapter.getTimeoutMs();
            }, (err) => {
                return err.code === 'INVALID_AI_TIMEOUT_CONFIG' &&
                       err.statusCode === 500 &&
                       err.message.includes('Must be an integer between 1000 and 120000 ms');
            });
        });

        test('J.5: Rejects PPOS_AI_TIMEOUT_MS above 120000ms with clear error', () => {
            cleanupEnv();
            process.env.PPOS_AI_TIMEOUT_MS = '200000';
            assert.throws(() => {
                aiProviderAdapter.getTimeoutMs();
            }, (err) => {
                return err.code === 'INVALID_AI_TIMEOUT_CONFIG' &&
                       err.statusCode === 500 &&
                       err.message.includes('Must be an integer between 1000 and 120000 ms');
            });
        });

        test('J.6: Rejects non-integer PPOS_AI_TIMEOUT_MS values (strings, decimals, negative)', () => {
            cleanupEnv();

            const invalidValues = ['invalid', '15000.5', '-5000', 'abc123', 'true'];
            for (const val of invalidValues) {
                process.env.PPOS_AI_TIMEOUT_MS = val;
                assert.throws(() => {
                    aiProviderAdapter.getTimeoutMs();
                }, (err) => {
                    return err.code === 'INVALID_AI_TIMEOUT_CONFIG';
                }, `Expected rejection for PPOS_AI_TIMEOUT_MS="${val}"`);
            }
        });

        // 4. Axios timeout translation to AI_PROVIDER_TIMEOUT / 504 & Sanitized Logging
        await asyncTest('J.7: Translates Axios ECONNABORTED timeout to AI_PROVIDER_TIMEOUT HTTP 504 with sanitized logging', async () => {
            cleanupEnv();
            process.env.PPOS_AI_TIMEOUT_MS = '25000';
            process.env.GEMINI_API_KEY = 'test_secret_api_key_1234567890';

            // Capture logger outputs at Logger class prototype level
            const loggedEntries = [];
            const LoggerClass = loggerModule.constructor;
            const originalLog = LoggerClass.prototype._log;
            LoggerClass.prototype._log = function(level, payload) {
                loggedEntries.push({ level, payload });
            };

            // Mock Axios post to simulate a timeout error
            const originalPost = axios.post;
            axios.post = async function(url, body, config) {
                const err = new Error('timeout of 25000ms exceeded');
                err.code = 'ECONNABORTED';
                err.config = config; // raw config with secrets/URL
                throw err;
            };

            try {
                await aiProviderAdapter.generateStructuredCompletion({
                    systemInstruction: 'SECRET_SYSTEM_INSTRUCTION',
                    userPrompt: 'SECRET_USER_PROMPT'
                });
                assert.fail('Expected AI_PROVIDER_TIMEOUT error');
            } catch (err) {
                assert.strictEqual(err.code, 'AI_PROVIDER_TIMEOUT');
                assert.strictEqual(err.statusCode, 504);
                assert.ok(err.message.includes('timed out after 25000ms'));
                assert.strictEqual(typeof err.latencyMs, 'number');

                // Verify logged diagnostic entry
                assert.strictEqual(loggedEntries.length, 1);
                const entry = loggedEntries[0];

                assert.strictEqual(entry.level, 'WARN');
                assert.strictEqual(entry.payload.event, 'ai_provider_timeout');
                assert.ok(entry.payload.metadata);
                assert.strictEqual(entry.payload.metadata.timeoutMs, 25000);
                assert.ok(entry.payload.metadata.model.includes('gemini'));
                assert.strictEqual(typeof entry.payload.metadata.latencyMs, 'number');

                // Verify NO secrets/prompts/URL/Axios objects were logged
                const logString = JSON.stringify(entry);
                assert.ok(!logString.includes('test_secret_api_key'));
                assert.ok(!logString.includes('SECRET_SYSTEM_INSTRUCTION'));
                assert.ok(!logString.includes('SECRET_USER_PROMPT'));
                assert.ok(!logString.includes('generativelanguage.googleapis.com'));
                assert.ok(!logString.includes('headers'));
                assert.ok(!logString.includes('ECONNABORTED'));
            } finally {
                LoggerClass.prototype._log = originalLog;
                axios.post = originalPost;
                cleanupEnv();
            }
        });

    } finally {
        cleanupEnv();
    }

    console.log(`\n═══ Phase 195J Results: ${passed} passed, ${failed} failed ═══\n`);
    if (failed > 0) {
        process.exit(1);
    }
})();
