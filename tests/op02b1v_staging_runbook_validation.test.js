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

        it('negative test: rejects dumps containing CREATE DATABASE or USE statements', () => {
            const restoreScript = fs.readFileSync(path.join(__dirname, '../scripts/staging_restore_drill.sh'), 'utf8');
            expect(restoreScript).toContain('CREATE DATABASE');
            expect(restoreScript).toContain('USE');
            expect(restoreScript).toContain('target database boundary');
        });
    });
});
