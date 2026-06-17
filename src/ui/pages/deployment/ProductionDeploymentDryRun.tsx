import React, { useState, useCallback } from 'react';
import {
  getDeploymentDryRunReadiness,
  createDeploymentDryRun,
  executeDeploymentDryRun,
  simulateDeploymentRollback,
  getDeploymentDryRunSteps,
  getDeploymentDryRunAuditTimeline,
  getDeploymentDryRunEvidencePack,
} from '../../api/productionDeploymentDryRunClient';
import type {
  CreateDryRunPayload,
  ExecuteDryRunPayload,
  SimulateRollbackPayload,
} from '../../types/productionDeploymentDryRun';

const SAFETY_NOTICE =
  'This is a dry-run only. No production activation, live provider connectivity, payment execution, ' +
  'refund execution, payout execution, external submission, service restart, real deployment, ' +
  'rollback execution, or source record mutation will occur.';

export function ProductionDeploymentDryRun() {
  const [dryRunId, setDryRunId] = useState('');
  const [activeDryRunId, setActiveDryRunId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<Record<string, unknown> | null>(null);
  const [steps, setSteps] = useState<unknown[]>([]);
  const [auditTimeline, setAuditTimeline] = useState<unknown[]>([]);
  const [evidencePack, setEvidencePack] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [createPayload, setCreatePayload] = useState<CreateDryRunPayload>({
    requested_by: 'admin',
    readiness_reference_id: '',
  });

  const [executePayload, setExecutePayload] = useState<ExecuteDryRunPayload>({
    dry_run_id: '',
    actor: 'admin',
  });

  const [rollbackPayload, setRollbackPayload] = useState<SimulateRollbackPayload>({
    dry_run_id: '',
    actor: 'admin',
    rollback_scenario: 'STANDARD_ROLLBACK',
  });

  const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setLoading(true);
    setMessage(`Running: ${label}...`);
    try {
      const result = await fn();
      setMessage(`Done: ${label}`);
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`Error: ${label} — ${msg}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCheckReadiness = async () => {
    const result = await run('Check Readiness', () => getDeploymentDryRunReadiness(dryRunId || undefined)) as Record<string, unknown> | null;
    if (result) setReadiness(result);
  };

  const handleCreate = async () => {
    const result = await run('Create Dry Run', () => createDeploymentDryRun(createPayload)) as Record<string, unknown> | null;
    if (result && result.dry_run_id) {
      const id = result.dry_run_id as string;
      setActiveDryRunId(id);
      setDryRunId(id);
      setExecutePayload(p => ({ ...p, dry_run_id: id }));
      setRollbackPayload(p => ({ ...p, dry_run_id: id }));
    }
  };

  const handleExecute = async () => {
    await run('Execute Dry Run', () => executeDeploymentDryRun({ ...executePayload, dry_run_id: executePayload.dry_run_id || activeDryRunId || '' }));
  };

  const handleSimulateRollback = async () => {
    await run('Simulate Rollback', () => simulateDeploymentRollback({ ...rollbackPayload, dry_run_id: rollbackPayload.dry_run_id || activeDryRunId || '' }));
  };

  const handleLoadSteps = async () => {
    const result = await run('Load Steps', () => getDeploymentDryRunSteps(activeDryRunId || dryRunId || undefined)) as Record<string, unknown> | null;
    if (result && Array.isArray(result.steps)) setSteps(result.steps);
  };

  const handleLoadAudit = async () => {
    const result = await run('Load Audit Timeline', () => getDeploymentDryRunAuditTimeline(activeDryRunId || dryRunId || undefined)) as Record<string, unknown> | null;
    if (result && Array.isArray(result.audit_timeline)) setAuditTimeline(result.audit_timeline);
  };

  const handleLoadEvidencePack = async () => {
    const result = await run('Load Evidence Pack', () => getDeploymentDryRunEvidencePack(activeDryRunId || dryRunId || undefined)) as Record<string, unknown> | null;
    if (result) setEvidencePack(result);
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: 900 }}>
      <h1>Phase 117 — Production Deployment Dry Run / Rollback Drill</h1>

      <div style={{ background: '#fff3cd', border: '2px solid #ffc107', padding: '1rem', marginBottom: '1.5rem', borderRadius: 4 }}>
        <strong>SAFETY NOTICE:</strong> {SAFETY_NOTICE}
      </div>

      {message && (
        <div style={{ background: '#e8f5e9', border: '1px solid #4caf50', padding: '0.75rem', marginBottom: '1rem', borderRadius: 4 }}>
          {message}
        </div>
      )}

      <section style={{ marginBottom: '2rem' }}>
        <h2>Dry Run ID</h2>
        <input
          style={{ width: '100%', padding: '0.5rem', fontFamily: 'monospace' }}
          placeholder="dry_run_id (auto-generated on create)"
          value={dryRunId}
          onChange={e => setDryRunId(e.target.value)}
        />
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>1. Readiness Check</h2>
        <button onClick={handleCheckReadiness} disabled={loading}>Check Readiness</button>
        {readiness && (
          <pre style={{ background: '#f5f5f5', padding: '1rem', marginTop: '0.5rem', overflowX: 'auto' }}>
            {JSON.stringify(readiness, null, 2)}
          </pre>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>2. Create Dry Run</h2>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input
            style={{ flex: 1, padding: '0.5rem', fontFamily: 'monospace' }}
            placeholder="requested_by"
            value={createPayload.requested_by}
            onChange={e => setCreatePayload(p => ({ ...p, requested_by: e.target.value }))}
          />
          <input
            style={{ flex: 2, padding: '0.5rem', fontFamily: 'monospace' }}
            placeholder="readiness_reference_id (optional)"
            value={createPayload.readiness_reference_id}
            onChange={e => setCreatePayload(p => ({ ...p, readiness_reference_id: e.target.value }))}
          />
        </div>
        <button onClick={handleCreate} disabled={loading}>Create Dry Run</button>
        {activeDryRunId && (
          <div style={{ marginTop: '0.5rem', color: '#2e7d32' }}>
            Active Dry Run ID: <strong>{activeDryRunId}</strong>
          </div>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>3. Execute Dry Run</h2>
        <input
          style={{ width: '100%', padding: '0.5rem', fontFamily: 'monospace', marginBottom: '0.5rem' }}
          placeholder="dry_run_id"
          value={executePayload.dry_run_id}
          onChange={e => setExecutePayload(p => ({ ...p, dry_run_id: e.target.value }))}
        />
        <button onClick={handleExecute} disabled={loading}>Execute Dry Run (Simulated)</button>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>4. Simulate Rollback</h2>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input
            style={{ flex: 2, padding: '0.5rem', fontFamily: 'monospace' }}
            placeholder="dry_run_id"
            value={rollbackPayload.dry_run_id}
            onChange={e => setRollbackPayload(p => ({ ...p, dry_run_id: e.target.value }))}
          />
          <input
            style={{ flex: 1, padding: '0.5rem', fontFamily: 'monospace' }}
            placeholder="rollback_scenario"
            value={rollbackPayload.rollback_scenario}
            onChange={e => setRollbackPayload(p => ({ ...p, rollback_scenario: e.target.value }))}
          />
        </div>
        <button onClick={handleSimulateRollback} disabled={loading}>Simulate Rollback (Drill Only)</button>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>5. Dry Run Steps</h2>
        <button onClick={handleLoadSteps} disabled={loading}>Load Steps</button>
        {steps.length > 0 && (
          <pre style={{ background: '#f5f5f5', padding: '1rem', marginTop: '0.5rem', overflowX: 'auto' }}>
            {JSON.stringify(steps, null, 2)}
          </pre>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>6. Audit Timeline</h2>
        <button onClick={handleLoadAudit} disabled={loading}>Load Audit Timeline</button>
        {auditTimeline.length > 0 && (
          <pre style={{ background: '#f5f5f5', padding: '1rem', marginTop: '0.5rem', overflowX: 'auto' }}>
            {JSON.stringify(auditTimeline, null, 2)}
          </pre>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>7. Evidence Pack</h2>
        <button onClick={handleLoadEvidencePack} disabled={loading}>Load Evidence Pack</button>
        {evidencePack && (
          <pre style={{ background: '#f5f5f5', padding: '1rem', marginTop: '0.5rem', overflowX: 'auto' }}>
            {JSON.stringify(evidencePack, null, 2)}
          </pre>
        )}
      </section>

      <section>
        <h2>Safety Invariants</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {[
              ['Deployment Dry Run Only', 'ACTIVE'],
              ['Real Deployment Executed', 'NOT ENABLED'],
              ['Service Restart Executed', 'NOT ENABLED'],
              ['Rollback Executed', 'NOT ENABLED'],
              ['Production Activation', 'NOT ENABLED'],
              ['Full Public', 'NOT ENABLED'],
              ['Live Provider Connectivity', 'NOT ENABLED'],
              ['Payment Execution', 'NOT ENABLED'],
              ['Refund Execution', 'NOT ENABLED'],
              ['Payout Execution', 'NOT ENABLED'],
              ['External Submission', 'NOT ENABLED'],
              ['Source Mutation', 'NOT ENABLED'],
            ].map(([label, value]) => (
              <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.4rem 0.75rem', fontWeight: 'bold' }}>{label}</td>
                <td style={{ padding: '0.4rem 0.75rem', color: value === 'ACTIVE' ? '#2e7d32' : '#b71c1c' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
