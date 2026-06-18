import React, { useState, useCallback } from 'react';
import {
  getRuntimeVerificationReadiness,
  createRuntimeVerificationRun,
  verifyDbReadThrough,
  verifyMemoryEmptyRecovery,
  verifyAuditRecovery,
  verifyEvidenceRecovery,
  verifyAllowlist,
  verifyBlockers,
  getRuntimeVerificationAuditTimeline,
  getRuntimeVerificationEvidencePack,
} from '../../api/internalOrderLifecycleRuntimeVerificationClient';

const SAFETY_NOTICE =
  'Runtime verification / restart recovery drill only. No real restart is executed by code. ' +
  'All restart actions are manual/documented. FULL_PUBLIC remains disabled. No open marketplace access, ' +
  'payment execution, refund execution, payout execution, tax/accounting submission, ' +
  'provider submission, or source record mutation outside pilot scope is enabled.';

export function InternalOrderLifecycleRuntimeVerification() {
  const [tenantId, setTenantId] = useState('');
  const [verificationRunId, setVerificationRunId] = useState('');
  const [linkedPilotRunId, setLinkedPilotRunId] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const persistenceMode = result?.persistenceMode as string | undefined;
  const persistenceStatus = result?.persistenceStatus as string | undefined;

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
      getRuntimeVerificationReadiness({ verification_run_id: verificationRunId || undefined })
    ), [run, verificationRunId]);

  const handleCreate = useCallback(async () => {
    const r = await run('Create Verification Run', () =>
      createRuntimeVerificationRun({ tenant_id: tenantId, linked_pilot_run_id: linkedPilotRunId || undefined, requested_by: 'admin' })
    );
    if (r) {
      const vr = r.verification_run as Record<string, unknown> | undefined;
      if (vr?.verification_run_id) setVerificationRunId(String(vr.verification_run_id));
    }
  }, [run, tenantId, linkedPilotRunId]);

  const handleDbReadThrough = useCallback(() =>
    run('Verify DB Read-Through', () =>
      verifyDbReadThrough({ verification_run_id: verificationRunId })
    ), [run, verificationRunId]);

  const handleMemoryRecovery = useCallback(() =>
    run('Verify Memory Empty Recovery', () =>
      verifyMemoryEmptyRecovery({ verification_run_id: verificationRunId })
    ), [run, verificationRunId]);

  const handleAuditRecovery = useCallback(() =>
    run('Verify Audit Recovery', () =>
      verifyAuditRecovery({ verification_run_id: verificationRunId })
    ), [run, verificationRunId]);

  const handleEvidenceRecovery = useCallback(() =>
    run('Verify Evidence Recovery', () =>
      verifyEvidenceRecovery({ verification_run_id: verificationRunId, linked_pilot_run_id: linkedPilotRunId || undefined })
    ), [run, verificationRunId, linkedPilotRunId]);

  const handleAllowlist = useCallback(() =>
    run('Verify Allowlist Fail-Closed', () =>
      verifyAllowlist({ verification_run_id: verificationRunId })
    ), [run, verificationRunId]);

  const handleBlockers = useCallback(() =>
    run('Verify Blocker Findings', () =>
      verifyBlockers({ verification_run_id: verificationRunId, linked_pilot_run_id: linkedPilotRunId || undefined })
    ), [run, verificationRunId, linkedPilotRunId]);

  const handleAuditTimeline = useCallback(() =>
    run('Get Audit Timeline', () =>
      getRuntimeVerificationAuditTimeline({ verification_run_id: verificationRunId })
    ), [run, verificationRunId]);

  const handleEvidencePack = useCallback(() =>
    run('Build Evidence Pack', () =>
      getRuntimeVerificationEvidencePack({ verification_run_id: verificationRunId })
    ), [run, verificationRunId]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1>Phase 122.2 — Runtime Verification / Restart Recovery Drill</h1>

      <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <strong>Runtime Verification Only — No Real Restart Executed</strong>
        <p style={{ margin: '8px 0 0' }}>{SAFETY_NOTICE}</p>
      </div>

      {/* Persistence Status */}
      <div style={{ background: '#e2e3e5', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3>Verification Status</h3>
        <table style={{ width: '100%', fontSize: 13 }}>
          <tbody>
            <tr>
              <td>Persistence Mode</td>
              <td><strong>{persistenceMode || '—'}</strong></td>
            </tr>
            <tr>
              <td>Persistence Status</td>
              <td><strong style={{ color: persistenceStatus === 'PERSISTED' ? '#28a745' : persistenceStatus === 'FALLBACK_ONLY' ? '#ffc107' : persistenceStatus === 'FAILED' ? '#dc3545' : undefined }}>
                {persistenceStatus || '—'}
              </strong></td>
            </tr>
            <tr>
              <td>Memory Fallback Production Valid</td>
              <td><strong style={{ color: '#dc3545' }}>NO — memory-only is not production-valid</strong></td>
            </tr>
          </tbody>
        </table>
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
            <tr><td>SERVICE_RESTART_EXECUTED</td><td><strong>NO — manual only</strong></td></tr>
            <tr><td>REAL_RESTART_EXECUTED</td><td><strong>NO — manual only</strong></td></tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div>
          <label>Tenant ID</label><br />
          <input value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="tenant_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Verification Run ID</label><br />
          <input value={verificationRunId} onChange={e => setVerificationRunId(e.target.value)} placeholder="verification_run_id (auto)" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Linked Pilot Run ID</label><br />
          <input value={linkedPilotRunId} onChange={e => setLinkedPilotRunId(e.target.value)} placeholder="linked_pilot_run_id (optional)" style={{ width: '100%', padding: 6 }} />
        </div>
      </div>

      <h3>Actions</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        <button onClick={handleReadiness} disabled={loading}>Check Readiness</button>
        <button onClick={handleCreate} disabled={loading || !tenantId}>Create Verification Run</button>
        <button onClick={handleDbReadThrough} disabled={loading || !verificationRunId}>Verify DB Read-Through</button>
        <button onClick={handleMemoryRecovery} disabled={loading || !verificationRunId}>Verify Memory Recovery</button>
        <button onClick={handleAuditRecovery} disabled={loading || !verificationRunId}>Verify Audit Recovery</button>
        <button onClick={handleEvidenceRecovery} disabled={loading || !verificationRunId}>Verify Evidence Recovery</button>
        <button onClick={handleAllowlist} disabled={loading || !verificationRunId}>Verify Allowlist</button>
        <button onClick={handleBlockers} disabled={loading || !verificationRunId}>Verify Blockers</button>
        <button onClick={handleAuditTimeline} disabled={loading || !verificationRunId}>Audit Timeline</button>
        <button onClick={handleEvidencePack} disabled={loading || !verificationRunId}>Evidence Pack</button>
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
