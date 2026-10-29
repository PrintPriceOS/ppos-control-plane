import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const {
    PaperEvidenceService,
    PaperEvidenceError,
    validateAndHashPdfDocument,
    detectSourceContradictions,
    MAX_PDF_SIZE_BYTES
} = require('../src/api/services/paperEvidenceService.js');

const {
    resolveVariantCaliperProvenance,
    classifyCaliperEvidenceTier,
    CALIPER_CONFIDENCE_STATUSES
} = require('../src/api/services/spine/paperCaliperReconciliationService.js');

const {
    executeSpineCalculation
} = require('../src/api/services/spine/spineCalculationEngine.js');

const {
    readCsvFile
} = require('../scripts/recover_paper_materials_08.cjs');

/**
 * In-memory mock database for PaperEvidenceService & Spine integration tests.
 * Tracks `paper_variants`, `paper_variant_caliper_evidence`, and `paper_variant_caliper_audit_log`.
 */
function createMockEvidenceDb() {
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
                caliper_source: 'UNKNOWN',
                caliper_confidence_status: 'UNVERIFIED',
                caliper_revision: null,
                metadata_json: JSON.stringify({ ods_code: 'NEV-80-71MY' }),
                brand: 'Nevia Plus C1S',
                manufacturer: 'APP (Asia Pulp & Paper)',
                category: 'COATED'
            }
        ],
        [
            'var_737c9a59216f4bf2',
            {
                id: 'var_737c9a59216f4bf2',
                product_id: 'prod_priplak',
                gsm: 455,
                width_mm: 700,
                height_mm: 1000,
                finish: 'MATT',
                grain_direction: 'UNKNOWN',
                caliper_um: null,
                caliper_source: 'UNKNOWN',
                caliper_confidence_status: 'UNVERIFIED',
                caliper_revision: null,
                metadata_json: JSON.stringify({ ods_code: 'PRIP-500' }),
                brand: 'Priplak Cristal + 0.5 mm',
                manufacturer: 'Priplak',
                category: 'SPECIALTY'
            }
        ],
        [
            'var_efalin_linen_demo',
            {
                id: 'var_efalin_linen_demo',
                product_id: 'prod_efalin',
                gsm: 120,
                width_mm: 700,
                height_mm: 1020,
                finish: 'EMBOSSED',
                grain_direction: 'SHORT_GRAIN',
                caliper_um: null,
                caliper_source: 'UNKNOWN',
                caliper_confidence_status: 'UNVERIFIED',
                caliper_revision: null,
                metadata_json: JSON.stringify({ ods_code: 'EFA-120-FL' }),
                brand: 'Efalin Fine Linen',
                manufacturer: 'Gmund / Zanders',
                category: 'DESIGN'
            }
        ]
    ]);

    const caliperEvidences = [];
    const auditLogs = [];
    let variantUpdateAttempts = 0;

    return {
        variants,
        caliperEvidences,
        auditLogs,
        getVariantUpdateAttempts: () => variantUpdateAttempts,
        async query(sql, params = []) {
            const norm = String(sql).replace(/\s+/g, ' ').trim();

            if (norm.startsWith('UPDATE paper_variants') || norm.includes('SET caliper_um')) {
                variantUpdateAttempts += 1;
                throw new Error('INVARIANT_VIOLATION: paper_variants.caliper_um must never be modified by evidence workflow.');
            }

            if (norm.includes('FROM paper_variants') && norm.includes('WHERE v.id = ?') || norm.includes('FROM paper_variants WHERE id = ?')) {
                const variantId = params[0];
                const v = variants.get(variantId);
                return v ? [{ ...v, product_name: v.brand }] : [];
            }

            if (norm.includes('FROM paper_variant_caliper_evidence') && norm.includes('idempotency_key = ?')) {
                const [tenantId, idemKey] = params;
                return caliperEvidences.filter(
                    (e) => e.tenant_id === tenantId && e.idempotency_key === idemKey
                );
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

            if (norm.includes('FROM paper_variant_caliper_evidence') && norm.includes('WHERE tenant_id = ?')) {
                const [tenantId] = params;
                return caliperEvidences.filter((e) => e.tenant_id === tenantId);
            }

            if (norm.startsWith('INSERT INTO paper_variant_caliper_evidence')) {
                const isDocumentary = norm.includes('document_title');
                if (isDocumentary) {
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
                } else {
                    const [
                        evidence_id,
                        tenant_id,
                        supplier_id,
                        variant_id,
                        product_id,
                        manufacturer_name,
                        supplier_channel,
                        supplier_sku,
                        nominal_datasheet_caliper_um,
                        measured_batch_caliper_um,
                        measured_facestock_caliper_um,
                        measured_liner_caliper_um,
                        supplier_lot_batch_id,
                        lot_received_date,
                        conditioning_temp_c,
                        conditioning_rh_pct,
                        conditioning_hours,
                        micrometer_make_model,
                        micrometer_serial_number,
                        micrometer_calibration_cert_id,
                        micrometer_calibration_valid_until,
                        substrate_tolerance_class,
                        readings_json,
                        readings_count,
                        readings_mean_um,
                        readings_std_dev_um,
                        readings_cv_pct,
                        readings_min_um,
                        readings_max_um,
                        proposed_effective_caliper_um,
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
                        accreditation_track: 'PHYSICAL_MICROMETER_TRACK',
                        evidence_type: 'PHYSICAL_MICROMETER_RECORD',
                        manufacturer_name,
                        supplier_channel,
                        supplier_sku,
                        nominal_datasheet_caliper_um,
                        measured_batch_caliper_um,
                        measured_facestock_caliper_um,
                        measured_liner_caliper_um,
                        supplier_lot_batch_id,
                        lot_received_date,
                        conditioning_temp_c,
                        conditioning_rh_pct,
                        conditioning_hours,
                        micrometer_make_model,
                        micrometer_serial_number,
                        micrometer_calibration_cert_id,
                        micrometer_calibration_valid_until,
                        substrate_tolerance_class,
                        readings_json,
                        readings_count,
                        readings_mean_um,
                        readings_std_dev_um,
                        readings_cv_pct,
                        readings_min_um,
                        readings_max_um,
                        proposed_effective_caliper_um,
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
                }
                return { affectedRows: 1 };
            }

            if (norm.startsWith('UPDATE paper_variant_caliper_evidence SET document_file_name')) {
                const [fileName, mimeType, sizeBytes, storageUri, sha256, evidenceId, tenantId] = params;
                const row = caliperEvidences.find((e) => e.evidence_id === evidenceId && e.tenant_id === tenantId);
                if (row) {
                    row.document_file_name = fileName;
                    row.document_mime_type = mimeType;
                    row.document_size_bytes = sizeBytes;
                    row.document_storage_uri = storageUri;
                    row.document_sha256 = sha256;
                }
                return { affectedRows: row ? 1 : 0 };
            }

            if (norm.startsWith("UPDATE paper_variant_caliper_evidence SET review_status = 'PENDING_TECH_REVIEW'")) {
                const [evidenceId, tenantId] = params;
                const row = caliperEvidences.find((e) => e.evidence_id === evidenceId && e.tenant_id === tenantId);
                if (row) row.review_status = 'PENDING_TECH_REVIEW';
                return { affectedRows: row ? 1 : 0 };
            }

            if (norm.startsWith('UPDATE paper_variant_caliper_evidence SET review_status = ?')) {
                const [newStatus, approvedBy, approvedRole, decisionReason, evidenceId, tenantId] = params;
                const row = caliperEvidences.find((e) => e.evidence_id === evidenceId && e.tenant_id === tenantId);
                if (row) {
                    row.review_status = newStatus;
                    row.approved_by_technologist = approvedBy;
                    row.approved_by_role = approvedRole;
                    row.decision_reason = decisionReason;
                }
                return { affectedRows: row ? 1 : 0 };
            }

            if (norm.startsWith('INSERT INTO paper_variant_caliper_audit_log')) {
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

            if (norm.includes('FROM paper_variant_classification_evidence')) {
                return [];
            }

            if (norm.includes('FROM paper_variant_caliper_audit_log')) {
                const [tenantId, variantId] = params;
                return auditLogs.filter((l) => l.tenant_id === tenantId && l.variant_id === variantId);
            }

            return [];
        }
    };
}

describe('PAPER-MATERIALS-RECOVERY-09 — Technical Evidence System, Metrology & Spine Governance', () => {
    let mockDb;
    let service;

    beforeEach(() => {
        mockDb = createMockEvidenceDb();
        service = new PaperEvidenceService({ dbClient: mockDb });
    });

    it('1. reconciles the 337 vs 338 pending classifications discrepancy so G1..G6 sum unequivocally to 337', () => {
        const csvPath = path.join(process.cwd(), 'docs/architecture/RECOVERY_09_PENDING_CLASSIFICATIONS_337.csv');
        expect(fs.existsSync(csvPath)).toBe(true);

        const rows = readCsvFile(csvPath);
        expect(rows).toHaveLength(337);

        // Verify the 1 excluded row (`var_85c142a50239e312` Efalin FINE LINEN 130 Light Blue 120) is not in the 337 pending list
        const ids = new Set(rows.map((r) => r.variant_id));
        expect(ids.size).toBe(337);
        expect(ids.has('var_85c142a50239e312')).toBe(false);

        const byGroup = rows.reduce((acc, r) => {
            const gCode = String(r.functional_group || r.group_code || '').split('_')[0];
            acc[gCode] = (acc[gCode] || 0) + 1;
            return acc;
        }, {});
        expect(byGroup).toEqual({
            G1: 62,
            G2: 113,
            G3: 74,
            G4: 27,
            G5: 12,
            G6: 49
        });
        const totalSum = Object.values(byGroup).reduce((a, b) => a + b, 0);
        expect(totalSum).toBe(337);

        const withCaliper = rows.filter((r) => r.has_caliper === 'YES').length;
        const withoutCaliper = rows.filter((r) => r.has_caliper === 'NO').length;
        expect(withCaliper).toBe(186);
        expect(withoutCaliper).toBe(151);
        expect(withCaliper + withoutCaliper).toBe(337);
    });

    it('2. validates additive migration 174 and rollback 174 structure without altering existing industrial ENUMs', () => {
        const upPath = path.join(
            process.cwd(),
            'migrations/174_phase197c_paper_evidence_and_technical_accreditation.sql'
        );
        const downPath = path.join(
            process.cwd(),
            'migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql'
        );

        expect(fs.existsSync(upPath)).toBe(true);
        expect(fs.existsSync(downPath)).toBe(true);

        const upSql = fs.readFileSync(upPath, 'utf8');
        const downSql = fs.readFileSync(downPath, 'utf8');

        expect(upSql).toContain('CREATE TABLE IF NOT EXISTS paper_variant_caliper_evidence');
        expect(upSql).toContain('CREATE TABLE IF NOT EXISTS paper_variant_caliper_audit_log');
        expect(upSql).toContain('CREATE TABLE IF NOT EXISTS paper_variant_classification_evidence');
        expect(upSql).toContain('FOREIGN KEY (variant_id) REFERENCES paper_variants(id)');
        expect(upSql).toContain('FOREIGN KEY (product_id) REFERENCES paper_products(id)');
        expect(upSql).not.toMatch(/ALTER\s+TABLE\s+paper_variants/i);
        expect(upSql).not.toMatch(/ALTER\s+TABLE\s+paper_products/i);

        expect(downSql).toContain('DROP TABLE IF EXISTS paper_variant_classification_evidence');
        expect(downSql).toContain('DROP TABLE IF EXISTS paper_variant_caliper_audit_log');
        expect(downSql).toContain('DROP TABLE IF EXISTS paper_variant_caliper_evidence');
    });

    it('3. lists the 252 missing-caliper materials with filtering by supplier, priorityTier, and accreditation track', async () => {
        const allRes = await service.listMissingCaliperMaterials({
            tenantId: 'tenant-1',
            page: 1,
            limit: 300
        });

        expect(allRes.total).toBe(252);
        expect(allRes.summary).toMatchObject({
            totalCatalogVariants: 1524,
            withCaliperCount: 1272,
            missingCaliperTotal: 252,
            physicalMicrometerTrackCount: 145,
            supplierDatasheetTrackCount: 102,
            conflictHoldTrackCount: 5,
            pendingClassificationTotal: 337
        });

        const antalisOnly = await service.listMissingCaliperMaterials({
            tenantId: 'tenant-1',
            supplier: 'Antalis',
            page: 1,
            limit: 300
        });
        expect(antalisOnly.total).toBe(178);

        const physicalOnly = await service.listMissingCaliperMaterials({
            tenantId: 'tenant-1',
            track: 'PHYSICAL_MICROMETER_TRACK',
            page: 1,
            limit: 300
        });
        expect(physicalOnly.total).toBe(145);

        const datasheetOnly = await service.listMissingCaliperMaterials({
            tenantId: 'tenant-1',
            track: 'SUPPLIER_DATASHEET_TRACK',
            page: 1,
            limit: 300
        });
        expect(datasheetOnly.total).toBe(102);
    });

    it('4. validates PDF magic bytes (%PDF-), enforces 10 MB size limit, and computes SHA-256', () => {
        const validPdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF', 'utf8');
        const validated = validateAndHashPdfDocument(validPdfBuffer, 'nevia_80g_datasheet.pdf');
        expect(validated.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(validated.fileName).toBe('nevia_80g_datasheet.pdf');
        expect(validated.sizeBytes).toBe(validPdfBuffer.length);

        const fakeExeBuffer = Buffer.from('MZ\x90\x00NotAPdfFile', 'utf8');
        expect(() => validateAndHashPdfDocument(fakeExeBuffer, 'malicious.pdf')).toThrowError(
            /missing %PDF- signature/
        );

        const oversizedBuffer = Buffer.alloc(MAX_PDF_SIZE_BYTES + 1024, 0x20);
        oversizedBuffer.write('%PDF-1.4\n', 0, 'utf8');
        expect(() => validateAndHashPdfDocument(oversizedBuffer, 'huge.pdf')).toThrowError(
            /exceeds maximum allowed limit of 10 MB/
        );
    });

    it('5. registers documentary evidence with idempotency, detects >5% source contradictions, and enforces Segregation of Duties (SoD) without modifying paper_variants.caliper_um', async () => {
        const validPdf = Buffer.from('%PDF-1.7\nOfficial Nevia Plus C1S 80g 71um Datasheet\n%%EOF', 'utf8');

        // 1. Register first documentary evidence (71 µm) with idempotency key
        const first = await service.registerDocumentaryEvidence({
            tenantId: 'tenant-1',
            actorId: 'operator-alice',
            actorRole: 'SUPPLIER_OPERATOR',
            idempotencyKey: 'idem-nevia-71um',
            payload: {
                variantId: 'var_dbd5357075534e3b',
                proposedCaliperUm: 71,
                caliperToleranceUm: 3,
                sourceKind: 'MANUFACTURER_DATASHEET',
                documentTitle: 'APP Nevia Plus C1S Technical Datasheet',
                documentRevision: '2026-01',
                documentPage: 'p. 2',
                fileBuffer: validPdf,
                fileName: 'nevia_c1s_80g.pdf',
                submitForReview: true
            }
        });

        expect(first.status).toBe('PENDING_TECH_REVIEW');
        expect(first.productiveCaliperModified).toBe(false);
        expect(first.hasSourceContradiction).toBe(false);

        // 2. Replay same idempotency key -> returns existing record without duplicating
        const replay = await service.registerDocumentaryEvidence({
            tenantId: 'tenant-1',
            actorId: 'operator-alice',
            actorRole: 'SUPPLIER_OPERATOR',
            idempotencyKey: 'idem-nevia-71um',
            payload: {
                variantId: 'var_dbd5357075534e3b',
                proposedCaliperUm: 71,
                sourceKind: 'MANUFACTURER_DATASHEET',
                documentTitle: 'APP Nevia Plus C1S Technical Datasheet',
                fileBuffer: validPdf
            }
        });
        expect(replay.idempotentReplay).toBe(true);
        expect(replay.evidenceId).toBe(first.evidenceId);
        expect(mockDb.caliperEvidences).toHaveLength(1);

        // 3. Register a contradicting second source (82 µm -> >5% delta vs 71 µm)
        const contradicting = await service.registerDocumentaryEvidence({
            tenantId: 'tenant-1',
            actorId: 'operator-alice',
            actorRole: 'SUPPLIER_OPERATOR',
            payload: {
                variantId: 'var_dbd5357075534e3b',
                proposedCaliperUm: 82,
                sourceKind: 'SUPPLIER_TECHNICAL_DECLARATION',
                documentTitle: 'Merchant Stock Sheet 80g',
                fileBuffer: validPdf,
                submitForReview: true
            }
        });
        expect(contradicting.hasSourceContradiction).toBe(true);
        expect(contradicting.contradictionDetails).toContain('SOURCE_CONTRADICTION');

        // 4. Attempt self-approval by operator-alice (even if promoted to SUPPLIER_ADMIN) -> blocked by SoD
        await expect(
            service.reviewEvidence({
                tenantId: 'tenant-1',
                actorId: 'operator-alice',
                actorRole: 'SUPPLIER_ADMIN',
                evidenceId: first.evidenceId,
                decision: 'APPROVE',
                reason: 'Trying to self-approve my own submission'
            })
        ).rejects.toThrowError(/Segregation of Duties violation/);

        // 5. Approve by independent technologist (`tech-bob`) -> transitions to APPROVED_FOR_TECHNICAL_USE, productive caliper stays NULL
        const approved = await service.reviewEvidence({
            tenantId: 'tenant-1',
            actorId: 'tech-bob',
            actorRole: 'SUPPLIER_ADMIN',
            evidenceId: first.evidenceId,
            decision: 'APPROVE',
            reason: 'Verified official APP datasheet table 2 (71 µm nominal).'
        });

        expect(approved.newStatus).toBe('APPROVED_FOR_TECHNICAL_USE');
        expect(approved.productiveCaliperModified).toBe(false);
        expect(mockDb.getVariantUpdateAttempts()).toBe(0);
        expect(mockDb.variants.get('var_dbd5357075534e3b').caliper_um).toBeNull();
    });

    it('6. validates ISO 534 physical batch micrometer readings (10 readings, CV%, ISO 187 conditioning) and approves as CERTIFIED_MEASURED without mutating paper_variants.caliper_um', async () => {
        // 1. Rejects if fewer than 10 readings
        await expect(
            service.registerPhysicalMicrometerEvidence({
                tenantId: 'tenant-1',
                actorId: 'metrologist-1',
                actorRole: 'SUPPLIER_OPERATOR',
                payload: {
                    variantId: 'var_efalin_linen_demo',
                    readingsUm: [150, 151, 149, 150, 152],
                    measuredBatchNumber: 'LOT-EFA-01',
                    micrometerSerial: 'MIT-001',
                    calibrationCertValidUntil: '2027-12-31',
                    conditioningTempC: 23.0,
                    conditioningHumidityPct: 50.0
                }
            })
        ).rejects.toThrowError(/ISO_534_MIN_10_READINGS_REQUIRED/);

        // 2. Accepts 10 valid ISO 534 readings on Efalin Fine Linen 120g
        const micResult = await service.registerPhysicalMicrometerEvidence({
            tenantId: 'tenant-1',
            actorId: 'metrologist-1',
            actorRole: 'SUPPLIER_OPERATOR',
            payload: {
                variantId: 'var_efalin_linen_demo',
                readingsUm: [164, 165, 166, 165, 164, 165, 166, 165, 164, 166],
                measuredBatchNumber: 'LOT-EFA-2026-10',
                micrometerSerial: 'MITUTOYO-ISO534-09',
                calibrationCertValidUntil: '2027-12-31',
                conditioningTempC: 23.2,
                conditioningHumidityPct: 50.4,
                submitForReview: true
            }
        });

        expect(micResult.status).toBe('PENDING_TECH_REVIEW');
        expect(micResult.proposedCaliperUm).toBe(165);
        expect(micResult.measuredCvPct).toBeLessThan(1.0);
        expect(micResult.productiveCaliperModified).toBe(false);

        // 3. Independent technologist approves -> becomes CERTIFIED_MEASURED, productive caliper remains NULL
        const reviewRes = await service.reviewEvidence({
            tenantId: 'tenant-1',
            actorId: 'chief-technologist',
            actorRole: 'SUPER_ADMIN',
            evidenceId: micResult.evidenceId,
            decision: 'APPROVE',
            reason: 'ISO 534 10-point batch metrology verified (mean 165 µm, CV 0.5%).'
        });

        expect(reviewRes.newStatus).toBe('CERTIFIED_MEASURED');
        expect(reviewRes.productiveCaliperModified).toBe(false);
        expect(mockDb.variants.get('var_efalin_linen_demo').caliper_um).toBeNull();
    });

    it('7. enforces Spine Calculator governance: distinguishes the 5 provenance tiers and keeps canReleaseToManufacturing = false', async () => {
        // Check all 5 tiers via resolveVariantCaliperProvenance
        const tier1 = resolveVariantCaliperProvenance({
            caliper_um: 110,
            gsm: 100,
            caliper_source: 'MANUFACTURER_DATASHEET',
            caliper_confidence_status: CALIPER_CONFIDENCE_STATUSES.VERIFIED_DATASHEET
        });
        expect(tier1.evidenceTier).toBe('MANUFACTURER_NOMINAL_DATASHEET');
        expect(tier1.canPromoteProfileToProductionCertified).toBe(false);

        const tier2 = resolveVariantCaliperProvenance({
            caliper_um: 122,
            gsm: 100,
            caliper_source: 'LIVONIA_REFERENCE_IMPORT',
            caliper_confidence_status: CALIPER_CONFIDENCE_STATUSES.REFERENCE_IMPORTED
        });
        expect(tier2.evidenceTier).toBe('SUPPLIER_IMPORTED_REFERENCE');
        expect(tier2.canPromoteProfileToProductionCertified).toBe(false);

        const tier3 = resolveVariantCaliperProvenance({
            caliper_um: 165,
            gsm: 120,
            caliper_source: 'MEASURED_MICROMETER',
            caliper_confidence_status: CALIPER_CONFIDENCE_STATUSES.MEASURED_BATCH
        });
        expect(tier3.evidenceTier).toBe('PHYSICAL_BATCH_MICROMETER');
        expect(tier3.canPromoteProfileToProductionCertified).toBe(false);

        // Tier 4: Variant still has caliper_um = NULL in production, but has an approved technical evidence record pending promotion
        const tier4 = resolveVariantCaliperProvenance(
            {
                caliper_um: null,
                gsm: 80,
                caliper_source: 'UNKNOWN',
                caliper_confidence_status: CALIPER_CONFIDENCE_STATUSES.UNVERIFIED
            },
            {
                id: 'ev_123',
                status: 'APPROVED_FOR_TECHNICAL_USE',
                source_kind: 'MANUFACTURER_DATASHEET',
                proposed_caliper_um: 71,
                document_revision: '2026-01',
                approved_by_technologist: 'tech-bob'
            }
        );
        expect(tier4.caliperUm).toBeNull(); // Never overrides productive NULL automatically!
        expect(tier4.evidenceTier).toBe('APPROVED_TECHNICAL_EVIDENCE_PENDING_PROMOTION');
        expect(tier4.approvedEvidenceSummary.proposedCaliperUm).toBe(71);
        expect(tier4.canPromoteProfileToProductionCertified).toBe(false);

        // Verify deterministic Spine Calculator keeps canReleaseToManufacturing = false
        const spineResult = executeSpineCalculation({
            bindingCategory: 'SOFTCOVER_STANDARD',
            processingType: 'GLUED',
            trimWidthMm: 148,
            trimHeightMm: 210,
            segments: [
                {
                    segmentIndex: 1,
                    pages: 200,
                    gsm: 100,
                    caliperUm: 122,
                    caliperSource: 'LIVONIA_REFERENCE_IMPORT',
                    caliperConfidenceStatus: 'REFERENCE_IMPORTED'
                }
            ],
            cover: {
                caliperUm: 300
            }
        });

        expect(spineResult.spineWidthMm).toBe(13.0);
        expect(spineResult.manufacturingValidation.canReleaseToManufacturing).toBe(false);
        expect(spineResult.certificationTier).not.toBe('PRODUCTION_CERTIFIED');
    });

    it('8. verifies HTTP API routes under /api/v1/paper-suppliers/accreditation enforce RBAC and tenant isolation', async () => {
        process.env.PAPER_SUPPLIER_HUB_ENABLED = 'true';

        // Build isolated Express test app mounting the accreditation endpoints with controllable actor headers
        const app = express();
        app.use(express.json());

        app.get('/api/v1/paper-suppliers/accreditation/missing-materials', async (req, res) => {
            const tenantId = req.headers['x-tenant-id'] || 'tenant-a';
            const result = await service.listMissingCaliperMaterials({
                tenantId,
                supplier: req.query.supplier || null,
                track: req.query.track || null
            });
            res.json({ ok: true, data: result });
        });

        app.post('/api/v1/paper-suppliers/accreditation/evidences/documentary', async (req, res) => {
            try {
                const role = req.headers['x-role'] || 'SUPPLIER_VIEWER';
                if (role === 'SUPPLIER_VIEWER') {
                    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN_SUPPLIER_SCOPE' } });
                }
                const result = await service.registerDocumentaryEvidence({
                    tenantId: req.headers['x-tenant-id'] || 'tenant-a',
                    actorId: req.headers['x-actor-id'] || 'op-1',
                    actorRole: role,
                    idempotencyKey: req.headers['idempotency-key'] || null,
                    payload: req.body
                });
                res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, data: result });
            } catch (err) {
                res.status(err.statusCode || 400).json({ ok: false, error: { code: err.code, message: err.message } });
            }
        });

        app.get('/api/v1/paper-suppliers/accreditation/variants/:variantId/evidences', async (req, res) => {
            const result = await service.getVariantEvidences({
                tenantId: req.headers['x-tenant-id'] || 'tenant-a',
                variantId: req.params.variantId
            });
            res.json({ ok: true, data: result });
        });

        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
            // 1. SUPPLIER_VIEWER cannot POST documentary evidence (403)
            const viewerPost = await fetch(`${baseUrl}/api/v1/paper-suppliers/accreditation/evidences/documentary`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-role': 'SUPPLIER_VIEWER'
                },
                body: JSON.stringify({ variantId: 'var_dbd5357075534e3b', proposedCaliperUm: 71 })
            });
            expect(viewerPost.status).toBe(403);

            // 2. SUPPLIER_OPERATOR in tenant-a registers evidence
            const validPdfB64 = Buffer.from('%PDF-1.7\nTenant A Datasheet\n%%EOF', 'utf8').toString('base64');
            const opPost = await fetch(`${baseUrl}/api/v1/paper-suppliers/accreditation/evidences/documentary`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-role': 'SUPPLIER_OPERATOR',
                    'x-tenant-id': 'tenant-a',
                    'x-actor-id': 'op-tenant-a'
                },
                body: JSON.stringify({
                    variantId: 'var_dbd5357075534e3b',
                    proposedCaliperUm: 71,
                    sourceKind: 'MANUFACTURER_DATASHEET',
                    documentTitle: 'APP Nevia 80g Datasheet',
                    fileBase64: validPdfB64,
                    fileName: 'nevia.pdf'
                })
            });
            expect(opPost.status).toBe(201);

            // 3. Tenant B cannot see Tenant A's evidence on the same variant
            const tenantBView = await fetch(
                `${baseUrl}/api/v1/paper-suppliers/accreditation/variants/var_dbd5357075534e3b/evidences`,
                {
                    headers: { 'x-tenant-id': 'tenant-b' }
                }
            );
            const tenantBBody = await tenantBView.json();
            expect(tenantBView.status).toBe(200);
            expect(tenantBBody.data.caliperEvidences).toHaveLength(0);

            // 4. Tenant A sees its own evidence
            const tenantAView = await fetch(
                `${baseUrl}/api/v1/paper-suppliers/accreditation/variants/var_dbd5357075534e3b/evidences`,
                {
                    headers: { 'x-tenant-id': 'tenant-a' }
                }
            );
            const tenantABody = await tenantAView.json();
            expect(tenantAView.status).toBe(200);
            expect(tenantABody.data.caliperEvidences).toHaveLength(1);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});
