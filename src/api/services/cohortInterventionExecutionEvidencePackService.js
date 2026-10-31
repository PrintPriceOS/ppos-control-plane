'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builderService = require('./cohortInterventionExecutionBuilderService').serviceInstance || require('./cohortInterventionExecutionBuilderService');

class CohortInterventionExecutionEvidencePackService {
  constructor() {
    this._mockState = {
      evidence: new Map()
    };
  }

  async buildEvidencePack(executionId, execution, steps, dryRun, rollbackPlan, result, guardrail) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const sourceApprovalHash = execution.lineage_hashes_json.source_approval_hash || 'placeholder_approval_hash';
    const dryRunHash = dryRun ? dryRun.dry_run_hash : 'placeholder_dry_run_hash';
    const resultHash = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');

    const evidenceData = {
      execution_id: executionId,
      execution_type: execution.execution_type,
      cohort_id: execution.cohort_id,
      tenant_id: execution.tenant_id,
      risk_level: execution.risk_level,
      confidence_level: execution.confidence_level,
      steps: steps.map(s => ({ step_key: s.step_key, status: s.status, completed_at: s.completed_at })),
      dry_run_preview: dryRun ? dryRun.dry_run_payload_json : null,
      rollback_plan: rollbackPlan ? rollbackPlan.rollback_payload_json : null,
      operator_confirmation: {
        confirmed_by: execution.operator_confirmed_by,
        confirmed_at: execution.operator_confirmed_at,
        phrase: execution.operator_confirmation_phrase
      },
      execution_result: result,
      guardrail_result: guardrail,
      safe_scope_attestation: execution.safe_scope_attestation_json,
      compiled_at: new Date().toISOString()
    };

    // Redact sensitive details
    const redactedString = this.redactSecrets(JSON.stringify(evidenceData));
    const finalEvidenceData = JSON.parse(redactedString);

    const evidencePackHash = crypto.createHash('sha256').update(redactedString).digest('hex');
    const evidenceId = 'eev_' + crypto.randomBytes(8).toString('hex');

    const record = {
      evidence_id: evidenceId,
      execution_id: executionId,
      source_approval_hash: sourceApprovalHash,
      dry_run_hash: dryRunHash,
      execution_result_hash: resultHash,
      evidence_pack_hash: evidencePackHash,
      evidence_schema_version: '140.0',
      evidence_data_json: finalEvidenceData,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.evidence.set(executionId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_execution_evidence
         (evidence_id, execution_id, source_approval_hash, dry_run_hash, execution_result_hash,
          evidence_pack_hash, evidence_schema_version, evidence_data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.evidence_id, record.execution_id, record.source_approval_hash, record.dry_run_hash, record.execution_result_hash,
          record.evidence_pack_hash, record.evidence_schema_version, JSON.stringify(record.evidence_data_json)
        ]
      );
    }

    return record;
  }

  async getEvidencePack(executionId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.evidence.get(executionId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_execution_evidence WHERE execution_id = ?", [executionId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  redactSecrets(str) {
    // Redact password, credentials, secret, keys, tokens, auth headers
    return str
      .replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"[REDACTED]"')
      .replace(/"secret"\s*:\s*"[^"]*"/gi, '"secret":"[REDACTED]"')
      .replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"[REDACTED]"')
      .replace(/"private_key"\s*:\s*"[^"]*"/gi, '"private_key":"[REDACTED]"')
      .replace(/"apiKey"\s*:\s*"[^"]*"/gi, '"apiKey":"[REDACTED]"')
      .replace(/"dbPassword"\s*:\s*"[^"]*"/gi, '"dbPassword":"[REDACTED]"');
  }
}

const serviceInstance = new CohortInterventionExecutionEvidencePackService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionExecutionEvidencePackService = CohortInterventionExecutionEvidencePackService;
