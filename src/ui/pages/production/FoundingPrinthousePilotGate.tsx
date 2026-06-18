import React, { useState, useCallback } from 'react';
import {
  getFoundingPrinthousePilotReadiness,
  createPilotProgram,
  registerFoundingPrinthouse,
  approveParticipantForPilot,
  suspendParticipant,
  linkInternalPilotOrder,
  getOrderHandoffReadiness,
  submitPrinthouseReview,
  recordPilotFinding,
  resolvePilotFinding,
  getFoundingPrinthousePilotAuditTimeline,
  getFoundingPrinthousePilotEvidencePack,
} from '../../api/foundingPrinthousePilotGateClient';

const SAFETY_NOTICE =
  'Founding-printhouse pilot only. FULL_PUBLIC and open marketplace access remain disabled. ' +
  'No real payment/refund/payout/provider/tax/accounting execution is enabled. ' +
  'No automatic production machine dispatch. No source record mutation outside pilot scope.';

export function FoundingPrinthousePilotGate() {
  const [tenantId, setTenantId] = useState('');
  const [programName, setProgramName] = useState('');
  const [programId, setProgramId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [printhouseTenantId, setPrinthouseTenantId] = useState('');
  const [printhouseName, setPrinthouseName] = useState('');
  const [orderLinkId, setOrderLinkId] = useState('');
  const [pilotRunId, setPilotRunId] = useState('');
  const [pilotOrderId, setPilotOrderId] = useState('');
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
      getFoundingPrinthousePilotReadiness({ pilot_program_id: programId || undefined })
    ), [run, programId]);

  const handleCreateProgram = useCallback(async () => {
    const r = await run('Create Pilot Program', () =>
      createPilotProgram({ tenant_id: tenantId, program_name: programName, created_by: 'admin' })
    );
    if (r) {
      const pp = r.pilot_program as Record<string, unknown> | undefined;
      if (pp?.pilot_program_id) setProgramId(String(pp.pilot_program_id));
    }
  }, [run, tenantId, programName]);

  const handleRegister = useCallback(async () => {
    const r = await run('Register Founding Printhouse', () =>
      registerFoundingPrinthouse({
        pilot_program_id: programId, printhouse_tenant_id: printhouseTenantId,
        printhouse_name: printhouseName, allowed_file_access_level: 'REDACTED_PREVIEW', created_by: 'admin',
      })
    );
    if (r) {
      const p = r.participant as Record<string, unknown> | undefined;
      if (p?.participant_id) setParticipantId(String(p.participant_id));
    }
  }, [run, programId, printhouseTenantId, printhouseName]);

  const handleApprove = useCallback(() =>
    run('Approve Participant', () =>
      approveParticipantForPilot({ participant_id: participantId, approved_by: 'admin' })
    ), [run, participantId]);

  const handleSuspend = useCallback(() =>
    run('Suspend Participant', () =>
      suspendParticipant({ participant_id: participantId, suspended_by: 'admin', reason: 'Manual suspension' })
    ), [run, participantId]);

  const handleLinkOrder = useCallback(async () => {
    const r = await run('Link Internal Pilot Order', () =>
      linkInternalPilotOrder({
        pilot_program_id: programId, participant_id: participantId,
        pilot_run_id: pilotRunId || undefined, pilot_order_id: pilotOrderId || undefined, created_by: 'admin',
      })
    );
    if (r) {
      const ol = r.order_link as Record<string, unknown> | undefined;
      if (ol?.order_link_id) setOrderLinkId(String(ol.order_link_id));
    }
  }, [run, programId, participantId, pilotRunId, pilotOrderId]);

  const handleHandoffReadiness = useCallback(() =>
    run('Order Handoff Readiness', () =>
      getOrderHandoffReadiness({ order_link_id: orderLinkId })
    ), [run, orderLinkId]);

  const handleReview = useCallback(() =>
    run('Submit Review', () =>
      submitPrinthouseReview({ pilot_program_id: programId, participant_id: participantId, order_link_id: orderLinkId || undefined, reviewer: 'admin', review_status: 'APPROVED', review_notes: 'Reviewed via admin UI' })
    ), [run, programId, participantId, orderLinkId]);

  const handleRecordFinding = useCallback(async () => {
    const r = await run('Record Finding', () =>
      recordPilotFinding({ pilot_program_id: programId, participant_id: participantId || undefined, finding_type: 'OBSERVATION', blocks_handoff: false, severity: 'LOW', summary: 'Manual finding from admin UI', created_by: 'admin' })
    );
    if (r) {
      const f = r.finding as Record<string, unknown> | undefined;
      if (f?.finding_id) setFindingId(String(f.finding_id));
    }
  }, [run, programId, participantId]);

  const handleResolveFinding = useCallback(() =>
    run('Resolve Finding', () =>
      resolvePilotFinding({ finding_id: findingId, resolved_by: 'admin' })
    ), [run, findingId]);

  const handleAuditTimeline = useCallback(() =>
    run('Get Audit Timeline', () =>
      getFoundingPrinthousePilotAuditTimeline({ pilot_program_id: programId, participant_id: participantId || undefined })
    ), [run, programId, participantId]);

  const handleEvidencePack = useCallback(() =>
    run('Build Evidence Pack', () =>
      getFoundingPrinthousePilotEvidencePack({ pilot_program_id: programId, participant_id: participantId || undefined })
    ), [run, programId, participantId]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1>Phase 123 — Founding Printhouse Pilot Gate</h1>

      <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <strong>Founding-Printhouse Pilot Only</strong>
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
            <tr><td>EXTERNAL_TAX_SUBMISSION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>EXTERNAL_ACCOUNTING_SUBMISSION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>PROVIDER_EXTERNAL_SUBMISSION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>SOURCE_MUTATION_OUTSIDE_PILOT_SCOPE</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>PRODUCTION_ACTIVATION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>AUTOMATIC_PRODUCTION_DISPATCH</td><td><strong>NOT_ENABLED</strong></td></tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div>
          <label>Tenant ID</label><br />
          <input value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="tenant_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Program Name</label><br />
          <input value={programName} onChange={e => setProgramName(e.target.value)} placeholder="program_name" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Program ID</label><br />
          <input value={programId} onChange={e => setProgramId(e.target.value)} placeholder="pilot_program_id (auto)" style={{ width: '100%', padding: 6 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div>
          <label>Printhouse Tenant ID</label><br />
          <input value={printhouseTenantId} onChange={e => setPrinthouseTenantId(e.target.value)} placeholder="printhouse_tenant_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Printhouse Name</label><br />
          <input value={printhouseName} onChange={e => setPrinthouseName(e.target.value)} placeholder="printhouse_name" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Participant ID</label><br />
          <input value={participantId} onChange={e => setParticipantId(e.target.value)} placeholder="participant_id (auto)" style={{ width: '100%', padding: 6 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div>
          <label>Pilot Run ID</label><br />
          <input value={pilotRunId} onChange={e => setPilotRunId(e.target.value)} placeholder="pilot_run_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Pilot Order ID</label><br />
          <input value={pilotOrderId} onChange={e => setPilotOrderId(e.target.value)} placeholder="pilot_order_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Order Link ID</label><br />
          <input value={orderLinkId} onChange={e => setOrderLinkId(e.target.value)} placeholder="order_link_id (auto)" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Finding ID</label><br />
          <input value={findingId} onChange={e => setFindingId(e.target.value)} placeholder="finding_id (auto)" style={{ width: '100%', padding: 6 }} />
        </div>
      </div>

      <h3>Actions</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        <button onClick={handleReadiness} disabled={loading}>Check Readiness</button>
        <button onClick={handleCreateProgram} disabled={loading || !tenantId || !programName}>Create Program</button>
        <button onClick={handleRegister} disabled={loading || !programId || !printhouseTenantId || !printhouseName}>Register Printhouse</button>
        <button onClick={handleApprove} disabled={loading || !participantId}>Approve Participant</button>
        <button onClick={handleSuspend} disabled={loading || !participantId}>Suspend Participant</button>
        <button onClick={handleLinkOrder} disabled={loading || !programId || !participantId}>Link Order</button>
        <button onClick={handleHandoffReadiness} disabled={loading || !orderLinkId}>Handoff Readiness</button>
        <button onClick={handleReview} disabled={loading || !programId || !participantId}>Submit Review</button>
        <button onClick={handleRecordFinding} disabled={loading || !programId}>Record Finding</button>
        <button onClick={handleResolveFinding} disabled={loading || !findingId}>Resolve Finding</button>
        <button onClick={handleAuditTimeline} disabled={loading || !programId}>Audit Timeline</button>
        <button onClick={handleEvidencePack} disabled={loading || !programId}>Evidence Pack</button>
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
