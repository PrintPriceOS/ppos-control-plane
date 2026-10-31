import React, { useState, useCallback } from 'react';
import {
  getInternalOrderLifecyclePilotReadiness,
  createInternalOrderLifecyclePilotRun,
  createInternalPilotOrder,
  executeInternalOrderLifecycle,
  createInternalOrderLifecycleRollbackPoint,
  simulateInternalOrderLifecycleRollback,
  recordInternalOrderLifecycleFinding,
  resolveInternalOrderLifecycleFinding,
  getInternalOrderLifecycleSteps,
  getInternalOrderLifecycleAuditTimeline,
  getInternalOrderLifecycleEvidencePack,
} from '../../api/internalOrderLifecyclePilotClient';

const SAFETY_NOTICE =
  'Internal order lifecycle pilot only. FULL_PUBLIC remains disabled. No open marketplace access, ' +
  'unrestricted live provider connectivity, payment execution, refund execution, payout execution, ' +
  'tax/accounting submission, provider submission, or source record mutation outside pilot scope is enabled.';

export function InternalOrderLifecyclePilot() {
  const [tenantId, setTenantId] = useState('');
  const [pilotRunId, setPilotRunId] = useState('');
  const [pilotOrderId, setPilotOrderId] = useState('');
  const [findingKey, setFindingKey] = useState('');
  const [findingSeverity, setFindingSeverity] = useState('INFO');
  const [blocksLifecycle, setBlocksLifecycle] = useState(false);
  const [findingId, setFindingId] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const persistenceMode = result?.persistenceMode as string | undefined;
  const persistenceStatus = result?.persistenceStatus as string | undefined;
  const tenantAllowlistFailClosed = result?.tenantAllowlistFailClosed as boolean | undefined;
  const priorPhaseEvidenceStatus = result?.priorPhaseEvidenceStatus as string | undefined;

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

  const handleCreateRun = useCallback(async () => {
    const r = await run('Create Pilot Lifecycle Run', () =>
      createInternalOrderLifecyclePilotRun({ tenant_id: tenantId, requested_by: 'admin' })
    );
    if (r) {
      const pr = r.pilot_run as Record<string, unknown> | undefined;
      if (pr?.pilot_run_id) setPilotRunId(String(pr.pilot_run_id));
    }
  }, [run, tenantId]);

  const handleReadiness = useCallback(() =>
    run('Evaluate Readiness', () =>
      getInternalOrderLifecyclePilotReadiness({ pilot_run_id: pilotRunId || undefined, tenant_id: tenantId || undefined })
    ), [run, pilotRunId, tenantId]);

  const handleCreateOrder = useCallback(async () => {
    const r = await run('Create Internal Pilot Order', () =>
      createInternalPilotOrder({ pilot_run_id: pilotRunId, tenant_id: tenantId })
    );
    if (r) {
      const po = r.pilot_order as Record<string, unknown> | undefined;
      if (po?.pilot_order_id) setPilotOrderId(String(po.pilot_order_id));
    }
  }, [run, pilotRunId, tenantId]);

  const handleExecuteLifecycle = useCallback(() =>
    run('Execute Internal Order Lifecycle', () =>
      executeInternalOrderLifecycle({ pilot_run_id: pilotRunId, pilot_order_id: pilotOrderId, tenant_id: tenantId })
    ), [run, pilotRunId, pilotOrderId, tenantId]);

  const handleRollbackPoint = useCallback(() =>
    run('Create Rollback Point', () =>
      createInternalOrderLifecycleRollbackPoint({ pilot_run_id: pilotRunId, pilot_order_id: pilotOrderId })
    ), [run, pilotRunId, pilotOrderId]);

  const handleSimulateRollback = useCallback(() =>
    run('Simulate Rollback', () =>
      simulateInternalOrderLifecycleRollback({ pilot_run_id: pilotRunId, pilot_order_id: pilotOrderId })
    ), [run, pilotRunId, pilotOrderId]);

  const handleRecordFinding = useCallback(() =>
    run('Record Finding', () =>
      recordInternalOrderLifecycleFinding({ pilot_run_id: pilotRunId, finding_key: findingKey, severity: findingSeverity, blocks_lifecycle: blocksLifecycle })
    ), [run, pilotRunId, findingKey, findingSeverity, blocksLifecycle]);

  const handleResolveFinding = useCallback(() =>
    run('Resolve Finding', () =>
      resolveInternalOrderLifecycleFinding({ pilot_run_id: pilotRunId, finding_id: findingId, resolved_by: 'admin' })
    ), [run, pilotRunId, findingId]);

  const handleSteps = useCallback(() =>
    run('List Lifecycle Steps', () =>
      getInternalOrderLifecycleSteps({ pilot_run_id: pilotRunId, pilot_order_id: pilotOrderId || undefined })
    ), [run, pilotRunId, pilotOrderId]);

  const handleAuditTimeline = useCallback(() =>
    run('Get Audit Timeline', () =>
      getInternalOrderLifecycleAuditTimeline({ pilot_run_id: pilotRunId })
    ), [run, pilotRunId]);

  const handleEvidencePack = useCallback(() =>
    run('Build Evidence Pack', () =>
      getInternalOrderLifecycleEvidencePack({ pilot_run_id: pilotRunId, pilot_order_id: pilotOrderId || undefined })
    ), [run, pilotRunId, pilotOrderId]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1>Phase 122 — Internal Order Lifecycle Pilot</h1>

      <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <strong>Controlled Internal Pilot</strong>
        <p style={{ margin: '8px 0 0' }}>{SAFETY_NOTICE}</p>
      </div>

      {/* Persistence & Hardening Status */}
      <div style={{ background: '#e2e3e5', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3>Hardening Status (Phase 122.1)</h3>
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
              <td>Tenant Allowlist Fail-Closed</td>
              <td><strong>{tenantAllowlistFailClosed === true ? 'YES (fail-closed)' : tenantAllowlistFailClosed === false ? 'NO (allowlist present or test mode)' : '—'}</strong></td>
            </tr>
            <tr>
              <td>Prior Phase Evidence</td>
              <td><strong style={{ color: priorPhaseEvidenceStatus === 'VERIFIED' ? '#28a745' : priorPhaseEvidenceStatus === 'PRIOR_PHASE_EVIDENCE_UNVERIFIED' ? '#ffc107' : undefined }}>
                {priorPhaseEvidenceStatus || '—'}
              </strong></td>
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
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div>
          <label>Tenant ID</label><br />
          <input value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="tenant_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Pilot Run ID</label><br />
          <input value={pilotRunId} onChange={e => setPilotRunId(e.target.value)} placeholder="pilot_run_id (auto-generated)" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Pilot Order ID</label><br />
          <input value={pilotOrderId} onChange={e => setPilotOrderId(e.target.value)} placeholder="pilot_order_id (auto-generated)" style={{ width: '100%', padding: 6 }} />
        </div>
      </div>

      <h3>Actions</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        <button onClick={handleCreateRun} disabled={loading || !tenantId}>Create Pilot Lifecycle Run</button>
        <button onClick={handleReadiness} disabled={loading}>Evaluate Readiness</button>
        <button onClick={handleCreateOrder} disabled={loading || !pilotRunId || !tenantId}>Create Internal Pilot Order</button>
        <button onClick={handleExecuteLifecycle} disabled={loading || !pilotRunId}>Execute Lifecycle</button>
        <button onClick={handleRollbackPoint} disabled={loading || !pilotRunId}>Create Rollback Point</button>
        <button onClick={handleSimulateRollback} disabled={loading || !pilotRunId}>Simulate Rollback</button>
        <button onClick={handleSteps} disabled={loading || !pilotRunId}>List Steps</button>
        <button onClick={handleAuditTimeline} disabled={loading || !pilotRunId}>Audit Timeline</button>
        <button onClick={handleEvidencePack} disabled={loading || !pilotRunId}>Evidence Pack</button>
      </div>

      <h3>Findings</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <label>Finding Key</label><br />
          <input value={findingKey} onChange={e => setFindingKey(e.target.value)} placeholder="finding_key" style={{ padding: 6 }} />
        </div>
        <div>
          <label>Severity</label><br />
          <select value={findingSeverity} onChange={e => setFindingSeverity(e.target.value)} style={{ padding: 6 }}>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="BLOCKER">BLOCKER</option>
          </select>
        </div>
        <div>
          <label>
            <input type="checkbox" checked={blocksLifecycle} onChange={e => setBlocksLifecycle(e.target.checked)} />
            {' '}Blocks Lifecycle
          </label>
        </div>
        <button onClick={handleRecordFinding} disabled={loading || !pilotRunId}>Record Finding</button>
        <div>
          <label>Finding ID</label><br />
          <input value={findingId} onChange={e => setFindingId(e.target.value)} placeholder="finding_id" style={{ padding: 6 }} />
        </div>
        <button onClick={handleResolveFinding} disabled={loading || !pilotRunId || !findingId}>Resolve Finding</button>
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
