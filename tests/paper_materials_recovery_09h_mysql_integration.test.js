import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import express from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const {
    PaperEvidenceService,
    PaperEvidenceError,
    validateAndHashPdfDocument,
    persistPdfBufferToPrivateStore,
    cleanupOrphanEvidenceFile,
    MAX_PDF_SIZE_BYTES
} = require('../src/api/services/paperEvidenceService.js');

const {
    runRealMysqlRecovery09hValidation
} = require('../scripts/test_recovery09h_real_mysql_integration.js');

const VALID_PDF_BUFFER = Buffer.from(
    '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n%%EOF',
    'utf8'
);

/**
 * Transactional & Referential Integrity Mock DB for RECOVERY-09H tests.
 * Simulates InnoDB ON DELETE RESTRICT, row-level locking (`FOR UPDATE`),
 * atomic Compare-And-Swap (`WHERE review_status IN (...)`), and rollback.
 */
function createTransactionalEvidenceDb() {
    const variants = new Map([
        [
            'var_dbd5357075534e3b',
            {
                id: 'var_dbd5357075534e3b',
                product_id: 'prod_nevia_c1s',
                gsm: 80,
                width_mm: 700,
                height_mm: 1000,
                finish: 'GLOSS',
                grain_direction: 'LONG_GRAIN',
                caliper_um: null,
                caliper_source: 'NONE',
                caliper_confidence_status: 'MISSING',
                caliper_revision: 1,
                brand: 'Nevia Plus C1S',
                manufacturer: 'APP',
                category: 'COATED'
            }
        ]
    ]);

    const caliperEvidences = [];
    const auditLogs = [];
    let failOnAuditInsert = false;

    async function executeQuery(sql, params = []) {
        const norm = String(sql).replace(/\s+/g, ' ').trim();

        if (norm.startsWith('DELETE FROM paper_variants')) {
            const variantId = params[0];
            const hasEvidence = caliperEvidences.some((e) => e.variant_id === variantId);
            const hasAudit = auditLogs.some((a) => a.variant_id === variantId);
            if (hasEvidence || hasAudit) {
                const err = new Error(
                    `Cannot delete or update a parent row: a foreign key constraint fails (\`fk_pvce_variant\` FOREIGN KEY (\`variant_id\`) REFERENCES \`paper_variants\` (\`id\`) ON DELETE RESTRICT)`
                );
                err.code = 'ER_ROW_IS_REFERENCED_2';
                err.errno = 1451;
                throw err;
            }
            variants.delete(variantId);
            return { affectedRows: 1 };
        }

        if (norm.startsWith('DELETE FROM paper_variant_caliper_evidence')) {
            const evidenceId = params[0];
            const hasAudit = auditLogs.some((a) => a.evidence_id === evidenceId);
            if (hasAudit) {
                const err = new Error(
                    `Cannot delete or update a parent row: a foreign key constraint fails (\`fk_pvcal_evidence\` FOREIGN KEY (\`evidence_id\`) REFERENCES \`paper_variant_caliper_evidence\` (\`evidence_id\`) ON DELETE RESTRICT)`
                );
                err.code = 'ER_ROW_IS_REFERENCED_2';
                err.errno = 1451;
                throw err;
            }
            return { affectedRows: 1 };
        }

        if (norm.includes('FROM paper_variants') && (norm.includes('WHERE v.id = ?') || norm.includes('WHERE id = ?'))) {
            const v = variants.get(params[0]);
            return v ? [{ ...v, product_name: v.brand }] : [];
        }

        if (norm.includes('SELECT DISTINCT document_sha256 FROM paper_variant_caliper_evidence WHERE tenant_id = ?')) {
            const [tenantId] = params;
            return caliperEvidences
                .filter((e) => e.tenant_id === tenantId && e.document_sha256)
                .map((e) => ({ document_sha256: e.document_sha256 }));
        }

        if (norm.includes('FROM paper_variant_caliper_evidence') && norm.includes('idempotency_key = ?')) {
            const [tenantId, idemKey] = params;
            return caliperEvidences.filter((e) => e.tenant_id === tenantId && e.idempotency_key === idemKey);
        }

        if (norm.includes('FROM paper_variant_caliper_evidence') && norm.includes('WHERE evidence_id = ? AND tenant_id = ?')) {
            const [evidenceId, tenantId] = params;
            return caliperEvidences.filter((e) => e.evidence_id === evidenceId && e.tenant_id === tenantId);
        }

        if (norm.includes('FROM paper_variant_caliper_evidence') && norm.includes('WHERE evidence_id = ? LIMIT 1')) {
            const [evidenceId] = params;
            return caliperEvidences.filter((e) => e.evidence_id === evidenceId);
        }

        if (norm.includes('FROM paper_variant_caliper_evidence') && norm.includes('WHERE tenant_id = ? AND variant_id = ?')) {
            const [tenantId, variantId] = params;
            return caliperEvidences.filter((e) => e.tenant_id === tenantId && e.variant_id === variantId);
        }

        if (norm.startsWith('INSERT INTO paper_variant_caliper_evidence')) {
            const [
                evidence_id,
                tenant_id,
                supplier_id,
                variant_id,
                product_id,
                accreditation_track,
                evidence_type,
                document_title,
                document_file_name,
                document_mime_type,
                document_size_bytes,
                document_storage_uri,
                document_sha256,
                manufacturer_name,
                supplier_channel,
                supplier_sku,
                datasheet_version,
                datasheet_published_date,
                measurement_standard,
                shade_embossing_invariance_confirmed,
                nominal_datasheet_caliper_um,
                nominal_tolerance_um,
                nominal_tolerance_pct,
                nominal_bulk_cm3_g,
                proposed_effective_caliper_um,
                proposed_caliper_source,
                has_source_contradiction,
                contradiction_details_json,
                review_status,
                idempotency_key,
                submitted_by,
                submitted_by_role,
                technical_notes
            ] = params;
            caliperEvidences.unshift({
                evidence_id,
                tenant_id,
                supplier_id,
                variant_id,
                product_id,
                accreditation_track,
                evidence_type,
                document_title,
                document_file_name,
                document_mime_type,
                document_size_bytes,
                document_storage_uri,
                document_sha256,
                manufacturer_name,
                supplier_channel,
                supplier_sku,
                datasheet_version,
                datasheet_published_date,
                measurement_standard,
                shade_embossing_invariance_confirmed,
                nominal_datasheet_caliper_um,
                nominal_tolerance_um,
                nominal_tolerance_pct,
                nominal_bulk_cm3_g,
                proposed_effective_caliper_um,
                proposed_caliper_source,
                has_source_contradiction,
                contradiction_details_json,
                review_status,
                idempotency_key,
                submitted_by,
                submitted_by_role,
                technical_notes,
                approved_by_technologist: null,
                created_at: new Date().toISOString()
            });
            return { affectedRows: 1 };
        }

        if (norm.startsWith("UPDATE paper_variant_caliper_evidence SET review_status = 'PENDING_TECH_REVIEW'")) {
            const [evidenceId, tenantId] = params;
            const row = caliperEvidences.find(
                (e) => e.evidence_id === evidenceId && e.tenant_id === tenantId && e.review_status === 'DRAFT'
            );
            if (!row) return { affectedRows: 0 };
            row.review_status = 'PENDING_TECH_REVIEW';
            return { affectedRows: 1 };
        }

        if (norm.startsWith('UPDATE paper_variant_caliper_evidence SET review_status = ?')) {
            const [newStatus, approvedBy, approvedRole, decisionReason, evidenceId, tenantId] = params;
            const row = caliperEvidences.find(
                (e) =>
                    e.evidence_id === evidenceId &&
                    e.tenant_id === tenantId &&
                    (e.review_status === 'DRAFT' || e.review_status === 'PENDING_TECH_REVIEW')
            );
            if (!row) return { affectedRows: 0 };
            row.review_status = newStatus;
            row.approved_by_technologist = approvedBy;
            row.approved_by_role = approvedRole;
            row.decision_reason = decisionReason;
            return { affectedRows: 1 };
        }

        if (norm.startsWith('INSERT INTO paper_variant_caliper_audit_log')) {
            if (failOnAuditInsert) {
                throw new Error('SIMULATED_DB_AUDIT_LOG_INSERT_FAILURE');
            }
            const [audit_id, tenant_id, supplier_id, variant_id, evidence_id, action_type, previous_review_status, new_review_status] = params;
            auditLogs.unshift({
                audit_id,
                tenant_id,
                supplier_id,
                variant_id,
                evidence_id,
                action_type,
                previous_review_status,
                new_review_status,
                created_at: new Date().toISOString()
            });
            return { affectedRows: 1 };
        }

        return [];
    }

    return {
        variants,
        caliperEvidences,
        auditLogs,
        setFailOnAuditInsert(val) {
            failOnAuditInsert = Boolean(val);
        },
        query: executeQuery,
        async getConnection() {
            let snapshotEvidences = null;
            let snapshotAudits = null;
            return {
                async beginTransaction() {
                    snapshotEvidences = JSON.parse(JSON.stringify(caliperEvidences));
                    snapshotAudits = JSON.parse(JSON.stringify(auditLogs));
                },
                query: executeQuery,
                async commit() {},
                async rollback() {
                    if (snapshotEvidences) {
                        caliperEvidences.length = 0;
                        caliperEvidences.push(...snapshotEvidences);
                    }
                    if (snapshotAudits) {
                        auditLogs.length = 0;
                        auditLogs.push(...snapshotAudits);
                    }
                },
                release() {}
            };
        }
    };
}

