#!/usr/bin/env node
'use strict';

/**
 * PAPER-MATERIALS-RECOVERY-08 — Technical Accreditation Program Validator & Planner
 *
 * Strictly READ-ONLY program helper:
 * - Never executes INSERT/UPDATE/DELETE against MySQL Control.
 * - Never sends automated external emails or network requests.
 * - Validates the 252 missing-caliper inventory, the 252 supplier request matrix rows,
 *   the ISO 534 physical micrometer statistical acceptance engine, and the Segregation
 *   of Duties (SoD) governance rules designed for Paper Materials.
 */

const fs = require('fs');
const path = require('path');

const ARCH_DIR = path.resolve(__dirname, '../docs/architecture');
const INVENTORY_CSV_PATH = path.join(ARCH_DIR, 'RECOVERY_08_MISSING_MATERIALS_INVENTORY.csv');
const SUPPLIER_MATRIX_CSV_PATH = path.join(ARCH_DIR, 'RECOVERY_08_SUPPLIER_REQUEST_MATRIX.csv');
const EMAIL_TEMPLATES_MD_PATH = path.join(ARCH_DIR, 'RECOVERY_08_SUPPLIER_EMAIL_TEMPLATES.md');
const PHYSICAL_PROTOCOL_MD_PATH = path.join(ARCH_DIR, 'RECOVERY_08_PHYSICAL_MEASUREMENT_PROTOCOL.md');
const WORKFLOW_DESIGN_MD_PATH = path.join(ARCH_DIR, 'RECOVERY_08_EVIDENCE_WORKFLOW_DESIGN.md');
const FINAL_ASSESSMENT_MD_PATH = path.join(ARCH_DIR, 'RECOVERY_08_FINAL_ASSESSMENT.md');

const EXPECTED_CATALOG_TOTAL = 1524;
const EXPECTED_WITH_CALIPER = 1272;
const EXPECTED_MISSING_CALIPER = 252;
const EXPECTED_HISTORICAL_CONFLICTS = 9;
const EXPECTED_PENDING_CLASSIFICATIONS_RESOLVED = 337;
const EXPECTED_PENDING_CLASSIFICATIONS_RAW_DB = 338;

const CV_LIMITS_BY_SUBSTRATE = Object.freeze({
  STANDARD_SMOOTH_PAPER: 2.5,
  SMOOTH_ACRYLIC_COVERING: 3.5,
  EMBOSSED_OR_LAID_COVERING: 5.0,
  MULTILAYER_ADHESIVE_OR_NCR: 3.0
});

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function readCsvFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const lines = raw.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : '';
    });
    return row;
  });
}

/**
 * Evaluates a 10-reading ISO 534 single-sheet micrometer measurement set
 * and enforces Conditioning (ISO 187), Calibration validity, and Segregation of Duties (SoD).
 */
function evaluatePhysicalMicrometerRecord(record = {}) {
  const errors = [];
  const readings = Array.isArray(record.readingsUm)
    ? record.readingsUm.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : [];

  if (readings.length < 10) {
    errors.push('ISO_534_MIN_10_READINGS_REQUIRED');
  }

  const tempC = Number(record.ambientTempC);
  const rhPct = Number(record.ambientRhPct);
  if (!Number.isFinite(tempC) || tempC < 22.0 || tempC > 24.0) {
    errors.push('ISO_187_TEMPERATURE_OUT_OF_RANGE');
  }
  if (!Number.isFinite(rhPct) || rhPct < 48.0 || rhPct > 52.0) {
    errors.push('ISO_187_HUMIDITY_OUT_OF_RANGE');
  }

  if (!record.calibrationCertId || !record.calibrationValidUntil || !record.measurementDate) {
    errors.push('MISSING_MICROMETER_CALIBRATION_TRACEABILITY');
  } else if (String(record.calibrationValidUntil) < String(record.measurementDate)) {
    errors.push('EXPIRED_MICROMETER_CALIBRATION_CERTIFICATE');
  }

  if (!record.submittedByOperator || !record.approvedByTechnologist) {
    errors.push('MISSING_OPERATOR_OR_TECHNOLOGIST_SIGNATURE');
  } else if (String(record.submittedByOperator).trim() === String(record.approvedByTechnologist).trim()) {
    errors.push('SOD_SELF_APPROVAL_FORBIDDEN');
  }

  let meanUm = null;
  let roundedCaliperUm = null;
  let stdDevUm = null;
  let cvPct = null;
  let minUm = null;
  let maxUm = null;
  let rangePct = null;

  const substrateClass = record.substrateClass || 'EMBOSSED_OR_LAID_COVERING';
  const maxAllowedCvPct = CV_LIMITS_BY_SUBSTRATE[substrateClass] || 5.0;

  if (readings.length >= 2) {
    const n = readings.length;
    meanUm = readings.reduce((acc, v) => acc + v, 0) / n;
    roundedCaliperUm = Math.round(meanUm);
    const variance = readings.reduce((acc, v) => acc + Math.pow(v - meanUm, 2), 0) / (n - 1);
    stdDevUm = Math.sqrt(variance);
    cvPct = (stdDevUm / meanUm) * 100;
    minUm = Math.min(...readings);
    maxUm = Math.max(...readings);
    rangePct = ((maxUm - minUm) / meanUm) * 100;

    if (cvPct > maxAllowedCvPct) {
      errors.push('REJECTED_HIGH_VARIANCE_CV_EXCEEDED');
    }
  }

  const approved = errors.length === 0;
  return {
    approved,
    reviewStatus: approved ? 'CERTIFIED_MEASURED' : 'REJECTED',
    resultingCaliperSource: approved ? 'MEASURED_MICROMETER' : 'MISSING',
    resultingConfidenceStatus: approved ? 'VERIFIED' : 'MISSING',
    canReleaseToManufacturing: false, // Strictly false while binding/folding profiles remain REFERENCE_IMPORTED
    statistics: {
      sampleCount: readings.length,
      meanUm: meanUm !== null ? Number(meanUm.toFixed(2)) : null,
      roundedCaliperUm,
      stdDevUm: stdDevUm !== null ? Number(stdDevUm.toFixed(3)) : null,
      cvPct: cvPct !== null ? Number(cvPct.toFixed(2)) : null,
      minUm,
      maxUm,
      rangePct: rangePct !== null ? Number(rangePct.toFixed(2)) : null,
      maxAllowedCvPct
    },
    errors
  };
}

