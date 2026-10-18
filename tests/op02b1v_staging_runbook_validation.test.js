'use strict';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mysqlClient from '../src/api/services/mysqlClient';
import fs from 'fs';
import path from 'path';

describe('OP-02B.1V: Staging Runbook, Configuration Contracts & Secret Resolution', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('1. Docker Secrets & Password File Resolution', () => {
        it('resolves MYSQL_PASSWORD from MYSQL_PASSWORD_FILE when direct variable is not set', () => {
            const tempSecretPath = path.join(__dirname, 'temp_test_db_secret.txt');
            fs.writeFileSync(tempSecretPath, 'super_secure_staging_password_123\n', 'utf8');

            try {
                delete process.env.MYSQL_PASSWORD;
                process.env.MYSQL_PASSWORD_FILE = tempSecretPath;
                process.env.MYSQL_HOST = 'test-staging-mysql';
                process.env.MYSQL_DATABASE = 'ppos_control_staging';

                // Close any existing pool and reinitialize
                mysqlClient.closePool();
                const pool = mysqlClient.getPool();

                expect(pool.pool.config.connectionConfig.password).toBe('super_secure_staging_password_123');
            } finally {
                mysqlClient.closePool();
                if (fs.existsSync(tempSecretPath)) {
                    fs.unlinkSync(tempSecretPath);
                }
            }
        });
    });

    describe('2. Fail-Closed Commercial Capability & Grant Contracts', () => {
        it('ensures printhouseActivationAdapter fail-closed on unactivated tenants', async () => {
            const activationAdapter = require('../src/api/services/printhouseActivationAdapter');
            
            // Testing unactivated tenant
            const result = await activationAdapter.getCapabilities({ tenantId: 'unactivated-tenant-test' });
            expect(result.capabilities.MARKETPLACE_VISIBLE).toBe(false);
            expect(result.capabilities.LIVE_QUOTING_ALLOWED).toBe(false);
            expect(result.capabilities.JOB_ROUTING_ALLOWED).toBe(false);
            expect(result.capabilities.PRODUCTION_DISPATCH_ALLOWED).toBe(false);
        });

        it('verifies the 4 commercial capability grants directly against database schema contracts', async () => {
            const mysql = require('../src/api/services/mysqlClient');
            const activationAdapter = require('../src/api/services/printhouseActivationAdapter');
            const vi = (await import('vitest')).vi;

            // Ensure mysqlClient is considered configured
            process.env.MYSQL_HOST = 'test-staging-mysql';

            // Mock DB response simulating an active grant row with all 4 capabilities enabled
            vi.spyOn(mysql, 'query').mockImplementation(async (sql, params) => {
                if (sql.includes('printhouse_activation_grants') && params[0] === 'tenant-commercial-test') {
                    return [
                        {
                            id: 'grant-test-01',
                            review_id: 'rev-01',
                            tenant_id: 'tenant-commercial-test',
                            site_id: null,
                            marketplace_visible: 1,
                            live_quoting_allowed: 1,
                            job_routing_allowed: 1,
                            production_dispatch_allowed: 1,
                            status: 'ACTIVE',
                            granted_at: new Date()
                        }
                    ];
                }
                if (sql.includes('printhouse_activation_grants') && params[0] === 'tenant-commercial-test-2') {
                    return [
                        {
                            id: 'grant-test-02',
                            review_id: 'rev-02',
                            tenant_id: 'tenant-commercial-test-2',
                            site_id: null,
                            marketplace_visible: 1,
                            live_quoting_allowed: 1,
                            job_routing_allowed: 1,
                            production_dispatch_allowed: 1,
                            status: 'DEACTIVATED',
                            granted_at: new Date()
                        }
                    ];
                }
                return [];
            });

            const res = await activationAdapter.getCapabilities({ tenantId: 'tenant-commercial-test' });
            expect(res.status).toBe('ACTIVE');
            expect(res.capabilities.MARKETPLACE_VISIBLE).toBe(true);
            expect(res.capabilities.LIVE_QUOTING_ALLOWED).toBe(true);
            expect(res.capabilities.JOB_ROUTING_ALLOWED).toBe(true);
            expect(res.capabilities.PRODUCTION_DISPATCH_ALLOWED).toBe(true);

            // Mock DB response simulating deactivated grant
            vi.spyOn(mysqlClient, 'query').mockResolvedValueOnce([
                {
                    id: 'grant-test-02',
                    review_id: 'rev-02',
                    tenant_id: 'tenant-commercial-test-2',
                    marketplace_visible: 1,
                    live_quoting_allowed: 1,
                    job_routing_allowed: 1,
                    production_dispatch_allowed: 1,
                    status: 'DEACTIVATED',
                    granted_at: new Date()
                }
            ]);

            const deactRes = await activationAdapter.getCapabilities({ tenantId: 'tenant-commercial-test-2' });
            expect(deactRes.capabilities.MARKETPLACE_VISIBLE).toBe(false);
            expect(deactRes.capabilities.LIVE_QUOTING_ALLOWED).toBe(false);
            expect(deactRes.capabilities.JOB_ROUTING_ALLOWED).toBe(false);
            expect(deactRes.capabilities.PRODUCTION_DISPATCH_ALLOWED).toBe(false);
        });
    });

    describe('3. Docker Compose & Staging Environment Contract Completeness', () => {
        it('verifies docker-compose.staging.yml has all required services, secrets, and volumes', () => {
            const composeContent = fs.readFileSync(path.join(__dirname, '../docker-compose.staging.yml'), 'utf8');
            expect(composeContent).toContain('ppos-staging-mysql');
            expect(composeContent).toContain('control-plane-staging');
            expect(composeContent).toContain('staging_mysql_data:');
            expect(composeContent).toContain('staging_documents_data:');
            expect(composeContent).toContain('secrets:');
            expect(composeContent).toContain('staging_db_password:');
            expect(composeContent).toContain('staging_root_password:');
            expect(composeContent).toContain('staging_jwt_secret:');
        });

        it('verifies docker-compose.staging.yml enforces shared-host non-invasive architecture', () => {
            const composeContent = fs.readFileSync(path.join(__dirname, '../docker-compose.staging.yml'), 'utf8');
            // Dedicated project name
            expect(composeContent).toContain('name: ppos-staging');
            // Safe non-conflicting port for app
            expect(composeContent).toContain('127.0.0.1:18081:8081');
            // Zero host published ports for staging-mysql (no 3306 on host)
            expect(composeContent).not.toContain('"127.0.0.1:3306:3306"');
            expect(composeContent).not.toContain('"3306:3306"');
            // Authenticated MySQL healthcheck
            expect(composeContent).toContain('SELECT 1;');
            // Mock webhook dispatch containment
            expect(composeContent).toContain('WEBHOOK_DISPATCH_MOCK_ONLY');
        });

        it('verifies deployment compose has zero build directive and consumes pre-built image, while lab compose contains build context', () => {
            const deployCompose = fs.readFileSync(path.join(__dirname, '../docker-compose.staging.yml'), 'utf8');
            expect(deployCompose).not.toContain('build:');
            expect(deployCompose).toContain('image: ppos-control-plane:staging-');

            const labCompose = fs.readFileSync(path.join(__dirname, '../docker-compose.staging.lab.yml'), 'utf8');
            expect(labCompose).toContain('build:');
            expect(labCompose).toContain('dockerfile: Dockerfile');
        });

        it('verifies Dockerfile exists and builds via multistage runner pattern', () => {
            const dockerfileContent = fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf8');
            expect(dockerfileContent).toContain('FROM node:22-bookworm-slim AS builder');
            expect(dockerfileContent).toContain('FROM node:22-bookworm-slim AS runner');
            expect(dockerfileContent).toContain('npm run build');
            expect(dockerfileContent).toContain('CMD ["node", "server.js"]');
        });
    });

    describe('4. Persistent Bootstrap Environment Guards & Anti-Production Constraints', () => {
        const { checkStagingPersistentGuards } = require('../scripts/bootstrap_staging_persistent_schema');

        it('rejects execution when NODE_ENV is production', () => {
            expect(() => {
                checkStagingPersistentGuards({
                    nodeEnv: 'production',
                    bootstrapFlag: 'true',
                    targetDb: 'ppos_control_staging'
                });
            }).toThrow(/Strictly forbidden in production/);
        });

        it('rejects execution without explicit PPOS_STAGING_PERSISTENT_BOOTSTRAP=true flag', () => {
            expect(() => {
                checkStagingPersistentGuards({
                    nodeEnv: 'staging',
                    bootstrapFlag: 'false',
                    targetDb: 'ppos_control_staging'
                });
            }).toThrow(/PPOS_STAGING_PERSISTENT_BOOTSTRAP=true is required/);
        });

        it('strictly rejects production database targets', () => {
            expect(() => {
                checkStagingPersistentGuards({
                    nodeEnv: 'staging',
                    bootstrapFlag: 'true',
                    targetDb: 'ppos_control_plane'
                });
            }).toThrow(/Forbidden target database/);

            expect(() => {
                checkStagingPersistentGuards({
                    nodeEnv: 'staging',
                    bootstrapFlag: 'true',
                    targetDb: 'production_db'
                });
            }).toThrow(/Forbidden target database/);
        });

        it('gives DATABASE_URL precedence and rejects production host even if DB is named staging', () => {
            expect(() => {
                checkStagingPersistentGuards({
                    nodeEnv: 'staging',
                    bootstrapFlag: 'true',
                    DATABASE_URL: 'mysql://usr:pwd@production-cluster.rds.amazonaws.com:3306/ppos_staging'
                });
            }).toThrow(/Forbidden production host identifier/);
        });

        it('accepts explicitly authorized staging or sandbox target databases', () => {
            expect(() => {
                checkStagingPersistentGuards({
                    nodeEnv: 'staging',
                    bootstrapFlag: 'true',
                    targetDb: 'ppos_control_staging'
                });
            }).not.toThrow();

            expect(() => {
                checkStagingPersistentGuards({
                    nodeEnv: 'test',
                    bootstrapFlag: 'true',
                    targetDb: 'ppos_sandbox_drill'
                });
            }).not.toThrow();
        });
    });

    describe('5. Backup & Restore Security Constraints', () => {
        it('verifies staging_backup_snapshot.sh does not use --databases flag, does not expose password on CLI, and uses UUID, SHA256 and HMAC-SHA256 authenticity', () => {
            const backupScript = fs.readFileSync(path.join(__dirname, '../scripts/staging_backup_snapshot.sh'), 'utf8');
            expect(backupScript).not.toContain('--databases');
            expect(backupScript).toContain('ENC_PASS');
            expect(backupScript).not.toContain('pass:${BACKUP_PASSPHRASE}');
            expect(backupScript).toContain('BACKUP_UUID');
            expect(backupScript).toContain('sha256sum');
            expect(backupScript).toContain('HMAC-SHA256');
            expect(backupScript).toContain('pipefail');
            expect(backupScript).toContain('BACKUP_HMAC_KEY or BACKUP_HMAC_KEY_FILE is mandatory');
            expect(backupScript).not.toContain('auth-tag:ppos-backup-v2'); // No silent derivation fallback
        });

        it('verifies staging_restore_drill.sh strictly rejects production databases, requires sha256 and HMAC authenticity tag, and confirms destination server identity', () => {
            const restoreScript = fs.readFileSync(path.join(__dirname, '../scripts/staging_restore_drill.sh'), 'utf8');
            expect(restoreScript).toContain('*prod*|*production*|*live*|*master*');
            expect(restoreScript).toContain('SHA-256 checksum file (${SHA_FILE}) is missing');
            expect(restoreScript).toContain('HMAC authenticity file (${HMAC_FILE}) is missing');
            expect(restoreScript).not.toContain('pass:${PASSPHRASE}');
            expect(restoreScript).toContain('SERVER_IDENTITY');
            expect(restoreScript).toContain('ELAPSED_MS');
            expect(restoreScript).toContain('BACKUP_HMAC_KEY or BACKUP_HMAC_KEY_FILE is mandatory');
            expect(restoreScript).not.toContain('auth-tag:ppos-backup-v2'); // No silent derivation fallback
            expect(restoreScript).toContain('backupHmacUtil.js'); // Uses dedicated utility without arg exposure
            expect(restoreScript).toContain('timingSafeEqual'); // Uses constant-time comparison
        });

        it('verifies staging_backup_snapshot.sh uses in-flight stream quota limiter in pipeline', () => {
            const backupScript = fs.readFileSync(path.join(__dirname, '../scripts/staging_backup_snapshot.sh'), 'utf8');
            expect(backupScript).toContain('stream_quota_limiter.js');
            expect(backupScript).toContain('MAX_STORAGE_BYTES');
            expect(backupScript).toContain('trap cleanup EXIT INT TERM');
        });

        it('verifies stream_quota_limiter aborts in-flight before writing excessive bytes and cleans up', async () => {
            const { spawnSync } = require('child_process');
            const limiterPath = path.join(__dirname, '../scripts/lib/stream_quota_limiter.js');
            
            // Limit = 1024 bytes (1 KB)
            const inputData = Buffer.alloc(2048, 'A'); // 2 KB payload
            const result = spawnSync('node', [limiterPath, '1024'], {
                input: inputData,
                encoding: 'utf8'
            });

            expect(result.status).toBe(1);
            expect(result.stderr).toContain('In-flight quota breached');
            expect(result.stderr).toContain('exceeding hard ceiling of 1024 bytes');
        });

        it('verifies stream_quota_limiter passes through streams within budget', () => {
            const { spawnSync } = require('child_process');
            const limiterPath = path.join(__dirname, '../scripts/lib/stream_quota_limiter.js');
            
            const inputData = Buffer.alloc(512, 'B'); // 512 bytes payload
            const result = spawnSync('node', [limiterPath, '1024'], {
                input: inputData,
                encoding: 'utf8'
            });

            expect(result.status).toBe(0);
            expect(result.stdout.length).toBe(512);
        });

        it('negative test: rejects dumps containing CREATE DATABASE or USE statements', () => {
            const restoreScript = fs.readFileSync(path.join(__dirname, '../scripts/staging_restore_drill.sh'), 'utf8');
            expect(restoreScript).toContain('CREATE DATABASE');
            expect(restoreScript).toContain('USE');
            expect(restoreScript).toContain('target database boundary');
        });
    });

    describe('6. Outgoing Commercial & Network Isolation Contract Assertions', () => {
        it('verifies environment template and compose enforce complete commercial containment', () => {
            const envContent = fs.readFileSync(path.join(__dirname, '../.env.staging.example'), 'utf8');
            const composeContent = fs.readFileSync(path.join(__dirname, '../docker-compose.staging.yml'), 'utf8');

            const forbiddenActiveFlags = [
                'PAYMENT_EXECUTION_ENABLED=true',
                'PAYOUT_EXECUTION_ENABLED=true',
                'REFUND_EXECUTION_ENABLED=true',
                'LIVE_PROVIDER_CONNECTIVITY=true',
                'MARKETPLACE_VISIBLE=true',
                'LIVE_QUOTING_ALLOWED=true',
                'JOB_ROUTING_ALLOWED=true',
                'PRODUCTION_DISPATCH_ALLOWED=true'
            ];

            forbiddenActiveFlags.forEach(flag => {
                expect(envContent).not.toContain(flag);
                expect(composeContent).not.toContain(flag);
            });

            // Enforce explicit mock containment
            expect(envContent).toContain('PAYMENT_EXECUTION_ENABLED=false');
            expect(envContent).toContain('LIVE_PROVIDER_CONNECTIVITY=false');
            expect(envContent).toContain('WEBHOOK_DISPATCH_MOCK_ONLY=true');
            expect(envContent).toContain('OUTGOING_WEBHOOK_SINK_URL=http://127.0.0.1:9999/sink');

            expect(composeContent).toContain("PAYMENT_EXECUTION_ENABLED: 'false'");
            expect(composeContent).toContain("LIVE_PROVIDER_CONNECTIVITY: 'false'");
            expect(composeContent).toContain("WEBHOOK_DISPATCH_MOCK_ONLY: 'true'");
            expect(composeContent).toContain("OUTGOING_WEBHOOK_SINK_URL: 'http://127.0.0.1:9999/sink'");
        });

        it('behavioral test: outgoingWebhookService intercepts dispatch under WEBHOOK_DISPATCH_MOCK_ONLY with zero external network traffic (instrumenting http, https, and axios)', async () => {
            const outgoingWebhookService = require('../src/api/services/outgoingWebhookService');
            const mysql = require('../src/api/services/mysqlClient');
            const http = require('http');
            const https = require('https');
            const axios = require('axios');
            const vi = (await import('vitest')).vi;

            process.env.WEBHOOK_DISPATCH_MOCK_ONLY = 'true';
            process.env.OUTGOING_WEBHOOK_SINK_URL = 'http://127.0.0.1:9999/sink';

            let externalNetworkCallAttempted = false;
            const httpSpy = vi.spyOn(http, 'request').mockImplementation(() => {
                externalNetworkCallAttempted = true;
                throw new Error('EXTERNAL_HTTP_FORBIDDEN');
            });
            const httpsSpy = vi.spyOn(https, 'request').mockImplementation(() => {
                externalNetworkCallAttempted = true;
                throw new Error('EXTERNAL_HTTPS_FORBIDDEN');
            });
            const axiosPostSpy = vi.spyOn(axios, 'post').mockImplementation(() => {
                externalNetworkCallAttempted = true;
                throw new Error('EXTERNAL_AXIOS_FORBIDDEN');
            });

            // Mock DB delivery row pointing to HTTPS production destination
            vi.spyOn(mysql, 'query').mockImplementation(async (sql, params) => {
                if (sql.includes('FROM webhook_deliveries')) {
                    return [{
                        id: 'del_staging_test_01',
                        tenant_id: 'tenant_staging_01',
                        subscription_id: 'sub_01',
                        endpoint_id: 'ep_01',
                        event_type: 'ORDER_PLACED',
                        event_id: 'evt_01',
                        url: 'https://production-partner.printprice.pro/webhook',
                        payload_json: { test: 'staging_event' },
                        signature: 'sig_mock_123',
                        attempt_count: 0,
                        max_attempts: 3,
                        status: 'PENDING'
                    }];
                }
                if (sql.includes('UPDATE webhook_deliveries')) {
                    return { affectedRows: 1 };
                }
                return [];
            });

            const result = await outgoingWebhookService.deliverSingleWebhook('del_staging_test_01');

            expect(result.ok).toBe(true);
            expect(result.status).toBe('DELIVERED');
            expect(result.mocked).toBe(true);
            expect(result.statusCode).toBe(200);
            expect(externalNetworkCallAttempted).toBe(false);

            httpSpy.mockRestore();
            httpsSpy.mockRestore();
            axiosPostSpy.mockRestore();
        });

        it('behavioral test: provider connectivity service blocks live provider execution under staging invariants', async () => {
            const FinancialOperationsProviderSandboxService = require('../src/api/services/financialOperationsProviderSandboxService');
            const FinancialOperationsProviderConnectivityTestService = require('../src/api/services/financialOperationsProviderConnectivityTestService');

            const sbSvc = new FinancialOperationsProviderSandboxService();
            const testSvc = new FinancialOperationsProviderConnectivityTestService(sbSvc);
            const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'admin_test' };

            // 1. Create provider sandbox config
            const sb = await sbSvc.createSandboxConfig({
                tenantId: 'tenant_staging_01',
                providerKey: 'stripe_mock',
                providerType: 'PAYMENT_PROVIDER',
                providerName: 'Stripe Staging Mock',
                allowedOperations: ['PAYMENT_AUTH_TEST'],
                blockedOperations: []
            }, actorAdmin);

            await sbSvc.requestReview(sb.provider_sandbox_id, actorAdmin);
            await sbSvc.activateSandbox(sb.provider_sandbox_id, actorAdmin);

            // 2. Behavioral verification: When live provider connectivity is forced to true, creation must be BLOCKED
            sb.live_provider_connectivity_enabled = true;
            const blockedLiveTest = await testSvc.createTest(sb.provider_sandbox_id, {
                connectivityMode: 'MOCK_PROVIDER',
                operationType: 'PAYMENT_AUTH_TEST'
            }, actorAdmin);

            expect(blockedLiveTest.test_status).toBe('BLOCKED');
            expect(blockedLiveTest.blockers_json.some(b => b.includes('Live provider connectivity is enabled'))).toBe(true);

            // 3. Behavioral verification: In safe staging mode (live_provider_connectivity_enabled = false), mock test completes purely locally
            sb.live_provider_connectivity_enabled = false;
            const safeTest = await testSvc.createTest(sb.provider_sandbox_id, {
                connectivityMode: 'MOCK_PROVIDER',
                operationType: 'PAYMENT_AUTH_TEST'
            }, actorAdmin);

            expect(safeTest.test_status).toBe('READY_FOR_TEST');
            const executedMock = await testSvc.executeMockTest(safeTest.connection_test_id, actorAdmin);
            expect(executedMock.test_status).toBe('MOCK_COMPLETED');
            expect(executedMock.response_payload_json.message).toContain('No external API was called');
        });

        it('behavioral test: financial operations security guardrail strictly blocks live payment and provider execution', async () => {
            const FinancialOperationsSecurityGuardrailService = require('../src/api/services/financialOperationsSecurityGuardrailService');
            const guardrailService = new FinancialOperationsSecurityGuardrailService();
            const actor = { role: 'SYSTEM_ADMIN', userId: 'sec_admin' };

            // When livePaymentEnabled is true, guardrail evaluation must return BLOCKED with explicit blocker
            const blockedResult = await guardrailService.evaluateGuardrails({
                config: {
                    fullPublicEnabled: false,
                    livePaymentEnabled: true, // Attempt live payment
                    liveRefundEnabled: false,
                    livePayoutEnabled: false,
                    externalInvoiceEnabled: false,
                    taxFilingEnabled: false,
                    mockProviderLocalOnly: true,
                    sandboxModeEnforced: true,
                    dryRunModeEnforced: true,
                    manualApprovalGatesPresent: true,
                    auditLoggingEnabled: true
                },
                actor
            });

            expect(blockedResult.status).toBe('BLOCKED');
            expect(blockedResult.blockers).toContain('Live payment execution enabled');

            // When livePaymentEnabled is false (staging invariant), guardrails pass
            const safeResult = await guardrailService.evaluateGuardrails({
                config: {
                    fullPublicEnabled: false,
                    livePaymentEnabled: false, // Staging invariant
                    liveRefundEnabled: false,
                    livePayoutEnabled: false,
                    externalInvoiceEnabled: false,
                    taxFilingEnabled: false,
                    mockProviderLocalOnly: true,
                    sandboxModeEnforced: true,
                    dryRunModeEnforced: true,
                    manualApprovalGatesPresent: true,
                    auditLoggingEnabled: true,
                    partnerAccessScoped: true,
                    tenantAccessScoped: true
                },
                actor
            });

            expect(safeResult.status).toBe('PASS');
            expect(safeResult.blockers).toHaveLength(0);
        });

        it('behavioral test: financial operations review service strictly blocks on live payment or live provider connectivity', async () => {
            const FinancialOperationsProductionActivationReviewService = require('../src/api/services/financialOperationsProductionActivationReviewService');
            const reviewService = new FinancialOperationsProductionActivationReviewService();
            const actor = { role: 'SYSTEM_ADMIN', userId: 'fin_admin' };

            // Live payment enabled -> must be BLOCKED_BY_SECURITY
            const blockedReview = await reviewService.aggregateReview({
                sourceData: {
                    readinessValidated: true,
                    releaseGatesValidated: true,
                    pilotModeValidated: true,
                    partnerSandboxValidated: true,
                    productionHardeningValidated: true,
                    fullPublicEnabled: false,
                    productionActivationEnabled: false,
                    liveProviderConnectivityEnabled: false,
                    livePaymentEnabled: true, // VIOLATION
                    liveRefundEnabled: false,
                    livePayoutEnabled: false,
                    externalInvoiceEnabled: false,
                    taxFilingEnabled: false,
                    mutationDisabled: true,
                    auditTimelineComplete: true,
                    rollbackPathDocumented: true,
                    incidentResponseReady: true,
                    observabilityReady: true,
                    manualApprovalsPresent: true
                },
                actor
            });

            expect(blockedReview.security_status).toBe('BLOCKED');
            expect(blockedReview.blockers).toContain('BLOCKED_BY_SECURITY');

            // Staging invariant: livePaymentEnabled=false, liveProviderConnectivityEnabled=false -> PASS
            const safeReview = await reviewService.aggregateReview({
                sourceData: {
                    readinessValidated: true,
                    releaseGatesValidated: true,
                    pilotModeValidated: true,
                    partnerSandboxValidated: true,
                    productionHardeningValidated: true,
                    fullPublicEnabled: false,
                    productionActivationEnabled: false,
                    liveProviderConnectivityEnabled: false, // STAGING
                    livePaymentEnabled: false,             // STAGING
                    liveRefundEnabled: false,
                    livePayoutEnabled: false,
                    externalInvoiceEnabled: false,
                    taxFilingEnabled: false,
                    mutationDisabled: true,
                    auditTimelineComplete: true,
                    rollbackPathDocumented: true,
                    incidentResponseReady: true,
                    observabilityReady: true,
                    manualApprovalsPresent: true
                },
                actor
            });

            expect(safeReview.security_status).toBe('PASS');
        });
    });

    describe('7. Deployment Runbook Implementation & Hardening Assertions', () => {
        it('verifies runbook_staging_deploy.sh enforces all required deployment invariants', () => {
            const runbook = fs.readFileSync(path.join(__dirname, '../scripts/runbook_staging_deploy.sh'), 'utf8');

            // 1. Explicit working directory
            expect(runbook).toContain('DEPLOY_DIR="${STAGING_DEPLOY_DIR:-/opt/ppos-staging}"');
            expect(runbook).toContain('cd "$DEPLOY_DIR"');

            // 2. Fail-closed stop on error
            expect(runbook).toContain('set -euo pipefail');

            // 3. Preserve existing secrets
            expect(runbook).toContain('Existing secret preserved: secrets/$SECRET');

            // 4. Compose and tarball checksum verification (strict with mandatory files check)
            expect(runbook).toContain('MANDATORY_FILES=');
            expect(runbook).toContain('sha256sum --check --strict "$CHECKSUM_FILE"');

            // 5. Image ID assertion
            expect(runbook).toContain("LOADED_IMAGE_ID=$(docker inspect --format='{{.Id}}' \"$EXPECTED_IMAGE_TAG\"");

            // 6. Bounded readiness wait with HTTP timeout and JSON status validation
            expect(runbook).toContain('--max-time 3');
            expect(runbook).toContain('PARSED_STATUS');
            expect(runbook).toContain('JSON.parse');
            expect(runbook).toContain('READY');
        });
    });
});