describe('PAPER-MATERIALS-RECOVERY-09H — Referential Integrity, Deep PDF Security, Concurrency & MySQL 8 Audit', () => {
    let tempStoreDir;
    let txDb;
    let service;

    beforeEach(() => {
        tempStoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppos-rec09h-test-'));
        txDb = createTransactionalEvidenceDb();
        service = new PaperEvidenceService({ dbClient: txDb, storageRoot: tempStoreDir });
    });

    afterEach(() => {
        try {
            fs.rmSync(tempStoreDir, { recursive: true, force: true });
        } catch (_) {}
    });

    it('1. Referential Integrity: enforces ON DELETE RESTRICT across all 6 FKs in Migration 174 and prevents deleting variants with accreditation evidence', async () => {
        const upPath = path.join(
            process.cwd(),
            'migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql'
        );
        const upSql = fs.readFileSync(upPath, 'utf8');

        const restrictMatches = upSql.match(/CONSTRAINT\s+fk_[a-z_]+\s+FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+[a-z_]+\([^)]+\)\s+ON\s+DELETE\s+RESTRICT/gi) || [];
        expect(restrictMatches.length).toBe(6);
        expect(upSql).not.toContain('ON DELETE CASCADE');

        // Register an evidence on var_dbd5357075534e3b
        const reg = await service.registerDocumentaryEvidence({
            tenantId: 'tenant-09h',
            actorId: 'operator-1',
            actorRole: 'SUPPLIER_OPERATOR',
            payload: {
                variantId: 'var_dbd5357075534e3b',
                proposedCaliperUm: 71,
                fileBuffer: VALID_PDF_BUFFER,
                fileName: 'nevia_80g.pdf',
                submitForReview: true
            }
        });

        // Attempting to delete the variant or evidence fails with ON DELETE RESTRICT
        await expect(txDb.query('DELETE FROM paper_variants WHERE id = ?', ['var_dbd5357075534e3b'])).rejects.toThrowError(
            /ON DELETE RESTRICT/
        );
        await expect(
            txDb.query('DELETE FROM paper_variant_caliper_evidence WHERE evidence_id = ?', [reg.evidenceId])
        ).rejects.toThrowError(/ON DELETE RESTRICT/);

        // Audit log is strictly append-only
        await expect(service.updateAuditLogEntry()).rejects.toThrowError(/append-only and cannot be modified/);
        await expect(service.deleteAuditLogEntry()).rejects.toThrowError(/append-only and cannot be deleted/);
    });

    it('2. Deep PDF Content & Structural Security: rejects header-only spoofing, missing %%EOF, and active /JavaScript or /Launch payloads', () => {
        // 1. Header-only spoofing (`%PDF-1.7` without objects or %%EOF) -> rejected!
        const headerOnlyFake = Buffer.from('%PDF-1.7\nJust text pretending to be a PDF without EOF or objects', 'utf8');
        expect(() => validateAndHashPdfDocument(headerOnlyFake, 'spoof.pdf')).toThrowError(
            /missing %%EOF trailer marker/
        );

        // 2. Has %PDF-1.7 and %%EOF, but no indirect objects (`1 0 obj`) or `/Type /Catalog` -> rejected!
        const noStructureFake = Buffer.from('%PDF-1.7\n Plain text with trailer \n%%EOF', 'utf8');
        expect(() => validateAndHashPdfDocument(noStructureFake, 'nostruct.pdf')).toThrowError(
            /failed deep PDF structural inspection/
        );

        // 3. Valid PDF structure containing `/JavaScript` active payload -> rejected!
        const maliciousJsPdf = Buffer.from(
            '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\n%%EOF',
            'utf8'
        );
        expect(() => validateAndHashPdfDocument(maliciousJsPdf, 'exploit.pdf')).toThrowError(
            /PDF contains forbidden active or executable construct \(\/JavaScript\)/
        );

        // 4. Valid PDF structure containing `/Launch` action -> rejected!
        const maliciousLaunchPdf = Buffer.from(
            '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Action << /S /Launch /F (cmd.exe) >> >>\nendobj\n%%EOF',
            'utf8'
        );
        expect(() => validateAndHashPdfDocument(maliciousLaunchPdf, 'launch.pdf')).toThrowError(
            /PDF contains forbidden active or executable construct \(\/Launch\)/
        );

        // 5. Wrong MIME type -> rejected!
        expect(() =>
            validateAndHashPdfDocument({
                buffer: VALID_PDF_BUFFER,
                fileName: 'datasheet.html',
                mimeType: 'text/html'
            })
        ).toThrowError(/Unsupported document MIME type/);
    });

    it('3. Durable Private PDF Storage, Tenant Access Restriction, Tamper Detection & Orphan File Cleanup on DB Rollback', async () => {
        // 1. Register documentary evidence -> persists PDF to private tenant folder on disk
        const reg = await service.registerDocumentaryEvidence({
            tenantId: 'tenant-alpha',
            actorId: 'operator-1',
            actorRole: 'SUPPLIER_OPERATOR',
            payload: {
                variantId: 'var_dbd5357075534e3b',
                proposedCaliperUm: 71,
                fileBuffer: VALID_PDF_BUFFER,
                fileName: '../traversal_attempt/nevia_tds.pdf',
                submitForReview: true
            }
        });

        // Filename path traversal stripped cleanly
        expect(reg.evidence.document_file_name).toBe('nevia_tds.pdf');

        // Verify file exists on disk in tenant-isolated private folder
        const expectedDiskPath = path.join(tempStoreDir, 'tenant-alpha', `${reg.documentSha256}.pdf`);
        expect(fs.existsSync(expectedDiskPath)).toBe(true);

        // 2. Authorized tenant download succeeds and verifies SHA-256
        const downloaded = await service.getEvidenceDocumentDownload({
            tenantId: 'tenant-alpha',
            evidenceId: reg.evidenceId
        });
        expect(downloaded.sha256).toBe(reg.documentSha256);
        expect(downloaded.buffer.equals(VALID_PDF_BUFFER)).toBe(true);

        // 3. Cross-tenant download is strictly blocked (404)
        await expect(
            service.getEvidenceDocumentDownload({
                tenantId: 'tenant-beta',
                evidenceId: reg.evidenceId
            })
        ).rejects.toThrowError(/not found for this tenant/);

        // 4. Simulate on-disk file tampering -> download detects SHA-256 mismatch and fails closed (409)
        const originalBytes = fs.readFileSync(expectedDiskPath);
        fs.writeFileSync(expectedDiskPath, Buffer.from('%PDF-1.7\nTampered content on disk\n%%EOF', 'utf8'));
        await expect(
            service.getEvidenceDocumentDownload({
                tenantId: 'tenant-alpha',
                evidenceId: reg.evidenceId
            })
        ).rejects.toThrowError(/Cryptographic integrity failure/);
        // Restore original bytes
        fs.writeFileSync(expectedDiskPath, originalBytes);

        // 5. Simulate DB failure during registration of a new PDF -> newly written file is automatically cleaned up (no orphan left behind!)
        const secondPdf = Buffer.from(
            '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n% Second unique PDF\n%%EOF',
            'utf8'
        );
        const secondSha256 = crypto.createHash('sha256').update(secondPdf).digest('hex');
        const secondDiskPath = path.join(tempStoreDir, 'tenant-alpha', `${secondSha256}.pdf`);

        txDb.setFailOnAuditInsert(true);
        await expect(
            service.registerDocumentaryEvidence({
                tenantId: 'tenant-alpha',
                actorId: 'operator-1',
                actorRole: 'SUPPLIER_OPERATOR',
                payload: {
                    variantId: 'var_dbd5357075534e3b',
                    proposedCaliperUm: 72,
                    fileBuffer: secondPdf,
                    fileName: 'rollback_test.pdf'
                }
            })
        ).rejects.toThrowError(/SIMULATED_DB_AUDIT_LOG_INSERT_FAILURE/);
        txDb.setFailOnAuditInsert(false);

        // Orphan file on disk was automatically removed and DB transaction rolled back!
        expect(fs.existsSync(secondDiskPath)).toBe(false);
        expect(txDb.caliperEvidences).toHaveLength(1);

        // 6. Test sweepOrphanEvidenceFiles for any stray unreferenced file in tenant directory
        const strayFilePath = path.join(tempStoreDir, 'tenant-alpha', `${'f'.repeat(64)}.pdf`);
        fs.writeFileSync(strayFilePath, VALID_PDF_BUFFER);
        expect(fs.existsSync(strayFilePath)).toBe(true);

        const sweepResult = await service.sweepOrphanEvidenceFiles({ tenantId: 'tenant-alpha' });
        expect(sweepResult.deletedCount).toBe(1);
        expect(fs.existsSync(strayFilePath)).toBe(false);
        expect(fs.existsSync(expectedDiskPath)).toBe(true);
    });

    it('4. Approval Integrity & Concurrency: strips spoofed actor identity from request body and blocks concurrent review race conditions', async () => {
        const reg = await service.registerDocumentaryEvidence({
            tenantId: 'tenant-09h',
            actorId: 'operator-alice',
            actorRole: 'SUPPLIER_OPERATOR',
            payload: {
                variantId: 'var_dbd5357075534e3b',
                proposedCaliperUm: 71,
                fileBuffer: VALID_PDF_BUFFER,
                fileName: 'nevia_80g.pdf',
                submitForReview: true
            }
        });

        // Concurrent race condition test: two technologists review the exact same evidence simultaneously
        const [review1, review2] = await Promise.allSettled([
            service.reviewEvidence({
                tenantId: 'tenant-09h',
                actorId: 'tech-carlos',
                actorRole: 'SUPPLIER_ADMIN',
                evidenceId: reg.evidenceId,
                decision: 'APPROVE',
                reason: 'Technologist 1 approval of APP 71um datasheet.'
            }),
            service.reviewEvidence({
                tenantId: 'tenant-09h',
                actorId: 'tech-elena',
                actorRole: 'MATERIAL_TECHNOLOGIST',
                evidenceId: reg.evidenceId,
                decision: 'REJECT',
                reason: 'Technologist 2 concurrent rejection.'
            })
        ]);

        const winners = [review1, review2].filter((r) => r.status === 'fulfilled');
        const losers = [review1, review2].filter((r) => r.status === 'rejected');

        expect(winners).toHaveLength(1);
        expect(losers).toHaveLength(1);
        expect(losers[0].reason.code).toBe('EVIDENCE_ALREADY_REVIEWED');
        expect(losers[0].reason.statusCode).toBe(409);

        // Productive caliper_um on paper_variants is never modified and canReleaseToManufacturing is false
        expect(winners[0].value.productiveCaliperModified).toBe(false);
        expect(winners[0].value.canReleaseToManufacturing).toBe(false);
        expect(txDb.variants.get('var_dbd5357075534e3b').caliper_um).toBeNull();
    });

    it('5. Ephemeral MySQL 8 Integration Suite (runs live when MySQL 8 is reachable in CI)', async () => {
        const res = await runRealMysqlRecovery09hValidation();
        if (!res.skipped) {
            expect(res.passed).toBe(true);
        } else {
            expect(res.skipped).toBe(true);
        }
    });
});
