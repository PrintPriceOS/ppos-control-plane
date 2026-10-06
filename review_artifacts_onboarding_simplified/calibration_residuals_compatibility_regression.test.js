import { describe, test, expect, vi, beforeEach } from 'vitest';
const calibrationAcceptanceService = require('../src/api/services/calibrationAcceptanceService');
const calibrationSessionService = require('../src/api/services/calibrationSessionService');
const adapter = require('../src/api/services/buildPriceCalibrationAdapter');
const db = require('../src/api/services/mysqlClient');

describe('Calibration Residuals & Compatibility Regressions', () => {
    let mockQuery;
    let mockConnection;

    const baseRates = { interior_full_colour_var: { '500': 100 } };
    const baseRatesChecksum = calibrationSessionService.computeRatesChecksum(baseRates);
    const patch = { interior_full_colour_var: { '500': 102 } };
    const patchChecksum = calibrationSessionService.computeRatesChecksum(patch);
    const activePaths = ['interior_full_colour_var.500'];

    function setupMocks({
        sessionOverrides = {},
        runOverrides = {},
        forwardPriceMock = null
    } = {}) {
        const session = {
            id: 'sess-100',
            tenant_id: 'tenant-1',
            printer_node_id: 'node-1',
            book_spec_json: JSON.stringify({
                copies: 500,
                interior_pages: 100,
                interior_print: '4/4',
                cover_print: '4/0',
                binding_method: 'perfect bound'
            }),
            target_manufacturing_price: 100.0,
            currency: 'EUR',
            status: 'CALCULATED',
            current_rates_checksum: baseRatesChecksum,
            multi_targets_json: null,
            ...sessionOverrides
        };

        const run = {
            id: 'run-100',
            tenant_id: 'tenant-1',
            calibration_session_id: 'sess-100',
            printer_node_id: 'node-1',
            solver_version: '193C_v1_deterministic',
            status: 'SUCCEEDED',
            rate_snapshot_checksum: baseRatesChecksum,
            target_price: 100.0,
            proposed_patch_json: JSON.stringify(patch),
            proposed_patch_checksum: patchChecksum,
            active_rate_paths_json: JSON.stringify(activePaths),
            warnings_json: JSON.stringify([]),
            absolute_residual: null,
            percent_residual: null,
            point_results_json: null,
            curve_metrics_json: null,
            identifiability_json: JSON.stringify({ status: 'EXACTLY_DETERMINED' }),
            identifiability_report_json: JSON.stringify({ status: 'EXACTLY_DETERMINED' }),
            ...runOverrides
        };

        mockQuery = vi.fn().mockImplementation(async (sql, params) => {
            if (sql && sql.includes('FROM printhouse_pricing_calibration_sessions') && sql.includes('FOR UPDATE')) {
                return [[session]];
            }
            if (sql && sql.includes('FROM printer_nodes') && sql.includes('FOR UPDATE')) {
                return [[{
                    id: 'node-1',
                    tenant_id: 'tenant-1',
                    rates_json: JSON.stringify(baseRates),
                    signatures: null,
                    production_lead_days: 7,
                    delivery_time: 2
                }]];
            }
            if (sql && sql.includes('FROM printhouse_pricing_calibration_runs') && sql.includes('FOR UPDATE')) {
                return [[run]];
            }
            if (sql && sql.includes('SELECT id FROM printhouse_pricing_revisions')) {
                return [[]]; // No prior revision
            }
            return [{ affectedRows: 1 }];
        });

        mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(true),
            query: mockQuery,
            commit: vi.fn().mockResolvedValue(true),
            rollback: vi.fn().mockResolvedValue(true),
            release: vi.fn()
        };

        vi.spyOn(db, 'getPool').mockReturnValue({
            getConnection: vi.fn().mockResolvedValue(mockConnection)
        });

        if (forwardPriceMock) {
            vi.spyOn(adapter, 'evaluateForwardPrice').mockImplementation(forwardPriceMock);
        }
    }

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // ── GROUP 1: Caso de 1 % que detecte confusión entre 0.01 y 1 ──
    describe('1. Caso de 1 %: Detección estricta de confusión entre ratio 0.01 y porcentaje 1', () => {
        test('1.1 Single-point contract: Rechaza run.percent_residual = 0.01 cuando el error real es 1 % (1.0 percentage points)', async () => {
            // Target = 100 EUR, Predicted = 101 EUR -> Absolute residual = 1.00 EUR.
            // Ratio = 0.01, Percentage points = 1.00%.
            // Canonical solver contract produces percentage points (1.0).
            // A supplied value of 0.01 claims 0.01% error (100x lower), which must be rejected as contradictory.
            setupMocks({
                runOverrides: {
                    absolute_residual: 1.0,
                    percent_residual: 0.01 // Confusing 0.01 ratio with percentage points!
                },
                forwardPriceMock: () => ({ predictedManufacturingPrice: 101.0 })
            });

            await expect(calibrationAcceptanceService.acceptCalibrationRun(
                'tenant-1',
                'sess-100',
                'run-100',
                { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' },
                { absoluteTolerance: 2.0, percentTolerance: 0.05 } // Tolerances permit 1 EUR
            )).rejects.toThrow('CONTRADICTORY_SUPPLIED_RESIDUAL');

            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.commit).not.toHaveBeenCalled();
        });

        test('1.2 Single-point contract: Acepta run.percent_residual = 1.0 cuando el error real es 1 %', async () => {
            setupMocks({
                runOverrides: {
                    absolute_residual: 1.0,
                    percent_residual: 1.0 // Correctly formatted percentage points
                },
                forwardPriceMock: () => ({ predictedManufacturingPrice: 101.0 })
            });

            const result = await calibrationAcceptanceService.acceptCalibrationRun(
                'tenant-1',
                'sess-100',
                'run-100',
                { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' },
                { absoluteTolerance: 2.0, percentTolerance: 0.05 }
            );

            expect(result.ok).toBe(true);
            expect(result.status).toBe('ACCEPTED');
            expect(result.absoluteResidual).toBe(1.0);
            // Risk 3: Resulting percentResidual in acceptances/responses remains canonical ratio [0..1]
            expect(result.percentResidual).toBe(0.01);
            expect(mockConnection.commit).toHaveBeenCalled();
        });

        test('1.3 Explicit ratio discriminator: Rechaza run.percent_residual = 1.0 cuando la unidad declarada es RATIO', async () => {
            setupMocks({
                runOverrides: {
                    absolute_residual: 1.0,
                    percent_residual: 1.0 // Supplying percentage points when RATIO is expected
                },
                forwardPriceMock: () => ({ predictedManufacturingPrice: 101.0 })
            });

            await expect(calibrationAcceptanceService.acceptCalibrationRun(
                'tenant-1',
                'sess-100',
                'run-100',
                { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' },
                { absoluteTolerance: 2.0, percentTolerance: 0.05, percentResidualUnit: 'RATIO' }
            )).rejects.toThrow('CONTRADICTORY_SUPPLIED_RESIDUAL');

            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.commit).not.toHaveBeenCalled();
        });

        test('1.4 Explicit ratio discriminator: Acepta run.percent_residual = 0.01 cuando la unidad declarada es RATIO', async () => {
            setupMocks({
                runOverrides: {
                    absolute_residual: 1.0,
                    percent_residual: 0.01,
                    percent_residual_unit: 'RATIO'
                },
                forwardPriceMock: () => ({ predictedManufacturingPrice: 101.0 })
            });

            const result = await calibrationAcceptanceService.acceptCalibrationRun(
                'tenant-1',
                'sess-100',
                'run-100',
                { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' },
                { absoluteTolerance: 2.0, percentTolerance: 0.05 }
            );

            expect(result.ok).toBe(true);
            expect(result.status).toBe('ACCEPTED');
            expect(mockConnection.commit).toHaveBeenCalled();
        });
    });

    // ── GROUP 2: Valores justo dentro, en el límite y fuera de tolerancia ──
    describe('2. Tolerancias: Valores justo dentro, en el límite exacto y justo fuera', () => {
        // Target = 100 EUR, absTolerance = 0.50 EUR, pctTolerance = 0.005 (0.50 EUR) -> effectiveTolerance = 0.50 EUR

        test('2.1 Justo dentro: residual = 0.49 EUR (0.49 <= 0.50) es aceptado', async () => {
            setupMocks({
                runOverrides: {
                    absolute_residual: 0.49,
                    percent_residual: 0.49
                },
                forwardPriceMock: () => ({ predictedManufacturingPrice: 100.49 })
            });

            const result = await calibrationAcceptanceService.acceptCalibrationRun(
                'tenant-1',
                'sess-100',
                'run-100',
                { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' },
                { absoluteTolerance: 0.50, percentTolerance: 0.005 }
            );

            expect(result.ok).toBe(true);
            expect(result.absoluteResidual).toBe(0.49);
            expect(result.effectiveTolerance).toBe(0.50);
            expect(mockConnection.commit).toHaveBeenCalled();
        });

        test('2.2 En el límite exacto: residual = 0.50 EUR (0.50 <= 0.50) es aceptado', async () => {
            setupMocks({
                runOverrides: {
                    absolute_residual: 0.50,
                    percent_residual: 0.50
                },
                forwardPriceMock: () => ({ predictedManufacturingPrice: 100.50 })
            });

            const result = await calibrationAcceptanceService.acceptCalibrationRun(
                'tenant-1',
                'sess-100',
                'run-100',
                { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' },
                { absoluteTolerance: 0.50, percentTolerance: 0.005 }
            );

            expect(result.ok).toBe(true);
            expect(result.absoluteResidual).toBe(0.50);
            expect(result.effectiveTolerance).toBe(0.50);
            expect(mockConnection.commit).toHaveBeenCalled();
        });

        test('2.3 Justo fuera: residual = 0.51 EUR (0.51 > 0.50) es rechazado por tolerancia', async () => {
            setupMocks({
                runOverrides: {
                    absolute_residual: 0.51,
                    percent_residual: 0.51
                },
                forwardPriceMock: () => ({ predictedManufacturingPrice: 100.51 })
            });

            await expect(calibrationAcceptanceService.acceptCalibrationRun(
                'tenant-1',
                'sess-100',
                'run-100',
                { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' },
                { absoluteTolerance: 0.50, percentTolerance: 0.005 }
            )).rejects.toThrow(/GOVERNANCE_CURVE_REJECTED|CALIBRATION_ACCEPTANCE_TOLERANCE_EXCEEDED/);

            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.commit).not.toHaveBeenCalled();
        });

        test('2.4 Justo fuera con skipCurveValidation: rechaza estrictamente con CALIBRATION_ACCEPTANCE_TOLERANCE_EXCEEDED', async () => {
            setupMocks({
                runOverrides: {
                    absolute_residual: 0.51,
                    percent_residual: 0.51
                },
                forwardPriceMock: () => ({ predictedManufacturingPrice: 100.51 })
            });

            await expect(calibrationAcceptanceService.acceptCalibrationRun(
                'tenant-1',
                'sess-100',
                'run-100',
                { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' },
                { absoluteTolerance: 0.50, percentTolerance: 0.005, skipCurveValidation: true }
            )).rejects.toThrow('CALIBRATION_ACCEPTANCE_TOLERANCE_EXCEEDED');

            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.commit).not.toHaveBeenCalled();
        });
    });

    // ── GROUP 3: Curva cuyo mayor residual esté en una tirada distinta de la primera ──
    describe('3. Curva multi-cantidad: Mayor residual en tirada distinta de la primera', () => {
        const multiTargets = [
            { quantity: 100, targetManufacturingPrice: 100.0, targetBasis: 'MANUFACTURING_PRICE' },
            { quantity: 500, targetManufacturingPrice: 400.0, targetBasis: 'MANUFACTURING_PRICE' },
            { quantity: 2000, targetManufacturingPrice: 1200.0, targetBasis: 'MANUFACTURING_PRICE' }
        ];

        // Forward prices:
        // Qty 100: 100.05 EUR -> absRes = 0.05 EUR (point 0)
        // Midpoint 300: 250.00 EUR -> structurally sound probe
        // Qty 500: 400.40 EUR -> absRes = 0.40 EUR (point 1: MAXIMUM!)
        // Midpoint 1250: 800.00 EUR -> structurally sound probe
        // Qty 2000: 1200.15 EUR -> absRes = 0.15 EUR (point 2)
        // Max absolute residual across curve is 0.40 EUR (at Qty 500, NOT Qty 100).
        const multiForwardPrices = {
            100: 100.05,
            300: 250.00,
            500: 400.40,
            1250: 800.00,
            2000: 1200.15
        };

        test('3.1 Acepta curva cuando run.absolute_residual coincide con el máximo de la curva (0.40 EUR en Qty 500) y no con Qty 100 (0.05 EUR)', async () => {
            setupMocks({
                sessionOverrides: {
                    multi_targets_json: JSON.stringify(multiTargets),
                    target_manufacturing_price: 100.0
                },
                runOverrides: {
                    absolute_residual: 0.40, // Max residual of the curve (Qty 500)
                    percent_residual: 0.001, // 0.40 / 400 = 0.001 (ratio)
                    point_results_json: JSON.stringify([
                        { quantity: 100, absoluteResidual: 0.05 },
                        { quantity: 500, absoluteResidual: 0.40 },
                        { quantity: 2000, absoluteResidual: 0.15 }
                    ])
                },
                forwardPriceMock: (spec) => {
                    const q = spec.quantity || spec.copies || 100;
                    return { predictedManufacturingPrice: multiForwardPrices[q] || 100.0 };
                }
            });

            const result = await calibrationAcceptanceService.acceptCalibrationRun(
                'tenant-1',
                'sess-100',
                'run-100',
                { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' },
                { absoluteTolerance: 0.50, percentTolerance: 0.01 }
            );

            expect(result.ok).toBe(true);
            expect(result.status).toBe('ACCEPTED');
            expect(mockConnection.commit).toHaveBeenCalled();

            // Verify that verification_json recorded curve evaluation and correct metrics
            const insertCalls = mockQuery.mock.calls.filter(call => call[0].includes('INSERT INTO printhouse_pricing_calibration_acceptances'));
            expect(insertCalls).toHaveLength(1);
            const verificationJson = JSON.parse(insertCalls[0][1][17]);
            expect(verificationJson.curveEvaluation.mode).toBe('MULTI_QUANTITY');
            expect(verificationJson.curveEvaluation.curveMetrics.maxAbsoluteResidual).toBe(0.40);
        });

        test('3.2 Rechaza curva si run.absolute_residual se asigna erróneamente al primer punto (0.05 EUR) contradiciendo el máximo de la curva (0.40 EUR)', async () => {
            setupMocks({
                sessionOverrides: {
                    multi_targets_json: JSON.stringify(multiTargets),
                    target_manufacturing_price: 100.0
                },
                runOverrides: {
                    absolute_residual: 0.05, // Mistakenly supplied point 0 instead of curve maximum (0.40)
                    percent_residual: 0.001
                },
                forwardPriceMock: (spec) => {
                    const q = spec.quantity || spec.copies || 100;
                    return { predictedManufacturingPrice: multiForwardPrices[q] || 100.0 };
                }
            });

            await expect(calibrationAcceptanceService.acceptCalibrationRun(
                'tenant-1',
                'sess-100',
                'run-100',
                { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' },
                { absoluteTolerance: 0.50, percentTolerance: 0.01 }
            )).rejects.toThrow('CONTRADICTORY_SUPPLIED_RESIDUAL');

            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.commit).not.toHaveBeenCalled();
        });

        test('3.3 Rechaza curva si un punto individual en run.point_results_json contradice el cálculo verificado', async () => {
            setupMocks({
                sessionOverrides: {
                    multi_targets_json: JSON.stringify(multiTargets),
                    target_manufacturing_price: 100.0
                },
                runOverrides: {
                    absolute_residual: 0.40,
                    percent_residual: 0.001,
                    point_results_json: JSON.stringify([
                        { quantity: 100, absoluteResidual: 0.05 },
                        { quantity: 500, absoluteResidual: 99.99 }, // Contradictory point residual!
                        { quantity: 2000, absoluteResidual: 0.15 }
                    ])
                },
                forwardPriceMock: (spec) => {
                    const q = spec.quantity || spec.copies || 100;
                    return { predictedManufacturingPrice: multiForwardPrices[q] || 100.0 };
                }
            });

            await expect(calibrationAcceptanceService.acceptCalibrationRun(
                'tenant-1',
                'sess-100',
                'run-100',
                { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' },
                { absoluteTolerance: 0.50, percentTolerance: 0.01 }
            )).rejects.toThrow('CONTRADICTORY_SUPPLIED_RESIDUAL');

            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.commit).not.toHaveBeenCalled();
        });
    });

    // ── GROUP 4: Residuales contradictorios rechazados sin persistir revisión ni tarifas ──
    describe('4. Aislamiento e Integridad: Rechazo limpio sin mutación ni persistencia', () => {
        test('4.1 Run con absolute_residual contradictorio es rechazado sin invocar INSERT revisiones ni UPDATE printer_nodes', async () => {
            setupMocks({
                runOverrides: {
                    absolute_residual: 42.0 // Real forward residual is 0.05 EUR
                },
                forwardPriceMock: () => ({ predictedManufacturingPrice: 100.05 })
            });

            let error = null;
            try {
                await calibrationAcceptanceService.acceptCalibrationRun(
                    'tenant-1',
                    'sess-100',
                    'run-100',
                    { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' }
                );
            } catch (err) {
                error = err;
            }

            expect(error).not.toBeNull();
            expect(error.code).toBe('CONTRADICTORY_SUPPLIED_RESIDUAL');
            expect(error.statusCode).toBe(422);

            // Assert complete transactional rollback
            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.commit).not.toHaveBeenCalled();

            // Assert zero mutation to printhouse_pricing_revisions
            const revInserts = mockQuery.mock.calls.filter(c => c[0].includes('INSERT INTO printhouse_pricing_revisions'));
            expect(revInserts).toHaveLength(0);

            // Assert zero mutation to printer_nodes.rates_json
            const nodeUpdates = mockQuery.mock.calls.filter(c => c[0].includes('UPDATE printer_nodes'));
            expect(nodeUpdates).toHaveLength(0);

            // Assert zero insertion to acceptances
            const accInserts = mockQuery.mock.calls.filter(c => c[0].includes('INSERT INTO printhouse_pricing_calibration_acceptances'));
            expect(accInserts).toHaveLength(0);

            // Assert zero status transition on calibration session
            const sessUpdates = mockQuery.mock.calls.filter(c => c[0].includes('UPDATE printhouse_pricing_calibration_sessions'));
            expect(sessUpdates).toHaveLength(0);
        });

        test('4.2 Run con percent_residual negativo o inválido es rechazado sin mutación de tarifas', async () => {
            setupMocks({
                runOverrides: {
                    absolute_residual: 0.05,
                    percent_residual: -0.5 // Invalid negative percent residual
                },
                forwardPriceMock: () => ({ predictedManufacturingPrice: 100.05 })
            });

            await expect(calibrationAcceptanceService.acceptCalibrationRun(
                'tenant-1',
                'sess-100',
                'run-100',
                { id: 'usr-1', email: 'op@test.pro', role: 'ADMIN' }
            )).rejects.toThrow('CONTRADICTORY_SUPPLIED_RESIDUAL');

            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.commit).not.toHaveBeenCalled();

            const nodeUpdates = mockQuery.mock.calls.filter(c => c[0].includes('UPDATE printer_nodes'));
            expect(nodeUpdates).toHaveLength(0);
        });
    });
});
