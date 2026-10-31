'use strict';

const crypto = require('crypto');

const SAFETY_MARKERS = Object.freeze({
  pilotOnly: true,
  sandboxOnly: true,
  reviewOnly: true,
  fullPublicEnabled: false,
  openMarketplaceAccessEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  externalTaxSubmissionEnabled: false,
  externalAccountingSubmissionEnabled: false,
  providerExternalSubmissionEnabled: false,
  providerLiveCaptureEnabled: false,
  sourceMutationOutsidePilotScope: false,
  productionActivationEnabled: false,
  invoiceIssued: false,
  invoicePreviewOnly: true,
  paymentSimulationOnly: true,
  payoutPreviewOnly: true,
});

const SAFETY_FLAGS_DB = Object.freeze({
  sandbox_only: true,
  pilot_only: true,
  review_only: true,
  payment_execution_enabled: false,
  refund_execution_enabled: false,
  payout_execution_enabled: false,
  external_tax_submission_enabled: false,
  external_accounting_submission_enabled: false,
  provider_live_capture_enabled: false,
  provider_external_submission_enabled: false,
  source_mutation_enabled: false,
  full_public_enabled: false,
  open_marketplace_enabled: false,
  production_activation_enabled: false,
});

const SAFETY_MESSAGE =
  'Sandbox commercial pilot only. No real payment, refund, payout, tax submission, ' +
  'accounting submission, or provider capture is executed. ' +
  'FULL_PUBLIC and open marketplace access remain disabled. ' +
  'All invoices are preview-only. All payments are simulation-only. All payouts are preview-only. ' +
  'No source record mutation outside pilot scope.';

const EVIDENCE_SCHEMA_VERSION = '125.0';

const REDACTION_FIELDS = [
  'internal_customer_reference', 'raw_customer_data', 'raw_file_package_urls',
  'raw_preflight_artifact_paths', 'raw_invoice_data', 'secrets',
  'internal_file_paths', 'raw_internal_urls', 'raw_payment_credentials',
  'raw_provider_keys', 'raw_bank_account_data',
];

function _isDbFallbackAllowed() {
  return process.env.NODE_ENV === 'test' || process.env.ALLOW_DB_FALLBACK_FOR_SMOKE === 'true';
}

function _isTenantAllowlisted(tenantId) {
  const allowlist = process.env.PILOT_TENANT_ALLOWLIST || '';
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS === 'true';
  if (isTestMode && allowlist.length === 0) return true;
  if (!allowlist) return false;
  return allowlist.split(',').map(t => t.trim()).includes(tenantId);
}

class SandboxCommercialPilotService {
  constructor(opts) {
    this._phase124Service = (opts && opts.phase124Service) || null;
    this._runs = new Map();
    this._invoicePreviews = new Map();
    this._paymentSimulations = new Map();
    this._settlementPreviews = new Map();
    this._printhouseConfirmations = new Map();
    this._findings = new Map();
    this._audits = new Map();
    this._evidencePacks = new Map();

    let _db = null;
    try { _db = require('./mysqlClient'); } catch (_e) { /* no DB available */ }
    this._db = _db;
  }

  async _dbWrite(sql, params) {
    if (!this._db) {
      if (_isDbFallbackAllowed()) return { ok: false, fallback: true };
      return { ok: false, fallback: false };
    }
    try {
      await this._db.query(sql, params);
      return { ok: true, fallback: false };
    } catch (err) {
      if (_isDbFallbackAllowed()) return { ok: false, fallback: true, error: err.message };
      return { ok: false, fallback: false, error: err.message };
    }
  }

  async _dbRead(sql, params) {
    if (!this._db) return null;
    try {
      const [rows] = await this._db.query(sql, params);
      return rows;
    } catch (_e) {
      return null;
    }
  }

