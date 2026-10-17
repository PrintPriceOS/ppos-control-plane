'use strict';

/**
 * src/api/services/legacyPhaseMarkerAdapter.js
 *
 * Strict compatibility adapter for legacy PHASE_MARKER inserts into schema_versions
 * originating from migrations 080 to 091.
 *
 * Enforces:
 * - Whitelist of exactly 12 authorized migrations (080-091)
 * - Exact canonical description matching
 * - Origin file verification
 * - Record type = 'PHASE_MARKER' and checksum = ''
 * - Preservation of MIGRATION records without collision or overwrite
 * - Strict concurrency and collision controls
 */

const LEGACY_PHASE_MARKERS = Object.freeze({
  '080': {
    file: '080_phase132_controlled_invite_only_expansion_preparation_gate.sql',
    description: 'Phase 132: Controlled Invite-Only Expansion Preparation Gate',
    hasOnDuplicate: false
  },
  '081': {
    file: '081_phase133_controlled_invite_only_expansion_execution_gate.sql',
    description: 'Phase 133: Controlled Invite-Only Expansion Execution / Invite Issuance Gate',
    hasOnDuplicate: true
  },
  '082': {
    file: '082_phase134_controlled_invite_acceptance_participant_onboarding_gate.sql',
    description: 'Phase 134: Controlled Invite Acceptance / Participant Onboarding Gate',
    hasOnDuplicate: true
  },
  '083': {
    file: '083_phase135_controlled_runtime_access_session_gate.sql',
    description: 'Phase 135: Controlled Runtime Access Session Gate',
    hasOnDuplicate: true
  },
  '084': {
    file: '084_phase136_runtime_activity_observation_participant_usage_audit_gate.sql',
    description: 'Phase 136: Runtime Activity Observation / Participant Usage Audit Gate',
    hasOnDuplicate: true
  },
  '085': {
    file: '085_phase137_runtime_activity_review_cohort_health_decision_gate.sql',
    description: 'Phase 137: Runtime Activity Review / Cohort Health Decision Gate',
    hasOnDuplicate: true
  },
  '086': {
    file: '086_phase138_governed_cohort_intervention_preparation_gate.sql',
    description: 'Phase 138: Governed Cohort Intervention Preparation Gate',
    hasOnDuplicate: true
  },
  '087': {
    file: '087_phase139_governed_cohort_intervention_approval_gate.sql',
    description: 'Phase 139: Governed Cohort Intervention Approval Gate',
    hasOnDuplicate: true
  },
  '088': {
    file: '088_phase140_controlled_cohort_intervention_execution_gate.sql',
    description: 'Phase 140: Controlled Cohort Intervention Execution Gate',
    hasOnDuplicate: true
  },
  '089': {
    file: '089_phase141_restricted_high_risk_cohort_intervention_simulation_gate.sql',
    description: 'Phase 141: Restricted High-Risk Cohort Intervention Simulation Gate',
    hasOnDuplicate: true
  },
  '090': {
    file: '090_phase142_high_risk_cohort_intervention_simulation_review_gate.sql',
    description: 'Phase 142: High-Risk Cohort Intervention Simulation Review Gate',
    hasOnDuplicate: true
  },
  '091': {
    file: '091_phase143_high_risk_cohort_intervention_approval_preparation_gate.sql',
    description: 'Phase 143: High-Risk Cohort Intervention Approval Preparation Gate',
    hasOnDuplicate: true
  }
});

// Strict regex matching the exact historical INSERT INTO schema_versions format (with optional trailing semicolon)
const LEGACY_MARKER_REGEX = /^\s*INSERT\s+INTO\s+`?schema_versions`?\s*\(\s*`?version`?\s*,\s*`?applied_at`?\s*,\s*`?description`?\s*\)\s*VALUES\s*\(\s*'(\d{3})'\s*,\s*NOW\(\)\s*,\s*'([^']+)'\s*\)(?:\s+ON\s+DUPLICATE\s+KEY\s+UPDATE\s+[\s\S]*?)?\s*;?\s*$/i;

/**
 * Checks if a SQL statement attempts to insert into schema_versions.
 * @param {string} sql
 * @returns {boolean}
 */
function isSchemaVersionsInsert(sql) {
  if (!sql || typeof sql !== 'string') return false;
  return /^\s*INSERT\s+INTO\s+`?schema_versions`?/i.test(sql);
}

