import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = require('../src/api/services/mysqlClient');
const paperImportService = require('../src/api/services/paperImportService');

describe('Paper Supplier Import Batch Contract & Dimension Validation Suite', () => {
    let querySpy: any;

    beforeEach(() => {
        vi.clearAllMocks();
        querySpy = vi.spyOn(db, 'query');
    });

    describe('listImportBatches invariant contract', () => {
        it('derives counts from real database row decisions, verifies zero pending for clean confirmed batches, and separates rejected counts', async () => {
            // Mock COUNT(*) query
            querySpy.mockResolvedValueOnce([{ total: 2 }]);

            // Mock rows query with one CONFIRMED batch and one PREVIEW batch
            querySpy.mockResolvedValueOnce([
                {
                    id: 'imp_batch_confirmed_01',
                    tenant_id: 'tenant-demo',
                    supplier_id: 'supp-demo',
                    file_name: 'catalog_compatible_all.csv',
                    file_sha256: 'sha256_mock_hash_1',
                    format: 'CSV',
                    total_rows: 1544,
                    valid_rows: 1522,
                    issue_rows: 6,
                    duplicate_rows: 16,
                    status: 'CONFIRMED',
                    created_by: 'usr-1',
                    confirmed_at: '2026-10-23T04:38:36.000Z',
                    created_at: '2026-10-23T04:38:32.000Z',
                    updated_at: '2026-10-23T04:38:36.000Z',
                    metadata_json: JSON.stringify({
                        valid_count: 1522,
                        rejected_count: 22,
                        pending_count: 0,
                        confirmed_by: 'usr-1'
                    })
                },
                {
                    id: 'imp_batch_preview_02',
                    tenant_id: 'tenant-demo',
                    supplier_id: 'supp-demo',
                    file_name: 'import_batch_03.csv',
                    file_sha256: 'sha256_mock_hash_2',
                    format: 'CSV',
                    total_rows: 50,
                    valid_rows: 37,
                    issue_rows: 13,
                    duplicate_rows: 0,
                    status: 'PREVIEW',
                    created_by: 'usr-1',
                    confirmed_at: null,
                    created_at: '2026-10-22T19:32:41.000Z',
                    updated_at: '2026-10-22T19:32:41.000Z',
                    metadata_json: '{}'
                }
            ]);

            // Mock granular row decision counts from paper_import_rows
            querySpy.mockResolvedValueOnce([
                { batch_id: 'imp_batch_confirmed_01', decision: 'ACCEPTED', cnt: 1522 },
                { batch_id: 'imp_batch_confirmed_01', decision: 'REJECTED', cnt: 22 },
                { batch_id: 'imp_batch_preview_02', decision: 'ACCEPTED', cnt: 37 },
                { batch_id: 'imp_batch_preview_02', decision: 'PENDING', cnt: 13 }
            ]);

            const result = await paperImportService.listImportBatches({
                tenantId: 'tenant-demo',
                supplierId: 'supp-demo',
                page: 1,
                limit: 20
            });

            expect(result.total).toBe(2);
            expect(result.batches.length).toBe(2);

            const confirmed = result.batches[0];
            const preview = result.batches[1];

            // Invariant 1: Confirmed batch derived from real decisions has zero pending rows and zero inconsistency
            expect(confirmed.pendingRows).toBe(0);
            expect(confirmed.pending_rows).toBe(0);
            expect(confirmed.validRows).toBe(1522);
            expect(confirmed.rejectedRows).toBe(22);
            expect(confirmed.rejected_rows).toBe(22);
            expect(confirmed.issueRows).toBe(6);
            expect(confirmed.totalRows).toBe(1544);
            expect(confirmed.validRows + confirmed.rejectedRows).toBe(confirmed.totalRows);
            expect(confirmed.hasInconsistency).toBe(false);

            // Invariant 2: Aliases present for frontend compatibility
            expect(confirmed.fileName).toBe('catalog_compatible_all.csv');
            expect(confirmed.file_name).toBe('catalog_compatible_all.csv');
            expect(confirmed.original_filename).toBe('catalog_compatible_all.csv');

            // Invariant 3: Preview batch retains real database pending rows
            expect(preview.pendingRows).toBe(13);
            expect(preview.pending_rows).toBe(13);
            expect(preview.issueRows).toBe(13);
            expect(preview.validRows).toBe(37);
            expect(preview.totalRows).toBe(50);
            expect(preview.hasInconsistency).toBe(false);
        });

        it('surfaces inconsistency and does NOT mask pending count if a confirmed batch contains unresolved pending rows in database', async () => {
            querySpy.mockResolvedValueOnce([{ total: 1 }]);

            querySpy.mockResolvedValueOnce([
                {
                    id: 'imp_batch_corrupted_conf',
                    tenant_id: 'tenant-demo',
                    supplier_id: 'supp-demo',
                    file_name: 'corrupted_batch.csv',
                    file_sha256: 'sha256_mock_hash_x',
                    format: 'CSV',
                    total_rows: 50,
                    valid_rows: 44,
                    issue_rows: 6,
                    duplicate_rows: 0,
                    status: 'CONFIRMED',
                    created_by: 'usr-1',
                    confirmed_at: '2026-10-23T05:00:00.000Z',
                    created_at: '2026-10-23T04:55:00.000Z',
                    updated_at: '2026-10-23T05:00:00.000Z',
                    metadata_json: JSON.stringify({
                        valid_count: 44,
                        rejected_count: 0,
                        pending_count: 6
                    })
                }
            ]);

            // Database actually has 6 rows with decision PENDING!
            querySpy.mockResolvedValueOnce([
                { batch_id: 'imp_batch_corrupted_conf', decision: 'ACCEPTED', cnt: 44 },
                { batch_id: 'imp_batch_corrupted_conf', decision: 'PENDING', cnt: 6 }
            ]);

            const result = await paperImportService.listImportBatches({
                tenantId: 'tenant-demo',
                supplierId: 'supp-demo',
                page: 1,
                limit: 20
            });

            const batch = result.batches[0];
            // Must NOT hide pending count under the rug!
            expect(batch.pendingRows).toBe(6);
            expect(batch.pending_rows).toBe(6);
            expect(batch.hasInconsistency).toBe(true);
            expect(batch.inconsistencyCode).toBe('CONFIRMED_BATCH_HAS_PENDING_ROWS');
            expect(batch.inconsistencyMessage).toContain('6 fila(s) pendiente(s) real(es)');
        });
    });

    describe('Dimension description conflict detection, blocking, and partial edits', () => {
        it('detects discrepancy when title specifies 72x104 but columns specify 720x1020 mm', () => {
            const validation = paperImportService.validateTechnicalRow({
                name: 'AllyKing Cream GC2 325 72x104',
                gsm: 325,
                width_mm: 720,
                height_mm: 1020,
                finish: 'UNCOATED',
                colGsm: 325,
                colW_mm: 720,
                colH_mm: 1020
            });

            expect(validation.validationStatus).toBe('WARNING');
            const conflictIssue = validation.technicalIssues.find((i: any) => i.code === 'DIMENSION_DESCRIPTION_CONFLICT');
            expect(conflictIssue).toBeDefined();
            expect(conflictIssue.severity).toBe('WARNING');
            expect(conflictIssue.message).toContain('conflict with dimensions found in description');
        });

        it('conserves DIMENSION_DESCRIPTION_CONFLICT across partial edits (editing only width or only height)', () => {
            // Original contradictory row: 720x1020 mm vs '72x104' (720x1040)
            // 1. Partial edit: user submits width_mm = 720, but height_mm is still 1020 mm
            const partialEditWidth = paperImportService.validateTechnicalRow({
                name: 'AllyKing Cream GC2 325 72x104',
                gsm: 325,
                width_mm: 720,
                height_mm: 1020,
                finish: 'UNCOATED',
                colGsm: 325,
                colW_mm: 720,
                colH_mm: 1020
            });
            expect(partialEditWidth.validationStatus).toBe('WARNING');
            expect(partialEditWidth.technicalIssues.some((i: any) => i.code === 'DIMENSION_DESCRIPTION_CONFLICT')).toBe(true);

            // 2. Partial edit: user submits height_mm = 1040, but width_mm is not 720 (e.g. 700)
            const partialEditHeight = paperImportService.validateTechnicalRow({
                name: 'AllyKing Cream GC2 325 72x104',
                gsm: 325,
                width_mm: 700,
                height_mm: 1040,
                finish: 'UNCOATED',
                colGsm: 325,
                colW_mm: 700,
                colH_mm: 1040
            });
            expect(partialEditHeight.validationStatus).toBe('WARNING');
            expect(partialEditHeight.technicalIssues.some((i: any) => i.code === 'DIMENSION_DESCRIPTION_CONFLICT')).toBe(true);

            // 3. Full edit: both dimensions match the description (720x1040) -> WARNING is eliminated
            const fullResolution = paperImportService.validateTechnicalRow({
                name: 'AllyKing Cream GC2 325 72x104',
                gsm: 325,
                width_mm: 720,
                height_mm: 1040,
                finish: 'UNCOATED',
                colGsm: 325,
                colW_mm: 720,
                colH_mm: 1040
            });
            expect(fullResolution.technicalIssues.some((i: any) => i.code === 'DIMENSION_DESCRIPTION_CONFLICT')).toBe(false);
            expect(fullResolution.validationStatus).toBe('VALID');
        });

        it('DIMENSION_DESCRIPTION_CONFLICT is strictly in UNSAFE_DISCREPANCY_WARNING_CODES and blocks automated bulk acceptance', () => {
            expect(paperImportService.UNSAFE_DISCREPANCY_WARNING_CODES.has('DIMENSION_DESCRIPTION_CONFLICT')).toBe(true);

            const rowNormWithConflict = {
                name: 'AllyKing Cream GC2 325 72x104',
                gsm: 325,
                width_mm: 720,
                height_mm: 1020,
                issues: [
                    { code: 'DIMENSION_DESCRIPTION_CONFLICT', severity: 'WARNING', category: 'TECHNICAL' }
                ]
            };

            // Automated safe bulk acceptance MUST reject this row fail-closed
            expect(paperImportService.isRowWarningExplicitlySafe(rowNormWithConflict)).toBe(false);
        });

        it('preserves FORMAT and rawFormat during row normalization to avoid losing original spreadsheet evidence', () => {
            const rawCells = [
                'ART-1234',
                '',
                'AllyKing Cream GC2 325 72x104',
                '',
                '',
                '',
                'B1 720 x 1040', // FORMAT column (index 6)
                '325',
                '',
                'Semi-gloss',
                '',
                '',
                '',
                '720',
                '1020',
                'CARTON',
                'AllyKing',
                '1'
            ];

            const headers = [
                'CODE', 'QR', 'NAME', 'PRICE', 'CALIPER', 'THICKNESS_MM',
                'FORMAT', 'GRAMS', 'COAT', 'FINISH', 'MIN_QTY', 'STEPS_UNITS',
                'SORTIMENT', 'WIDTH', 'HEIGHT', 'PAPER_TYPE', 'PROVIDER', 'AKTIV'
            ];

            const norm = paperImportService.normalizeRowData(rawCells, headers, 1);

            // Verified preservation: original format text preserved directly on normalized object and in evidence
            expect(norm.format).toBe('B1 720 x 1040');
            expect(norm.rawFormat).toBe('B1 720 x 1040');
            expect(norm.evidence.format).toBe('B1 720 x 1040');
            expect(norm.evidence.rawFormat).toBe('B1 720 x 1040');
            expect(norm.evidence.formatDimensions).toBeDefined();
            expect(norm.evidence.formatDimensions.rawW).toBe(720);
            expect(norm.evidence.formatDimensions.rawH).toBe(1040);
        });

        it('blocks confirmImportBatch when a row has DIMENSION_DESCRIPTION_CONFLICT with decision PENDING', async () => {
            const mockConn = {
                beginTransaction: vi.fn(),
                query: vi.fn(),
                commit: vi.fn(),
                rollback: vi.fn(),
                release: vi.fn()
            };
            vi.spyOn(db, 'getConnection').mockResolvedValueOnce(mockConn);

            mockConn.query.mockResolvedValueOnce([
                {
                    id: 'batch-test-conflict-pending',
                    tenant_id: 'tenant-demo',
                    supplier_id: 'supp-demo',
                    status: 'PREVIEW'
                }
            ]);

            mockConn.query.mockResolvedValueOnce([
                [
                    {
                        id: 'row-conflict-pending',
                        batch_id: 'batch-test-conflict-pending',
                        row_number: 1,
                        validation_status: 'WARNING',
                        decision: 'PENDING',
                        normalized_data_json: JSON.stringify({
                            name: 'AllyKing Cream GC2 325 72x104',
                            gsm: 325,
                            width_mm: 720,
                            height_mm: 1020,
                            technicalIssues: [
                                { code: 'DIMENSION_DESCRIPTION_CONFLICT', severity: 'WARNING' }
                            ]
                        })
                    }
                ]
            ]);

            await expect(
                paperImportService.confirmImportBatch({
                    batchId: 'batch-test-conflict-pending',
                    tenantId: 'tenant-demo',
                    supplierId: 'supp-demo',
                    actorId: 'user-op'
                })
            ).rejects.toThrow(/UNRESOLVED_ROWS_EXIST/);

            expect(mockConn.rollback).toHaveBeenCalled();
            expect(mockConn.release).toHaveBeenCalled();
        });

        it('blocks confirmImportBatch even if marked ACCEPTED when DIMENSION_DESCRIPTION_CONFLICT was not resolved', async () => {
            const mockConn = {
                beginTransaction: vi.fn(),
                query: vi.fn(),
                commit: vi.fn(),
                rollback: vi.fn(),
                release: vi.fn()
            };
            vi.spyOn(db, 'getConnection').mockResolvedValueOnce(mockConn);

            mockConn.query.mockResolvedValueOnce([
                {
                    id: 'batch-test-conflict-accepted',
                    tenant_id: 'tenant-demo',
                    supplier_id: 'supp-demo',
                    status: 'PREVIEW'
                }
            ]);

            mockConn.query.mockResolvedValueOnce([
                [
                    {
                        id: 'row-conflict-accepted',
                        batch_id: 'batch-test-conflict-accepted',
                        row_number: 1,
                        validation_status: 'WARNING',
                        decision: 'ACCEPTED',
                        normalized_data_json: JSON.stringify({
                            name: 'AllyKing Cream GC2 325 72x104',
                            gsm: 325,
                            width_mm: 720,
                            height_mm: 1020,
                            technicalIssues: [
                                { code: 'DIMENSION_DESCRIPTION_CONFLICT', severity: 'WARNING' }
                            ]
                        })
                    }
                ]
            ]);

            await expect(
                paperImportService.confirmImportBatch({
                    batchId: 'batch-test-conflict-accepted',
                    tenantId: 'tenant-demo',
                    supplierId: 'supp-demo',
                    actorId: 'user-op'
                })
            ).rejects.toThrow(/UNRESOLVED_ROWS_EXIST/);

            expect(mockConn.rollback).toHaveBeenCalled();
            expect(mockConn.release).toHaveBeenCalled();
        });
    });
});
