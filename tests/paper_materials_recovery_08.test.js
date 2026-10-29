import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  EXPECTED_CATALOG_TOTAL,
  EXPECTED_WITH_CALIPER,
  EXPECTED_MISSING_CALIPER,
  EXPECTED_HISTORICAL_CONFLICTS,
  EXPECTED_PENDING_CLASSIFICATIONS_RESOLVED,
  EXPECTED_PENDING_CLASSIFICATIONS_RAW_DB,
  INVENTORY_CSV_PATH,
  SUPPLIER_MATRIX_CSV_PATH,
  EMAIL_TEMPLATES_MD_PATH,
  PHYSICAL_PROTOCOL_MD_PATH,
  WORKFLOW_DESIGN_MD_PATH,
  FINAL_ASSESSMENT_MD_PATH,
  readCsvFile,
  loadAndAuditRecovery08Deliverables,
  evaluatePhysicalMicrometerRecord,
  evaluateManufacturerDatasheetEvidence
} = require('../scripts/recover_paper_materials_08.cjs');

const {
  resolveVariantCaliperProvenance
} = require('../src/api/services/spine/paperCaliperReconciliationService.js');

describe('PAPER-MATERIALS-RECOVERY-08 — Technical Accreditation Program & Metrology Governance', () => {
  it('1. verifies all 6 mandatory deliverables exist and catalog counts equal 1,524 = 1,272 + 252', () => {
    const audit = loadAndAuditRecovery08Deliverables();

    expect(audit.deliverablesPresent).toEqual({
      missingMaterialsInventoryCsv: true,
      supplierRequestMatrixCsv: true,
      supplierEmailTemplatesMd: true,
      physicalMeasurementProtocolMd: true,
      evidenceWorkflowDesignMd: true,
      finalAssessmentMd: true
    });

    expect(audit.productionWritesExecuted).toBe(0);
    expect(audit.externalEmailsSentAutomatically).toBe(0);
    expect(audit.canReleaseToManufacturing).toBe(false);
    expect(audit.securityRotationPending).toBe(true);
    expect(audit.verdict).toBe('RECOVERY_08_READY_FOR_IMPLEMENTATION');

    expect(audit.catalogBaseline.totalVariants).toBe(1524);
    expect(audit.catalogBaseline.withCaliper).toBe(1272);
    expect(audit.catalogBaseline.withoutCaliper).toBe(252);
    expect(audit.catalogBaseline.withCaliper + audit.catalogBaseline.withoutCaliper).toBe(EXPECTED_CATALOG_TOTAL);
    expect(audit.catalogBaseline.historicalConflictsPreserved).toBe(EXPECTED_HISTORICAL_CONFLICTS);
    expect(audit.catalogBaseline.pendingClassificationsResolvedOther).toBe(EXPECTED_PENDING_CLASSIFICATIONS_RESOLVED);
    expect(audit.catalogBaseline.pendingClassificationsRawDbOther).toBe(EXPECTED_PENDING_CLASSIFICATIONS_RAW_DB);
  });

  it('2. verifies Phase 1 inventory CSV has 252 unique variants split into 145 physical, 102 datasheet, and 5 conflict hold', () => {
    const rows = readCsvFile(INVENTORY_CSV_PATH);
    expect(rows).toHaveLength(EXPECTED_MISSING_CALIPER);

    const uniqueIds = new Set(rows.map((r) => r.variant_id));
    expect(uniqueIds.size).toBe(EXPECTED_MISSING_CALIPER);

    // Ensure the 2 variants held in RECOVERY-07W Phase 1 are included in DOCUMENTATION_REQUIRED
    expect(uniqueIds.has('var_dbd5357075534e3b')).toBe(true); // Nevia Plus C1S 80g 71my
    expect(uniqueIds.has('var_737c9a59216f4bf2')).toBe(true); // Priplak Cristal + 0.5 mm

    const audit = loadAndAuditRecovery08Deliverables();
    expect(audit.byStatus).toEqual({
      PHYSICAL_MEASUREMENT_REQUIRED: 145,
      DOCUMENTATION_REQUIRED: 102,
      CONFLICT_HOLD: 5
    });
    expect(audit.byTrack).toEqual({
      PHYSICAL_MICROMETER_TRACK: 145,
      DATASHEET_REQUEST_TRACK: 102,
      CONFLICT_RECONCILIATION_TRACK: 5
    });
    expect(audit.byPriorityTier).toEqual({
      P1_INTERIOR_BOOK_PAPER: 29,
      P2_COVER_BOARD_AND_CARD: 54,
      P3_SPECIALTY_AND_COVERING: 169
    });
  });

  it('3. verifies Phase 2 supplier request matrix has 252 complete requests and email templates cover Antalis, Papyrus, Polap, Igepa, and Dardedze', () => {
    const matrix = readCsvFile(SUPPLIER_MATRIX_CSV_PATH);
    expect(matrix).toHaveLength(252);

    const reqIds = new Set(matrix.map((r) => r.request_id));
    expect(reqIds.size).toBe(252);
    expect(reqIds.has('REQ08-001')).toBe(true);
    expect(reqIds.has('REQ08-252')).toBe(true);

    for (const row of matrix) {
      expect(row.variant_id).toMatch(/^var_/);
      expect(row.requested_measurement_standard).toContain('ISO 534');
      expect(row.requested_tolerance_spec).toContain('REQUIRED');
      expect(row.requested_datasheet_version_and_date).toContain('REQUIRED');
      expect(row.requested_shade_embossing_delta_confirmation.length).toBeGreaterThan(10);
    }

    const emailDoc = fs.readFileSync(EMAIL_TEMPLATES_MD_PATH, 'utf8');
    expect(emailDoc).toContain('TPL-01-ANTALIS-TDS');
    expect(emailDoc).toContain('TPL-02-PAPYRUS-TDS');
    expect(emailDoc).toContain('TPL-03-POLAP-COVERING-TDS');
    expect(emailDoc).toContain('TPL-04-IGEPA-ZANDERS-WINTER-PEYER-TDS');
    expect(emailDoc).toContain('TPL-05-BALTIC-PARTNERS-TDS');
    expect(emailDoc).toContain('TPL-06-MILL-ARBITRATION');
    expect(emailDoc).toContain('CERO ENVÍOS AUTOMÁTICOS REALIZADOS');
  });

  it('4. verifies Phase 3 ISO 534 physical micrometer statistical engine, conditioning, calibration, and Segregation of Duties (SoD)', () => {
    const protocolDoc = fs.readFileSync(PHYSICAL_PROTOCOL_MD_PATH, 'utf8');
    expect(protocolDoc).toContain('Efalin');
    expect(protocolDoc).toContain('Geltex');
    expect(protocolDoc).toContain('Wibalin');
    expect(protocolDoc).toContain('Surbalin');
    expect(protocolDoc).toContain('ISO 534:2011');
    expect(protocolDoc).toContain('200 mm²');
    expect(protocolDoc).toContain('100 kPa');

    // Valid 10-reading ISO 534 record for Efalin Fine Linen 120g
    const validResult = evaluatePhysicalMicrometerRecord({
      readingsUm: [168, 170, 169, 171, 168, 170, 169, 167, 170, 168],
      ambientTempC: 23.1,
      ambientRhPct: 50.4,
      calibrationCertId: 'CAL-ISO17025-2026-0419',
      calibrationValidUntil: '2027-04-18',
      measurementDate: '2026-10-29',
      substrateClass: 'EMBOSSED_OR_LAID_COVERING',
      submittedByOperator: 'op_metrology_01',
      approvedByTechnologist: 'tech_lead_01'
    });

    expect(validResult.approved).toBe(true);
    expect(validResult.reviewStatus).toBe('CERTIFIED_MEASURED');
    expect(validResult.resultingCaliperSource).toBe('MEASURED_MICROMETER');
    expect(validResult.resultingConfidenceStatus).toBe('VERIFIED');
    expect(validResult.canReleaseToManufacturing).toBe(false);
    expect(validResult.statistics.sampleCount).toBe(10);
    expect(validResult.statistics.roundedCaliperUm).toBe(169);
    expect(validResult.statistics.cvPct).toBeLessThan(1.0);

    // Reject self-approval (SoD violation) and high CV%
    const invalidResult = evaluatePhysicalMicrometerRecord({
      readingsUm: [140, 195, 150, 210, 145, 200, 155, 205, 160, 190],
      ambientTempC: 26.5,
      ambientRhPct: 60.0,
      calibrationCertId: 'CAL-EXPIRED',
      calibrationValidUntil: '2025-01-01',
      measurementDate: '2026-10-29',
      substrateClass: 'SMOOTH_ACRYLIC_COVERING',
      submittedByOperator: 'same_user',
      approvedByTechnologist: 'same_user'
    });

    expect(invalidResult.approved).toBe(false);
    expect(invalidResult.reviewStatus).toBe('REJECTED');
    expect(invalidResult.errors).toContain('ISO_187_TEMPERATURE_OUT_OF_RANGE');
    expect(invalidResult.errors).toContain('ISO_187_HUMIDITY_OUT_OF_RANGE');
    expect(invalidResult.errors).toContain('EXPIRED_MICROMETER_CALIBRATION_CERTIFICATE');
    expect(invalidResult.errors).toContain('SOD_SELF_APPROVAL_FORBIDDEN');
    expect(invalidResult.errors).toContain('REJECTED_HIGH_VARIANCE_CV_EXCEEDED');
  });

  it('5. verifies Phase 4 Evidence Workflow preserves REFERENCE_IMPORTED vs VERIFIED and compatible provenance in paperCaliperReconciliationService', () => {
    const tdsResult = evaluateManufacturerDatasheetEvidence({
      documentSha256: 'a'.repeat(64),
      datasheetVersion: 'Rev 2025-11',
      datasheetPublishedDate: '2025-11-15',
      nominalDatasheetCaliperUm: 165,
      shadeEmbossingInvarianceConfirmed: true,
      accreditationTrack: 'DATASHEET_REQUEST_TRACK',
      submittedBy: 'doc_specialist_01',
      approvedByTechnologist: 'tech_lead_01'
    });

    expect(tdsResult.approved).toBe(true);
    expect(tdsResult.reviewStatus).toBe('APPROVED_REFERENCE');
    expect(tdsResult.resultingCaliperSource).toBe('MANUFACTURER_DATASHEET');
    expect(tdsResult.resultingConfidenceStatus).toBe('REFERENCE_IMPORTED');
    expect(tdsResult.canReleaseToManufacturing).toBe(false);

    // Verify existing paperCaliperReconciliationService honors both states without schema enum breakage
    const provRefImported = resolveVariantCaliperProvenance({
      caliper_um: 165,
      caliper_source: 'MANUFACTURER_DATASHEET',
      caliper_confidence_status: 'REFERENCE_IMPORTED'
    });
    expect(provRefImported.caliperSource).toBe('MANUFACTURER_DATASHEET');
    expect(provRefImported.caliperConfidenceStatus).toBe('REFERENCE_IMPORTED');
    expect(provRefImported.caliperUm).toBe(165);

    const provMeasuredVerified = resolveVariantCaliperProvenance({
      caliper_um: 169,
      caliper_source: 'MEASURED_MICROMETER',
      caliper_confidence_status: 'VERIFIED'
    });
    expect(provMeasuredVerified.caliperSource).toBe('MEASURED_MICROMETER');
    expect(provMeasuredVerified.caliperConfidenceStatus).toBe('VERIFIED');
    expect(provMeasuredVerified.caliperUm).toBe(169);
  });

  it('6. verifies Phase 5 independent classification inventory (337 OTHER/UNKNOWN resolved, 338 raw OTHER) is documented separately from caliper accreditation', () => {
    const workflowDoc = fs.readFileSync(WORKFLOW_DESIGN_MD_PATH, 'utf8');
    const finalDoc = fs.readFileSync(FINAL_ASSESSMENT_MD_PATH, 'utf8');

    expect(workflowDoc).toContain('paper_variant_classification_evidence');
    expect(finalDoc).toContain('Fase 5 — Inventario Independiente de Clasificaciones Técnicas Pendientes (`OTHER / UNKNOWN`)');
    expect(finalDoc).toContain('337');
    expect(finalDoc).toContain('338');
    expect(finalDoc).toContain('RECOVERY_08_READY_FOR_IMPLEMENTATION');
  });
});