/**
 * Handles a legacy phase marker statement if it matches the authorized pattern.
 *
 * @param {object} connection - MySQL connection
 * @param {string} sql - SQL statement being executed
 * @param {string} currentMigrationFilename - Filename of the migration being executed
 * @returns {Promise<boolean>} true if the statement was handled as an authorized legacy phase marker; false if it's unrelated SQL.
 * @throws {Error} If the statement targets schema_versions from an authorized migration but violates contract/integrity.
 */
async function handleLegacyPhaseMarkerStatement(connection, sql, currentMigrationFilename) {
  if (!sql || typeof sql !== 'string') return false;

  const match = sql.match(LEGACY_MARKER_REGEX);
  if (!match) {
    // If it's attempting to insert into schema_versions inside 080-091 but does not match the exact syntax, reject explicitly
    if (isSchemaVersionsInsert(sql) && currentMigrationFilename) {
      const isAuthorizedFile = Object.values(LEGACY_PHASE_MARKERS).some(m => m.file === currentMigrationFilename);
      if (isAuthorizedFile) {
        throw new Error(`UNAUTHORIZED_SCHEMA_VERSIONS_INSERT_FORMAT: Statement in ${currentMigrationFilename} does not match exact legacy marker specification`);
      }
    }
    return false;
  }

  const rawVersion = match[1];
  const rawDescription = match[2];

  // 1. Version must be in authorized whitelist
  const authorized = LEGACY_PHASE_MARKERS[rawVersion];
  if (!authorized) {
    throw new Error(`UNAUTHORIZED_LEGACY_PHASE_MARKER_VERSION: Version '${rawVersion}' is not an authorized legacy phase marker`);
  }

  // 2. Provenance must match authorized migration file
  if (!currentMigrationFilename || currentMigrationFilename !== authorized.file) {
    throw new Error(`UNAUTHORIZED_LEGACY_PHASE_MARKER_PROVENANCE: Version '${rawVersion}' cannot be emitted by '${currentMigrationFilename}', expected '${authorized.file}'`);
  }

  // 3. Description must strictly match canonical description
  if (rawDescription !== authorized.description) {
    throw new Error(`LEGACY_PHASE_MARKER_DESCRIPTION_MISMATCH: Expected '${authorized.description}' but got '${rawDescription}' in ${currentMigrationFilename}`);
  }

  // 4. Concurrency & collision check: inspect existing row for this version
  const [existingRows] = await connection.query(
    'SELECT version, description, record_type, checksum, state FROM schema_versions WHERE version = ?',
    [rawVersion]
  );

  if (existingRows && existingRows.length > 0) {
    const existing = existingRows[0];
    
    // Never allow a PHASE_MARKER to overwrite or collide with a real MIGRATION
    if (existing.record_type === 'MIGRATION') {
      throw new Error(`COLLISION_WITH_REAL_MIGRATION: Version '${rawVersion}' is already registered as a real MIGRATION`);
    }

    // Idempotency: verify identical phase marker
    const sameDescription = (existing.description === authorized.description);
    const sameType = (existing.record_type === 'PHASE_MARKER');
    const sameChecksum = (existing.checksum === '');
    const isApplied = (existing.state === 'APPLIED');

    if (sameDescription && sameType && sameChecksum && isApplied) {
      // Exactly identical: idempotent no-op
      return true;
    }

    throw new Error(`INCOMPATIBLE_EXISTING_PHASE_MARKER: Version '${rawVersion}' exists with conflicting state (record_type=${existing.record_type}, checksum=${existing.checksum}, state=${existing.state}, description=${existing.description})`);
  }

  // 5. Safe insert with strict record_type='PHASE_MARKER' and checksum=''
  // Using INSERT ... ON DUPLICATE KEY UPDATE to guarantee safe behavior under concurrency
  await connection.query(`
    INSERT INTO schema_versions (
      version,
      description,
      record_type,
      checksum,
      state,
      execution_id,
      runner_id,
      started_at,
      applied_at
    ) VALUES (?, ?, 'PHASE_MARKER', '', 'APPLIED', '00000000-0000-0000-0000-000000000000', 'legacy-adapter', NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE
      description = VALUES(description),
      record_type = IF(record_type = 'MIGRATION', 'MIGRATION', 'PHASE_MARKER'),
      checksum = IF(record_type = 'MIGRATION', checksum, ''),
      state = IF(record_type = 'MIGRATION', state, 'APPLIED')
  `, [rawVersion, authorized.description]);

  return true;
}

module.exports = {
  LEGACY_PHASE_MARKERS,
  LEGACY_MARKER_REGEX,
  isSchemaVersionsInsert,
  handleLegacyPhaseMarkerStatement
};
