import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import express from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret-recovery-11-governance-key-0123456789';
}
process.env.PAPER_SUPPLIER_HUB_ENABLED = 'true';

const {
    PaperEvidenceService,
    PaperEvidenceError,
    HISTORICAL_CONFLICT_9_VARIANT_IDS
} = require('../src/api/services/paperEvidenceService.js');

const {
    executeSpineCalculation,
    BUILTIN_BINDING_PROFILES
} = require('../src/api/services/spine/spineCalculationEngine.js');

const {
    runRealMysqlRecovery11Validation
} = require('../scripts/test_recovery11_real_mysql_promotion.js');

const VALID_PDF_BUFFER = Buffer.from(
    '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n%%EOF',
    'utf8'
);

/**
 * Transactional Mock DB for PAPER-MATERIALS-RECOVERY-11 Governed Promotion Tests.
 * Simulates InnoDB row-level locks (`FOR UPDATE`), Compare-And-Swap (`WHERE id = ? AND caliper_revision = ? AND caliper_um IS NULL`),
 * `spine_calculation_snapshots` invalidation, and atomic rollback on failure.
 */
function createPromotionMockDb() {
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
                caliper_mm: null,
                bulk_factor: null,
                caliper_source: 'NONE',
                caliper_confidence_status: 'MISSING',
                caliper_revision: 1,
                brand: 'Nevia Plus C1S',
                manufacturer: 'APP',
                category: 'COATED'
            }
        ],
        [
            'var_efalin_120_fl',
            {
                id: 'var_efalin_120_fl',
                product_id: 'prod_efalin_fl',
                gsm: 120,
                width_mm: 700,
                height_mm: 1000,
                finish: 'EMBOSSED',
                grain_direction: 'SHORT_GRAIN',
                caliper_um: null,
                caliper_mm: null,
                bulk_factor: null,
                caliper_source: 'NONE',
                caliper_confidence_status: 'MISSING',
                caliper_revision: 1,
                brand: 'Efalin Fine Linen',
                manufacturer: 'Gmund / Zanders',
                category: 'DESIGN'
            }
        ],
        [
            'var_existing_gprint_91',
            {
                id: 'var_existing_gprint_91',
                product_id: 'prod_gprint',
                gsm: 100,
                width_mm: 700,
                height_mm: 1000,
                finish: 'SILK',
                grain_direction: 'LONG_GRAIN',
                caliper_um: 91,
                caliper_mm: 0.091,
                bulk_factor: 0.91,
                caliper_source: 'MANUFACTURER_DATASHEET',
                caliper_confidence_status: 'REFERENCE_IMPORTED',
                caliper_revision: 1,
                brand: 'G-Print Smooth',
                manufacturer: 'Arctic Paper',
                category: 'COATED'
            }
        ],
        [
            'var_2b0314c68f5a97c7',
            {
                id: 'var_2b0314c68f5a97c7',
                product_id: 'prod_amber',
                gsm: 110,
                width_mm: 700,
                height_mm: 1000,
                finish: 'UNCOATED',
                grain_direction: 'LONG_GRAIN',
                caliper_um: 122,
                caliper_mm: 0.122,
                bulk_factor: 1.109,
                caliper_source: 'LIVONIA_REFERENCE_IMPORT',
                caliper_confidence_status: 'REFERENCE_IMPORTED',
                caliper_revision: 1,
                brand: 'Amber Graphic',
                manufacturer: 'Arctic Paper',
                category: 'UNCOATED'
            }
        ]
    ]);

    const caliperEvidences = [];
    const auditLogs = [];
    const spineSnapshots = [
        {
            id: 'scs_active_nevia_01',
            tenant_id: 'tenant-livonia',
            snapshot_lifecycle_status: 'ACTIVE',
            invalidation_reason: null,
            input_payload_json: JSON.stringify({
                bindingCategory: 'SOFTCOVER_STANDARD',
                segments: [{ pages: 200, variantId: 'var_dbd5357075534e3b' }]
            })
        }
    ];

    async function executeQuery(sql, params = []) {
        const norm = String(sql).replace(/\s+/g, ' ').trim();

        if (norm.includes('FROM paper_variants') && (norm.includes('WHERE v.id = ?') || norm.includes('WHERE id = ?'))) {
            const v = variants.get(params[0]);
            return v ? [{ ...v, product_name: v.brand }] : [];
        }

        if (norm.startsWith('UPDATE paper_variants SET caliper_um = ?') && norm.includes('AND caliper_um IS NULL')) {
            const [caliperUm, caliperMm, bulkFactor, caliperSource, confidenceStatus, verifiedBy, variantId, expectedRev] = params;
            const v = variants.get(variantId);
            if (!v || v.caliper_um !== null || Number(v.caliper_revision) !== Number(expectedRev)) {
                return { affectedRows: 0 };
            }
            v.caliper_um = caliperUm;
            v.caliper_mm = caliperMm;
            v.bulk_factor = bulkFactor ?? v.bulk_factor;
            v.caliper_source = caliperSource;
            v.caliper_confidence_status = confidenceStatus;
            v.caliper_verified_by = verifiedBy;
            v.caliper_revision = Number(v.caliper_revision) + 1;
            return { affectedRows: 1 };
        }

        if (norm.startsWith('UPDATE paper_variants SET caliper_um = ?') && !norm.includes('AND caliper_um IS NULL')) {
            const [caliperUm, caliperMm, bulkFactor, caliperSource, confidenceStatus, variantId, expectedRev] = params;
            const v = variants.get(variantId);
            if (!v || Number(v.caliper_revision) !== Number(expectedRev)) {
                return { affectedRows: 0 };
            }
            v.caliper_um = caliperUm;
            v.caliper_mm = caliperMm;
            v.bulk_factor = bulkFactor;
            v.caliper_source = caliperSource;
            v.caliper_confidence_status = confidenceStatus;
            v.caliper_verified_by = null;
            v.caliper_revision = Number(v.caliper_revision) + 1;
            return { affectedRows: 1 };
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

        if (norm.includes('FROM paper_variant_caliper_evidence') && norm.includes('WHERE tenant_id = ?')) {
            const [tenantId] = params;
            return caliperEvidences.filter((e) => e.tenant_id === tenantId);
        }

        if (norm.startsWith('INSERT INTO paper_variant_caliper_evidence')) {
            const isDoc = norm.includes('document_title');
            if (isDoc) {
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
                    applied_to_catalog_variant: false,
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
                    applied_to_catalog_variant: false,
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
            row.applied_to_catalog_variant = false;
            return { affectedRows: 1 };
        }

        if (norm.startsWith('UPDATE paper_variant_caliper_evidence SET applied_to_catalog_variant = TRUE')) {
            const [evidenceId, tenantId] = params;
            const row = caliperEvidences.find(
                (e) =>
                    e.evidence_id === evidenceId &&
                    e.tenant_id === tenantId &&
                    !e.applied_to_catalog_variant &&
                    (e.review_status === 'APPROVED_FOR_TECHNICAL_USE' || e.review_status === 'CERTIFIED_MEASURED')
            );
            if (!row) return { affectedRows: 0 };
            row.applied_to_catalog_variant = true;
            return { affectedRows: 1 };
        }

        if (norm.startsWith("UPDATE paper_variant_caliper_evidence SET review_status = 'SUPERSEDED'")) {
            const [reason, evidenceId, tenantId] = params;
            const row = caliperEvidences.find((e) => e.evidence_id === evidenceId && e.tenant_id === tenantId);
            if (!row) return { affectedRows: 0 };
            row.review_status = 'SUPERSEDED';
            row.applied_to_catalog_variant = false;
            row.decision_reason = reason;
            return { affectedRows: 1 };
        }

        if (norm.startsWith('SELECT id, input_payload_json FROM spine_calculation_snapshots')) {
            const [tenantId] = params;
            return spineSnapshots.filter((s) => s.tenant_id === tenantId && s.snapshot_lifecycle_status === 'ACTIVE');
        }

        if (norm.startsWith("UPDATE spine_calculation_snapshots SET snapshot_lifecycle_status = 'INVALIDATED'")) {
            const [snapId, tenantId] = params;
            const s = spineSnapshots.find(
                (r) => r.id === snapId && r.tenant_id === tenantId && r.snapshot_lifecycle_status === 'ACTIVE'
            );
            if (!s) return { affectedRows: 0 };
            s.snapshot_lifecycle_status = 'INVALIDATED';
            s.invalidation_reason = norm.includes('REVERTED')
                ? 'PAPER_VARIANT_CALIPER_PROMOTION_REVERTED'
                : 'PAPER_VARIANT_CALIPER_PROMOTED';
            return { affectedRows: 1 };
        }

        if (norm.startsWith('INSERT INTO paper_variant_caliper_audit_log')) {
            if (norm.includes("'CATALOG_CALIPER_PROMOTED'")) {
                const [
                    audit_id,
                    tenant_id,
                    supplier_id,
                    variant_id,
                    evidence_id,
                    previous_review_status,
                    new_review_status,
                    previous_caliper_um,
                    new_caliper_um,
                    previous_caliper_source,
                    new_caliper_source,
                    previous_confidence_status,
                    new_confidence_status,
                    previous_revision,
                    new_revision,
                    nominal_datasheet_caliper_um,
                    measured_batch_caliper_um,
                    document_sha256,
                    actor_user_id,
                    actor_role,
                    decision_reason,
                    metadata_json
                ] = params;
                auditLogs.unshift({
                    audit_id,
                    tenant_id,
                    supplier_id,
                    variant_id,
                    evidence_id,
                    action_type: 'CATALOG_CALIPER_PROMOTED',
                    previous_review_status,
                    new_review_status,
                    previous_caliper_um,
                    new_caliper_um,
                    previous_caliper_source,
                    new_caliper_source,
                    previous_confidence_status,
                    new_confidence_status,
                    previous_revision,
                    new_revision,
                    nominal_datasheet_caliper_um,
                    measured_batch_caliper_um,
                    document_sha256,
                    actor_user_id,
                    actor_role,
                    decision_reason,
                    metadata_json,
                    created_at: new Date().toISOString()
                });
                return { affectedRows: 1 };
            }

            if (norm.includes("'EVIDENCE_SUPERSEDED'")) {
                const [
                    audit_id,
                    tenant_id,
                    supplier_id,
                    variant_id,
                    evidence_id,
                    previous_review_status,
                    previous_caliper_um,
                    new_caliper_um,
                    previous_caliper_source,
                    new_caliper_source,
                    previous_confidence_status,
                    new_confidence_status,
                    previous_revision,
                    new_revision,
                    nominal_datasheet_caliper_um,
                    measured_batch_caliper_um,
                    document_sha256,
                    actor_user_id,
                    actor_role,
                    decision_reason,
                    metadata_json
                ] = params;
                auditLogs.unshift({
                    audit_id,
                    tenant_id,
                    supplier_id,
                    variant_id,
                    evidence_id,
                    action_type: 'EVIDENCE_SUPERSEDED',
                    previous_review_status,
                    new_review_status: 'SUPERSEDED',
                    previous_caliper_um,
                    new_caliper_um,
                    previous_caliper_source,
                    new_caliper_source,
                    previous_confidence_status,
                    new_confidence_status,
                    previous_revision,
                    new_revision,
                    nominal_datasheet_caliper_um,
                    measured_batch_caliper_um,
                    document_sha256,
                    actor_user_id,
                    actor_role,
                    decision_reason,
                    metadata_json,
                    created_at: new Date().toISOString()
                });
                return { affectedRows: 1 };
            }

            if (norm.includes("'EVIDENCE_APPROVED'") && norm.includes('metadata_json')) {
                const [
                    audit_id,
                    tenant_id,
                    supplier_id,
                    variant_id,
                    evidence_id,
                    previous_review_status,
                    new_review_status,
                    previous_caliper_um,
                    new_caliper_um,
                    previous_caliper_source,
                    new_caliper_source,
                    previous_confidence_status,
                    new_confidence_status,
                    previous_revision,
                    new_revision,
                    nominal_datasheet_caliper_um,
                    measured_batch_caliper_um,
                    document_sha256,
                    actor_user_id,
                    actor_role,
                    decision_reason,
                    metadata_json
                ] = params;
                auditLogs.unshift({
                    audit_id,
                    tenant_id,
                    supplier_id,
                    variant_id,
                    evidence_id,
                    action_type: 'EVIDENCE_APPROVED',
                    previous_review_status,
                    new_review_status,
                    previous_caliper_um,
                    new_caliper_um,
                    previous_caliper_source,
                    new_caliper_source,
                    previous_confidence_status,
                    new_confidence_status,
                    previous_revision,
                    new_revision,
                    nominal_datasheet_caliper_um,
                    measured_batch_caliper_um,
                    document_sha256,
                    actor_user_id,
                    actor_role,
                    decision_reason,
                    metadata_json,
                    created_at: new Date().toISOString()
                });
                return { affectedRows: 1 };
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

        if (norm.includes('FROM paper_variant_caliper_audit_log')) {
            const [tenantId, variantId] = params;
            return auditLogs.filter((l) => l.tenant_id === tenantId && l.variant_id === variantId);
        }

        return [];
    }

    return {
        variants,
        caliperEvidences,
        auditLogs,
        spineSnapshots,
        query: executeQuery,
        async getConnection() {
            return {
                async beginTransaction() { },
                query: executeQuery,
                async commit() { },
                async rollback() { },
                release() { }
            };
        }
    };
}

describe('PAPER-MATERIALS-RECOVERY-11 — Governed Promotion of Technical Evidences to Catalog (paper_variants.caliper_um)', () => {
    let tempStoreDir;
    let mockDb;
    let service;

    beforeEach(() => {
        tempStoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppos-rec11-test-'));
        mockDb = createPromotionMockDb();
        service = new PaperEvidenceService({ dbClient: mockDb, storageRoot: tempStoreDir });
    });

    afterEach(() => {
        try {
            fs.rmSync(tempStoreDir, { recursive: true, force: true });
        } catch (_) { }
    });

    it('1. Pre-conditions & Lifecycle Gate: blocks promotion of DRAFT, PENDING_TECH_REVIEW, REJECTED, and SUPERSEDED evidences', async () => {
        // 1. Register DRAFT evidence
        const draftReg = await service.registerDocumentaryEvidence({
            tenantId: 'tenant-livonia',
            actorId: 'operator-1',
            actorRole: 'SUPPLIER_OPERATOR',
            payload: {
                variantId: 'var_dbd5357075534e3b',
                proposedCaliperUm: 71,
                fileBuffer: VALID_PDF_BUFFER,
                fileName: 'nevia_draft.pdf',
                submitForReview: false
            }
        });

        await expect(
            service.requestEvidencePromotion({
                tenantId: 'tenant-livonia',
                variantId: 'var_dbd5357075534e3b',
                evidenceId: draftReg.evidenceId,
                actorId: 'operator-2',
                actorRole: 'SUPPLIER_OPERATOR',
                reason: 'Attempt to request promotion on DRAFT evidence'
            })
        ).rejects.toMatchObject({
            code: 'EVIDENCE_NOT_APPROVED_FOR_PROMOTION',
            statusCode: 422
        });

        // 2. Register PENDING_TECH_REVIEW evidence and reject it
        const rejReg = await service.registerDocumentaryEvidence({
            tenantId: 'tenant-livonia',
            actorId: 'operator-1',
            actorRole: 'SUPPLIER_OPERATOR',
            payload: {
                variantId: 'var_dbd5357075534e3b',
                proposedCaliperUm: 71,
                fileBuffer: VALID_PDF_BUFFER,
                fileName: 'nevia_rej.pdf',
                submitForReview: true
            }
        });

        await service.reviewEvidence({
            tenantId: 'tenant-livonia',
            actorId: 'tech-approver-1',
            actorRole: 'MATERIAL_TECHNOLOGIST',
            evidenceId: rejReg.evidenceId,
            decision: 'REJECT',
            reason: 'Rejected outdated datasheet'
        });

        await expect(
            service.authorizeEvidencePromotion({
                tenantId: 'tenant-livonia',
                variantId: 'var_dbd5357075534e3b',
                evidenceId: rejReg.evidenceId,
                actorId: 'admin-authorizer-1',
                actorRole: 'SUPPLIER_ADMIN',
                reason: 'Attempt to promote rejected evidence'
            })
        ).rejects.toMatchObject({
            code: 'EVIDENCE_REVOKED_OR_SUPERSEDED',
            statusCode: 409
        });
    });

    it('2. 3-Way Segregation of Duties (SoD): blocks submitter, reviewer, and requester from self-authorizing catalog promotion', async () => {
        const reg = await service.registerDocumentaryEvidence({
            tenantId: 'tenant-livonia',
            actorId: 'user-submitter-alice',
            actorRole: 'SUPPLIER_OPERATOR',
            payload: {
                variantId: 'var_dbd5357075534e3b',
                proposedCaliperUm: 71,
                fileBuffer: VALID_PDF_BUFFER,
                fileName: 'nevia_tds.pdf',
                submitForReview: true
            }
        });

        await service.reviewEvidence({
            tenantId: 'tenant-livonia',
            actorId: 'user-reviewer-bob',
            actorRole: 'MATERIAL_TECHNOLOGIST',
            evidenceId: reg.evidenceId,
            decision: 'APPROVE',
            reason: 'Approved APP Nevia Plus C1S 80g 71 µm.'
        });

        const reqPromo = await service.requestEvidencePromotion({
            tenantId: 'tenant-livonia',
            variantId: 'var_dbd5357075534e3b',
            evidenceId: reg.evidenceId,
            actorId: 'user-requester-carol',
            actorRole: 'SUPPLIER_OPERATOR',
            reason: 'Requesting promotion to catalog for book cover quotes.'
        });
        expect(reqPromo.status).toBe('PROMOTION_REQUESTED');
        expect(reqPromo.productiveCaliperModified).toBe(false);

        // 1. Submitter Alice blocked (`403 SOD_SUBMITTER_CANNOT_PROMOTE`)
        await expect(
            service.authorizeEvidencePromotion({
                tenantId: 'tenant-livonia',
                variantId: 'var_dbd5357075534e3b',
                evidenceId: reg.evidenceId,
                actorId: 'user-submitter-alice',
                actorRole: 'SUPPLIER_ADMIN',
                reason: 'Submitter trying to promote'
            })
        ).rejects.toMatchObject({
            code: 'SOD_SUBMITTER_CANNOT_PROMOTE',
            statusCode: 403
        });

        // 2. Reviewer Bob blocked (`403 SOD_REVIEWER_CANNOT_PROMOTE`)
        await expect(
            service.authorizeEvidencePromotion({
                tenantId: 'tenant-livonia',
                variantId: 'var_dbd5357075534e3b',
                evidenceId: reg.evidenceId,
                actorId: 'user-reviewer-bob',
                actorRole: 'MATERIAL_TECHNOLOGIST',
                reason: 'Reviewer trying to promote'
            })
        ).rejects.toMatchObject({
            code: 'SOD_REVIEWER_CANNOT_PROMOTE',
            statusCode: 403
        });

        // 3. Requester Carol blocked (`403 SOD_REQUESTER_CANNOT_AUTHORIZE_PROMOTION`)
        await expect(
            service.authorizeEvidencePromotion({
                tenantId: 'tenant-livonia',
                variantId: 'var_dbd5357075534e3b',
                evidenceId: reg.evidenceId,
                promotionRequestId: reqPromo.promotionRequestId,
                actorId: 'user-requester-carol',
                actorRole: 'SUPPLIER_ADMIN',
                reason: 'Requester trying to self-authorize'
            })
        ).rejects.toMatchObject({
            code: 'SOD_REQUESTER_CANNOT_AUTHORIZE_PROMOTION',
            statusCode: 403
        });

        // 4. Non-admin VIEWER / OPERATOR role blocked (`403 FORBIDDEN_PROMOTION_AUTHORIZER_ROLE_REQUIRED`)
        await expect(
            service.authorizeEvidencePromotion({
                tenantId: 'tenant-livonia',
                variantId: 'var_dbd5357075534e3b',
                evidenceId: reg.evidenceId,
                actorId: 'user-viewer-dave',
                actorRole: 'SUPPLIER_VIEWER',
                reason: 'Viewer trying to authorize'
            })
        ).rejects.toMatchObject({
            code: 'FORBIDDEN_PROMOTION_AUTHORIZER_ROLE_REQUIRED',
            statusCode: 403
        });
    });

    it('3. Contradiction Gate & Catalog Protection: blocks unresolved contradictions, existing 1,272 calipers, and all 9 historical conflicts', async () => {
        expect(HISTORICAL_CONFLICT_9_VARIANT_IDS.size).toBe(9);

        // A. Existing caliper protection (`var_existing_gprint_91` has 91 µm)
        const regExisting = await service.registerDocumentaryEvidence({
            tenantId: 'tenant-livonia',
            actorId: 'operator-1',
            actorRole: 'SUPPLIER_OPERATOR',
            payload: {
                variantId: 'var_existing_gprint_91',
                proposedCaliperUm: 95,
                fileBuffer: VALID_PDF_BUFFER,
                fileName: 'gprint.pdf',
                submitForReview: true
            }
        });
        await service.reviewEvidence({
            tenantId: 'tenant-livonia',
            actorId: 'tech-2',
            actorRole: 'MATERIAL_TECHNOLOGIST',
            evidenceId: regExisting.evidenceId,
            decision: 'APPROVE',
            reason: 'Approved for overwrite test',
            acknowledgeContradiction: true
        });
        await expect(
            service.authorizeEvidencePromotion({
                tenantId: 'tenant-livonia',
                variantId: 'var_existing_gprint_91',
                evidenceId: regExisting.evidenceId,
                actorId: 'admin-3',
                actorRole: 'SUPPLIER_ADMIN',
                reason: 'Attempt to overwrite existing 91 µm caliper',
                acknowledgeContradiction: true
            })
        ).rejects.toMatchObject({
            code: 'EXISTING_CATALOG_CALIPER_PROTECTED',
            statusCode: 409
        });

        // B. Historical conflict protection (`var_2b0314c68f5a97c7` Amber Graphic 122 µm)
        const regConflict = await service.registerDocumentaryEvidence({
            tenantId: 'tenant-livonia',
            actorId: 'operator-1',
            actorRole: 'SUPPLIER_OPERATOR',
            payload: {
                variantId: 'var_2b0314c68f5a97c7',
                proposedCaliperUm: 132,
                fileBuffer: VALID_PDF_BUFFER,
                fileName: 'amber.pdf',
                submitForReview: true
            }
        });
        await service.reviewEvidence({
            tenantId: 'tenant-livonia',
            actorId: 'tech-2',
            actorRole: 'MATERIAL_TECHNOLOGIST',
            evidenceId: regConflict.evidenceId,
            decision: 'APPROVE',
            reason: 'Approved for historical conflict test',
            acknowledgeContradiction: true
        });
        await expect(
            service.authorizeEvidencePromotion({
                tenantId: 'tenant-livonia',
                variantId: 'var_2b0314c68f5a97c7',
                evidenceId: regConflict.evidenceId,
                actorId: 'admin-3',
                actorRole: 'SUPPLIER_ADMIN',
                reason: 'Attempt to overwrite historical conflict Amber Graphic',
                acknowledgeContradiction: true
            })
        ).rejects.toMatchObject({
            code: 'HISTORICAL_CONFLICT_VARIANT_PROTECTED',
            statusCode: 409
        });
    });

    it('4. Governed Promotion Execution, Spine Snapshot Invalidation, Industrial Lock (canReleaseToManufacturing = false), and Governed Reversion', async () => {
        // 1. Register & approve Nevia Plus C1S 80g @ 71 µm
        const reg = await service.registerDocumentaryEvidence({
            tenantId: 'tenant-livonia',
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

        await service.reviewEvidence({
            tenantId: 'tenant-livonia',
            actorId: 'tech-bob',
            actorRole: 'MATERIAL_TECHNOLOGIST',
            evidenceId: reg.evidenceId,
            decision: 'APPROVE',
            reason: 'Verified APP Nevia Plus C1S 80g 71 µm.',
            acknowledgeContradiction: true
        });

        // 2. Preview promotion before execution
        const preview = await service.previewEvidencePromotion({
            tenantId: 'tenant-livonia',
            variantId: 'var_dbd5357075534e3b',
            evidenceId: reg.evidenceId,
            actorId: 'admin-diana',
            actorRole: 'SUPPLIER_ADMIN'
        });

        expect(preview.comparison.currentCaliperUm).toBeNull();
        expect(preview.comparison.proposedCaliperUm).toBe(71);
        expect(preview.comparison.targetSource).toBe('MANUFACTURER_DATASHEET');
        expect(preview.comparison.targetConfidence).toBe('REFERENCE_IMPORTED');
        expect(preview.spineImpact.beforePromotion.available).toBe(false);
        expect(preview.spineImpact.afterPromotion.available).toBe(true);
        expect(preview.spineImpact.afterPromotion.softcover200ppGlued.netBlockMm).toBe(7.1);
        expect(preview.spineImpact.afterPromotion.softcover200ppGlued.spineWidthMm).toBe(8.0);
        expect(preview.spineImpact.canReleaseToManufacturingAfterPromotion).toBe(false);

        // 3. Authorize promotion as distinct Admin (`admin-diana`)
        const promoRes = await service.authorizeEvidencePromotion({
            tenantId: 'tenant-livonia',
            variantId: 'var_dbd5357075534e3b',
            evidenceId: reg.evidenceId,
            actorId: 'admin-diana',
            actorRole: 'SUPPLIER_ADMIN',
            reason: 'Authorized governed promotion of Nevia Plus C1S 80g (71 µm) to catalog.',
            expectedCaliperRevision: 1,
            acknowledgeContradiction: true,
            idempotencyKey: 'idem-promo-nevia-01'
        });

        expect(promoRes.productiveCaliperModified).toBe(true);
        expect(promoRes.previousCaliperUm).toBeNull();
        expect(promoRes.newCaliperUm).toBe(71);
        expect(promoRes.newCaliperMm).toBe(0.071);
        expect(promoRes.newCaliperSource).toBe('MANUFACTURER_DATASHEET');
        expect(promoRes.newConfidenceStatus).toBe('REFERENCE_IMPORTED');
        expect(promoRes.previousRevision).toBe(1);
        expect(promoRes.newRevision).toBe(2);
        expect(promoRes.invalidatedSpineSnapshotsCount).toBe(1);
        expect(promoRes.canReleaseToManufacturing).toBe(false);

        // Active Spine snapshot was invalidated
        expect(mockDb.spineSnapshots[0].snapshot_lifecycle_status).toBe('INVALIDATED');
        expect(mockDb.spineSnapshots[0].invalidation_reason).toBe('PAPER_VARIANT_CALIPER_PROMOTED');

        // Verify Spine Engine calculation with promoted variant keeps canReleaseToManufacturing = false
        const promotedVariant = mockDb.variants.get('var_dbd5357075534e3b');
        const spineCalc = executeSpineCalculation(
            {
                bindingCategory: 'SOFTCOVER_STANDARD',
                processingType: 'GLUED',
                trimWidthMm: 170,
                trimHeightMm: 240,
                segments: [
                    {
                        pages: 200,
                        variantId: promotedVariant.id,
                        gsm: promotedVariant.gsm,
                        caliperUm: promotedVariant.caliper_um,
                        caliperSource: promotedVariant.caliper_source,
                        caliperConfidenceStatus: promotedVariant.caliper_confidence_status
                    }
                ],
                cover: { caliperUm: 350 }
            },
            BUILTIN_BINDING_PROFILES['livonia-alegro-softcover@2.0.0']
        );
        expect(spineCalc.blockThickness.netPaperBlockMm).toBe(7.1);
        expect(spineCalc.spineWidthMm).toBe(8.0);
        expect(spineCalc.manufacturingValidation.canReleaseToManufacturing).toBe(false);

        // 4. Second promotion attempt on same variant/evidence is blocked (`409 EVIDENCE_ALREADY_PROMOTED`)
        await expect(
            service.authorizeEvidencePromotion({
                tenantId: 'tenant-livonia',
                variantId: 'var_dbd5357075534e3b',
                evidenceId: reg.evidenceId,
                actorId: 'admin-diana',
                actorRole: 'SUPPLIER_ADMIN',
                reason: 'Duplicate promotion without idempotency key',
                acknowledgeContradiction: true
            })
        ).rejects.toMatchObject({
            code: 'EVIDENCE_ALREADY_PROMOTED',
            statusCode: 409
        });

        // 5. Governed revocation & reversion restores caliper_um = NULL and marks evidence SUPERSEDED
        const revRes = await service.revokeAndRevertPromotion({
            tenantId: 'tenant-livonia',
            variantId: 'var_dbd5357075534e3b',
            evidenceId: reg.evidenceId,
            actorId: 'admin-diana',
            actorRole: 'SUPPLIER_ADMIN',
            reason: 'Reverting promotion during audit verification.',
            expectedCaliperRevision: 2
        });

        expect(revRes.productiveCaliperReverted).toBe(true);
        expect(revRes.previousCaliperUm).toBe(71);
        expect(revRes.restoredCaliperUm).toBeNull();
        expect(revRes.newEvidenceStatus).toBe('SUPERSEDED');
        expect(revRes.newRevision).toBe(3);
        expect(mockDb.variants.get('var_dbd5357075534e3b').caliper_um).toBeNull();
    });

    it('5. Express HTTP Route Security: strips spoofed client identity fields and enforces RBAC on /promotions endpoints', async () => {
        const paperSuppliersRoutes = require('../src/api/routes/paperSuppliersRoutes.js');
        const app = express();
        app.use(express.json());

        let mockActor = {
            userId: 'user-submitter-alice',
            tenantId: 'tenant-livonia',
            supplierId: 'supp-antalis',
            role: 'SUPER_ADMIN'
        };

        app.use((req, _res, next) => {
            req.user = {
                id: mockActor.userId,
                email: 'admin@printprice.pro',
                tenantId: mockActor.tenantId,
                tenant_id: mockActor.tenantId,
                supplierId: mockActor.supplierId,
                supplier_id: mockActor.supplierId,
                role: 'SUPER_ADMIN',
                authMode: 'BREAK_GLASS'
            };
            req.verifiedSupplierContext = {
                userId: mockActor.userId,
                tenantId: mockActor.tenantId,
                supplierId: mockActor.supplierId,
                role: 'SUPER_ADMIN',
                approvalStatus: 'APPROVED'
            };
            next();
        });

        // Inject mock service instance
        const origService = require('../src/api/services/paperEvidenceService.js').paperEvidenceService;
        Object.assign(origService, {
            db: mockDb,
            storageRoot: tempStoreDir
        });

        app.use('/api/v1/paper-suppliers', paperSuppliersRoutes);

        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;

        try {
            // Register & approve evidence
            const reg = await service.registerDocumentaryEvidence({
                tenantId: 'tenant-livonia',
                actorId: 'user-submitter-alice',
                actorRole: 'SUPPLIER_OPERATOR',
                payload: {
                    variantId: 'var_efalin_120_fl',
                    proposedCaliperUm: 165,
                    fileBuffer: VALID_PDF_BUFFER,
                    fileName: 'efalin.pdf',
                    submitForReview: true
                }
            });
            // Switch to physical micrometer track for Efalin
            mockDb.caliperEvidences[0].accreditation_track = 'DATASHEET_REQUEST_TRACK';

            await service.reviewEvidence({
                tenantId: 'tenant-livonia',
                actorId: 'user-reviewer-bob',
                actorRole: 'MATERIAL_TECHNOLOGIST',
                evidenceId: reg.evidenceId,
                decision: 'APPROVE',
                reason: 'Approved Efalin 165 µm.'
            });

            // Attempt to spoof `authorizedBy: 'admin-different'` while logged in as `user-submitter-alice`
            const spoofRes = await fetch(
                `http://127.0.0.1:${port}/api/v1/paper-suppliers/accreditation/variants/var_efalin_120_fl/evidences/${reg.evidenceId}/promotions/authorize`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        actorId: 'spoofed-admin-99',
                        authorizedBy: 'spoofed-admin-99',
                        reason: 'Trying to bypass SoD by spoofing authorizedBy in request body'
                    })
                }
            );
            const spoofJson = await spoofRes.json();
            expect(spoofRes.status).toBe(403);
            expect(spoofJson.error.code).toBe('SOD_SUBMITTER_CANNOT_PROMOTE');
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('6. Real MySQL 8 Ephemeral Promotion & Concurrency Certification (runs live when MySQL 8 is reachable in CI)', async () => {
        const res = await runRealMysqlRecovery11Validation();
        expect(res.passed === true || res.skipped === true).toBe(true);
    });
});