  _getPersistenceInfo(dbResult) {
    if (!dbResult) return { persistenceMode: 'MEMORY_FALLBACK', persistenceStatus: 'FALLBACK_ONLY' };
    if (dbResult.ok) return { persistenceMode: 'DB', persistenceStatus: 'PERSISTED' };
    if (dbResult.fallback) return { persistenceMode: 'MEMORY_FALLBACK', persistenceStatus: 'FALLBACK_ONLY' };
    return { persistenceMode: 'DB', persistenceStatus: 'FAILED' };
  }

  async _writeAudit(sandboxRunId, pilotOrderId, eventType, actor, payload) {
    const auditId = crypto.randomUUID();
    const record = {
      audit_id: auditId,
      sandbox_run_id: sandboxRunId || null,
      pilot_order_id: pilotOrderId || null,
      event_type: eventType,
      event_actor: actor || 'system',
      event_payload_json: payload || {},
      safety_snapshot_json: { ...SAFETY_MARKERS },
      created_at: new Date().toISOString(),
    };
    this._audits.set(auditId, record);
    await this._dbWrite(
      `INSERT INTO sandbox_commercial_audits
       (audit_id, sandbox_run_id, pilot_order_id, event_type, event_actor, event_payload_json, safety_snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [auditId, record.sandbox_run_id, record.pilot_order_id, eventType, record.event_actor,
       JSON.stringify(record.event_payload_json), JSON.stringify(record.safety_snapshot_json)]
    );
    return record;
  }

  async createSandboxCommercialRun(payload) {
    const { pilot_program_id, participant_id, pilot_order_id, handoff_package_id, printhouse_tenant_id, created_by } = payload || {};
    if (!pilot_order_id) throw new Error('pilot_order_id is required');

    if (printhouse_tenant_id && !_isTenantAllowlisted(printhouse_tenant_id)) {
      throw new Error('Printhouse tenant is not in PILOT_TENANT_ALLOWLIST. Access denied (fail-closed).');
    }

    const sandboxRunId = crypto.randomUUID();
    const run = {
      sandbox_run_id: sandboxRunId,
      phase: 'PHASE_125',
      pilot_program_id: pilot_program_id || null,
      participant_id: participant_id || null,
      pilot_order_id,
      handoff_package_id: handoff_package_id || null,
      printhouse_tenant_id: printhouse_tenant_id || null,
      run_status: 'DRAFT',
      ...SAFETY_FLAGS_DB,
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._runs.set(sandboxRunId, run);

    const dbResult = await this._dbWrite(
      `INSERT INTO sandbox_commercial_pilot_runs
       (sandbox_run_id, phase, pilot_program_id, participant_id, pilot_order_id, handoff_package_id, printhouse_tenant_id, run_status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sandboxRunId, run.phase, run.pilot_program_id, run.participant_id, run.pilot_order_id,
       run.handoff_package_id, run.printhouse_tenant_id, run.run_status, run.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(sandboxRunId, pilot_order_id, 'SANDBOX_COMMERCIAL_RUN_CREATED', created_by, { pilot_program_id, participant_id, handoff_package_id });

    return {
      sandbox_run: run,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async buildInvoicePreview(payload) {
    const { sandbox_run_id, pilot_order_id, currency, total_amount_preview, line_items_json, created_by } = payload || {};
    if (!sandbox_run_id) throw new Error('sandbox_run_id is required');

    const run = await this._getRunById(sandbox_run_id);
    if (!run) throw new Error('Sandbox run not found');

    const invoicePreviewId = crypto.randomUUID();
    const preview = {
      invoice_preview_id: invoicePreviewId,
      sandbox_run_id,
      pilot_order_id: pilot_order_id || run.pilot_order_id || null,
      invoice_preview_status: 'GENERATED',
      invoice_preview_only: true,
      invoice_issued: false,
      source_mutation: false,
      invoice_data_json: { currency, total_amount_preview, line_items: line_items_json || [] },
      currency: currency || 'USD',
      total_amount_preview: total_amount_preview || 0,
      line_items_json: line_items_json || [],
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._invoicePreviews.set(invoicePreviewId, preview);

    const dbResult = await this._dbWrite(
      `INSERT INTO sandbox_commercial_invoice_previews
       (invoice_preview_id, sandbox_run_id, pilot_order_id, invoice_preview_status, invoice_data_json, currency, total_amount_preview, line_items_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoicePreviewId, sandbox_run_id, preview.pilot_order_id, preview.invoice_preview_status,
       JSON.stringify(preview.invoice_data_json), preview.currency, preview.total_amount_preview,
       JSON.stringify(preview.line_items_json), preview.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(sandbox_run_id, preview.pilot_order_id, 'INVOICE_PREVIEW_BUILT', created_by, {
      invoice_preview_id: invoicePreviewId, invoicePreviewOnly: true, invoiceIssued: false, sourceMutation: false,
    });

    return {
      invoice_preview: preview,
      invoicePreviewOnly: true,
      invoiceIssued: false,
      sourceMutation: false,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async simulatePaymentIntent(payload) {
    const { sandbox_run_id, pilot_order_id, simulated_amount, simulated_currency, simulated_provider, created_by } = payload || {};
    if (!sandbox_run_id) throw new Error('sandbox_run_id is required');

    const run = await this._getRunById(sandbox_run_id);
    if (!run) throw new Error('Sandbox run not found');

    const paymentSimulationId = crypto.randomUUID();
    const simulation = {
      payment_simulation_id: paymentSimulationId,
      sandbox_run_id,
      pilot_order_id: pilot_order_id || run.pilot_order_id || null,
      simulation_type: 'PAYMENT',
      simulation_status: 'SIMULATED',
      payment_simulation_only: true,
      payment_execution_enabled: false,
      refund_execution_enabled: false,
      payout_execution_enabled: false,
      live_provider_connectivity_enabled: false,
      simulated_amount: simulated_amount || 0,
      simulated_currency: simulated_currency || 'USD',
      simulated_provider: simulated_provider || 'SANDBOX_STRIPE',
      simulation_result_json: {
        status: 'SIMULATED_SUCCESS',
        simulated: true,
        real_charge_executed: false,
        real_capture_executed: false,
        provider_contacted: false,
      },
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._paymentSimulations.set(paymentSimulationId, simulation);

    const dbResult = await this._dbWrite(
      `INSERT INTO sandbox_commercial_payment_simulations
       (payment_simulation_id, sandbox_run_id, pilot_order_id, simulation_type, simulation_status,
        simulated_amount, simulated_currency, simulated_provider, simulation_result_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [paymentSimulationId, sandbox_run_id, simulation.pilot_order_id, simulation.simulation_type,
       simulation.simulation_status, simulation.simulated_amount, simulation.simulated_currency,
       simulation.simulated_provider, JSON.stringify(simulation.simulation_result_json), simulation.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(sandbox_run_id, simulation.pilot_order_id, 'PAYMENT_INTENT_SIMULATED', created_by, {
      payment_simulation_id: paymentSimulationId, paymentSimulationOnly: true, paymentExecutionEnabled: false, liveProviderConnectivityEnabled: false,
    });

    return {
      payment_simulation: simulation,
      paymentSimulationOnly: true,
      paymentExecutionEnabled: false,
      liveProviderConnectivityEnabled: false,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async simulateRefundScenario(payload) {
    const { sandbox_run_id, pilot_order_id, simulated_amount, simulated_currency, created_by } = payload || {};
    if (!sandbox_run_id) throw new Error('sandbox_run_id is required');

    const run = await this._getRunById(sandbox_run_id);
    if (!run) throw new Error('Sandbox run not found');

    const refundSimulationId = crypto.randomUUID();
    const simulation = {
      payment_simulation_id: refundSimulationId,
      sandbox_run_id,
      pilot_order_id: pilot_order_id || run.pilot_order_id || null,
      simulation_type: 'REFUND',
      simulation_status: 'SIMULATED',
      payment_simulation_only: true,
      payment_execution_enabled: false,
      refund_execution_enabled: false,
      payout_execution_enabled: false,
      live_provider_connectivity_enabled: false,
      simulated_amount: simulated_amount || 0,
      simulated_currency: simulated_currency || 'USD',
      simulated_provider: 'SANDBOX_STRIPE',
      simulation_result_json: {
        status: 'SIMULATED_REFUND_SUCCESS',
        simulated: true,
        real_refund_executed: false,
        provider_contacted: false,
      },
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._paymentSimulations.set(refundSimulationId, simulation);

    const dbResult = await this._dbWrite(
      `INSERT INTO sandbox_commercial_payment_simulations
       (payment_simulation_id, sandbox_run_id, pilot_order_id, simulation_type, simulation_status,
        simulated_amount, simulated_currency, simulated_provider, simulation_result_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [refundSimulationId, sandbox_run_id, simulation.pilot_order_id, simulation.simulation_type,
       simulation.simulation_status, simulation.simulated_amount, simulation.simulated_currency,
       simulation.simulated_provider, JSON.stringify(simulation.simulation_result_json), simulation.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(sandbox_run_id, simulation.pilot_order_id, 'REFUND_SCENARIO_SIMULATED', created_by, {
      refund_simulation_id: refundSimulationId, refundExecutionEnabled: false,
    });

    return {
      refund_simulation: simulation,
      refundSimulationOnly: true,
      refundExecutionEnabled: false,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async simulatePayoutScenario(payload) {
    const { sandbox_run_id, pilot_order_id, simulated_amount, simulated_currency, created_by } = payload || {};
    if (!sandbox_run_id) throw new Error('sandbox_run_id is required');

    const run = await this._getRunById(sandbox_run_id);
    if (!run) throw new Error('Sandbox run not found');

    const payoutSimulationId = crypto.randomUUID();
    const simulation = {
      payment_simulation_id: payoutSimulationId,
      sandbox_run_id,
      pilot_order_id: pilot_order_id || run.pilot_order_id || null,
      simulation_type: 'PAYOUT',
      simulation_status: 'SIMULATED',
      payment_simulation_only: true,
      payment_execution_enabled: false,
      refund_execution_enabled: false,
      payout_execution_enabled: false,
      live_provider_connectivity_enabled: false,
      simulated_amount: simulated_amount || 0,
      simulated_currency: simulated_currency || 'USD',
      simulated_provider: 'SANDBOX_STRIPE',
      simulation_result_json: {
        status: 'SIMULATED_PAYOUT_SUCCESS',
        simulated: true,
        real_payout_executed: false,
        provider_contacted: false,
      },
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._paymentSimulations.set(payoutSimulationId, simulation);

    const dbResult = await this._dbWrite(
      `INSERT INTO sandbox_commercial_payment_simulations
       (payment_simulation_id, sandbox_run_id, pilot_order_id, simulation_type, simulation_status,
        simulated_amount, simulated_currency, simulated_provider, simulation_result_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payoutSimulationId, sandbox_run_id, simulation.pilot_order_id, simulation.simulation_type,
       simulation.simulation_status, simulation.simulated_amount, simulation.simulated_currency,
       simulation.simulated_provider, JSON.stringify(simulation.simulation_result_json), simulation.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(sandbox_run_id, simulation.pilot_order_id, 'PAYOUT_SCENARIO_SIMULATED', created_by, {
      payout_simulation_id: payoutSimulationId, payoutExecutionEnabled: false,
    });

    return {
      payout_simulation: simulation,
      payoutSimulationOnly: true,
      payoutExecutionEnabled: false,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async buildSettlementPreview(payload) {
    const { sandbox_run_id, pilot_order_id, settlement_amount_preview, settlement_currency, printhouse_payout_preview, platform_fee_preview, created_by } = payload || {};
    if (!sandbox_run_id) throw new Error('sandbox_run_id is required');

    const run = await this._getRunById(sandbox_run_id);
    if (!run) throw new Error('Sandbox run not found');

    const settlementPreviewId = crypto.randomUUID();
    const preview = {
      settlement_preview_id: settlementPreviewId,
      sandbox_run_id,
      pilot_order_id: pilot_order_id || run.pilot_order_id || null,
      settlement_status: 'PREVIEW',
      payout_preview_only: true,
      payout_execution_enabled: false,
      settlement_amount_preview: settlement_amount_preview || 0,
      settlement_currency: settlement_currency || 'USD',
      printhouse_payout_preview: printhouse_payout_preview || 0,
      platform_fee_preview: platform_fee_preview || 0,
      settlement_data_json: {
        previewOnly: true,
        payoutExecutionEnabled: false,
        breakdown: {
          settlement_amount: settlement_amount_preview || 0,
          printhouse_payout: printhouse_payout_preview || 0,
          platform_fee: platform_fee_preview || 0,
        },
      },
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._settlementPreviews.set(settlementPreviewId, preview);

    const dbResult = await this._dbWrite(
      `INSERT INTO sandbox_commercial_settlement_previews
       (settlement_preview_id, sandbox_run_id, pilot_order_id, settlement_status,
        settlement_amount_preview, settlement_currency, printhouse_payout_preview, platform_fee_preview, settlement_data_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [settlementPreviewId, sandbox_run_id, preview.pilot_order_id, preview.settlement_status,
       preview.settlement_amount_preview, preview.settlement_currency, preview.printhouse_payout_preview,
       preview.platform_fee_preview, JSON.stringify(preview.settlement_data_json), preview.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(sandbox_run_id, preview.pilot_order_id, 'SETTLEMENT_PREVIEW_BUILT', created_by, {
      settlement_preview_id: settlementPreviewId, payoutPreviewOnly: true, payoutExecutionEnabled: false,
    });

    return {
      settlement_preview: preview,
      payoutPreviewOnly: true,
      payoutExecutionEnabled: false,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async submitPrinthouseCommercialConfirmation(payload) {
    const { sandbox_run_id, participant_id, printhouse_tenant_id, confirmation_status, confirmation_notes, confirmed_by } = payload || {};
    if (!sandbox_run_id) throw new Error('sandbox_run_id is required');

    const run = await this._getRunById(sandbox_run_id);
    if (!run) throw new Error('Sandbox run not found');

    if (printhouse_tenant_id && !_isTenantAllowlisted(printhouse_tenant_id)) {
      throw new Error('Printhouse tenant is not in PILOT_TENANT_ALLOWLIST. Access denied (fail-closed).');
    }

    const confirmationId = crypto.randomUUID();
    const confirmation = {
      confirmation_id: confirmationId,
      sandbox_run_id,
      participant_id: participant_id || null,
      printhouse_tenant_id: printhouse_tenant_id || null,
      confirmation_status: confirmation_status || 'CONFIRMED',
      confirmation_type: 'COMMERCIAL_REVIEW',
      confirmation_notes: confirmation_notes || null,
      confirmed_by: confirmed_by || null,
      created_at: new Date().toISOString(),
    };
    this._printhouseConfirmations.set(confirmationId, confirmation);

    const dbResult = await this._dbWrite(
      `INSERT INTO sandbox_commercial_printhouse_confirmations
       (confirmation_id, sandbox_run_id, participant_id, printhouse_tenant_id, confirmation_status, confirmation_type, confirmation_notes, confirmed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [confirmationId, sandbox_run_id, confirmation.participant_id, confirmation.printhouse_tenant_id,
       confirmation.confirmation_status, confirmation.confirmation_type, confirmation.confirmation_notes, confirmation.confirmed_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(sandbox_run_id, run.pilot_order_id, 'PRINTHOUSE_COMMERCIAL_CONFIRMATION', confirmed_by, {
      confirmation_id: confirmationId, confirmation_status: confirmation.confirmation_status,
    });

    return {
      confirmation,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async recordCommercialFinding(payload) {
    const { sandbox_run_id, pilot_order_id, finding_type, blocks_commercial, severity, summary, details_json, created_by } = payload || {};
    if (!sandbox_run_id) throw new Error('sandbox_run_id is required');

    const findingId = crypto.randomUUID();
    const finding = {
      finding_id: findingId,
      sandbox_run_id,
      pilot_order_id: pilot_order_id || null,
      finding_type: finding_type || 'OBSERVATION',
      finding_status: 'OPEN',
      blocks_commercial: blocks_commercial || false,
      severity: severity || 'LOW',
      summary: summary || null,
      details_json: details_json || null,
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._findings.set(findingId, finding);

    const dbResult = await this._dbWrite(
      `INSERT INTO sandbox_commercial_findings
       (finding_id, sandbox_run_id, pilot_order_id, finding_type, finding_status, blocks_commercial, severity, summary, details_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [findingId, sandbox_run_id, finding.pilot_order_id, finding.finding_type,
       'OPEN', finding.blocks_commercial ? 1 : 0, finding.severity, finding.summary, JSON.stringify(finding.details_json), finding.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(sandbox_run_id, pilot_order_id, 'COMMERCIAL_FINDING_RECORDED', created_by, { finding_type, severity, blocks_commercial });

    return {
      finding,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async resolveCommercialFinding(payload) {
    const { finding_id, resolved_by } = payload || {};
    if (!finding_id) throw new Error('finding_id is required');

    const finding = await this._getFindingById(finding_id);
    if (!finding) throw new Error('Finding not found');

    finding.finding_status = 'RESOLVED';
    finding.resolved_by = resolved_by || null;
    finding.updated_at = new Date().toISOString();
    this._findings.set(finding_id, finding);

    const dbResult = await this._dbWrite(
      `UPDATE sandbox_commercial_findings SET finding_status = 'RESOLVED', resolved_by = ?, updated_at = NOW() WHERE finding_id = ?`,
      [resolved_by || null, finding_id]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(finding.sandbox_run_id, finding.pilot_order_id, 'COMMERCIAL_FINDING_RESOLVED', resolved_by, { finding_id });

    return {
      finding,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async buildCommercialEvidencePack(payload) {
    const { sandbox_run_id } = payload || {};
    if (!sandbox_run_id) throw new Error('sandbox_run_id is required');

    const run = await this._getRunById(sandbox_run_id);
    if (!run) throw new Error('Sandbox run not found');

    const allFindings = [];
    for (const [, f] of this._findings) {
      if (f.sandbox_run_id === sandbox_run_id) allFindings.push(f);
    }
    const dbFindings = await this._dbRead(
      'SELECT * FROM sandbox_commercial_findings WHERE sandbox_run_id = ? ORDER BY created_at ASC',
      [sandbox_run_id]
    );
    const findings = dbFindings || allFindings;
    const unresolvedBlockers = findings.filter(f => f.finding_status !== 'RESOLVED' && (f.blocks_commercial === true || f.blocks_commercial === 1));

    const allInvoices = [];
    for (const [, i] of this._invoicePreviews) {
      if (i.sandbox_run_id === sandbox_run_id) allInvoices.push(i);
    }
    const dbInvoices = await this._dbRead(
      'SELECT * FROM sandbox_commercial_invoice_previews WHERE sandbox_run_id = ? ORDER BY created_at ASC',
      [sandbox_run_id]
    );

    const allPayments = [];
    for (const [, p] of this._paymentSimulations) {
      if (p.sandbox_run_id === sandbox_run_id) allPayments.push(p);
    }
    const dbPayments = await this._dbRead(
      'SELECT * FROM sandbox_commercial_payment_simulations WHERE sandbox_run_id = ? ORDER BY created_at ASC',
      [sandbox_run_id]
    );

    const allSettlements = [];
    for (const [, s] of this._settlementPreviews) {
      if (s.sandbox_run_id === sandbox_run_id) allSettlements.push(s);
    }
    const dbSettlements = await this._dbRead(
      'SELECT * FROM sandbox_commercial_settlement_previews WHERE sandbox_run_id = ? ORDER BY created_at ASC',
      [sandbox_run_id]
    );

    const allConfirmations = [];
    for (const [, c] of this._printhouseConfirmations) {
      if (c.sandbox_run_id === sandbox_run_id) allConfirmations.push(c);
    }

    const allAudits = [];
    for (const [, a] of this._audits) {
      if (a.sandbox_run_id === sandbox_run_id) allAudits.push(a);
    }

    const invoices = dbInvoices || allInvoices;
    const payments = dbPayments || allPayments;
    const settlements = dbSettlements || allSettlements;

    const evidencePackId = crypto.randomUUID();
    const evidencePack = {
      evidence_pack_id: evidencePackId,
      evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
      sandbox_run_id,
      pilot_program_id: run.pilot_program_id,
      participant_id: run.participant_id,
      pilot_order_id: run.pilot_order_id,
      handoff_package_id: run.handoff_package_id,
      printhouse_tenant_id: run.printhouse_tenant_id,
      run_status: run.run_status,
      invoice_summary: {
        total: invoices.length,
        all_preview_only: invoices.every(i => i.invoice_preview_only === true || i.invoice_preview_only === 1),
        none_issued: invoices.every(i => i.invoice_issued === false || i.invoice_issued === 0),
      },
      payment_simulation_summary: {
        total: payments.length,
        all_simulation_only: payments.every(p => p.payment_simulation_only === true || p.payment_simulation_only === 1),
        none_executed: payments.every(p => p.payment_execution_enabled === false || p.payment_execution_enabled === 0),
        types: {
          payment: payments.filter(p => p.simulation_type === 'PAYMENT').length,
          refund: payments.filter(p => p.simulation_type === 'REFUND').length,
          payout: payments.filter(p => p.simulation_type === 'PAYOUT').length,
        },
      },
      settlement_summary: {
        total: settlements.length,
        all_preview_only: settlements.every(s => s.payout_preview_only === true || s.payout_preview_only === 1),
        none_executed: settlements.every(s => s.payout_execution_enabled === false || s.payout_execution_enabled === 0),
      },
      confirmation_summary: {
        total: allConfirmations.length,
      },
      findings_summary: {
        total: findings.length,
        open: findings.filter(f => f.finding_status === 'OPEN').length,
        resolved: findings.filter(f => f.finding_status === 'RESOLVED').length,
        unresolved_blockers: unresolvedBlockers.length,
      },
      audit_summary: {
        total_events: allAudits.length,
      },
      redaction_classification: 'INTERNAL_ONLY',
      redacted_fields: REDACTION_FIELDS,
      safety_invariants: {
        ...SAFETY_MARKERS,
      },
      generated_at: new Date().toISOString(),
      generated_by: 'system',
    };

    const integrityHash = crypto.createHash('sha256').update(JSON.stringify(evidencePack)).digest('hex');
    evidencePack.integrity_hash = integrityHash;

    this._evidencePacks.set(evidencePackId, evidencePack);
    await this._dbWrite(
      `INSERT INTO sandbox_commercial_evidence_packs
       (evidence_pack_id, sandbox_run_id, pilot_order_id, evidence_status, evidence_schema_version, evidence_hash, evidence_json, redaction_classification, generated_by)
       VALUES (?, ?, ?, 'GENERATED', ?, ?, ?, 'INTERNAL_ONLY', 'system')`,
      [evidencePackId, sandbox_run_id, run.pilot_order_id,
       EVIDENCE_SCHEMA_VERSION, integrityHash, JSON.stringify(evidencePack)]
    );

    await this._writeAudit(sandbox_run_id, run.pilot_order_id, 'COMMERCIAL_EVIDENCE_PACK_BUILT', 'system', {
      evidence_pack_id: evidencePackId, integrity_hash: integrityHash, findings_total: findings.length, unresolved_blockers: unresolvedBlockers.length,
    });

    return {
      evidence_pack: evidencePack,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async getCommercialAuditTimeline(payload) {
    const { sandbox_run_id } = payload || {};
    if (!sandbox_run_id) throw new Error('sandbox_run_id is required');

    const memAudits = [];
    for (const [, a] of this._audits) {
      if (a.sandbox_run_id === sandbox_run_id) memAudits.push(a);
    }

    const dbRows = await this._dbRead(
      'SELECT * FROM sandbox_commercial_audits WHERE sandbox_run_id = ? ORDER BY created_at ASC',
      [sandbox_run_id]
    );

    return {
      audit_timeline: dbRows || memAudits,
      source: dbRows ? 'DB' : 'MEMORY',
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async getReadiness(payload) {
    const { sandbox_run_id } = payload || {};

    const readiness = {
      phase122_1_validated: false,
      phase122_2_validated: false,
      phase123_validated: false,
      phase124_validated: false,
      migration_065_applied: false,
      migration_066_applied: false,
      migration_067_applied: false,
      migration_068_applied: false,
      migration_069_applied: false,
      db_available: !!this._db,
      tenant_allowlist_fail_closed: !(process.env.NODE_ENV === 'test' || process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS === 'true') || !!(process.env.PILOT_TENANT_ALLOWLIST),
    };

    const schemaRows = await this._dbRead(
      "SELECT version FROM schema_versions WHERE version IN ('065', '066', '067', '068', '069') ORDER BY version ASC", []
    );
    if (schemaRows) {
      for (const row of schemaRows) {
        if (String(row.version) === '065') readiness.migration_065_applied = true;
        if (String(row.version) === '066') readiness.migration_066_applied = true;
        if (String(row.version) === '067') readiness.migration_067_applied = true;
        if (String(row.version) === '068') readiness.migration_068_applied = true;
        if (String(row.version) === '069') readiness.migration_069_applied = true;
      }
    }

    const ev1 = await this._dbRead(
      "SELECT evidence_status FROM internal_order_lifecycle_pilot_evidence_packs WHERE evidence_status = 'GENERATED' LIMIT 1", []
    );
    if (ev1 && ev1.length > 0) readiness.phase122_1_validated = true;

    const ev2 = await this._dbRead(
      "SELECT verification_run_id FROM internal_order_lifecycle_runtime_verification_runs WHERE status = 'PASSED' LIMIT 1", []
    );
    if (ev2 && ev2.length > 0) readiness.phase122_2_validated = true;

    const ev3 = await this._dbRead(
      "SELECT evidence_pack_id FROM founding_printhouse_pilot_evidence_packs WHERE evidence_status = 'GENERATED' LIMIT 1", []
    );
    if (ev3 && ev3.length > 0) readiness.phase123_validated = true;

    const ev4 = await this._dbRead(
      "SELECT evidence_pack_id FROM controlled_printhouse_handoff_evidence_packs WHERE evidence_status = 'GENERATED' LIMIT 1", []
    );
    if (ev4 && ev4.length > 0) readiness.phase124_validated = true;

    let run = null;
    if (sandbox_run_id) {
      run = await this._getRunById(sandbox_run_id);
    }

    return {
      readiness,
      sandbox_run: run,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  // --- Internal lookup helpers ---

  async _getRunById(id) {
    if (this._runs.has(id)) return this._runs.get(id);
    const rows = await this._dbRead('SELECT * FROM sandbox_commercial_pilot_runs WHERE sandbox_run_id = ?', [id]);
    if (rows && rows.length > 0) { this._runs.set(id, rows[0]); return rows[0]; }
    return null;
  }

  async _getFindingById(id) {
    if (this._findings.has(id)) return this._findings.get(id);
    const rows = await this._dbRead('SELECT * FROM sandbox_commercial_findings WHERE finding_id = ?', [id]);
    if (rows && rows.length > 0) { this._findings.set(id, rows[0]); return rows[0]; }
    return null;
  }
}

module.exports = SandboxCommercialPilotService;
