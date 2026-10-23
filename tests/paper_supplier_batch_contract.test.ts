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
        it('enforces strictly zero pending rows for confirmed batches and separates rejected counts', async () => {
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

            // Invariant 1: Confirmed batch MUST have zero pending rows
            expect(confirmed.pendingRows).toBe(0);
            expect(confirmed.pending_rows).toBe(0);
            expect(confirmed.validRows).toBe(1522);
            expect(confirmed.rejectedRows).toBe(22);
            expect(confirmed.rejected_rows).toBe(22);
            expect(confirmed.issueRows).toBe(6);
            expect(confirmed.totalRows).toBe(1544);
            expect(confirmed.validRows + confirmed.rejectedRows).toBe(confirmed.totalRows);

            // Invariant 2: Aliases present for frontend compatibility
            expect(confirmed.fileName).toBe('catalog_compatible_all.csv');
            expect(confirmed.file_name).toBe('catalog_compatible_all.csv');
            expect(confirmed.original_filename).toBe('catalog_compatible_all.csv');

            // Invariant 3: Preview batch retains unresolved issues as pending
            expect(preview.pendingRows).toBe(13);
            expect(preview.pending_rows).toBe(13);
            expect(preview.issueRows).toBe(13);
            expect(preview.validRows).toBe(37);
            expect(preview.totalRows).toBe(50);
        });
    });

    describe('Dimension description conflict detection', () => {
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

        it('passes without warning when declared dimensions match title dimensions', () => {
            const validation = paperImportService.validateTechnicalRow({
                name: 'AllyKing Cream GC2 325 72x104',
                gsm: 325,
                width_mm: 720,
                height_mm: 1040,
                finish: 'UNCOATED',
                colGsm: 325,
                colW_mm: 720,
                colH_mm: 1040
            });

            const conflictIssue = validation.technicalIssues.find((i: any) => i.code === 'DIMENSION_DESCRIPTION_CONFLICT');
            expect(conflictIssue).toBeUndefined();
            expect(validation.validationStatus).toBe('VALID');
        });

        it('ignores names without embedded dimensions and does not raise false positive', () => {
            const validation = paperImportService.validateTechnicalRow({
                name: 'Torras Creator Silk 150gsm',
                gsm: 150,
                width_mm: 700,
                height_mm: 1000,
                finish: 'SILK',
                colGsm: 150,
                colW_mm: 700,
                colH_mm: 1000
            });

            const conflictIssue = validation.technicalIssues.find((i: any) => i.code === 'DIMENSION_DESCRIPTION_CONFLICT');
            expect(conflictIssue).toBeUndefined();
            expect(validation.validationStatus).toBe('VALID');
        });
    });
});
