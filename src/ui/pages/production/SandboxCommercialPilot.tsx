import React, { useState, useCallback } from 'react';
import {
  getSandboxCommercialReadiness,
  createSandboxCommercialRun,
  buildInvoicePreview,
  simulatePaymentIntent,
  simulateRefundScenario,
  simulatePayoutScenario,
  buildSettlementPreview,
  submitPrinthouseCommercialConfirmation,
  recordCommercialFinding,
  resolveCommercialFinding,
  getCommercialAuditTimeline,
  getCommercialEvidencePack,
} from '../../api/sandboxCommercialPilotClient';

const SAFETY_NOTICE =
  'Sandbox commercial pilot only. No real payment, refund, payout, tax submission, ' +
  'accounting submission, or provider capture is executed. ' +
  'FULL_PUBLIC and open marketplace access remain disabled. ' +
  'All invoices are preview-only. All payments are simulation-only. All payouts are preview-only. ' +
  'No source record mutation outside pilot scope.';

export function SandboxCommercialPilot() {
  const [sandboxRunId, setSandboxRunId] = useState('');
  const [pilotOrderId, setPilotOrderId] = useState('');
  const [programId, setProgramId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [handoffPackageId, setHandoffPackageId] = useState('');
  const [printhouseTenantId, setPrinthouseTenantId] = useState('');
  const [findingId, setFindingId] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const run = useCallback(async (label: string, fn: () => Promise<Record<string, unknown>>) => {
    setLoading(true);
    setMessage('');
    try {
      const r = await fn();
      setResult(r);
      setMessage(`${label} completed.`);
      return r;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(`Error in ${label}: ${msg}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleReadiness = useCallback(() =>
    run('Check Readiness', () =>
      getSandboxCommercialReadiness({ sandbox_run_id: sandboxRunId || undefined })
    ), [run, sandboxRunId]);

  const handleCreate = useCallback(async () => {
    const r = await run('Create Sandbox Commercial Run', () =>
      createSandboxCommercialRun({
        pilot_program_id: programId || undefined, participant_id: participantId || undefined,
        pilot_order_id: pilotOrderId, handoff_package_id: handoffPackageId || undefined,
        printhouse_tenant_id: printhouseTenantId || undefined, created_by: 'admin',
      })
    );
    if (r) {
      const sr = r.sandbox_run as Record<string, unknown> | undefined;
      if (sr?.sandbox_run_id) setSandboxRunId(String(sr.sandbox_run_id));
    }
  }, [run, programId, participantId, pilotOrderId, handoffPackageId, printhouseTenantId]);

  const handleInvoicePreview = useCallback(() =>
    run('Build Invoice Preview', () =>
      buildInvoicePreview({
        sandbox_run_id: sandboxRunId, pilot_order_id: pilotOrderId || undefined,
        currency: 'USD', total_amount_preview: 99.99,
        line_items_json: [{ description: 'Sample print product', quantity: 1, unit_price: 99.99 }],
        created_by: 'admin',
      })
    ), [run, sandboxRunId, pilotOrderId]);

  const handleSimulatePayment = useCallback(() =>
    run('Simulate Payment', () =>
      simulatePaymentIntent({
        sandbox_run_id: sandboxRunId, pilot_order_id: pilotOrderId || undefined,
        simulated_amount: 99.99, simulated_currency: 'USD', simulated_provider: 'SANDBOX_STRIPE',
        created_by: 'admin',
      })
    ), [run, sandboxRunId, pilotOrderId]);

  const handleSimulateRefund = useCallback(() =>
    run('Simulate Refund', () =>
      simulateRefundScenario({
        sandbox_run_id: sandboxRunId, pilot_order_id: pilotOrderId || undefined,
        simulated_amount: 99.99, simulated_currency: 'USD', created_by: 'admin',
      })
    ), [run, sandboxRunId, pilotOrderId]);

  const handleSimulatePayout = useCallback(() =>
    run('Simulate Payout', () =>
      simulatePayoutScenario({
        sandbox_run_id: sandboxRunId, pilot_order_id: pilotOrderId || undefined,
        simulated_amount: 79.99, simulated_currency: 'USD', created_by: 'admin',
      })
    ), [run, sandboxRunId, pilotOrderId]);

  const handleSettlementPreview = useCallback(() =>
    run('Build Settlement Preview', () =>
      buildSettlementPreview({
        sandbox_run_id: sandboxRunId, pilot_order_id: pilotOrderId || undefined,
        settlement_amount_preview: 99.99, settlement_currency: 'USD',
        printhouse_payout_preview: 79.99, platform_fee_preview: 20.00,
        created_by: 'admin',
      })
    ), [run, sandboxRunId, pilotOrderId]);

  const handleConfirmation = useCallback(() =>
    run('Printhouse Confirmation', () =>
      submitPrinthouseCommercialConfirmation({
        sandbox_run_id: sandboxRunId, participant_id: participantId || undefined,
        printhouse_tenant_id: printhouseTenantId || undefined,
        confirmation_status: 'CONFIRMED', confirmation_notes: 'Confirmed via admin UI', confirmed_by: 'admin',
      })
    ), [run, sandboxRunId, participantId, printhouseTenantId]);

  const handleRecordFinding = useCallback(async () => {
    const r = await run('Record Finding', () =>
      recordCommercialFinding({
        sandbox_run_id: sandboxRunId, pilot_order_id: pilotOrderId || undefined,
        finding_type: 'OBSERVATION', blocks_commercial: false, severity: 'LOW',
        summary: 'Manual finding from admin UI', created_by: 'admin',
      })
    );
    if (r) {
      const f = r.finding as Record<string, unknown> | undefined;
      if (f?.finding_id) setFindingId(String(f.finding_id));
    }
  }, [run, sandboxRunId, pilotOrderId]);

  const handleResolveFinding = useCallback(() =>
    run('Resolve Finding', () =>
      resolveCommercialFinding({ finding_id: findingId, resolved_by: 'admin' })
    ), [run, findingId]);

  const handleAuditTimeline = useCallback(() =>
    run('Get Audit Timeline', () =>
      getCommercialAuditTimeline({ sandbox_run_id: sandboxRunId })
    ), [run, sandboxRunId]);

  const handleEvidencePack = useCallback(() =>
    run('Build Evidence Pack', () =>
      getCommercialEvidencePack({ sandbox_run_id: sandboxRunId })
    ), [run, sandboxRunId]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1>Phase 125 — Sandbox Commercial / Invoice / Payment Handoff Pilot</h1>

      <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <strong>Sandbox Commercial Pilot Only</strong>
        <p style={{ margin: '8px 0 0' }}>{SAFETY_NOTICE}</p>
      </div>

      <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3>Safety Invariants</h3>
        <table style={{ width: '100%', fontSize: 13 }}>
          <tbody>
            <tr><td>FULL_PUBLIC</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>OPEN_MARKETPLACE_ACCESS</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>LIVE_PROVIDER_CONNECTIVITY</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>PAYMENT_EXECUTION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>REFUND_EXECUTION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>PAYOUT_EXECUTION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>PROVIDER_LIVE_CAPTURE</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>EXTERNAL_TAX_SUBMISSION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>EXTERNAL_ACCOUNTING_SUBMISSION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>PROVIDER_EXTERNAL_SUBMISSION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>SOURCE_MUTATION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>INVOICE_ISSUED</td><td><strong>NOT_ENABLED (preview only)</strong></td></tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div>
          <label>Pilot Order ID</label><br />
          <input value={pilotOrderId} onChange={e => setPilotOrderId(e.target.value)} placeholder="pilot_order_id (required)" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Program ID</label><br />
          <input value={programId} onChange={e => setProgramId(e.target.value)} placeholder="pilot_program_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Participant ID</label><br />
          <input value={participantId} onChange={e => setParticipantId(e.target.value)} placeholder="participant_id" style={{ width: '100%', padding: 6 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div>
          <label>Sandbox Run ID</label><br />
          <input value={sandboxRunId} onChange={e => setSandboxRunId(e.target.value)} placeholder="sandbox_run_id (auto)" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Handoff Package ID</label><br />
          <input value={handoffPackageId} onChange={e => setHandoffPackageId(e.target.value)} placeholder="handoff_package_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Printhouse Tenant ID</label><br />
          <input value={printhouseTenantId} onChange={e => setPrinthouseTenantId(e.target.value)} placeholder="printhouse_tenant_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Finding ID</label><br />
          <input value={findingId} onChange={e => setFindingId(e.target.value)} placeholder="finding_id (auto)" style={{ width: '100%', padding: 6 }} />
        </div>
      </div>

      <h3>Actions</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        <button onClick={handleReadiness} disabled={loading}>Check Readiness</button>
        <button onClick={handleCreate} disabled={loading || !pilotOrderId}>Create Sandbox Run</button>
        <button onClick={handleInvoicePreview} disabled={loading || !sandboxRunId}>Invoice Preview</button>
        <button onClick={handleSimulatePayment} disabled={loading || !sandboxRunId}>Simulate Payment</button>
        <button onClick={handleSimulateRefund} disabled={loading || !sandboxRunId}>Simulate Refund</button>
        <button onClick={handleSimulatePayout} disabled={loading || !sandboxRunId}>Simulate Payout</button>
        <button onClick={handleSettlementPreview} disabled={loading || !sandboxRunId}>Settlement Preview</button>
        <button onClick={handleConfirmation} disabled={loading || !sandboxRunId}>Printhouse Confirmation</button>
        <button onClick={handleRecordFinding} disabled={loading || !sandboxRunId}>Record Finding</button>
        <button onClick={handleResolveFinding} disabled={loading || !findingId}>Resolve Finding</button>
        <button onClick={handleAuditTimeline} disabled={loading || !sandboxRunId}>Audit Timeline</button>
        <button onClick={handleEvidencePack} disabled={loading || !sandboxRunId}>Evidence Pack</button>
      </div>

      {message && (
        <div style={{ padding: 12, marginBottom: 16, background: message.startsWith('Error') ? '#f8d7da' : '#d4edda', borderRadius: 6 }}>
          {message}
        </div>
      )}

      {result && (
        <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 16 }}>
          <h3>Result</h3>
          <pre style={{ fontSize: 12, maxHeight: 500, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
