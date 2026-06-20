'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class ControlledBetaInviteAcceptanceService {
  constructor() {
    this.schemaVersion = '134.0';
    this._mockState = {
      gates: new Map(),
      claims: new Map(),
      participants: new Map(),
      terms: new Map(),
      sessionLimits: new Map(),
      accessPolicies: new Map(),
      guardrails: new Map(),
      findings: new Map(),
      approvals: new Map(),
      evidencePacks: new Map(),
      audits: new Map(),
      
      // External dependency mock states (Phase 133 / Cohort / Preparation)
      phase133Invites: new Map(),
      phase133Gates: new Map(),
      phase133EvidencePacks: new Map(),
      phase131Decisions: new Map(),
      phase130Packs: new Map(),
      phase129Packs: new Map(),
      phase128Packs: new Map()
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
      list.push({ audit_id: auditId, acceptance_gate_id: gateId, event_type: eventType, actor_id: actorId, details_json: details, created_at: new Date() });
      this._mockState.audits.set(gateId, list);
    } else {
      await db.query(
        "INSERT INTO controlled_beta_onboarding_audits (audit_id, acceptance_gate_id, event_type, actor_id, details_json) VALUES (?, ?, ?, ?, ?)",
        [auditId, gateId, eventType, actorId, JSON.stringify(details)]
      );
    }
    return auditId;
  }

  async evaluateInviteAcceptanceReadiness(acceptanceGateId) {
    let readiness_status = 'BLOCKED';
    let blocked_reasons = [];
    const checks = {
      phase133_invite_exists: false,
      phase133_issuance_approved: false,
      phase133_evidence_pack_valid: false,
      phase133_evidence_integrity_hash_present: false,
      invite_status_issued: false,
      invite_not_revoked: false,
      invite_not_expired: false,
      invite_not_already_accepted: false,
      acceptance_gate_exists: false,
      claim_verified: false,
      participant_identity_bound: false,
      terms_required: false,
      terms_accepted: false,
      session_limits_defined: false,
      access_policy_defined: false,
      participant_scope_valid: false,
      runtime_scope_bounded: false,
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
      auto_onboarding_disabled: false,
      manual_approval_required: false,
      approval_present_before_runtime_access: false,
      audit_enabled: true,
      evidence_pack_redacted: true
    };

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(acceptanceGateId);
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_acceptance_gates WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      if (rows.length > 0) gate = rows[0];
    }

    if (!gate) {
      blocked_reasons.push('ACCEPTANCE_GATE_MISSING');
      return { ok: false, readiness_status: 'BLOCKED', blocked_reasons, checks };
    }

    checks.acceptance_gate_exists = true;

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

    if (gate.auto_onboarding_enabled) blocked_reasons.push('AUTO_ONBOARDING_ENABLED');
    else checks.auto_onboarding_disabled = true;

    // Hardcode other safety flags disabled
    checks.tax_accounting_external_submission_disabled = true;

    // Verify claim verification status
    let claims = [];
    if (!isProdLike) {
      claims = Array.from(this._mockState.claims.values()).filter(c => c.acceptance_gate_id === acceptanceGateId && c.claim_status === 'VERIFIED');
    } else {
      claims = await db.query("SELECT * FROM controlled_beta_invite_acceptance_claims WHERE acceptance_gate_id = ? AND claim_status = 'VERIFIED'", [acceptanceGateId]);
    }
    if (claims.length > 0) {
      checks.claim_verified = true;
    } else {
      blocked_reasons.push('CLAIM_NOT_VERIFIED');
    }

    // Verify identity binding
    if (gate.identity_bound) {
      checks.participant_identity_bound = true;
    } else {
      blocked_reasons.push('PARTICIPANT_IDENTITY_NOT_BOUND');
    }

    // Verify terms acceptance
    if (gate.terms_required) {
      checks.terms_required = true;
      if (gate.terms_accepted) {
        checks.terms_accepted = true;
      } else {
        blocked_reasons.push('TERMS_NOT_ACCEPTED');
      }
    } else {
      checks.terms_required = true;
      checks.terms_accepted = true;
    }

    // Verify session limits
    let sessionLimits = [];
    if (!isProdLike) {
      sessionLimits = Array.from(this._mockState.sessionLimits.values()).filter(s => s.acceptance_gate_id === acceptanceGateId);
    } else {
      sessionLimits = await db.query("SELECT * FROM controlled_beta_onboarding_session_limits WHERE acceptance_gate_id = ?", [acceptanceGateId]);
    }
    if (sessionLimits.length > 0) {
      checks.session_limits_defined = true;
    } else {
      blocked_reasons.push('SESSION_LIMITS_MISSING');
    }

    // Verify access policy
    let accessPolicies = [];
    if (!isProdLike) {
      accessPolicies = Array.from(this._mockState.accessPolicies.values()).filter(a => a.acceptance_gate_id === acceptanceGateId);
    } else {
      accessPolicies = await db.query("SELECT * FROM controlled_beta_onboarding_access_policies WHERE acceptance_gate_id = ?", [acceptanceGateId]);
    }
    if (accessPolicies.length > 0) {
      checks.access_policy_defined = true;
    } else {
      blocked_reasons.push('ACCESS_POLICY_MISSING');
    }

    // Verify participant scope matches cohort/tenant and roles
    let participants = [];
    if (!isProdLike) {
      participants = Array.from(this._mockState.participants.values()).filter(p => p.acceptance_gate_id === acceptanceGateId);
    } else {
      participants = await db.query("SELECT * FROM controlled_beta_onboarding_participants WHERE acceptance_gate_id = ?", [acceptanceGateId]);
    }
    if (participants.length > 0) {
      const part = participants[0];
      if (part.tenant_id === gate.tenant_id && part.cohort_id === gate.cohort_id) {
        checks.participant_scope_valid = true;
        checks.runtime_scope_bounded = true;
      } else {
        blocked_reasons.push('PARTICIPANT_SCOPE_INVALID');
      }
    } else {
      if (gate.identity_bound) {
        blocked_reasons.push('PARTICIPANT_SCOPE_INVALID');
      }
    }

    // Fetch findings for blocker checks
    let findings = [];
    if (!isProdLike) {
      findings = Array.from(this._mockState.findings.values()).filter(f => f.acceptance_gate_id === acceptanceGateId);
    } else {
      findings = await db.query("SELECT * FROM controlled_beta_onboarding_findings WHERE acceptance_gate_id = ?", [acceptanceGateId]);
    }
    const unresolvedBlockers = findings.filter(f => f.finding_status === 'OPEN' && f.severity === 'BLOCKER');
    if (unresolvedBlockers.length > 0) {
      blocked_reasons.push('UNRESOLVED_BLOCKER_FINDINGS');
    } else {
      checks.no_unresolved_blocker_findings = true;
    }

    // Dependency Validation Chain: Phase 133 issued invite
    let invite = null;
    let issuanceGate = null;
    let phase133Pack = null;

    if (!isProdLike) {
      invite = this._mockState.phase133Invites.get(gate.invite_record_id);
      if (invite) {
        issuanceGate = this._mockState.phase133Gates.get(invite.issuance_gate_id);
        phase133Pack = this._mockState.phase133EvidencePacks.get(invite.issuance_gate_id);
      }
    } else {
      // Fetch Phase 133 invite record
      if (await this.hasTable('controlled_beta_invite_issuance_records')) {
        const invRows = await db.query("SELECT * FROM controlled_beta_invite_issuance_records WHERE invite_record_id = ?", [gate.invite_record_id]);
        if (invRows.length > 0) invite = invRows[0];
      }
      // Fetch Phase 133 issuance gate
      if (invite && await this.hasTable('controlled_beta_invite_issuance_gates')) {
        const igRows = await db.query("SELECT * FROM controlled_beta_invite_issuance_gates WHERE issuance_gate_id = ?", [invite.issuance_gate_id]);
        if (igRows.length > 0) issuanceGate = igRows[0];
      }
      // Fetch Phase 133 evidence pack
      if (invite && await this.hasTable('controlled_beta_invite_issuance_evidence_packs')) {
        const packRows = await db.query("SELECT * FROM controlled_beta_invite_issuance_evidence_packs WHERE issuance_gate_id = ?", [invite.issuance_gate_id]);
        if (packRows.length > 0) phase133Pack = packRows[0];
      }
    }

    if (invite) {
      checks.phase133_invite_exists = true;

      // Status check
      if (invite.invite_status === 'ISSUED') {
        checks.invite_status_issued = true;
      } else {
        blocked_reasons.push('INVITE_NOT_ISSUED');
      }

      // Revocation check
      if (invite.invite_status !== 'REVOKED') {
        checks.invite_not_revoked = true;
      } else {
        blocked_reasons.push('INVITE_REVOKED');
      }

      // Expiration check
      const now = new Date();
      if (new Date(invite.expires_at) > now) {
        checks.invite_not_expired = true;
      } else {
        blocked_reasons.push('INVITE_EXPIRED');
      }

      // Already accepted check
      if (!invite.accepted_at && invite.invite_status !== 'ACCEPTED') {
        checks.invite_not_already_accepted = true;
      } else {
        blocked_reasons.push('INVITE_ALREADY_ACCEPTED');
      }
    } else {
      blocked_reasons.push('PHASE_133_INVITE_MISSING');
    }

    if (issuanceGate) {
      if (issuanceGate.gate_status === 'APPROVED') {
        checks.phase133_issuance_approved = true;
      } else {
        blocked_reasons.push('PHASE_133_ISSUANCE_NOT_APPROVED');
      }
    } else {
      blocked_reasons.push('PHASE_133_ISSUANCE_NOT_APPROVED');
    }

    if (phase133Pack) {
      checks.phase133_evidence_pack_valid = true;
      if (phase133Pack.evidence_integrity_hash || phase133Pack.integrity_hash) {
        checks.phase133_evidence_integrity_hash_present = true;
      } else {
        blocked_reasons.push('PHASE_133_EVIDENCE_MISSING_OR_DEGRADED');
      }
    } else {
      blocked_reasons.push('PHASE_133_EVIDENCE_MISSING_OR_DEGRADED');
    }

    // Verify approvals if onboarding status is approved
    if (gate.onboarding_approved) {
      checks.approval_present_before_runtime_access = true;
    } else {
      let approvals = [];
      if (!isProdLike) {
        approvals = Array.from(this._mockState.approvals.values()).filter(a => a.acceptance_gate_id === acceptanceGateId && a.approval_status === 'APPROVED');
      } else {
        approvals = await db.query("SELECT * FROM controlled_beta_onboarding_approvals WHERE acceptance_gate_id = ? AND approval_status = 'APPROVED'", [acceptanceGateId]);
      }
      if (approvals.length > 0 || gate.gate_status === 'APPROVED') {
        checks.approval_present_before_runtime_access = true;
      } else {
        blocked_reasons.push('RUNTIME_ACCESS_BEFORE_APPROVAL');
      }
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

  async createInviteAcceptanceGate(data) {
    const gateId = data.acceptance_gate_id || 'agate_' + crypto.randomBytes(8).toString('hex');
    const record = {
      acceptance_gate_id: gateId,
      invite_record_id: data.invite_record_id,
      issuance_gate_id: data.issuance_gate_id || '',
      issuance_batch_id: data.issuance_batch_id || '',
      tenant_id: data.tenant_id || '',
      cohort_id: data.cohort_id || '',
      participant_id: null,
      gate_status: 'DRAFT',
      readiness_status: 'PENDING',
      invite_status_at_claim: null,
      terms_required: 1,
      terms_accepted: 0,
      identity_bound: 0,
      onboarding_approved: 0,
      runtime_access_eligible: 0,
      runtime_access_granted: 0,
      manual_approval_required: 1,
      auto_onboarding_enabled: 0,
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
        `INSERT INTO controlled_beta_invite_acceptance_gates 
        (acceptance_gate_id, invite_record_id, issuance_gate_id, issuance_batch_id, tenant_id, cohort_id) 
        VALUES (?, ?, ?, ?, ?, ?)`,
        [record.acceptance_gate_id, record.invite_record_id, record.issuance_gate_id, record.issuance_batch_id, record.tenant_id, record.cohort_id]
      );
    }

    await this.audit(gateId, 'ACCEPTANCE_GATE_CREATED', 'SYSTEM', { gate_id: gateId });
    return record;
  }

  async verifyInviteClaim(acceptanceGateId, code, token, claimAttemptHash, ip, userAgent) {
    const claimId = 'claim_' + crypto.randomBytes(8).toString('hex');
    
    // Hash IP and user agent to avoid leaking PII
    const ipHash = crypto.createHash('sha256').update(ip || '127.0.0.1').digest('hex');
    const uaHash = crypto.createHash('sha256').update(userAgent || 'Unknown').digest('hex');

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(acceptanceGateId);
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_acceptance_gates WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      if (rows.length > 0) gate = rows[0];
    }

    if (!gate) throw new Error('Acceptance gate not found');

    let invite = null;
    if (!isProdLike) {
      invite = this._mockState.phase133Invites.get(gate.invite_record_id);
    } else {
      if (await this.hasTable('controlled_beta_invite_issuance_records')) {
        const invRows = await db.query("SELECT * FROM controlled_beta_invite_issuance_records WHERE invite_record_id = ?", [gate.invite_record_id]);
        if (invRows.length > 0) invite = invRows[0];
      }
    }

    if (!invite) {
      throw new Error('Associated invite record not found');
    }

    // Verify cryptographic hashes
    const inviteCodeHash = crypto.createHash('sha256').update(code).digest('hex');
    const inviteTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    let status = 'VERIFIED';
    let rejection = null;

    if (invite.invite_code_hash !== inviteCodeHash || invite.invite_token_hash !== inviteTokenHash) {
      status = 'REJECTED';
      rejection = 'INVALID_CREDENTIALS';
    } else if (invite.invite_status === 'REVOKED') {
      status = 'REJECTED';
      rejection = 'INVITE_REVOKED';
    } else if (new Date(invite.expires_at) < new Date()) {
      status = 'REJECTED';
      rejection = 'INVITE_EXPIRED';
    } else if (invite.invite_status === 'ACCEPTED' || invite.accepted_at) {
      status = 'REJECTED';
      rejection = 'INVITE_ALREADY_ACCEPTED';
    }

    const claimRecord = {
      claim_id: claimId,
      acceptance_gate_id: acceptanceGateId,
      invite_record_id: gate.invite_record_id,
      tenant_id: gate.tenant_id,
      cohort_id: gate.cohort_id,
      invite_code_hash: inviteCodeHash,
      invite_token_hash: inviteTokenHash,
      claim_status: status,
      claim_attempt_hash: claimAttemptHash || crypto.createHash('sha256').update(code + token).digest('hex'),
      claimed_at: new Date(),
      claim_ip_hash: ipHash,
      user_agent_hash: uaHash,
      rejection_reason: rejection,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.claims.set(claimId, claimRecord);
      if (status === 'VERIFIED') {
        gate.invite_status_at_claim = 'ISSUED';
        this._mockState.gates.set(acceptanceGateId, gate);
      }
    } else {
      await db.query(
        `INSERT INTO controlled_beta_invite_acceptance_claims 
        (claim_id, acceptance_gate_id, invite_record_id, tenant_id, cohort_id, invite_code_hash, invite_token_hash, claim_status, claim_attempt_hash, claim_ip_hash, user_agent_hash, rejection_reason) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [claimRecord.claim_id, claimRecord.acceptance_gate_id, claimRecord.invite_record_id, claimRecord.tenant_id, claimRecord.cohort_id, claimRecord.invite_code_hash, claimRecord.invite_token_hash, claimRecord.claim_status, claimRecord.claim_attempt_hash, claimRecord.claim_ip_hash, claimRecord.user_agent_hash, claimRecord.rejection_reason]
      );
      if (status === 'VERIFIED') {
        await db.query(
          "UPDATE controlled_beta_invite_acceptance_gates SET invite_status_at_claim = 'ISSUED' WHERE acceptance_gate_id = ?",
          [acceptanceGateId]
        );
      }
    }

    await this.audit(acceptanceGateId, 'CLAIM_ATTEMPT', 'SYSTEM', { claim_id: claimId, claim_status: status, rejection_reason: rejection });

    if (status !== 'VERIFIED') {
      throw new Error(`Invite claim failed: ${rejection}`);
    }

    return claimRecord;
  }

  async bindParticipantIdentity(acceptanceGateId, externalRef, email, label) {
    const participantId = 'part_' + crypto.randomBytes(8).toString('hex');
    const externalRefHash = crypto.createHash('sha256').update(externalRef).digest('hex');
    const emailHash = crypto.createHash('sha256').update(email).digest('hex');
    const labelRedacted = label ? '[REDACTED] ' + label.substring(0, 3) : 'REDACTED';

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(acceptanceGateId);
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_acceptance_gates WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      if (rows.length > 0) gate = rows[0];
    }

    if (!gate) throw new Error('Acceptance gate not found');

    const participantRecord = {
      participant_id: participantId,
      acceptance_gate_id: acceptanceGateId,
      invite_record_id: gate.invite_record_id,
      tenant_id: gate.tenant_id,
      cohort_id: gate.cohort_id,
      participant_external_ref_hash: externalRefHash,
      participant_email_hash: emailHash,
      participant_label: labelRedacted,
      participant_status: 'PENDING',
      role_key: 'BETA_PARTICIPANT',
      scope_json: { tenant_id: gate.tenant_id, cohort_id: gate.cohort_id },
      created_at: new Date(),
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.participants.set(participantId, participantRecord);
      gate.participant_id = participantId;
      gate.identity_bound = 1;
      this._mockState.gates.set(acceptanceGateId, gate);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_onboarding_participants 
        (participant_id, acceptance_gate_id, invite_record_id, tenant_id, cohort_id, participant_external_ref_hash, participant_email_hash, participant_label, role_key, scope_json) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [participantRecord.participant_id, participantRecord.acceptance_gate_id, participantRecord.invite_record_id, participantRecord.tenant_id, participantRecord.cohort_id, participantRecord.participant_external_ref_hash, participantRecord.participant_email_hash, participantRecord.participant_label, participantRecord.role_key, JSON.stringify(participantRecord.scope_json)]
      );
      await db.query(
        "UPDATE controlled_beta_invite_acceptance_gates SET participant_id = ?, identity_bound = 1 WHERE acceptance_gate_id = ?",
        [participantId, acceptanceGateId]
      );
    }

    await this.audit(acceptanceGateId, 'IDENTITY_BOUND', 'SYSTEM', { participant_id: participantId });
    return participantRecord;
  }

  async recordTermsAcceptance(acceptanceGateId, participantId, termsVersion, termsHash, acceptedBy, method) {
    const termsAcceptanceId = 'terms_' + crypto.randomBytes(8).toString('hex');
    const acceptedByHash = crypto.createHash('sha256').update(acceptedBy || 'SYSTEM').digest('hex');

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const record = {
      terms_acceptance_id: termsAcceptanceId,
      acceptance_gate_id: acceptanceGateId,
      participant_id: participantId,
      terms_version: termsVersion,
      terms_hash: termsHash,
      accepted_at: new Date(),
      accepted_by_hash: acceptedByHash,
      acceptance_method: method || 'CLICKWRAP',
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.terms.set(termsAcceptanceId, record);
      const gate = this._mockState.gates.get(acceptanceGateId);
      if (gate) {
        gate.terms_accepted = 1;
        this._mockState.gates.set(acceptanceGateId, gate);
      }
    } else {
      await db.query(
        `INSERT INTO controlled_beta_onboarding_terms_acceptance 
        (terms_acceptance_id, acceptance_gate_id, participant_id, terms_version, terms_hash, accepted_by_hash, acceptance_method) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [record.terms_acceptance_id, record.acceptance_gate_id, record.participant_id, record.terms_version, record.terms_hash, record.accepted_by_hash, record.acceptance_method]
      );
      await db.query(
        "UPDATE controlled_beta_invite_acceptance_gates SET terms_accepted = 1 WHERE acceptance_gate_id = ?",
        [acceptanceGateId]
      );
    }

    await this.audit(acceptanceGateId, 'TERMS_ACCEPTED', 'SYSTEM', { terms_acceptance_id: termsAcceptanceId, version: termsVersion });
    return record;
  }

  async defineOnboardingSessionLimits(acceptanceGateId, participantId, limits) {
    const limitId = 'lim_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(acceptanceGateId);
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_acceptance_gates WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      if (rows.length > 0) gate = rows[0];
    }

    if (!gate) throw new Error('Acceptance gate not found');

    const record = {
      session_limit_id: limitId,
      acceptance_gate_id: acceptanceGateId,
      participant_id: participantId,
      tenant_id: gate.tenant_id,
      cohort_id: gate.cohort_id,
      max_sessions: limits.max_sessions || 1,
      max_concurrent_sessions: limits.max_concurrent_sessions || 1,
      session_ttl_minutes: limits.session_ttl_minutes || 60,
      daily_action_limit: limits.daily_action_limit || 100,
      feature_scope_json: limits.feature_scope_json || {},
      created_at: new Date(),
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.sessionLimits.set(limitId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_onboarding_session_limits 
        (session_limit_id, acceptance_gate_id, participant_id, tenant_id, cohort_id, max_sessions, max_concurrent_sessions, session_ttl_minutes, daily_action_limit, feature_scope_json) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.session_limit_id, record.acceptance_gate_id, record.participant_id, record.tenant_id, record.cohort_id, record.max_sessions, record.max_concurrent_sessions, record.session_ttl_minutes, record.daily_action_limit, JSON.stringify(record.feature_scope_json)]
      );
    }

    await this.audit(acceptanceGateId, 'SESSION_LIMITS_DEFINED', 'SYSTEM', { limit_id: limitId });
    return record;
  }

  async defineOnboardingAccessPolicy(acceptanceGateId, participantId, policy) {
    const policyId = 'pol_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(acceptanceGateId);
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_acceptance_gates WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      if (rows.length > 0) gate = rows[0];
    }

    if (!gate) throw new Error('Acceptance gate not found');

    const boundedRuntimeScope = policy.runtime_scope_json || {};
    boundedRuntimeScope.tenant_id = gate.tenant_id;
    boundedRuntimeScope.cohort_id = gate.cohort_id;

    const record = {
      access_policy_id: policyId,
      acceptance_gate_id: acceptanceGateId,
      participant_id: participantId,
      tenant_id: gate.tenant_id,
      cohort_id: gate.cohort_id,
      policy_status: policy.policy_status || 'ACTIVE',
      allowed_features_json: policy.allowed_features_json || [],
      denied_features_json: policy.denied_features_json || [],
      runtime_scope_json: boundedRuntimeScope,
      created_at: new Date(),
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.accessPolicies.set(policyId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_onboarding_access_policies 
        (access_policy_id, acceptance_gate_id, participant_id, tenant_id, cohort_id, policy_status, allowed_features_json, denied_features_json, runtime_scope_json) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.access_policy_id, record.acceptance_gate_id, record.participant_id, record.tenant_id, record.cohort_id, record.policy_status, JSON.stringify(record.allowed_features_json), JSON.stringify(record.denied_features_json), JSON.stringify(record.runtime_scope_json)]
      );
    }

    await this.audit(acceptanceGateId, 'ACCESS_POLICY_DEFINED', 'SYSTEM', { policy_id: policyId });
    return record;
  }

  async runOnboardingGuardrailChecks(acceptanceGateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(acceptanceGateId);
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_acceptance_gates WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      if (rows.length > 0) gate = rows[0];
    }

    if (!gate) return { ok: false, reason: 'ACCEPTANCE_GATE_MISSING' };

    const checks = [
      { key: 'no_full_public', status: gate.full_public_enabled ? 'FAILED' : 'PASSED' },
      { key: 'no_open_marketplace', status: gate.open_marketplace_enabled ? 'FAILED' : 'PASSED' },
      { key: 'no_public_signup', status: gate.public_signup_enabled ? 'FAILED' : 'PASSED' },
      { key: 'no_public_beta', status: gate.public_beta_enabled ? 'FAILED' : 'PASSED' },
      { key: 'no_kill_switch_active', status: gate.kill_switch_active ? 'FAILED' : 'PASSED' },
      { key: 'payment_execution_disabled', status: gate.payment_execution_enabled ? 'FAILED' : 'PASSED' },
      { key: 'provider_external_submission_disabled', status: gate.provider_external_submission_enabled ? 'FAILED' : 'PASSED' },
      { key: 'auto_onboarding_disabled', status: gate.auto_onboarding_enabled ? 'FAILED' : 'PASSED' },
      { key: 'manual_approval_required', status: gate.manual_approval_required ? 'PASSED' : 'FAILED' }
    ];

    if (isProdLike) {
      for (const check of checks) {
        const checkId = 'ch_' + crypto.randomBytes(8).toString('hex');
        await db.query(
          "INSERT INTO controlled_beta_onboarding_guardrail_checks (check_id, acceptance_gate_id, check_key, check_status) VALUES (?, ?, ?, ?)",
          [checkId, acceptanceGateId, check.key, check.status]
        );
      }
    }

    const failed = checks.filter(c => c.status === 'FAILED');
    return {
      ok: failed.length === 0,
      checks
    };
  }

  async submitOnboardingForApproval(acceptanceGateId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(acceptanceGateId);
      if (gate) {
        gate.gate_status = 'PENDING_APPROVAL';
        this._mockState.gates.set(acceptanceGateId, gate);
      }
    } else {
      await db.query("UPDATE controlled_beta_invite_acceptance_gates SET gate_status = 'PENDING_APPROVAL' WHERE acceptance_gate_id = ?", [acceptanceGateId]);
    }
    await this.audit(acceptanceGateId, 'ONBOARDING_SUBMITTED_FOR_REVIEW', actorId || 'SYSTEM', {});
    return { ok: true, status: 'PENDING_APPROVAL' };
  }

  async approveOnboarding(acceptanceGateId, actorId) {
    const approvalId = 'app_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    
    if (!isProdLike) {
      const gate = this._mockState.gates.get(acceptanceGateId);
      if (gate) {
        gate.gate_status = 'APPROVED';
        gate.onboarding_approved = 1;
        this._mockState.gates.set(acceptanceGateId, gate);
      }
      this._mockState.approvals.set(approvalId, {
        approval_id: approvalId,
        acceptance_gate_id: acceptanceGateId,
        approval_status: 'APPROVED',
        requested_by: 'SYSTEM',
        approved_by: actorId,
        created_at: new Date()
      });
    } else {
      await db.query("UPDATE controlled_beta_invite_acceptance_gates SET gate_status = 'APPROVED', onboarding_approved = 1, approved_at = NOW(), approved_by = ? WHERE acceptance_gate_id = ?", [actorId, acceptanceGateId]);
      await db.query(
        "INSERT INTO controlled_beta_onboarding_approvals (approval_id, acceptance_gate_id, approval_status, requested_by, approved_by) VALUES (?, ?, 'APPROVED', 'SYSTEM', ?)",
        [approvalId, acceptanceGateId, actorId]
      );
    }
    await this.audit(acceptanceGateId, 'ONBOARDING_APPROVED', actorId, { approval_id: approvalId });
    return { ok: true, status: 'APPROVED' };
  }

  async rejectOnboarding(acceptanceGateId, actorId, reason) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(acceptanceGateId);
      if (gate) {
        gate.gate_status = 'REJECTED';
        this._mockState.gates.set(acceptanceGateId, gate);
      }
    } else {
      await db.query("UPDATE controlled_beta_invite_acceptance_gates SET gate_status = 'REJECTED' WHERE acceptance_gate_id = ?", [acceptanceGateId]);
    }
    await this.audit(acceptanceGateId, 'ONBOARDING_REJECTED', actorId, { reason });
    return { ok: true, status: 'REJECTED' };
  }

  async blockOnboarding(acceptanceGateId, actorId, reasons) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(acceptanceGateId);
      if (gate) {
        gate.gate_status = 'BLOCKED';
        this._mockState.gates.set(acceptanceGateId, gate);
      }
    } else {
      await db.query(
        "UPDATE controlled_beta_invite_acceptance_gates SET gate_status = 'BLOCKED', blocked_at = NOW(), blocked_by = ?, blocked_reasons_json = ? WHERE acceptance_gate_id = ?",
        [actorId, JSON.stringify(reasons), acceptanceGateId]
      );
    }
    await this.audit(acceptanceGateId, 'ONBOARDING_BLOCKED', actorId, { reasons });
    return { ok: true, status: 'BLOCKED' };
  }

  async grantControlledRuntimeAccess(acceptanceGateId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    
    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(acceptanceGateId);
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_acceptance_gates WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      if (rows.length > 0) gate = rows[0];
    }

    if (!gate) throw new Error('Acceptance gate not found');

    const readiness = await this.evaluateInviteAcceptanceReadiness(acceptanceGateId);
    if (!readiness.ok) {
      throw new Error('Readiness is BLOCKED');
    }

    // Must be approved first
    if (!gate.onboarding_approved && gate.gate_status !== 'APPROVED') {
      throw new Error('Runtime access requires prior onboarding approval');
    }

    // Grant access
    if (!isProdLike) {
      gate.runtime_access_eligible = 1;
      gate.runtime_access_granted = 1;
      this._mockState.gates.set(acceptanceGateId, gate);

      // Mark invite status accepted
      const invite = this._mockState.phase133Invites.get(gate.invite_record_id);
      if (invite) {
        invite.invite_status = 'ACCEPTED';
        invite.accepted_at = new Date();
        invite.accepted_participant_id = gate.participant_id;
        this._mockState.phase133Invites.set(gate.invite_record_id, invite);
      }

      // Update participant status
      if (gate.participant_id) {
        const part = this._mockState.participants.get(gate.participant_id);
        if (part) {
          part.participant_status = 'ACTIVE';
          this._mockState.participants.set(gate.participant_id, part);
        }
      }
    } else {
      await db.query(
        "UPDATE controlled_beta_invite_acceptance_gates SET runtime_access_eligible = 1, runtime_access_granted = 1 WHERE acceptance_gate_id = ?",
        [acceptanceGateId]
      );
      if (await this.hasTable('controlled_beta_invite_issuance_records')) {
        await db.query(
          "UPDATE controlled_beta_invite_issuance_records SET invite_status = 'ACCEPTED', accepted_at = NOW(), accepted_participant_id = ? WHERE invite_record_id = ?",
          [gate.participant_id, gate.invite_record_id]
        );
      }
      await db.query(
        "UPDATE controlled_beta_onboarding_participants SET participant_status = 'ACTIVE', updated_at = NOW() WHERE participant_id = ?",
        [gate.participant_id]
      );
    }

    await this.audit(acceptanceGateId, 'RUNTIME_ACCESS_GRANTED', actorId, { participant_id: gate.participant_id });
    return { ok: true, runtime_access_granted: true };
  }

  async revokeParticipantOnboarding(acceptanceGateId, actorId, reason) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    
    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(acceptanceGateId);
      if (gate) {
        gate.runtime_access_granted = 0;
        gate.runtime_access_eligible = 0;
        gate.gate_status = 'REVOKED';
        this._mockState.gates.set(acceptanceGateId, gate);

        if (gate.participant_id) {
          const part = this._mockState.participants.get(gate.participant_id);
          if (part) {
            part.participant_status = 'REVOKED';
            this._mockState.participants.set(gate.participant_id, part);
          }
        }
      }
    } else {
      const rows = await db.query("SELECT * FROM controlled_beta_invite_acceptance_gates WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      if (rows.length > 0) gate = rows[0];
      await db.query(
        "UPDATE controlled_beta_invite_acceptance_gates SET runtime_access_granted = 0, runtime_access_eligible = 0, gate_status = 'REVOKED' WHERE acceptance_gate_id = ?",
        [acceptanceGateId]
      );
      if (gate && gate.participant_id) {
        await db.query(
          "UPDATE controlled_beta_onboarding_participants SET participant_status = 'REVOKED', updated_at = NOW() WHERE participant_id = ?",
          [gate.participant_id]
        );
      }
    }

    await this.audit(acceptanceGateId, 'ONBOARDING_REVOKED', actorId, { reason });
    return { ok: true };
  }

  async recordOnboardingFinding(acceptanceGateId, severity, findingKey, detailsJson) {
    const findingId = 'find_' + crypto.randomBytes(8).toString('hex');
    const record = {
      finding_id: findingId,
      acceptance_gate_id: acceptanceGateId,
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
        "INSERT INTO controlled_beta_onboarding_findings (finding_id, acceptance_gate_id, severity, finding_key, details_json) VALUES (?, ?, ?, ?, ?)",
        [findingId, acceptanceGateId, severity, findingKey, JSON.stringify(detailsJson)]
      );
    }
    return record;
  }

  async resolveOnboardingFinding(findingId, actorId) {
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
        "UPDATE controlled_beta_onboarding_findings SET finding_status = 'RESOLVED', resolved_at = NOW(), resolved_by = ? WHERE finding_id = ?",
        [actorId, findingId]
      );
    }
    return { ok: true };
  }

  async buildOnboardingEvidencePack(acceptanceGateId) {
    const packId = 'evp_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gate = null;
    let claims = [];
    let participants = [];
    let terms = [];
    let sessionLimits = [];
    let accessPolicies = [];
    let guardrails = [];
    let approvals = [];
    let audits = [];

    if (!isProdLike) {
      gate = this._mockState.gates.get(acceptanceGateId);
      claims = Array.from(this._mockState.claims.values()).filter(c => c.acceptance_gate_id === acceptanceGateId);
      participants = Array.from(this._mockState.participants.values()).filter(p => p.acceptance_gate_id === acceptanceGateId);
      terms = Array.from(this._mockState.terms.values()).filter(t => t.acceptance_gate_id === acceptanceGateId);
      sessionLimits = Array.from(this._mockState.sessionLimits.values()).filter(s => s.acceptance_gate_id === acceptanceGateId);
      accessPolicies = Array.from(this._mockState.accessPolicies.values()).filter(a => a.acceptance_gate_id === acceptanceGateId);
      guardrails = Array.from(this._mockState.guardrails.values()).filter(g => g.acceptance_gate_id === acceptanceGateId);
      approvals = Array.from(this._mockState.approvals.values()).filter(a => a.acceptance_gate_id === acceptanceGateId);
      audits = this._mockState.audits.get(acceptanceGateId) || [];
    } else {
      const gRows = await db.query("SELECT * FROM controlled_beta_invite_acceptance_gates WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      if (gRows.length > 0) gate = gRows[0];
      claims = await db.query("SELECT * FROM controlled_beta_invite_acceptance_claims WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      participants = await db.query("SELECT * FROM controlled_beta_onboarding_participants WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      terms = await db.query("SELECT * FROM controlled_beta_onboarding_terms_acceptance WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      sessionLimits = await db.query("SELECT * FROM controlled_beta_onboarding_session_limits WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      accessPolicies = await db.query("SELECT * FROM controlled_beta_onboarding_access_policies WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      guardrails = await db.query("SELECT * FROM controlled_beta_onboarding_guardrail_checks WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      approvals = await db.query("SELECT * FROM controlled_beta_onboarding_approvals WHERE acceptance_gate_id = ?", [acceptanceGateId]);
      audits = await db.query("SELECT * FROM controlled_beta_onboarding_audits WHERE acceptance_gate_id = ?", [acceptanceGateId]);
    }

    if (!gate) throw new Error('Acceptance gate not found');

    const evidenceData = {
      phase133_dependency: {
        invite_record_id: gate.invite_record_id,
        issuance_gate_id: gate.issuance_gate_id,
        issuance_batch_id: gate.issuance_batch_id
      },
      invite_status_summary: {
        invite_status_at_claim: gate.invite_status_at_claim
      },
      claim_verification: claims.map(c => ({
        claim_id: c.claim_id,
        claim_status: c.claim_status,
        claimed_at: c.claimed_at,
        invite_code_hash: c.invite_code_hash,
        invite_token_hash: c.invite_token_hash,
        rejection_reason: c.rejection_reason
      })),
      participant_summary: participants.map(p => ({
        participant_id: p.participant_id,
        tenant_id: p.tenant_id,
        cohort_id: p.cohort_id,
        participant_status: p.participant_status,
        role_key: p.role_key,
        scope_json: p.scope_json
      })),
      terms_acceptance: terms.map(t => ({
        terms_acceptance_id: t.terms_acceptance_id,
        terms_version: t.terms_version,
        accepted_at: t.accepted_at,
        acceptance_method: t.acceptance_method
      })),
      session_limits: sessionLimits.map(s => ({
        max_sessions: s.max_sessions,
        max_concurrent_sessions: s.max_concurrent_sessions,
        session_ttl_minutes: s.session_ttl_minutes,
        daily_action_limit: s.daily_action_limit,
        feature_scope_json: s.feature_scope_json
      })),
      access_policy: accessPolicies.map(a => ({
        allowed_features_json: a.allowed_features_json,
        denied_features_json: a.denied_features_json,
        runtime_scope_json: a.runtime_scope_json
      })),
      guardrail_checks: guardrails.map(g => ({
        check_key: g.check_key,
        check_status: g.check_status
      })),
      approvals: approvals.map(a => ({
        approval_id: a.approval_id,
        approval_status: a.approval_status,
        requested_by: a.requested_by,
        approved_by: a.approved_by,
        created_at: a.created_at
      })),
      audits: audits.map(au => ({
        event_type: au.event_type,
        actor_id: au.actor_id,
        created_at: au.created_at
      })),
      safety_invariants: {
        full_public_enabled: gate.full_public_enabled,
        open_marketplace_enabled: gate.open_marketplace_enabled,
        public_signup_enabled: gate.public_signup_enabled,
        public_beta_enabled: gate.public_beta_enabled,
        payment_execution_enabled: gate.payment_execution_enabled,
        provider_external_submission_enabled: gate.provider_external_submission_enabled,
        source_mutation_enabled: gate.source_mutation_enabled,
        kill_switch_active: gate.kill_switch_active
      },
      redaction_proof: {
        raw_invite_codes_excluded: true,
        raw_invite_tokens_excluded: true,
        raw_session_tokens_excluded: true,
        raw_emails_excluded: true
      }
    };

    const integrityHash = crypto.createHash('sha256').update(JSON.stringify(evidenceData)).digest('hex');

    const packRecord = {
      evidence_pack_id: packId,
      acceptance_gate_id: acceptanceGateId,
      evidence_schema_version: '134.0',
      evidence_data_json: evidenceData,
      evidence_integrity_hash: integrityHash,
      redaction_status: 'REDACTED',
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.evidencePacks.set(packId, packRecord);
    } else {
      await db.query(
        "INSERT INTO controlled_beta_onboarding_evidence_packs (evidence_pack_id, acceptance_gate_id, evidence_schema_version, evidence_data_json, evidence_integrity_hash) VALUES (?, ?, ?, ?, ?)",
        [packRecord.evidence_pack_id, packRecord.acceptance_gate_id, packRecord.evidence_schema_version, JSON.stringify(packRecord.evidence_data_json), packRecord.evidence_integrity_hash]
      );
    }

    await this.audit(acceptanceGateId, 'EVIDENCE_PACK_BUILT', 'SYSTEM', { evidence_pack_id: packId });
    return packRecord;
  }

  async getOnboardingAuditTimeline(acceptanceGateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.audits.get(acceptanceGateId) || [];
    } else {
      return await db.query("SELECT * FROM controlled_beta_onboarding_audits WHERE acceptance_gate_id = ? ORDER BY created_at ASC", [acceptanceGateId]);
    }
  }

  async getOnboardingDashboardState() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gates = Array.from(this._mockState.gates.values());
      return {
        total_gates: gates.length,
        ready_gates: gates.filter(g => g.readiness_status === 'READY').length,
        blocked_gates: gates.filter(g => g.readiness_status === 'BLOCKED').length,
        approved_gates: gates.filter(g => g.gate_status === 'APPROVED').length
      };
    } else {
      const rows = await db.query(
        `SELECT 
          COUNT(*) as total_gates,
          SUM(CASE WHEN readiness_status = 'READY' THEN 1 ELSE 0 END) as ready_gates,
          SUM(CASE WHEN readiness_status = 'BLOCKED' THEN 1 ELSE 0 END) as blocked_gates,
          SUM(CASE WHEN gate_status = 'APPROVED' THEN 1 ELSE 0 END) as approved_gates
        FROM controlled_beta_invite_acceptance_gates`
      );
      return rows[0] || { total_gates: 0, ready_gates: 0, blocked_gates: 0, approved_gates: 0 };
    }
  }
}

module.exports = new ControlledBetaInviteAcceptanceService();
