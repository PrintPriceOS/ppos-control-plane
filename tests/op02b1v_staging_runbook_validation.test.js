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

        it('verifies Dockerfile exists and builds via multistage runner pattern', () => {
            const dockerfileContent = fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf8');
            expect(dockerfileContent).toContain('FROM node:22-bookworm-slim AS builder');
            expect(dockerfileContent).toContain('FROM node:22-bookworm-slim AS runner');
            expect(dockerfileContent).toContain('npm run build');
            expect(dockerfileContent).toContain('CMD ["node", "server.js"]');
        });
    });
});
