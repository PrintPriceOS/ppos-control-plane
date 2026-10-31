import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret-recovery-12-classification-key-0123456789';
}
process.env.PAPER_SUPPLIER_HUB_ENABLED = 'true';

const {
    PaperEvidenceService,
    PaperEvidenceError
} = require('../src/api/services/paperEvidenceService.js');

const {
    resolveVariantTechnicalAttributes
} = require('../src/api/services/paperMaterialsNormalizationService.js');

const VALID_PDF_SHA256 = crypto.createHash('sha256').update('%PDF-1.7-test-classification-tds').digest('hex');

function createClassificationMockDb() {
    const products = new Map([
        [
            'prod_ca3c74d6d9e341f3',
            {
                id: 'prod_ca3c74d6d9e341f3',
                name: 'IQ Print 100 88x63 FSC',
                brand: 'Mondi',
                manufacturer: 'Mondi',
                category: 'OTHER',
                finish_summary: null,
                metadata_json: JSON.stringify({})
            }
        ],
        [
            'prod_0f8c631b9debbb56',
            {
                id: 'prod_0f8c631b9debbb56',
                name: 'Arctic Volume Ice 130 63x88 FSC',
                brand: 'Arctic Paper',
                manufacturer: 'Arctic Paper',
                category: 'OTHER',
                finish_summary: null,
                metadata_json: JSON.stringify({})
            }
        ],
        [
            'prod_ef1c9f209b0dc5d5',
            {
                id: 'prod_ef1c9f209b0dc5d5',
                name: 'Ensocoat 1s 250 70x100',
                brand: 'Stora Enso',
                manufacturer: 'Stora Enso',
                category: 'OTHER',
                finish_summary: null,
                metadata_json: JSON.stringify({})
            }
        ]
    ]);

    const variants = new Map([
        [
            'var_e17dfd0844bcd9f7',
            {
                id: 'var_e17dfd0844bcd9f7',
                product_id: 'prod_ca3c74d6d9e341f3',
                gsm: 100,
                width_mm: 880,
                height_mm: 630,
                finish: 'UNCOATED',
                grain_direction: 'UNKNOWN',
                caliper_um: 126,
                caliper_mm: 0.126,
                bulk_factor: 1.26,
                caliper_source: 'MANUFACTURER_DATASHEET',
                caliper_confidence_status: 'REFERENCE_IMPORTED',
                caliper_revision: 1,
                metadata_json: JSON.stringify({})
            }
        ],
        [
            'var_f3c1b55f55b0144e',
            {
                id: 'var_f3c1b55f55b0144e',
                product_id: 'prod_0f8c631b9debbb56',
                gsm: 130,
                width_mm: 630,
                height_mm: 880,
                finish: 'UNCOATED',
                grain_direction: 'UNKNOWN',
                caliper_um: 140,
                caliper_mm: 0.14,
                bulk_factor: 1.077,
                caliper_source: 'MANUFACTURER_DATASHEET',
                caliper_confidence_status: 'REFERENCE_IMPORTED',
                caliper_revision: 1,
                metadata_json: JSON.stringify({})
            }
        ],
        [
            'var_ac7fde2e2144f3c4',
            {
                id: 'var_ac7fde2e2144f3c4',
                product_id: 'prod_ef1c9f209b0dc5d5',
                gsm: 250,
                width_mm: 700,
                height_mm: 1000,
                finish: 'UNCOATED',
                grain_direction: 'UNKNOWN',
                caliper_um: 300,
                caliper_mm: 0.3,
                bulk_factor: 1.2,
                caliper_source: 'MANUFACTURER_DATASHEET',
                caliper_confidence_status: 'REFERENCE_IMPORTED',
                caliper_revision: 1,
                metadata_json: JSON.stringify({})
            }
        ]
    ]);

    const classificationEvidences = [];

    async function executeQuery(sql, params = []) {
        const norm = String(sql).replace(/\s+/g, ' ').trim();

        if (norm.startsWith('SELECT * FROM paper_variant_classification_evidence WHERE tenant_id = ? AND idempotency_key = ?')) {
            const [tenantId, idempotencyKey] = params;
            return classificationEvidences.filter(
                (e) => e.tenant_id === tenantId && e.idempotency_key === idempotencyKey
            );
        }

        if (norm.includes('FROM paper_variants v JOIN paper_products p ON v.product_id = p.id WHERE v.id = ?')) {
            const v = variants.get(params[0]);
            if (!v) return [];
            const p = products.get(v.product_id) || {};
            return [{
                ...v,
                product_name: p.name,
                brand: p.brand,
                manufacturer: p.manufacturer,
                product_category: p.category,
                category: p.category,
                finish_summary: p.finish_summary
            }];
        }

        if (norm.startsWith('SELECT * FROM paper_variants WHERE id = ?')) {
            const v = variants.get(params[0]);
            return v ? [{ ...v }] : [];
        }

        if (norm.startsWith('SELECT * FROM paper_products WHERE id = ?')) {
            const p = products.get(params[0]);
            return p ? [{ ...p }] : [];
        }

        if (norm.startsWith('INSERT INTO paper_variant_classification_evidence')) {
            const [
                classification_evidence_id,
                tenant_id,
                supplier_id,
                variant_id,
                product_id,
                functional_group,
                previous_category,
                proposed_category,
                previous_finish,
                proposed_finish,
                previous_coating_status,
                proposed_coating_status,
                previous_grain_direction,
                proposed_grain_direction,
                evidence_source_type,
                document_title,
                document_storage_uri,
                document_sha256,
                review_status,
                idempotency_key,
                submitted_by,
                submitted_by_role,
                notes,
                metadata_json
            ] = params;

            classificationEvidences.push({
                classification_evidence_id,
                tenant_id,
                supplier_id,
                variant_id,
                product_id,
                functional_group,
                previous_category,
                proposed_category,
                previous_finish,
                proposed_finish,
                previous_coating_status,
                proposed_coating_status,
                previous_grain_direction,
                proposed_grain_direction,
                evidence_source_type,
                document_title,
                document_storage_uri,
                document_sha256,
                review_status,
                applied_to_catalog_product: false,
                idempotency_key,
                submitted_by,
                submitted_by_role,
                approved_by_technologist: null,
                approved_by_role: null,
                approved_at: null,
                decision_reason: null,
                promotion_request_id: null,
                promotion_requested_by: null,
                promotion_requested_by_role: null,
                promotion_requested_at: null,
                promotion_request_reason: null,
                promotion_id: null,
                promoted_by: null,
                promoted_by_role: null,
                promoted_at: null,
                promotion_reason: null,
                notes,
                metadata_json,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            return { affectedRows: 1 };
        }

        if (norm.startsWith('SELECT * FROM paper_variant_classification_evidence WHERE classification_evidence_id = ?')) {
            const id = params[0];
            const tenantId = params[1];
            return classificationEvidences.filter(
                (e) => e.classification_evidence_id === id && (!tenantId || e.tenant_id === tenantId)
            );
        }

        if (norm.startsWith('UPDATE paper_variant_classification_evidence SET review_status = ?')) {
            const [targetStatus, techId, techRole, reason, metadataJson, evId, tenantId] = params;
            const ev = classificationEvidences.find(
                (e) =>
                    e.classification_evidence_id === evId &&
                    e.tenant_id === tenantId &&
                    ['DRAFT', 'PENDING_TECH_REVIEW'].includes(e.review_status)
            );
            if (!ev) return { affectedRows: 0 };
            ev.review_status = targetStatus;
            ev.approved_by_technologist = techId;
            ev.approved_by_role = techRole;
            ev.approved_at = new Date().toISOString();
            ev.decision_reason = reason;
            ev.applied_to_catalog_product = false;
            ev.metadata_json = metadataJson;
            return { affectedRows: 1 };
        }

        if (norm.startsWith('UPDATE paper_variant_classification_evidence SET promotion_request_id = ?')) {
            const [reqId, reqBy, reqRole, reqReason, metadataJson, evId, tenantId] = params;
            const ev = classificationEvidences.find(
                (e) => e.classification_evidence_id === evId && e.tenant_id === tenantId
            );
            if (!ev) return { affectedRows: 0 };
            ev.promotion_request_id = reqId;
            ev.promotion_requested_by = reqBy;
            ev.promotion_requested_by_role = reqRole;
            ev.promotion_requested_at = new Date().toISOString();
            ev.promotion_request_reason = reqReason;
            ev.metadata_json = metadataJson;
            return { affectedRows: 1 };
        }

        if (norm.startsWith('UPDATE paper_products SET category = ?')) {
            const [newCategory, newFinish, metadataJson, prodId] = params;
            const p = products.get(prodId);
            if (!p) return { affectedRows: 0 };
            p.category = newCategory;
            p.finish_summary = newFinish;
            p.metadata_json = metadataJson;
            return { affectedRows: 1 };
        }

        if (norm.startsWith('UPDATE paper_variants SET finish = ?')) {
            const [newFinish, newGrain, metadataJson, varId] = params;
            const v = variants.get(varId);
            if (!v) return { affectedRows: 0 };
            v.finish = newFinish;
            v.grain_direction = newGrain;
            v.metadata_json = metadataJson;
            return { affectedRows: 1 };
        }

        if (norm.startsWith('UPDATE paper_variant_classification_evidence SET applied_to_catalog_product = TRUE')) {
            const [promoId, promoBy, promoRole, promoReason, metadataJson, evId, tenantId] = params;
            const ev = classificationEvidences.find(
                (e) =>
                    e.classification_evidence_id === evId &&
                    e.tenant_id === tenantId &&
                    !e.applied_to_catalog_product &&
                    e.review_status === 'APPROVED'
            );
            if (!ev) return { affectedRows: 0 };
            ev.applied_to_catalog_product = true;
            ev.promotion_id = promoId;
            ev.promoted_by = promoBy;
            ev.promoted_by_role = promoRole;
            ev.promoted_at = new Date().toISOString();
            ev.promotion_reason = promoReason;
            ev.metadata_json = metadataJson;
            return { affectedRows: 1 };
        }

        throw new Error(`Unhandled SQL in classification mock DB: ${norm}`);
    }

    return {
        products,
        variants,
        classificationEvidences,
        query: executeQuery,
        getConnection: async () => ({
            beginTransaction: async () => {},
            commit: async () => {},
            rollback: async () => {},
            release: () => {},
            query: executeQuery
        })
    };
}

describe('PAPER-MATERIALS-RECOVERY-12 — Governed Classification Accreditation & Promotion', () => {
    let mockDb;
    let service;

    beforeEach(() => {
        mockDb = createClassificationMockDb();
        service = new PaperEvidenceService({ db: mockDb });
    });

    it('executes the 4-stage classification workflow (register -> review -> request -> authorize), updates paper_products/paper_variants, deactivates isSyntheticOtherUncoated, and keeps caliper_um 100% untouched', async () => {
        const tenantId = 'tenant-supplier-demo';
        const variantId = 'var_e17dfd0844bcd9f7';

        // Verify pre-accreditation state resolves to OTHER / UNKNOWN via synthetic guard
        const preVar = mockDb.variants.get(variantId);
        const preProd = mockDb.products.get(preVar.product_id);
        const preResolved = resolveVariantTechnicalAttributes({
            ...preVar,
            category: preProd.category,
            variant_metadata_json: preVar.metadata_json,
            product_metadata_json: preProd.metadata_json
        });
        expect(preResolved.paperType).toBe('OTHER');
        expect(preResolved.coatingStatus).toBe('UNKNOWN');
        expect(preResolved.finish).toBe('UNKNOWN');
        expect(preResolved.isSyntheticUncoatedResolved).toBe(true);

        // Stage 1: Register Classification Evidence
        const regRes = await service.registerClassificationEvidence({
            tenantId,
            supplierId: 'supp-mondi',
            actorId: 'actor_1_submitter',
            actorRole: 'SUPPLIER_OPERATOR',
            idempotencyKey: 'idem_cls_reg_01',
            payload: {
                variantId,
                functionalGroup: 'G3_UNCOATED_OFFSET_AND_BOOK_PAPERS_IN_RAW_OTHER',
                proposedCategory: 'OFFSET',
                proposedCoatingStatus: 'UNCOATED',
                proposedFinish: 'UNCOATED',
                proposedGrainDirection: 'UNKNOWN',
                evidenceSourceType: 'MILL_DATASHEET',
                documentTitle: 'Mondi IQ Print Official Technical Data Sheet (Woodfree Uncoated Offset)',
                documentSha256: VALID_PDF_SHA256
            }
        });

        expect(regRes.classificationEvidenceId).toMatch(/^evd_cls_/);
        expect(regRes.status).toBe('PENDING_TECH_REVIEW');
        expect(regRes.productiveClassificationModified).toBe(false);
        expect(regRes.productiveCaliperModified).toBe(false);
        expect(mockDb.products.get(preVar.product_id).category).toBe('OTHER');

        // Stage 2: Review Classification Evidence (Technologist APPROVE)
        const revRes = await service.reviewClassificationEvidence({
            tenantId,
            classificationEvidenceId: regRes.classificationEvidenceId,
            technologistUserId: 'actor_2_technologist',
            technologistRole: 'MATERIAL_TECHNOLOGIST',
            decision: 'APPROVE',
            decisionReason: 'Verified Mondi IQ Print TDS: woodfree uncoated offset paper.'
        });

        expect(revRes.newStatus).toBe('APPROVED');
        expect(revRes.productiveClassificationModified).toBe(false);
        expect(mockDb.products.get(preVar.product_id).category).toBe('OTHER');

        // Stage 3: Request Classification Promotion
        const reqRes = await service.requestClassificationPromotion({
            tenantId,
            variantId,
            classificationEvidenceId: regRes.classificationEvidenceId,
            actorId: 'actor_3_requester',
            actorRole: 'SUPPLIER_OPERATOR',
            reason: 'Requesting promotion of Batch C1 IQ Print 100g classification to OFFSET.'
        });

        expect(reqRes.promotionRequestId).toMatch(/^cls_req_/);
        expect(reqRes.status).toBe('PROMOTION_REQUESTED');
        expect(reqRes.productiveClassificationModified).toBe(false);

        // Stage 4: Authorize Classification Promotion
        const authRes = await service.authorizeClassificationPromotion({
            tenantId,
            variantId,
            classificationEvidenceId: regRes.classificationEvidenceId,
            promotionRequestId: reqRes.promotionRequestId,
            actorId: 'actor_4_authorizer',
            actorRole: 'SUPPLIER_ADMIN',
            reason: 'Authorizing governed Batch C1 classification promotion for IQ Print 100g.'
        });

        expect(authRes.promotionId).toMatch(/^cls_prm_/);
        expect(authRes.previousCategory).toBe('OTHER');
        expect(authRes.newCategory).toBe('OFFSET');
        expect(authRes.newCoatingStatus).toBe('UNCOATED');
        expect(authRes.newFinish).toBe('UNCOATED');
        expect(authRes.productiveClassificationModified).toBe(true);
        expect(authRes.productiveCaliperModified).toBe(false);
        expect(authRes.caliperPreservedUnchanged.caliperUm).toBe(126);

        // Verify post-promotion state in DB and runtime resolveVariantTechnicalAttributes()
        const postVar = mockDb.variants.get(variantId);
        const postProd = mockDb.products.get(postVar.product_id);
        expect(postProd.category).toBe('OFFSET');
        expect(postProd.finish_summary).toBe('UNCOATED');
        expect(postVar.caliper_um).toBe(126); // 100% untouched!
        expect(postVar.caliper_revision).toBe(1); // 100% untouched!

        const postResolved = resolveVariantTechnicalAttributes({
            ...postVar,
            category: postProd.category,
            variant_metadata_json: postVar.metadata_json,
            product_metadata_json: postProd.metadata_json
        });
        expect(postResolved.paperType).toBe('OFFSET');
        expect(postResolved.coatingStatus).toBe('UNCOATED');
        expect(postResolved.coatingConfidence).toBe('ACCREDITED_EVIDENCE');
        expect(postResolved.finish).toBe('UNCOATED');
        expect(postResolved.isSyntheticUncoatedResolved).toBe(false);
        expect(postResolved.classificationEvidenceId).toBe(regRes.classificationEvidenceId);
        expect(postResolved.classificationPromotionId).toBe(authRes.promotionId);
    });

    it('enforces 4-way Segregation of Duties and supports ONE_SIDE_COATED & grain_direction traceability', async () => {
        const tenantId = 'tenant-supplier-demo';
        const variantId = 'var_ac7fde2e2144f3c4';

        const regRes = await service.registerClassificationEvidence({
            tenantId,
            actorId: 'user_submitter',
            actorRole: 'SUPPLIER_OPERATOR',
            payload: {
                variantId,
                functionalGroup: 'G4_PACKAGING_BOARDS_AND_KRAFTLINER',
                proposedCategory: 'CARTON',
                proposedCoatingStatus: 'ONE_SIDE_COATED',
                proposedFinish: 'GLOSS',
                proposedGrainDirection: 'LONG_GRAIN',
                evidenceSourceType: 'MILL_DATASHEET',
                documentTitle: 'Stora Enso Ensocoat 1S 250g Official Packaging Board TDS',
                documentSha256: VALID_PDF_SHA256
            }
        });

        expect(regRes.proposedCoatingStatus).toBe('ONE_SIDE_COATED');
        expect(regRes.proposedGrainDirection).toBe('LONG_GRAIN');

        // Submitter cannot self-review
        await expect(
            service.reviewClassificationEvidence({
                tenantId,
                classificationEvidenceId: regRes.classificationEvidenceId,
                technologistUserId: 'user_submitter',
                technologistRole: 'MATERIAL_TECHNOLOGIST',
                decision: 'APPROVE',
                decisionReason: 'Self-approval attempt'
            })
        ).rejects.toMatchObject({ code: 'SOD_SELF_APPROVAL_FORBIDDEN' });

        await service.reviewClassificationEvidence({
            tenantId,
            classificationEvidenceId: regRes.classificationEvidenceId,
            technologistUserId: 'user_reviewer',
            technologistRole: 'MATERIAL_TECHNOLOGIST',
            decision: 'APPROVE',
            decisionReason: 'Approved by independent technologist'
        });

        const reqRes = await service.requestClassificationPromotion({
            tenantId,
            variantId,
            classificationEvidenceId: regRes.classificationEvidenceId,
            actorId: 'user_requester',
            actorRole: 'SUPPLIER_OPERATOR',
            reason: 'Requesting promotion for Ensocoat 1S'
        });

        // Submitter, Reviewer, and Requester cannot authorize promotion
        for (const forbiddenActor of ['user_submitter', 'user_reviewer', 'user_requester']) {
            await expect(
                service.authorizeClassificationPromotion({
                    tenantId,
                    variantId,
                    classificationEvidenceId: regRes.classificationEvidenceId,
                    promotionRequestId: reqRes.promotionRequestId,
                    actorId: forbiddenActor,
                    actorRole: 'SUPPLIER_ADMIN',
                    reason: 'Attempting self-authorization'
                })
            ).rejects.toThrow(/Segregation of Duties violation/);
        }
    });
});

