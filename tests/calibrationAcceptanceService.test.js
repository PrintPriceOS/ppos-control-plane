import { describe, test, expect, vi, beforeEach } from 'vitest';
const calibrationAcceptanceService = require('../src/api/services/calibrationAcceptanceService');
const commercialKnobService = require('../src/api/services/commercialKnobService');
const db = require('../src/api/services/mysqlClient');

describe('CalibrationAcceptanceService Commercial Provenance Enforcement', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    test('1. Rejects commercial calibration when EVIDENCE_CALIBRATED mode is set without session/run IDs', async () => {
        const mockQuery = vi.fn().mockImplementation((sql, params) => {
            if (sql && sql.includes('SELECT id, rates_checksum')) {
                return [[]];
            }
            return [[{ id: 'node-1', tenant_id: 'tenant-1', rates_json: '{}' }]];
        });
        const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: mockQuery,
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        vi.spyOn(db, 'getPool').mockReturnValue({
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        });

        const validChecksum = commercialKnobService.computeRatesChecksum({});

        await expect(calibrationAcceptanceService.acceptCommercialCalibration({
            tenantId: 'tenant-1',
            printerNodeId: 'node-1',
            baselineRatesChecksum: validChecksum,
            adjustments: { marginalPercent: 5 },
            quoteEvidence: { id: 'ev-1', session_id: null }, // triggers EVIDENCE_CALIBRATED mode
            bookSpec: { copies: 500, interior_pages: 100, interior_print: '4/4', cover_print: '4/0', binding_method: 'perfect bound' },
            actor: { id: 'op-1', email: 'op@test.com', role: 'PRINTHOUSE_OPERATOR' }
            // session and run IDs deliberately omitted
        })).rejects.toThrow('MISSING_CALIBRATION_PROVENANCE');

        expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test('2. Accepts OPERATOR_ADJUSTED commercial calibration with NULL session/run IDs without fabricating fake strings', async () => {
        const mockQuery = vi.fn().mockImplementation((sql, params) => {
            if (sql && sql.includes('FOR UPDATE')) {
                return [[{ id: 'node-1', tenant_id: 'tenant-1', rates_json: '{}' }]];
            }
            if (sql && sql.includes('SELECT id FROM printhouse_pricing_revisions')) {
                return [[]];
            }
            return [{ affectedRows: 1 }];
        });

        const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: mockQuery,
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        vi.spyOn(db, 'getPool').mockReturnValue({
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        });

        const validChecksum = commercialKnobService.computeRatesChecksum({});

        const res = await calibrationAcceptanceService.acceptCommercialCalibration({
            tenantId: 'tenant-1',
            printerNodeId: 'node-1',
            baselineRatesChecksum: validChecksum,
            adjustments: { marginalPercent: 5 },
            bookSpec: { copies: 500, interior_pages: 100, interior_print: '4/4', cover_print: '4/0', binding_method: 'perfect bound' },
            actor: { id: 'op-1', email: 'op@test.com', role: 'PRINTHOUSE_OPERATOR' }
        });

        expect(res.accepted).toBe(true);
        expect(mockConnection.commit).toHaveBeenCalled();

        // Verify that INSERT INTO printhouse_pricing_revisions used MANUAL_EDIT source_type
        const revCalls = mockQuery.mock.calls.filter(call => call[0].includes('INSERT INTO printhouse_pricing_revisions'));
        expect(revCalls).toHaveLength(1);
        expect(revCalls[0][1][3]).toBe('MANUAL_EDIT'); // source_type

        // Verify that INSERT INTO printhouse_pricing_calibration_acceptances included NULL session & run IDs
        const insertCalls = mockQuery.mock.calls.filter(call => call[0].includes('INSERT INTO printhouse_pricing_calibration_acceptances'));
        expect(insertCalls).toHaveLength(1);
        const insertParams = insertCalls[0][1];
        expect(insertParams[3]).toBeNull(); // calibration_session_id is NULL
        expect(insertParams[4]).toBeNull(); // calibration_run_id is NULL
    });

    test('3. Negative Test: Rejects calibration when calibration session does not exist in DB', async () => {
        const mockQuery = vi.fn().mockImplementation((sql, params) => {
            if (sql && sql.includes('FOR UPDATE')) {
                return [[{ id: 'node-1', tenant_id: 'tenant-1', rates_json: '{}' }]];
            }
            if (sql && sql.includes('printhouse_pricing_calibration_sessions')) {
                return [[]]; // session not found
            }
            return [[]];
        });

        const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: mockQuery,
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        vi.spyOn(db, 'getPool').mockReturnValue({
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        });

        const validChecksum = commercialKnobService.computeRatesChecksum({});

        await expect(calibrationAcceptanceService.acceptCommercialCalibration({
            tenantId: 'tenant-1',
            printerNodeId: 'node-1',
            baselineRatesChecksum: validChecksum,
            adjustments: { marginalPercent: 5 },
            calibration_session_id: 'sess-nonexistent',
            calibration_run_id: 'run-1',
            bookSpec: { copies: 500, interior_pages: 100, interior_print: '4/4', cover_print: '4/0', binding_method: 'perfect bound' },
            actor: { id: 'op-1', email: 'op@test.com', role: 'PRINTHOUSE_OPERATOR' }
        })).rejects.toThrow('CALIBRATION_SESSION_NOT_FOUND');

        expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test('4. Negative Test: Rejects calibration when session belongs to a different tenant', async () => {
        const mockQuery = vi.fn().mockImplementation((sql, params) => {
            if (sql && sql.includes('FOR UPDATE')) {
                return [[{ id: 'node-1', tenant_id: 'tenant-1', rates_json: '{}' }]];
            }
            if (sql && sql.includes('printhouse_pricing_calibration_sessions')) {
                return [[{ id: 'sess-1', tenant_id: 'tenant-OTHER', printer_node_id: 'node-1', status: 'ACTIVE' }]];
            }
            return [[]];
        });

        const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: mockQuery,
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        vi.spyOn(db, 'getPool').mockReturnValue({
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        });

        const validChecksum = commercialKnobService.computeRatesChecksum({});

        await expect(calibrationAcceptanceService.acceptCommercialCalibration({
            tenantId: 'tenant-1',
            printerNodeId: 'node-1',
            baselineRatesChecksum: validChecksum,
            adjustments: { marginalPercent: 5 },
            calibration_session_id: 'sess-1',
            calibration_run_id: 'run-1',
            bookSpec: { copies: 500, interior_pages: 100, interior_print: '4/4', cover_print: '4/0', binding_method: 'perfect bound' },
            actor: { id: 'op-1', email: 'op@test.com', role: 'PRINTHOUSE_OPERATOR' }
        })).rejects.toThrow('TENANT_MISMATCH');

        expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test('5. Negative Test: Rejects calibration when run belongs to a different session', async () => {
        const mockQuery = vi.fn().mockImplementation((sql, params) => {
            if (sql && sql.includes('FOR UPDATE')) {
                return [[{ id: 'node-1', tenant_id: 'tenant-1', rates_json: '{}' }]];
            }
            if (sql && sql.includes('printhouse_pricing_calibration_sessions')) {
                return [[{ id: 'sess-1', tenant_id: 'tenant-1', printer_node_id: 'node-1', status: 'ACTIVE' }]];
            }
            if (sql && sql.includes('printhouse_pricing_calibration_runs')) {
                return [[{ id: 'run-1', calibration_session_id: 'sess-OTHER', status: 'COMPLETED' }]];
            }
            return [[]];
        });

        const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: mockQuery,
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        vi.spyOn(db, 'getPool').mockReturnValue({
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        });

        const validChecksum = commercialKnobService.computeRatesChecksum({});

        await expect(calibrationAcceptanceService.acceptCommercialCalibration({
            tenantId: 'tenant-1',
            printerNodeId: 'node-1',
            baselineRatesChecksum: validChecksum,
            adjustments: { marginalPercent: 5 },
            calibration_session_id: 'sess-1',
            calibration_run_id: 'run-1',
            bookSpec: { copies: 500, interior_pages: 100, interior_print: '4/4', cover_print: '4/0', binding_method: 'perfect bound' },
            actor: { id: 'op-1', email: 'op@test.com', role: 'PRINTHOUSE_OPERATOR' }
        })).rejects.toThrow('CALIBRATION_RUN_SESSION_MISMATCH');

        expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test('6. Negative Test: Rejects calibration when runId is supplied without sessionId (incoherent pair)', async () => {
        const mockQuery = vi.fn().mockImplementation((sql, params) => {
            if (sql && sql.includes('FOR UPDATE')) {
                return [[{ id: 'node-1', tenant_id: 'tenant-1', rates_json: '{}' }]];
            }
            return [[]];
        });

        const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: mockQuery,
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        vi.spyOn(db, 'getPool').mockReturnValue({
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        });

        const validChecksum = commercialKnobService.computeRatesChecksum({});

        await expect(calibrationAcceptanceService.acceptCommercialCalibration({
            tenantId: 'tenant-1',
            printerNodeId: 'node-1',
            baselineRatesChecksum: validChecksum,
            adjustments: { marginalPercent: 5 },
            calibration_run_id: 'run-only-without-session',
            bookSpec: { copies: 500, interior_pages: 100, interior_print: '4/4', cover_print: '4/0', binding_method: 'perfect bound' },
            actor: { id: 'op-1', email: 'op@test.com', role: 'PRINTHOUSE_OPERATOR' }
        })).rejects.toThrow('MISSING_CALIBRATION_PROVENANCE');

        expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test('7. Negative Test: Rejects calibration when run status is invalid (e.g. FAILED)', async () => {
        const mockQuery = vi.fn().mockImplementation((sql, params) => {
            if (sql && sql.includes('FOR UPDATE')) {
                return [[{ id: 'node-1', tenant_id: 'tenant-1', rates_json: '{}' }]];
            }
            if (sql && sql.includes('printhouse_pricing_calibration_sessions')) {
                return [[{ id: 'sess-1', tenant_id: 'tenant-1', printer_node_id: 'node-1', status: 'ACTIVE' }]];
            }
            if (sql && sql.includes('printhouse_pricing_calibration_runs')) {
                return [[{ id: 'run-1', calibration_session_id: 'sess-1', status: 'FAILED' }]];
            }
            return [[]];
        });

        const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: mockQuery,
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        vi.spyOn(db, 'getPool').mockReturnValue({
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        });

        const validChecksum = commercialKnobService.computeRatesChecksum({});

        await expect(calibrationAcceptanceService.acceptCommercialCalibration({
            tenantId: 'tenant-1',
            printerNodeId: 'node-1',
            baselineRatesChecksum: validChecksum,
            adjustments: { marginalPercent: 5 },
            calibration_session_id: 'sess-1',
            calibration_run_id: 'run-1',
            bookSpec: { copies: 500, interior_pages: 100, interior_print: '4/4', cover_print: '4/0', binding_method: 'perfect bound' },
            actor: { id: 'op-1', email: 'op@test.com', role: 'PRINTHOUSE_OPERATOR' }
        })).rejects.toThrow('INVALID_CALIBRATION_RUN_STATE');

        expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test('8. Idempotency Test: Repeat acceptance returns idempotent: true without creating a new revision or acceptance record', async () => {
        const validChecksum = commercialKnobService.computeRatesChecksum({});
        const candidateChecksum = commercialKnobService.computeRatesChecksum(
            commercialKnobService.applyKnobAdjustments({}, { marginalPercent: 5 })
        );

        const mockQuery = vi.fn().mockImplementation((sql, params) => {
            if (sql && sql.includes('FOR UPDATE')) {
                return [[{ id: 'node-1', tenant_id: 'tenant-1', rates_json: '{}', active_pricing_revision_id: 'rev-existing-123' }]];
            }
            if (sql && sql.includes('SELECT id, rates_checksum')) {
                // Return existing revision with matching candidate checksum
                return [[{ id: 'rev-existing-123', rates_checksum: candidateChecksum, created_at: new Date() }]];
            }
            return [{ affectedRows: 1 }];
        });

        const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: mockQuery,
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        vi.spyOn(db, 'getPool').mockReturnValue({
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        });

        const res = await calibrationAcceptanceService.acceptCommercialCalibration({
            tenantId: 'tenant-1',
            printerNodeId: 'node-1',
            baselineRatesChecksum: validChecksum,
            adjustments: { marginalPercent: 5 },
            bookSpec: { copies: 500, interior_pages: 100, interior_print: '4/4', cover_print: '4/0', binding_method: 'perfect bound' },
            actor: { id: 'op-1', email: 'op@test.com', role: 'PRINTHOUSE_OPERATOR' }
        });

        expect(res.accepted).toBe(true);
        expect(res.idempotent).toBe(true);
        expect(res.revisionId).toBe('rev-existing-123');

        // Rollback is called when short-circuiting for idempotency to release transaction lock cleanly
        expect(mockConnection.rollback).toHaveBeenCalled();

        // Zero new revision or acceptance inserts performed
        const insertRevCalls = mockQuery.mock.calls.filter(call => call[0].includes('INSERT INTO printhouse_pricing_revisions'));
        const insertAccCalls = mockQuery.mock.calls.filter(call => call[0].includes('INSERT INTO printhouse_pricing_calibration_acceptances'));
        expect(insertRevCalls).toHaveLength(0);
        expect(insertAccCalls).toHaveLength(0);
    });

    test('9. Negative Test: Rejects calibration when run proposed_patch_checksum does not match canonical patch checksum', async () => {
        const mockQuery = vi.fn().mockImplementation((sql, params) => {
            if (sql && sql.includes('FOR UPDATE')) {
                return [[{ id: 'node-1', tenant_id: 'tenant-1', rates_json: '{}' }]];
            }
            if (sql && sql.includes('printhouse_pricing_calibration_sessions')) {
                return [[{ id: 'sess-1', tenant_id: 'tenant-1', printer_node_id: 'node-1', status: 'ACTIVE' }]];
            }
            if (sql && sql.includes('printhouse_pricing_calibration_runs')) {
                return [[{
                    id: 'run-1',
                    calibration_session_id: 'sess-1',
                    tenant_id: 'tenant-1',
                    printer_node_id: 'node-1',
                    status: 'SUCCEEDED',
                    proposed_patch_checksum: 'sha256:0000000000000000_tampered_patch'
                }]];
            }
            return [[]];
        });

        const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: mockQuery,
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        vi.spyOn(db, 'getPool').mockReturnValue({
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        });

        const validChecksum = commercialKnobService.computeRatesChecksum({});

        await expect(calibrationAcceptanceService.acceptCommercialCalibration({
            tenantId: 'tenant-1',
            printerNodeId: 'node-1',
            baselineRatesChecksum: validChecksum,
            adjustments: { marginalPercent: 5 },
            calibration_session_id: 'sess-1',
            calibration_run_id: 'run-1',
            bookSpec: { copies: 500, interior_pages: 100, interior_print: '4/4', cover_print: '4/0', binding_method: 'perfect bound' },
            actor: { id: 'op-1', email: 'op@test.com', role: 'PRINTHOUSE_OPERATOR' }
        })).rejects.toThrow('PROPOSED_PATCH_CHECKSUM_MISMATCH');

        expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test('10. Valid Case: Accepts calibration with distinct proposed_patch_checksum, rate_snapshot_checksum, and candidate_rates_checksum', async () => {
        const adjustments = { printingRunMultiplier: 1.05 };
        const baselineRates = { interior_full_colour_var: { '500': 100 } };
        const baselineChecksum = commercialKnobService.computeRatesChecksum(baselineRates);
        const patchChecksum = commercialKnobService.computePatchChecksum(adjustments);
        const candidateRates = commercialKnobService.applyKnobAdjustments(baselineRates, adjustments);
        const candidateChecksum = commercialKnobService.computeRatesChecksum(candidateRates);

        // Assert that patch checksum, baseline checksum, and candidate checksum are all distinct
        expect(patchChecksum).not.toBe(baselineChecksum);
        expect(candidateChecksum).not.toBe(baselineChecksum);
        expect(patchChecksum).not.toBe(candidateChecksum);

        const mockQuery = vi.fn().mockImplementation((sql, params) => {
            if (sql && sql.includes('FOR UPDATE')) {
                return [[{ id: 'node-1', tenant_id: 'tenant-1', rates_json: JSON.stringify(baselineRates) }]];
            }
            if (sql && sql.includes('printhouse_pricing_calibration_sessions')) {
                return [[{ id: 'sess-1', tenant_id: 'tenant-1', printer_node_id: 'node-1', status: 'ACTIVE' }]];
            }
            if (sql && sql.includes('printhouse_pricing_calibration_runs')) {
                return [[{
                    id: 'run-1',
                    calibration_session_id: 'sess-1',
                    tenant_id: 'tenant-1',
                    printer_node_id: 'node-1',
                    status: 'CONVERGED', // Canonical status
                    proposed_patch_checksum: patchChecksum,
                    rate_snapshot_checksum: baselineChecksum,
                    candidate_rates_checksum: candidateChecksum
                }]];
            }
            if (sql && sql.includes('SELECT id FROM printhouse_pricing_revisions')) {
                return [[]];
            }
            return [{ affectedRows: 1 }];
        });

        const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: mockQuery,
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        vi.spyOn(db, 'getPool').mockReturnValue({
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        });

        const res = await calibrationAcceptanceService.acceptCommercialCalibration({
            tenantId: 'tenant-1',
            printerNodeId: 'node-1',
            baselineRatesChecksum: baselineChecksum,
            adjustments,
            calibration_session_id: 'sess-1',
            calibration_run_id: 'run-1',
            bookSpec: { copies: 500, interior_pages: 100, interior_print: '4/4', cover_print: '4/0', binding_method: 'perfect bound' },
            actor: { id: 'op-1', email: 'op@test.com', role: 'PRINTHOUSE_OPERATOR' }
        });

        expect(res.accepted).toBe(true);
        expect(mockConnection.commit).toHaveBeenCalled();

        // Assert SQL INSERT parameters for printhouse_pricing_revisions
        const revCalls = mockQuery.mock.calls.filter(call => call[0].includes('INSERT INTO printhouse_pricing_revisions'));
        expect(revCalls).toHaveLength(1);
        const revParams = revCalls[0][1];
        expect(revParams[8]).toBe(candidateChecksum); // rates_checksum
        expect(revParams[9]).toBe(baselineChecksum);  // baseline_rates_checksum
        expect(revParams[10]).toBe(patchChecksum);    // proposed_patch_checksum

        // Assert SQL INSERT parameters for printhouse_pricing_calibration_acceptances
        const accCalls = mockQuery.mock.calls.filter(call => call[0].includes('INSERT INTO printhouse_pricing_calibration_acceptances'));
        expect(accCalls).toHaveLength(1);
        const accParams = accCalls[0][1];
        expect(accParams[6]).toBe(baselineChecksum);  // baseline_checksum
        expect(accParams[7]).toBe(patchChecksum);     // proposed_patch_checksum
        expect(accParams[8]).toBe(candidateChecksum); // resulting_rates_checksum
    });

    test('11. Negative Test: Rejects calibration when rate_snapshot_checksum on run does not match baseline checksum', async () => {
        const adjustments = { printingRunMultiplier: 1.05 };
        const baselineRates = {};
        const baselineChecksum = commercialKnobService.computeRatesChecksum(baselineRates);
        const patchChecksum = commercialKnobService.computePatchChecksum(adjustments);

        const mockQuery = vi.fn().mockImplementation((sql, params) => {
            if (sql && sql.includes('FOR UPDATE')) {
                return [[{ id: 'node-1', tenant_id: 'tenant-1', rates_json: '{}' }]];
            }
            if (sql && sql.includes('printhouse_pricing_calibration_sessions')) {
                return [[{ id: 'sess-1', tenant_id: 'tenant-1', printer_node_id: 'node-1', status: 'ACTIVE' }]];
            }
            if (sql && sql.includes('printhouse_pricing_calibration_runs')) {
                return [[{
                    id: 'run-1',
                    calibration_session_id: 'sess-1',
                    tenant_id: 'tenant-1',
                    printer_node_id: 'node-1',
                    status: 'SUCCEEDED',
                    proposed_patch_checksum: patchChecksum,
                    rate_snapshot_checksum: 'sha256:stale_baseline_hash_9999'
                }]];
            }
            return [[]];
        });

        const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: mockQuery,
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        vi.spyOn(db, 'getPool').mockReturnValue({
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        });

        await expect(calibrationAcceptanceService.acceptCommercialCalibration({
            tenantId: 'tenant-1',
            printerNodeId: 'node-1',
            baselineRatesChecksum: baselineChecksum,
            adjustments,
            calibration_session_id: 'sess-1',
            calibration_run_id: 'run-1',
            bookSpec: { copies: 500, interior_pages: 100, interior_print: '4/4', cover_print: '4/0', binding_method: 'perfect bound' },
            actor: { id: 'op-1', email: 'op@test.com', role: 'PRINTHOUSE_OPERATOR' }
        })).rejects.toThrow('RATE_SNAPSHOT_CHECKSUM_MISMATCH');

        expect(mockConnection.rollback).toHaveBeenCalled();
    });
});



