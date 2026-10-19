/**
 * tests/updateCompanyProfileTransactional.test.js
 *
 * Unit and Transactional tests for onboardingService.updateCompanyProfile:
 * 1. Rollback on SQL failure: Transaction rolls back if any SQL error occurs.
 * 2. Zero rows updated: Throws error when target printer_node is not matched on timezone change.
 * 3. Repeated save of identical timezone: Idempotent success without error.
 * 4. Tenant without printer_node yet: Safely updates tenant metadata_json without error.
 *
 * Invariant: Does not touch production database; executes using transactional mocks.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
const onboardingService = require('../src/api/services/printhouseOnboardingService');
const db = require('../src/api/services/mysqlClient');

describe('updateCompanyProfile Transactional Hardening', () => {
    let mockConnection;
    let mockPool;

    beforeEach(() => {
        vi.restoreAllMocks();

        mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: vi.fn(),
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        mockPool = {
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        };

        vi.spyOn(db, 'getPool').mockReturnValue(mockPool);
    });

    test('1. Transactional rollback occurs when an SQL error happens during update', async () => {
        const tenantId = 'tenant_rollback_test';

        mockConnection.query.mockImplementation((sql, params) => {
            if (sql.includes('SELECT metadata_json FROM tenants')) {
                return [[{ metadata_json: JSON.stringify({ legal_name: 'Original Co' }) }]];
            }
            if (sql.includes('UPDATE tenants SET')) {
                throw new Error('SIMULATED_SQL_DEADLOCK_OR_SYNTAX_ERROR');
            }
            return [[]];
        });

        await expect(
            onboardingService.updateCompanyProfile(tenantId, { legalName: 'New Name Co' })
        ).rejects.toThrow('SIMULATED_SQL_DEADLOCK_OR_SYNTAX_ERROR');

        expect(mockConnection.beginTransaction).toHaveBeenCalled();
        expect(mockConnection.rollback).toHaveBeenCalled();
        expect(mockConnection.commit).not.toHaveBeenCalled();
        expect(mockConnection.release).toHaveBeenCalled();
    });

    test('2. Throws error on zero rows updated when node exists but wasn\'t matched on timezone change', async () => {
        const tenantId = 'tenant_zero_rows_test';

        mockConnection.query.mockImplementation((sql, params) => {
            if (sql.includes('SELECT metadata_json FROM tenants')) {
                return [[{ metadata_json: JSON.stringify({ timezone: 'Europe/Madrid' }) }]];
            }
            if (sql.includes('SELECT id, region FROM printer_nodes')) {
                // Node exists with 'Europe/Madrid'
                return [[{ id: 'node_site_1', region: 'Europe/Madrid' }]];
            }
            if (sql.includes('UPDATE printer_nodes SET region')) {
                // Returns affectedRows: 0 (unexpected row match failure)
                return [{ affectedRows: 0, changedRows: 0 }];
            }
            return [[]];
        });

        await expect(
            onboardingService.updateCompanyProfile(tenantId, { siteTimezone: 'Europe/Berlin' })
        ).rejects.toThrow(/SITE_TIMEZONE_UPDATE_FAILED.*node_site_1/);

        expect(mockConnection.beginTransaction).toHaveBeenCalled();
        expect(mockConnection.rollback).toHaveBeenCalled();
        expect(mockConnection.commit).not.toHaveBeenCalled();
        expect(mockConnection.release).toHaveBeenCalled();
    });

    test('3. Repeated save of the same timezone succeeds idempotently without error', async () => {
        const tenantId = 'tenant_idempotent_tz_test';

        mockConnection.query.mockImplementation((sql, params) => {
            if (sql.includes('SELECT metadata_json FROM tenants')) {
                return [[{ metadata_json: JSON.stringify({ timezone: 'Europe/Berlin' }) }]];
            }
            if (sql.includes('SELECT id, region FROM printer_nodes')) {
                // Current node is already 'Europe/Berlin'
                return [[{ id: 'node_site_1', region: 'Europe/Berlin' }]];
            }
            if (sql.includes('UPDATE printer_nodes SET region')) {
                // MySQL returns affectedRows: 0 because value is identical
                return [{ affectedRows: 0, changedRows: 0 }];
            }
            if (sql.includes('UPDATE tenants SET')) {
                return [{ affectedRows: 1 }];
            }
            return [[]];
        });

        // Spy on getCompanyProfile for return value
        vi.spyOn(onboardingService, 'getCompanyProfile').mockResolvedValue({
            tenantId,
            timezone: 'Europe/Berlin',
            companyName: 'Same Timezone Co'
        });

        const result = await onboardingService.updateCompanyProfile(tenantId, {
            siteTimezone: 'Europe/Berlin',
            companyName: 'Same Timezone Co'
        });

        expect(result).toBeDefined();
        expect(mockConnection.beginTransaction).toHaveBeenCalled();
        expect(mockConnection.commit).toHaveBeenCalled();
        expect(mockConnection.rollback).not.toHaveBeenCalled();
        expect(mockConnection.release).toHaveBeenCalled();
    });

    test('4. Safely succeeds when no printer node exists yet (site creation deferred)', async () => {
        const tenantId = 'tenant_no_plants_yet';

        let capturedMetadata = null;
        mockConnection.query.mockImplementation((sql, params) => {
            if (sql.includes('SELECT metadata_json FROM tenants')) {
                return [[{ metadata_json: JSON.stringify({ legal_name: 'Pre-Plant Tenant' }) }]];
            }
            if (sql.includes('SELECT id, region FROM printer_nodes')) {
                // No printer nodes exist yet
                return [[]];
            }
            if (sql.includes('UPDATE tenants SET')) {
                capturedMetadata = JSON.parse(params[1]);
                return [{ affectedRows: 1 }];
            }
            return [[]];
        });

        vi.spyOn(onboardingService, 'getCompanyProfile').mockImplementation(async () => ({
            tenantId,
            timezone: capturedMetadata?.timezone,
            companyName: capturedMetadata?.legal_name
        }));

        const result = await onboardingService.updateCompanyProfile(tenantId, {
            siteTimezone: 'Europe/London',
            legalName: 'Pre-Plant Tenant'
        });

        expect(result).toBeDefined();
        expect(capturedMetadata?.timezone).toBe('Europe/London');
        expect(capturedMetadata?.company_profile_completed).toBe(true);
        expect(mockConnection.commit).toHaveBeenCalled();
        expect(mockConnection.rollback).not.toHaveBeenCalled();
        expect(mockConnection.release).toHaveBeenCalled();
    });
});
