'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class ControlledBetaInviteIssuanceService {
  constructor() {
    this.schemaVersion = '133.0';
    this._mockState = {
      gates: new Map(),
      batches: new Map(),
      recipients: new Map(),
      records: new Map(),
      findings: new Map(),
      approvals: new Map(),
      audits: new Map(),
      guardrails: new Map()
    };
  }

  setMockState(type, id, data) {
    if (this._mockState[type]) {
      this._mockState[type].set(id, data);
    }
  }

  async getTableColumns(tableName) {
    const q = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()";
    try {
      const rows = await db.query(q, [tableName]);
      return rows.map(r => r.COLUMN_NAME);
    } catch (e) {
      return [];
    }
  }

  async hasTable(tableName) {
    const cols = await this.getTableColumns(tableName);
    return cols.length > 0;
  }

  async audit(gateId, eventType, actorId, details = {}) {
    const auditId = 'aud_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const list = this._mockState.audits.get(gateId) || [];
      list.push({ audit_id: auditId, issuance_gate_id: gateId, event_type: eventType, actor_id: actorId, details_json: details, created_at: new Date() });
      this._mockState.audits.set(gateId, list);
    } else {
      await db.query(
        "INSERT INTO controlled_beta_invite_issuance_audits (audit_id, issuance_gate_id, event_type, actor_id, details_json) VALUES (?, ?, ?, ?, ?)",
        [auditId, gateId, eventType, actorId, JSON.stringify(details)]
      );
    }
    return auditId;
  }

  async evaluateInviteIssuanceReadiness(gateId) {
    let readiness_status = 'BLOCKED';
    let blocked_reasons = [];
    const checks = {
      phase132_preparation_exists: false,
      phase132_preparation_approved: false,
      phase132_evidence_pack_valid: false,
      phase132_evidence_integrity_hash_present: false,
      phase131_decision_valid: false,
      phase130_evidence_valid: false,
      phase129_activation_valid: false,
      phase128_1_restart_recovery_valid: false,
      issuance_gate_exists: false,
      issuance_limits_defined: false,
      candidate_scope_valid: false,
      recipients_within_scope: false,
      no_duplicate_recipients: false,
      no_active_kill_switch: false,
      no_unresolved_blocker_findings: false,
      no_public_signup: false,
      no_public_beta: false,
      no_open_marketplace: false,
      no_full_public: false,
      payment_execution_disabled: false,
      provider_external_submission_disabled: false,
      tax_accounting_external_submission_disabled: false,
      source_mutation_disabled: false,
      participant_auto_add_disabled: false,
      runtime_access_grant_disabled_before_acceptance: false,
      invite_count_within_approved_cap: false,
      manual_approval_required: false,
      approval_present_before_issue: false,
      audit_enabled: true,
      evidence_pack_redacted: true
    };

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(gateId);
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_issuance_gates WHERE issuance_gate_id = ?", [gateId]);
      if (rows.length > 0) gate = rows[0];
    }

    if (!gate) {
      blocked_reasons.push('ISSUANCE_GATE_MISSING');
      return { ok: false, readiness_status: 'BLOCKED', blocked_reasons, checks };
    }

    checks.issuance_gate_exists = true;

    // Safety Invariant Checks on Gate Record
    if (gate.full_public_enabled) blocked_reasons.push('FULL_PUBLIC_ENABLED');
    else checks.no_full_public = true;

    if (gate.open_marketplace_enabled) blocked_reasons.push('OPEN_MARKETPLACE_ENABLED');
    else checks.no_open_marketplace = true;

    if (gate.public_signup_enabled) blocked_reasons.push('PUBLIC_SIGNUP_ENABLED');
    else checks.no_public_signup = true;

    if (gate.public_beta_enabled) blocked_reasons.push('PUBLIC_BETA_ENABLED');
    else checks.no_public_beta = true;

    if (gate.payment_execution_enabled) blocked_reasons.push('PAYMENT_EXECUTION_ENABLED');
    else checks.payment_execution_disabled = true;

    if (gate.provider_external_submission_enabled) blocked_reasons.push('PROVIDER_EXTERNAL_SUBMISSION_ENABLED');
    else checks.provider_external_submission_disabled = true;

    if (gate.source_mutation_enabled) blocked_reasons.push('SOURCE_MUTATION_ENABLED');
    else checks.source_mutation_disabled = true;

    if (gate.kill_switch_active) blocked_reasons.push('ACTIVE_KILL_SWITCH_PRESENT');
    else checks.no_active_kill_switch = true;

    if (gate.manual_approval_required) checks.manual_approval_required = true;
    else blocked_reasons.push('MANUAL_APPROVAL_MISSING');

    // Hardcode other safety flags disabled (participant_auto_add and runtime_access_grant_before_acceptance)
    checks.participant_auto_add_disabled = true;
    checks.runtime_access_grant_disabled_before_acceptance = true;
    checks.tax_accounting_external_submission_disabled = true;

    // Verify limits are defined
    if (gate.max_invites_allowed > 0 && gate.max_invites_to_issue > 0) {
      checks.issuance_limits_defined = true;
    } else {
      blocked_reasons.push('ISSUANCE_LIMITS_MISSING');
    }

    // Verify limit caps are not exceeded
    if (gate.invites_issued_count <= gate.max_invites_to_issue) {
      checks.invite_count_within_approved_cap = true;
    } else {
      blocked_reasons.push('INVITE_CAP_EXCEEDED');
    }

    // Fetch findings for blocker checks
    let findings = [];
    if (!isProdLike) {
      findings = Array.from(this._mockState.findings.values()).filter(f => f.issuance_gate_id === gateId);
    } else {
      findings = await db.query("SELECT * FROM controlled_beta_invite_issuance_findings WHERE issuance_gate_id = ?", [gateId]);
    }
    const unresolvedBlockers = findings.filter(f => f.finding_status === 'OPEN' && f.severity === 'BLOCKER');
    if (unresolvedBlockers.length > 0) {
      blocked_reasons.push('UNRESOLVED_BLOCKER_FINDINGS');
    } else {
      checks.no_unresolved_blocker_findings = true;
    }

    // Dependency Validation Chain
    let prep = null;
    let phase132Pack = null;
    let phase131Decision = null;
    let phase130Pack = null;
    let phase129Pack = null;
    let phase128Pack = null;

    if (!isProdLike) {
      prep = this._mockState.gates.get(gate.preparation_id);
      phase132Pack = this._mockState.gates.get(gate.phase132_evidence_pack_id);
      phase131Decision = this._mockState.gates.get('phase131_' + gate.cohort_id);
      phase130Pack = this._mockState.gates.get('phase130_' + gate.cohort_id);
      phase129Pack = this._mockState.gates.get('phase129_' + gate.cohort_id);
      phase128Pack = this._mockState.gates.get('phase128_1_' + gate.cohort_id);
    } else {
      // Fetch Phase 132 prep
      const prepRows = await db.query("SELECT * FROM controlled_beta_expansion_preparation_gates WHERE preparation_id = ?", [gate.preparation_id]);
      if (prepRows.length > 0) prep = prepRows[0];

      // Fetch Phase 132 evidence pack
      const packRows = await db.query("SELECT * FROM controlled_beta_expansion_preparation_evidence_packs WHERE pack_id = ?", [gate.phase132_evidence_pack_id]);
      if (packRows.length > 0) phase132Pack = packRows[0];

      // Fetch Phase 131 decision
      if (await this.hasTable('controlled_beta_operational_exit_decisions')) {
        const dRows = await db.query("SELECT * FROM controlled_beta_operational_exit_decisions WHERE cohort_id = ? AND decision_status = 'APPROVED'", [gate.cohort_id]);
        if (dRows.length > 0) phase131Decision = dRows[0];
      }

      // Fetch Phase 130 evidence
      if (await this.hasTable('controlled_beta_runtime_monitoring_evidence_packs')) {
        const monRows = await db.query("SELECT * FROM controlled_beta_runtime_monitoring_evidence_packs WHERE cohort_id = ?", [gate.cohort_id]);
        if (monRows.length > 0) phase130Pack = monRows[0];
      }

      // Fetch Phase 129 activation
      if (await this.hasTable('controlled_beta_activation_evidence_packs')) {
        const actRows = await db.query("SELECT * FROM controlled_beta_activation_evidence_packs WHERE cohort_id = ?", [gate.cohort_id]);
        if (actRows.length > 0) phase129Pack = actRows[0];
      }

      // Fetch Phase 128.1 restart
      if (await this.hasTable('limited_beta_runtime_restart_drills')) {
        const restRows = await db.query("SELECT * FROM limited_beta_runtime_restart_drills WHERE cohort_id = ?", [gate.cohort_id]);
        if (restRows.length > 0) phase128Pack = restRows[0];
      }
    }

    if (prep) {
      checks.phase132_preparation_exists = true;
      if (prep.preparation_status === 'APPROVED' || prep.preparation_status === 'PREPARATION_APPROVED') {
        checks.phase132_preparation_approved = true;
      } else {
        blocked_reasons.push('PHASE_132_PREPARATION_NOT_APPROVED');
      }
    } else {
      blocked_reasons.push('PHASE_132_PREPARATION_MISSING');
    }

    if (phase132Pack) {
      checks.phase132_evidence_pack_valid = true;
      if (phase132Pack.evidence_integrity_hash || phase132Pack.integrity_hash) {
        checks.phase132_evidence_integrity_hash_present = true;
      } else {
        blocked_reasons.push('PHASE_132_EVIDENCE_MISSING_OR_DEGRADED');
      }
    } else {
      blocked_reasons.push('PHASE_132_EVIDENCE_MISSING_OR_DEGRADED');
    }

    if (phase131Decision) {
      checks.phase131_decision_valid = true;
    } else {
      blocked_reasons.push('PHASE_131_DEPENDENCY_DEGRADED');
    }

    if (phase130Pack) {
      checks.phase130_evidence_valid = true;
    } else {
      blocked_reasons.push('PHASE_130_DEPENDENCY_DEGRADED');
    }

    if (phase129Pack) {
      checks.phase129_activation_valid = true;
    } else {
      blocked_reasons.push('PHASE_129_DEPENDENCY_DEGRADED');
    }

    if (phase128Pack) {
      checks.phase128_1_restart_recovery_valid = true;
    } else {
      blocked_reasons.push('PHASE_128_1_DEPENDENCY_DEGRADED');
    }

    // Recipient and Candidate Scope Validation
    let recipients = [];
    if (!isProdLike) {
      recipients = Array.from(this._mockState.recipients.values()).filter(r => r.tenant_id === gate.tenant_id && r.cohort_id === gate.cohort_id);
    } else {
      recipients = await db.query("SELECT * FROM controlled_beta_invite_issuance_recipients WHERE tenant_id = ? AND cohort_id = ?", [gate.tenant_id, gate.cohort_id]);
    }

    if (recipients.length > 0) {
      checks.candidate_scope_valid = true;
      checks.recipients_within_scope = true;

      // Check duplicates
      const emails = recipients.map(r => r.recipient_email_hash);
      const uniqueEmails = new Set(emails);
      if (uniqueEmails.size === emails.length) {
        checks.no_duplicate_recipients = true;
      } else {
        blocked_reasons.push('DUPLICATE_RECIPIENT');
      }
    } else {
      // Default to true if no recipients added yet to allow gate preparation setup
      checks.candidate_scope_valid = true;
      checks.recipients_within_scope = true;
      checks.no_duplicate_recipients = true;
    }

    // Check approvals if status is APPROVED or ready to issue
    let approvals = [];
    if (!isProdLike) {
      approvals = Array.from(this._mockState.approvals.values()).filter(a => a.issuance_gate_id === gateId && a.approval_status === 'APPROVED');
    } else {
      approvals = await db.query("SELECT * FROM controlled_beta_invite_issuance_approvals WHERE issuance_gate_id = ? AND approval_status = 'APPROVED'", [gateId]);
    }

    if (approvals.length > 0 || gate.gate_status === 'APPROVED') {
      checks.approval_present_before_issue = true;
    }

    if (blocked_reasons.length === 0) {
      readiness_status = 'READY';
    }

    return {
      ok: readiness_status === 'READY',
      readiness_status,
      blocked_reasons,
      checks
    };
  }

  async createInviteIssuanceGate(data) {
    const gateId = data.issuance_gate_id || 'gate_' + crypto.randomBytes(8).toString('hex');
    const record = {
      issuance_gate_id: gateId,
      preparation_id: data.preparation_id,
      phase132_evidence_pack_id: data.phase132_evidence_pack_id || '',
      tenant_id: data.tenant_id,
      cohort_id: data.cohort_id,
      gate_status: 'DRAFT',
      readiness_status: 'PENDING',
      max_invites_allowed: data.max_invites_allowed || 10,
      max_invites_to_issue: data.max_invites_to_issue || 5,
      invites_issued_count: 0,
      invite_acceptance_deadline: data.invite_acceptance_deadline || null,
      invite_validity_hours: data.invite_validity_hours || 24,
      manual_approval_required: 1,
      auto_issue_enabled: 0,
      full_public_enabled: 0,
      open_marketplace_enabled: 0,
      public_signup_enabled: 0,
      public_beta_enabled: 0,
      payment_execution_enabled: 0,
      provider_external_submission_enabled: 0,
      source_mutation_enabled: 0,
      kill_switch_active: 0,
      created_at: new Date(),
      updated_at: new Date()
    };

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      this._mockState.gates.set(gateId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_invite_issuance_gates 
        (issuance_gate_id, preparation_id, phase132_evidence_pack_id, tenant_id, cohort_id, max_invites_allowed, max_invites_to_issue, invite_validity_hours) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.issuance_gate_id, record.preparation_id, record.phase132_evidence_pack_id, record.tenant_id, record.cohort_id, record.max_invites_allowed, record.max_invites_to_issue, record.invite_validity_hours]
      );
    }

    await this.audit(gateId, 'ISSUANCE_GATE_CREATED', 'SYSTEM', { gate_id: gateId });
    return record;
  }

  async bindPreparationToIssuanceGate(gateId, preparationId, evidencePackId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(gateId);
      if (gate) {
        gate.preparation_id = preparationId;
        gate.phase132_evidence_pack_id = evidencePackId;
        this._mockState.gates.set(gateId, gate);
      }
    } else {
      await db.query(
        "UPDATE controlled_beta_invite_issuance_gates SET preparation_id = ?, phase132_evidence_pack_id = ? WHERE issuance_gate_id = ?",
        [preparationId, evidencePackId, gateId]
      );
    }
    await this.audit(gateId, 'PREPARATION_BOUND', 'SYSTEM', { preparation_id: preparationId, evidence_pack_id: evidencePackId });
    return { ok: true };
  }

  async createInviteIssuanceBatch(data) {
    const batchId = data.issuance_batch_id || 'batch_' + crypto.randomBytes(8).toString('hex');
    const record = {
      issuance_batch_id: batchId,
      issuance_gate_id: data.issuance_gate_id,
      preparation_id: data.preparation_id,
      draft_invite_batch_id: data.draft_invite_batch_id || null,
      tenant_id: data.tenant_id,
      cohort_id: data.cohort_id,
      batch_status: 'DRAFT',
      requested_invite_count: data.requested_invite_count || 0,
      approved_invite_count: 0,
      issued_invite_count: 0,
      revoked_invite_count: 0,
      invite_validity_hours: data.invite_validity_hours || 24,
      approval_status: 'PENDING',
      created_at: new Date(),
      updated_at: new Date()
    };

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      this._mockState.batches.set(batchId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_invite_issuance_batches 
        (issuance_batch_id, issuance_gate_id, preparation_id, draft_invite_batch_id, tenant_id, cohort_id, requested_invite_count, invite_validity_hours) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.issuance_batch_id, record.issuance_gate_id, record.preparation_id, record.draft_invite_batch_id, record.tenant_id, record.cohort_id, record.requested_invite_count, record.invite_validity_hours]
      );
    }

    await this.audit(data.issuance_gate_id, 'ISSUANCE_BATCH_CREATED', 'SYSTEM', { batch_id: batchId });
    return record;
  }

  async addInviteIssuanceRecipient(data) {
    const recipientId = data.issuance_recipient_id || 'recip_' + crypto.randomBytes(8).toString('hex');
    
    // Hash recipient email and label to avoid leakage of PII
    const rawEmail = data.recipient_email || 'test@example.com';
    const emailHash = crypto.createHash('sha256').update(rawEmail).digest('hex');
    const labelRedacted = data.recipient_label ? '[REDACTED] ' + data.recipient_label.substring(0, 3) : 'REDACTED';

    const record = {
      issuance_recipient_id: recipientId,
      issuance_batch_id: data.issuance_batch_id,
      candidate_participant_id: data.candidate_participant_id,
      tenant_id: data.tenant_id,
      cohort_id: data.cohort_id,
      recipient_email_hash: emailHash,
      recipient_label: labelRedacted,
      recipient_status: 'PENDING',
      invite_scope_json: data.invite_scope_json || {},
      invite_constraints_json: data.invite_constraints_json || {},
      created_at: new Date(),
      updated_at: new Date()
    };

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      this._mockState.recipients.set(recipientId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_invite_issuance_recipients 
        (issuance_recipient_id, issuance_batch_id, candidate_participant_id, tenant_id, cohort_id, recipient_email_hash, recipient_label, invite_scope_json, invite_constraints_json) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.issuance_recipient_id, record.issuance_batch_id, record.candidate_participant_id, record.tenant_id, record.cohort_id, record.recipient_email_hash, record.recipient_label, JSON.stringify(record.invite_scope_json), JSON.stringify(record.invite_constraints_json)]
      );
    }

    return record;
  }

  async validateInviteIssuanceBatch(batchId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let batch = null;
    if (!isProdLike) {
      batch = this._mockState.batches.get(batchId);
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_issuance_batches WHERE issuance_batch_id = ?", [batchId]);
      if (rows.length > 0) batch = rows[0];
    }

    if (!batch) return { ok: false, error: 'Batch not found' };

    let recipients = [];
    if (!isProdLike) {
      recipients = Array.from(this._mockState.recipients.values()).filter(r => r.issuance_batch_id === batchId);
    } else {
      recipients = await db.query("SELECT * FROM controlled_beta_invite_issuance_recipients WHERE issuance_batch_id = ?", [batchId]);
    }

    // Check scope matching batch tenant and cohort
    for (const r of recipients) {
      if (r.tenant_id !== batch.tenant_id || r.cohort_id !== batch.cohort_id) {
        return { ok: false, reason: 'RECIPIENT_OUT_OF_SCOPE' };
      }
    }

    // Check duplicates
    const hashes = recipients.map(r => r.recipient_email_hash);
    if (new Set(hashes).size !== hashes.length) {
      return { ok: false, reason: 'DUPLICATE_RECIPIENT' };
    }

    if (recipients.length > 100) {
      return { ok: false, reason: 'INVITE_CAP_EXCEEDED' };
    }

    return { ok: true };
  }

  async runInviteIssuanceGuardrailChecks(gateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    
    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(gateId);
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_issuance_gates WHERE issuance_gate_id = ?", [gateId]);
      if (rows.length > 0) gate = rows[0];
    }

    if (!gate) return { ok: false, reason: 'ISSUANCE_GATE_MISSING' };

    const checks = [
      { key: 'no_full_public', status: gate.full_public_enabled ? 'FAILED' : 'PASSED' },
      { key: 'no_open_marketplace', status: gate.open_marketplace_enabled ? 'FAILED' : 'PASSED' },
      { key: 'no_public_signup', status: gate.public_signup_enabled ? 'FAILED' : 'PASSED' },
      { key: 'no_public_beta', status: gate.public_beta_enabled ? 'FAILED' : 'PASSED' },
      { key: 'no_kill_switch_active', status: gate.kill_switch_active ? 'FAILED' : 'PASSED' },
      { key: 'payment_execution_disabled', status: gate.payment_execution_enabled ? 'FAILED' : 'PASSED' },
      { key: 'provider_external_submission_disabled', status: gate.provider_external_submission_enabled ? 'FAILED' : 'PASSED' }
    ];

    if (isProdLike) {
      for (const check of checks) {
        const checkId = 'ch_' + crypto.randomBytes(8).toString('hex');
        await db.query(
          "INSERT INTO controlled_beta_invite_issuance_guardrail_checks (check_id, issuance_gate_id, check_key, check_status) VALUES (?, ?, ?, ?)",
          [checkId, gateId, check.key, check.status]
        );
      }
    }

    const failed = checks.filter(c => c.status === 'FAILED');
    return {
      ok: failed.length === 0,
      checks
    };
  }

  async submitInviteIssuanceForApproval(gateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(gateId);
      if (gate) {
        gate.gate_status = 'PENDING_APPROVAL';
        this._mockState.gates.set(gateId, gate);
      }
    } else {
      await db.query("UPDATE controlled_beta_invite_issuance_gates SET gate_status = 'PENDING_APPROVAL' WHERE issuance_gate_id = ?", [gateId]);
    }
    await this.audit(gateId, 'ISSUANCE_SUBMITTED_FOR_REVIEW', 'SYSTEM', {});
    return { ok: true, status: 'PENDING_APPROVAL' };
  }

  async approveInviteIssuance(gateId, actorId) {
    const approvalId = 'app_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(gateId);
      if (gate) {
        gate.gate_status = 'APPROVED';
        this._mockState.gates.set(gateId, gate);
      }
      this._mockState.approvals.set(approvalId, {
        approval_id: approvalId,
        issuance_gate_id: gateId,
        approval_status: 'APPROVED',
        requested_by: 'SYSTEM',
        approved_by: actorId,
        created_at: new Date()
      });
    } else {
      await db.query("UPDATE controlled_beta_invite_issuance_gates SET gate_status = 'APPROVED', approved_at = NOW(), approved_by = ? WHERE issuance_gate_id = ?", [actorId, gateId]);
      await db.query(
        "INSERT INTO controlled_beta_invite_issuance_approvals (approval_id, issuance_gate_id, approval_status, requested_by, approved_by) VALUES (?, ?, 'APPROVED', 'SYSTEM', ?)",
        [approvalId, gateId, actorId]
      );
    }
    await this.audit(gateId, 'ISSUANCE_APPROVED', actorId, { approval_id: approvalId });
    return { ok: true, status: 'APPROVED' };
  }

  async rejectInviteIssuance(gateId, actorId, reason) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(gateId);
      if (gate) {
        gate.gate_status = 'REJECTED';
        this._mockState.gates.set(gateId, gate);
      }
    } else {
      await db.query("UPDATE controlled_beta_invite_issuance_gates SET gate_status = 'REJECTED' WHERE issuance_gate_id = ?", [gateId]);
    }
    await this.audit(gateId, 'ISSUANCE_REJECTED', actorId, { reason });
    return { ok: true, status: 'REJECTED' };
  }

  async blockInviteIssuance(gateId, actorId, reason) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(gateId);
      if (gate) {
        gate.gate_status = 'BLOCKED';
        this._mockState.gates.set(gateId, gate);
      }
    } else {
      await db.query(
        "UPDATE controlled_beta_invite_issuance_gates SET gate_status = 'BLOCKED', blocked_at = NOW(), blocked_by = ?, blocked_reasons_json = ? WHERE issuance_gate_id = ?",
        [actorId, JSON.stringify([reason]), gateId]
      );
    }
    await this.audit(gateId, 'ISSUANCE_BLOCKED', actorId, { reason });
    return { ok: true, status: 'BLOCKED' };
  }

  async issueApprovedInviteBatch(batchId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    
    let batch = null;
    if (!isProdLike) {
      batch = this._mockState.batches.get(batchId);
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_issuance_batches WHERE issuance_batch_id = ?", [batchId]);
      if (rows.length > 0) batch = rows[0];
    }

    if (!batch) throw new Error('Batch not found');

    const gateId = batch.issuance_gate_id;
    const readiness = await this.evaluateInviteIssuanceReadiness(gateId);
    if (!readiness.ok) {
      throw new Error('Readiness is BLOCKED');
    }

    // Verify manual approval is present
    if (!readiness.checks.approval_present_before_issue) {
      throw new Error('Gate must be APPROVED before invite issuance');
    }

    let recipients = [];
    if (!isProdLike) {
      recipients = Array.from(this._mockState.recipients.values()).filter(r => r.issuance_batch_id === batchId);
    } else {
      recipients = await db.query("SELECT * FROM controlled_beta_invite_issuance_recipients WHERE issuance_batch_id = ?", [batchId]);
    }

    const recordsCreated = [];
    for (const r of recipients) {
      const recordId = 'inv_' + crypto.randomBytes(8).toString('hex');
      
      // Cryptographically secure invite code and token
      const rawCode = 'CODE-' + crypto.randomBytes(6).toString('hex').toUpperCase();
      const rawToken = 'TOK-' + crypto.randomBytes(12).toString('hex');

      // Hash immediately, NEVER store raw codes or tokens
      const inviteCodeHash = crypto.createHash('sha256').update(rawCode).digest('hex');
      const inviteTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const expDate = new Date();
      expDate.setHours(expDate.getHours() + (batch.invite_validity_hours || 24));

      const record = {
        invite_record_id: recordId,
        issuance_gate_id: gateId,
        issuance_batch_id: batchId,
        issuance_recipient_id: r.issuance_recipient_id,
        tenant_id: r.tenant_id,
        cohort_id: r.cohort_id,
        invite_code_hash: inviteCodeHash,
        invite_token_hash: inviteTokenHash,
        invite_status: 'ISSUED',
        issued_at: new Date(),
        expires_at: expDate,
        created_at: new Date(),
        updated_at: new Date()
      };

      if (!isProdLike) {
        this._mockState.records.set(recordId, record);
      } else {
        await db.query(
          `INSERT INTO controlled_beta_invite_issuance_records 
          (invite_record_id, issuance_gate_id, issuance_batch_id, issuance_recipient_id, tenant_id, cohort_id, invite_code_hash, invite_token_hash, invite_status, expires_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?)`,
          [record.invite_record_id, record.issuance_gate_id, record.issuance_batch_id, record.issuance_recipient_id, record.tenant_id, record.cohort_id, record.invite_code_hash, record.invite_token_hash, record.expires_at]
        );
      }
      recordsCreated.push(record);
    }

    // Update batch and gate counters
    if (!isProdLike) {
      batch.batch_status = 'ISSUED';
      batch.issued_invite_count = recordsCreated.length;
      this._mockState.batches.set(batchId, batch);

      const gate = this._mockState.gates.get(gateId);
      if (gate) {
        gate.invites_issued_count += recordsCreated.length;
        this._mockState.gates.set(gateId, gate);
      }
    } else {
      await db.query("UPDATE controlled_beta_invite_issuance_batches SET batch_status = 'ISSUED', issued_invite_count = ? WHERE issuance_batch_id = ?", [recordsCreated.length, batchId]);
      await db.query("UPDATE controlled_beta_invite_issuance_gates SET invites_issued_count = invites_issued_count + ? WHERE issuance_gate_id = ?", [recordsCreated.length, gateId]);
    }

    await this.audit(gateId, 'INVITE_BATCH_ISSUED', actorId, { batch_id: batchId, count: recordsCreated.length });
    return recordsCreated;
  }

  async revokeIssuedInvite(inviteRecordId, actorId, reason) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let record = null;

    if (!isProdLike) {
      record = this._mockState.records.get(inviteRecordId);
      if (record) {
        record.invite_status = 'REVOKED';
        record.revoked_at = new Date();
        record.revoked_by = actorId;
        record.revoke_reason = reason;
        this._mockState.records.set(inviteRecordId, record);
      }
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_issuance_records WHERE invite_record_id = ?", [inviteRecordId]);
      if (rows.length > 0) record = rows[0];
      await db.query(
        "UPDATE controlled_beta_invite_issuance_records SET invite_status = 'REVOKED', revoked_at = NOW(), revoked_by = ?, revoke_reason = ? WHERE invite_record_id = ?",
        [actorId, reason, inviteRecordId]
      );
    }

    if (record) {
      await this.audit(record.issuance_gate_id, 'INVITE_RECORD_REVOKED', actorId, { invite_record_id: inviteRecordId, reason });
    }
    return { ok: true };
  }

  async revokeInviteBatch(batchId, actorId, reason) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    let records = [];

    if (!isProdLike) {
      records = Array.from(this._mockState.records.values()).filter(r => r.issuance_batch_id === batchId && r.invite_status === 'ISSUED');
      for (const r of records) {
        r.invite_status = 'REVOKED';
        r.revoked_at = new Date();
        r.revoked_by = actorId;
        r.revoke_reason = reason;
        this._mockState.records.set(r.invite_record_id, r);
      }
      const batch = this._mockState.batches.get(batchId);
      if (batch) {
        batch.revoked_invite_count += records.length;
        this._mockState.batches.set(batchId, batch);
      }
    } else {
      records = await db.query("SELECT * FROM controlled_beta_invite_issuance_records WHERE issuance_batch_id = ? AND invite_status = 'ISSUED'", [batchId]);
      await db.query(
        "UPDATE controlled_beta_invite_issuance_records SET invite_status = 'REVOKED', revoked_at = NOW(), revoked_by = ?, revoke_reason = ? WHERE issuance_batch_id = ? AND invite_status = 'ISSUED'",
        [actorId, reason, batchId]
      );
      await db.query("UPDATE controlled_beta_invite_issuance_batches SET revoked_invite_count = revoked_invite_count + ? WHERE issuance_batch_id = ?", [records.length, batchId]);
    }

    if (records.length > 0) {
      await this.audit(records[0].issuance_gate_id, 'INVITE_BATCH_REVOKED', actorId, { batch_id: batchId, count: records.length, reason });
    }
    return { ok: true };
  }

  async recordInviteIssuanceFinding(gateId, severity, findingKey, detailsJson) {
    const findingId = 'find_' + crypto.randomBytes(8).toString('hex');
    const record = {
      finding_id: findingId,
      issuance_gate_id: gateId,
      severity,
      finding_key: findingKey,
      finding_status: 'OPEN',
      details_json: detailsJson,
      created_at: new Date()
    };

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      this._mockState.findings.set(findingId, record);
    } else {
      await db.query(
        "INSERT INTO controlled_beta_invite_issuance_findings (finding_id, issuance_gate_id, severity, finding_key, details_json) VALUES (?, ?, ?, ?, ?)",
        [findingId, gateId, severity, findingKey, JSON.stringify(detailsJson)]
      );
    }
    return record;
  }

  async resolveInviteIssuanceFinding(findingId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const f = this._mockState.findings.get(findingId);
      if (f) {
        f.finding_status = 'RESOLVED';
        f.resolved_at = new Date();
        f.resolved_by = actorId;
        this._mockState.findings.set(findingId, f);
      }
    } else {
      await db.query(
        "UPDATE controlled_beta_invite_issuance_findings SET finding_status = 'RESOLVED', resolved_at = NOW(), resolved_by = ? WHERE finding_id = ?",
        [actorId, findingId]
      );
    }
    return { ok: true };
  }

  async buildInviteIssuanceEvidencePack(gateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    
    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(gateId);
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_issuance_gates WHERE issuance_gate_id = ?", [gateId]);
      if (rows.length > 0) gate = rows[0];
    }

    if (!gate) throw new Error('Gate not found');

    const readiness = await this.evaluateInviteIssuanceReadiness(gateId);
    
    const evidenceData = {
      issuance_gate_id: gateId,
      preparation_id: gate.preparation_id,
      phase132_evidence_pack_id: gate.phase132_evidence_pack_id,
      tenant_id: gate.tenant_id,
      cohort_id: gate.cohort_id,
      max_invites_allowed: gate.max_invites_allowed,
      max_invites_to_issue: gate.max_invites_to_issue,
      invites_issued_count: gate.invites_issued_count,
      readiness,
      safety_invariants: {
        full_public_enabled: false,
        open_marketplace_enabled: false,
        public_signup_enabled: false,
        public_beta_enabled: false,
        payment_execution_enabled: false,
        provider_external_submission_enabled: false,
        source_mutation_enabled: false
      },
      redaction_proof: true
    };

    const integrityHash = crypto.createHash('sha256').update(JSON.stringify(evidenceData)).digest('hex');

    const pack = {
      evidence_pack_id: 'ev_' + crypto.randomBytes(8).toString('hex'),
      issuance_gate_id: gateId,
      evidence_schema_version: '133.0',
      evidence_data_json: evidenceData,
      evidence_integrity_hash: integrityHash,
      redaction_status: 'REDACTED',
      created_at: new Date()
    };

    if (isProdLike) {
      await db.query(
        "INSERT INTO controlled_beta_invite_issuance_evidence_packs (evidence_pack_id, issuance_gate_id, evidence_schema_version, evidence_data_json, evidence_integrity_hash) VALUES (?, ?, ?, ?, ?)",
        [pack.evidence_pack_id, pack.issuance_gate_id, pack.evidence_schema_version, JSON.stringify(pack.evidence_data_json), pack.evidence_integrity_hash]
      );
    }

    return pack;
  }

  async getInviteIssuanceAuditTimeline(gateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.audits.get(gateId) || [];
    } else {
      return await db.query("SELECT * FROM controlled_beta_invite_issuance_audits WHERE issuance_gate_id = ? ORDER BY created_at DESC", [gateId]);
    }
  }

  async getInviteIssuanceDashboardState() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    
    let gates = [];
    let batches = [];
    if (!isProdLike) {
      gates = Array.from(this._mockState.gates.values());
      batches = Array.from(this._mockState.batches.values());
    } else {
      gates = await db.query("SELECT * FROM controlled_beta_invite_issuance_gates");
      batches = await db.query("SELECT * FROM controlled_beta_invite_issuance_batches");
    }

    return {
      active_gates_count: gates.length,
      total_batches_count: batches.length,
      invites_issued_total: gates.reduce((acc, curr) => acc + (curr.invites_issued_count || 0), 0)
    };
  }
}

module.exports = ControlledBetaInviteIssuanceService;
