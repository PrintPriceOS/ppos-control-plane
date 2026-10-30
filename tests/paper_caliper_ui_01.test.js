/**
 * tests/paper_caliper_ui_01.test.js
 *
 * PAPER-CALIPER-UI-01 — Server contract for paper thickness in Printhouse Materials.
 * Verifies read-only resolution from the master catalog, absence of GSM-derived values,
 * tenant-scoped evidence lookup, proposal routing into the existing evidence workflow,
 * separation of supplier-reported vs physically measured thickness, and that the
 * authoritative `paper_variants.caliper_um` is never written.
 */
import { describe, it, expect, vi } from 'vitest';

const { PaperThicknessService, stripClientCaliperMetadata } = require('../src/api/services/paperThicknessService');

function makeDb({ variants = [], evidence = [] } = {}) {
    const calls = [];
    return {
        calls,
        query: vi.fn(async (sql, params) => {
            calls.push({ sql, params });
            if (/FROM paper_variants WHERE id IN/i.test(sql)) {
                return variants.filter((v) => params.includes(v.id));
            }
            if (/FROM paper_variant_caliper_evidence/i.test(sql)) {
                const tenant = params[0];
                return evidence.filter((e) => e.tenant_id === tenant && params.includes(e.variant_id) && params.includes(e.review_status));
            }
            if (/UPDATE materials_catalog/i.test(sql)) return { affectedRows: 1 };
            return [];
        })
    };
}

function makeEvidence() {
    return {
        registerDocumentaryEvidence: vi.fn(async (args) => ({ evidenceId: 'evd_cal_1', status: 'PENDING_TECH_REVIEW', args, productiveCaliperModified: false })),
        registerPhysicalMicrometerEvidence: vi.fn(async (args) => ({ evidenceId: 'evd_mic_1', status: 'PENDING_TECH_REVIEW', args, productiveCaliperModified: false }))
    };
}

const linked = (vid, extra = {}) => ({ id: 'mat-1', material_type: 'PAPER', gsm: 100, metadata_json: JSON.stringify({ paper_variant_id: vid }), ...extra });
const manual = (extra = {}) => ({ id: 'mat-2', material_type: 'PAPER', gsm: 100, metadata_json: JSON.stringify({}), ...extra });

describe('PAPER-CALIPER-UI-01 · thickness resolution (read-only)', () => {
    it('1. Material with known thickness returns authoritative caliper, source and verification status', async () => {
        const db = makeDb({ variants: [{ id: 'var_amber_100', caliper_um: 122, caliper_source: 'LIVONIA_REFERENCE_IMPORT', caliper_confidence_status: 'REFERENCE_IMPORTED' }] });
        const svc = new PaperThicknessService({ dbClient: db, evidenceService: makeEvidence() });
        const [m] = await svc.attachThickness('tenant_a', [linked('var_amber_100')]);
        expect(m.paper_thickness).toMatchObject({
            linkedVariantId: 'var_amber_100', isLinkedToMasterCatalog: true, caliperUm: 122,
            caliperSource: 'LIVONIA_REFERENCE_IMPORT', verificationStatus: 'REFERENCE_IMPORTED', isAuthoritative: true
        });
    });

    it('2. Linked material WITHOUT thickness returns null (never derived from GSM)', async () => {
        const db = makeDb({ variants: [{ id: 'var_missing', caliper_um: null, caliper_source: null, caliper_confidence_status: null }] });
        const svc = new PaperThicknessService({ dbClient: db, evidenceService: makeEvidence() });
        const [m] = await svc.attachThickness('tenant_a', [linked('var_missing', { gsm: 300 })]);
        expect(m.paper_thickness.caliperUm).toBeNull();
        expect(m.paper_thickness.isAuthoritative).toBe(false);
        expect(m.paper_thickness.caliperSource).toBe('NONE');
        expect(m.paper_thickness.verificationStatus).toBe('MISSING');
    });

    it('3. Manually created material has no linked variant and no thickness; no variant query issued', async () => {
        const db = makeDb();
        const svc = new PaperThicknessService({ dbClient: db, evidenceService: makeEvidence() });
        const [m] = await svc.attachThickness('tenant_a', [manual()]);
        expect(m.paper_thickness).toMatchObject({ linkedVariantId: null, isLinkedToMasterCatalog: false, caliperUm: null, isAuthoritative: false });
        expect(db.calls.length).toBe(0);
    });

    it('4. Admin rows with parsed `metadata` objects are supported (Materials & Paper page)', async () => {
        const db = makeDb({ variants: [{ id: 'var_x', caliper_um: 98, caliper_source: 'MANUFACTURER_DATASHEET', caliper_confidence_status: 'VERIFIED' }] });
        const svc = new PaperThicknessService({ dbClient: db, evidenceService: makeEvidence() });
        const [m] = await svc.attachThickness('tenant_a', [{ id: 'inv-1', metadata: { paper_variant_id: 'var_x' } }]);
        expect(m.paper_thickness.caliperUm).toBe(98);
    });

    it('5. Pending proposals are tenant-scoped: other tenants\' evidence is never exposed', async () => {
        const db = makeDb({
            variants: [{ id: 'var_amber_100', caliper_um: 122, caliper_source: 'X', caliper_confidence_status: 'Y' }],
            evidence: [
                { tenant_id: 'tenant_a', variant_id: 'var_amber_100', evidence_id: 'evd_a', evidence_type: 'SUPPLIER_TECHNICAL_SHEET_PDF', review_status: 'PENDING_TECH_REVIEW', proposed_caliper_um: 125 },
                { tenant_id: 'tenant_b', variant_id: 'var_amber_100', evidence_id: 'evd_b', evidence_type: 'PHYSICAL_MICROMETER_RECORD', review_status: 'PENDING_TECH_REVIEW', proposed_caliper_um: 130 }
            ]
        });
        const svc = new PaperThicknessService({ dbClient: db, evidenceService: makeEvidence() });
        const [m] = await svc.attachThickness('tenant_a', [linked('var_amber_100')]);
        expect(m.paper_thickness.pendingProposals.map((p) => p.evidenceId)).toEqual(['evd_a']);
        expect(m.paper_thickness.pendingProposals[0]).toMatchObject({ kind: 'SUPPLIER_REPORTED', proposedCaliperUm: 125 });
        // Authoritative value stays the catalog value while a proposal is pending
        expect(m.paper_thickness.caliperUm).toBe(122);
    });

    it('6. Lookup failure degrades to null thickness instead of breaking material listing', async () => {
        const db = { query: vi.fn(async () => { throw new Error('DB down'); }) };
        const svc = new PaperThicknessService({ dbClient: db, evidenceService: makeEvidence() });
        const [m] = await svc.attachThickness('tenant_a', [linked('var_amber_100')]);
        expect(m.paper_thickness).toBeNull();
        expect(m.id).toBe('mat-1');
    });
});

