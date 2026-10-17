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
 * Strips only valid leading SQL line comments (-- ...) and preceding/following whitespace.
 * Preserves the rest of the SQL string unchanged.
 * @param {string} sql
 * @returns {string}
 */
function stripLeadingSqlComments(sql) {
  if (!sql || typeof sql !== 'string') return '';
  let s = sql.trimStart();
  while (s.startsWith('--')) {
    const newlineIndex = s.indexOf('\n');
    if (newlineIndex === -1) {
      return '';
    }
    s = s.slice(newlineIndex + 1).trimStart();
  }
  return s;
}

/**
 * Checks if a SQL statement attempts to insert into schema_versions.
 * @param {string} sql
 * @returns {boolean}
 */
function isSchemaVersionsInsert(sql) {
  if (!sql || typeof sql !== 'string') return false;
  const stripped = stripLeadingSqlComments(sql);
  return /^\s*INSERT\s+INTO\s+`?schema_versions`?/i.test(stripped);
}

/**
 * Validates whether an existing row in schema_versions matches the authorized phase marker specification.
 *
 * @param {object} existing - Existing row from schema_versions
 * @param {string} rawVersion - Version string ('080'..'091')
 * @param {string} expectedDescription - Canonical description string
 * @throws {Error} If the existing row collides with a MIGRATION or has incompatible state/data
 */
function validateExistingPhaseMarkerRow(existing, rawVersion, expectedDescription) {
  if (!existing) return;

  if (existing.record_type === 'MIGRATION') {
    throw new Error(`COLLISION_WITH_REAL_MIGRATION: Version '${rawVersion}' is already registered as a real MIGRATION`);
  }

  const sameDescription = (existing.description === expectedDescription);
  const sameType = (existing.record_type === 'PHASE_MARKER');
  const sameChecksum = (existing.checksum === '');
  const isApplied = (existing.state === 'APPLIED');

  if (!sameDescription || !sameType || !sameChecksum || !isApplied) {
    throw new Error(`INCOMPATIBLE_EXISTING_PHASE_MARKER: Version '${rawVersion}' exists with conflicting state (record_type=${existing.record_type}, checksum=${existing.checksum}, state=${existing.state}, description=${existing.description})`);
  }
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

  const normalizedSql = stripLeadingSqlComments(sql);
  const match = normalizedSql.match(LEGACY_MARKER_REGEX);

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

  // 4. Concurrency & collision check: inspect existing row for this version before insert
  const [existingRows] = await connection.query(
    'SELECT version, description, record_type, checksum, state FROM schema_versions WHERE version = ?',
    [rawVersion]
  );

  if (existingRows && existingRows.length > 0) {
    validateExistingPhaseMarkerRow(existingRows[0], rawVersion, authorized.description);
    // Exactly identical: idempotent no-op
    return true;
  }

  // 5. Safe insert with strict record_type='PHASE_MARKER' and checksum=''
  // Uses plain INSERT without ON DUPLICATE KEY UPDATE to prevent overwriting existing rows.
  // In the event of a race/concurrent insert triggering ER_DUP_ENTRY, inspect existing row safely.
  try {
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
    `, [rawVersion, authorized.description]);
  } catch (err) {
    // If a unique key collision occurs concurrently, verify that the existing row is fully valid and compatible
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      const [raceRows] = await connection.query(
        'SELECT version, description, record_type, checksum, state FROM schema_versions WHERE version = ?',
        [rawVersion]
      );
      if (raceRows && raceRows.length > 0) {
        validateExistingPhaseMarkerRow(raceRows[0], rawVersion, authorized.description);
        return true;
      }
    }
    // Propagate all other database errors unmodified
    throw err;
  }

  return true;
}

module.exports = {
  LEGACY_PHASE_MARKERS,
  LEGACY_MARKER_REGEX,
  stripLeadingSqlComments,
  isSchemaVersionsInsert,
  handleLegacyPhaseMarkerStatement
};