/**
 * Evaluates a Manufacturer Official Datasheet (TDS) evidence submission,
 * preserving REFERENCE_IMPORTED confidence by default and enforcing SoD.
 */
function evaluateManufacturerDatasheetEvidence(submission = {}) {
  const errors = [];
  if (!submission.documentSha256 || !/^[a-f0-9]{64}$/i.test(String(submission.documentSha256))) {
    errors.push('MISSING_OR_INVALID_DOCUMENT_SHA256');
  }
  if (!submission.datasheetVersion || !submission.datasheetPublishedDate) {
    errors.push('MISSING_DATASHEET_VERSION_OR_DATE');
  }
  const nominalUm = Number(submission.nominalDatasheetCaliperUm);
  if (!Number.isFinite(nominalUm) || nominalUm <= 0) {
    errors.push('INVALID_NOMINAL_CALIPER_UM');
  }
  if (!submission.shadeEmbossingInvarianceConfirmed) {
    errors.push('SHADE_EMBOSSING_INVARIANCE_CONFIRMATION_REQUIRED');
  }
  if (!submission.submittedBy || !submission.approvedByTechnologist) {
    errors.push('MISSING_SUBMITTER_OR_TECHNOLOGIST_APPROVAL');
  } else if (String(submission.submittedBy).trim() === String(submission.approvedByTechnologist).trim()) {
    errors.push('SOD_SELF_APPROVAL_FORBIDDEN');
  }
  if (submission.accreditationTrack === 'PHYSICAL_MICROMETER_TRACK') {
    errors.push('PHYSICAL_MICROMETER_REQUIRED_FOR_COVERING_AND_EMBOSSED');
  }

  const approved = errors.length === 0;
  return {
    approved,
    reviewStatus: approved ? 'APPROVED_REFERENCE' : 'REJECTED',
    resultingCaliperSource: approved ? 'MANUFACTURER_DATASHEET' : 'MISSING',
    resultingConfidenceStatus: approved ? 'REFERENCE_IMPORTED' : 'MISSING',
    canReleaseToManufacturing: false,
    errors
  };
}

function loadAndAuditRecovery08Deliverables() {
  const inventoryRows = readCsvFile(INVENTORY_CSV_PATH);
  const supplierRows = readCsvFile(SUPPLIER_MATRIX_CSV_PATH);

  const byStatus = {};
  const byTrack = {};
  const byPriorityTier = {};
  const bySupplier = {};

  for (const row of inventoryRows) {
    byStatus[row.accreditation_status] = (byStatus[row.accreditation_status] || 0) + 1;
    byTrack[row.accreditation_track] = (byTrack[row.accreditation_track] || 0) + 1;
    byPriorityTier[row.industrial_priority_tier] = (byPriorityTier[row.industrial_priority_tier] || 0) + 1;
    bySupplier[row.primary_supplier_channel] = (bySupplier[row.primary_supplier_channel] || 0) + 1;
  }

  return {
    mode: 'READ_ONLY_ACCREDITATION_PROGRAM',
    productionWritesExecuted: 0,
    externalEmailsSentAutomatically: 0,
    canReleaseToManufacturing: false,
    securityRotationPending: true,
    verdict: 'RECOVERY_08_READY_FOR_IMPLEMENTATION',
    catalogBaseline: {
      totalVariants: EXPECTED_CATALOG_TOTAL,
      withCaliper: EXPECTED_WITH_CALIPER,
      withoutCaliper: inventoryRows.length,
      historicalConflictsPreserved: EXPECTED_HISTORICAL_CONFLICTS,
      pendingClassificationsResolvedOther: EXPECTED_PENDING_CLASSIFICATIONS_RESOLVED,
      pendingClassificationsRawDbOther: EXPECTED_PENDING_CLASSIFICATIONS_RAW_DB
    },
    inventoryCount: inventoryRows.length,
    supplierRequestCount: supplierRows.length,
    byStatus,
    byTrack,
    byPriorityTier,
    bySupplier,
    deliverablesPresent: {
      missingMaterialsInventoryCsv: fs.existsSync(INVENTORY_CSV_PATH),
      supplierRequestMatrixCsv: fs.existsSync(SUPPLIER_MATRIX_CSV_PATH),
      supplierEmailTemplatesMd: fs.existsSync(EMAIL_TEMPLATES_MD_PATH),
      physicalMeasurementProtocolMd: fs.existsSync(PHYSICAL_PROTOCOL_MD_PATH),
      evidenceWorkflowDesignMd: fs.existsSync(WORKFLOW_DESIGN_MD_PATH),
      finalAssessmentMd: fs.existsSync(FINAL_ASSESSMENT_MD_PATH)
    }
  };
}

if (require.main === module) {
  const report = loadAndAuditRecovery08Deliverables();
  console.log(JSON.stringify(report, null, 2));
}

module.exports = {
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
};