describe('PAPER-CALIPER-UI-01 · proposals route to the evidence workflow', () => {
    it('7. Supplier-reported proposal on linked material → documentary evidence (SUPPLIER_TECHNICAL_SHEET_PDF, submitted for review)', async () => {
        const db = makeDb();
        const ev = makeEvidence();
        const svc = new PaperThicknessService({ dbClient: db, evidenceService: ev });
        const out = await svc.proposeThickness({
            tenantId: 'tenant_a', actorId: 'u1', actorRole: 'PRINTHOUSE_ADMIN', material: linked('var_amber_100'),
            body: { kind: 'SUPPLIER_REPORTED', proposedCaliperUm: 125, documentUrl: 'https://mill.example/datasheet.pdf' }
        });
        expect(ev.registerDocumentaryEvidence).toHaveBeenCalledTimes(1);
        const args = ev.registerDocumentaryEvidence.mock.calls[0][0];
        expect(args).toMatchObject({ tenantId: 'tenant_a', supplierId: null, actorId: 'u1' });
        expect(args.payload).toMatchObject({ variantId: 'var_amber_100', evidenceType: 'SUPPLIER_TECHNICAL_SHEET_PDF', proposedCaliperUm: 125, submitForReview: true });
        expect(ev.registerPhysicalMicrometerEvidence).not.toHaveBeenCalled();
        expect(out).toMatchObject({ route: 'EVIDENCE_WORKFLOW', kind: 'SUPPLIER_REPORTED', productiveCaliperModified: false });
    });

    it('8. Physical measurement proposal on linked material → ISO 534 micrometer evidence', async () => {
        const ev = makeEvidence();
        const svc = new PaperThicknessService({ dbClient: makeDb(), evidenceService: ev });
        const readings = [121, 122, 123, 122, 121, 122, 123, 122, 122, 121];
        const out = await svc.proposeThickness({
            tenantId: 'tenant_a', actorId: 'u1', actorRole: 'PRINTHOUSE_OPERATOR', material: linked('var_amber_100'),
            body: { kind: 'PHYSICAL_MEASUREMENT', readingsUm: readings, conditioningTempC: 23, conditioningRhPct: 50, micrometerCalibrationCertId: 'CAL-1', micrometerCalibrationValidUntil: '2027-12-31' }
        });
        expect(ev.registerPhysicalMicrometerEvidence).toHaveBeenCalledTimes(1);
        expect(ev.registerPhysicalMicrometerEvidence.mock.calls[0][0].payload).toMatchObject({ variantId: 'var_amber_100', readingsUm: readings, submitForReview: true });
        expect(ev.registerDocumentaryEvidence).not.toHaveBeenCalled();
        expect(out).toMatchObject({ route: 'EVIDENCE_WORKFLOW', kind: 'PHYSICAL_MEASUREMENT', productiveCaliperModified: false });
    });

    it('9. Manually created material stores a non-authoritative pending note and never touches paper_variants', async () => {
        const db = makeDb();
        const ev = makeEvidence();
        const svc = new PaperThicknessService({ dbClient: db, evidenceService: ev });
        const out = await svc.proposeThickness({
            tenantId: 'tenant_a', actorId: 'u1', actorRole: 'PRINTHOUSE_ADMIN', material: manual(),
            body: { kind: 'SUPPLIER_REPORTED', proposedCaliperUm: 140 }
        });
        expect(out.route).toBe('UNLINKED_PENDING_NOTE');
        expect(out.proposal).toMatchObject({ status: 'PENDING_MASTER_CATALOG_LINK', proposedCaliperUm: 140 });
        expect(ev.registerDocumentaryEvidence).not.toHaveBeenCalled();
        const writes = db.calls.filter((c) => /UPDATE|INSERT/i.test(c.sql));
        expect(writes).toHaveLength(1);
        expect(writes[0].sql).toMatch(/UPDATE materials_catalog SET metadata_json = \? WHERE id = \? AND tenant_id = \?/);
        expect(writes[0].params.slice(1)).toEqual(['mat-2', 'tenant_a']);
        // The pending note shows up as unlinkedProposal, not as an authoritative caliper
        const [m] = await svc.attachThickness('tenant_a', [{ ...manual(), metadata_json: writes[0].params[0] }]);
        expect(m.paper_thickness.caliperUm).toBeNull();
        expect(m.paper_thickness.unlinkedProposal.proposedCaliperUm).toBe(140);
    });

    it('10. No code path issues UPDATE paper_variants (authoritative caliper is never overwritten)', async () => {
        const db = makeDb({ variants: [{ id: 'var_amber_100', caliper_um: 122 }] });
        const svc = new PaperThicknessService({ dbClient: db, evidenceService: makeEvidence() });
        await svc.attachThickness('tenant_a', [linked('var_amber_100'), manual()]);
        await svc.proposeThickness({ tenantId: 'tenant_a', actorId: 'u1', actorRole: 'X', material: linked('var_amber_100'), body: { kind: 'SUPPLIER_REPORTED', proposedCaliperUm: 1, documentUrl: 'https://x' } });
        await svc.proposeThickness({ tenantId: 'tenant_a', actorId: 'u1', actorRole: 'X', material: manual(), body: { kind: 'PHYSICAL_MEASUREMENT', proposedCaliperUm: 130 } });
        expect(db.calls.some((c) => /UPDATE\s+paper_variants/i.test(c.sql))).toBe(false);
    });

    it('11. Invalid kind, invalid value and missing identity are rejected', async () => {
        const svc = new PaperThicknessService({ dbClient: makeDb(), evidenceService: makeEvidence() });
        await expect(svc.proposeThickness({ tenantId: 't', actorId: 'u', material: manual(), body: { kind: 'GUESS_FROM_GSM', proposedCaliperUm: 100 } }))
            .rejects.toMatchObject({ code: 'INVALID_THICKNESS_PROPOSAL_KIND', statusCode: 422 });
        await expect(svc.proposeThickness({ tenantId: 't', actorId: 'u', material: manual(), body: { kind: 'SUPPLIER_REPORTED', proposedCaliperUm: 0 } }))
            .rejects.toMatchObject({ code: 'INVALID_PROPOSED_CALIPER_UM' });
        await expect(svc.proposeThickness({ tenantId: null, actorId: 'u', material: manual(), body: { kind: 'SUPPLIER_REPORTED', proposedCaliperUm: 100 } }))
            .rejects.toMatchObject({ code: 'UNAUTHORIZED', statusCode: 403 });
    });

    it('12. Client-supplied caliper keys are stripped from material metadata (cannot be forged)', () => {
        const out = stripClientCaliperMetadata({ paper_variant_id: 'v', caliper_um: 999, caliperSource: 'FAKE', caliper_confidence_status: 'VERIFIED', thickness_proposal: { x: 1 }, brand: 'B' });
        expect(out).toEqual({ paper_variant_id: 'v', brand: 'B' });
    });
});

describe('PAPER-CALIPER-UI-01 · printhouse material service guards', () => {
    it('13. caliper_um / caliper_source / caliper_confidence_status are protected fields on printhouse materials', async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_only_secret_for_caliper_ui_01_suite';
        const svc = require('../src/api/services/printhouseMaterialService');
        for (const field of ['caliper_um', 'caliper_source', 'caliper_confidence_status']) {
            await expect(svc.createMaterial('tenant_a', 'site_a', {
                material_name: 'X', material_type: 'PAPER', substrate_class: 'S', sheet_format: 'SRA3', finish_type: 'MATT', gsm: 100, [field]: 1
            })).rejects.toMatchObject({ message: 'FIELD_NOT_EDITABLE' });
        }
    });
});

