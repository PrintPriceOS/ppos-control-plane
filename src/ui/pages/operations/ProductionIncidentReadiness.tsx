import React, { useState, useCallback } from 'react';
import {
  getObservabilityReadiness,
  simulateIncident,
  simulateAlertDispatch,
  recordIncidentFinding,
  resolveIncidentFinding,
  getIncidentReadinessEvidencePack,
} from '../../api/productionObservabilityIncidentReadinessClient';
import type {
  IncidentCategory,
  SimulateIncidentPayload,
  RecordFindingPayload,
} from '../../types/productionObservabilityIncidentReadiness';

const SAFETY_NOTICE =
  'This is a simulation-only phase. No real alerts are dispatched to external systems, ' +
  'no production is mutated, no financial/provider execution occurs, and no external submissions are made. ' +
  'Alert dispatch is simulated to INTERNAL_TEST_SINK_ONLY.';

const INCIDENT_CATEGORIES: IncidentCategory[] = [
  'API_DOWN',
  'DB_CONNECTION_FAILURE',
  'REDIS_CONNECTION_FAILURE',
  'PAYMENT_PROVIDER_FAILURE_SIMULATED',
  'PREFLIGHT_SERVICE_DEGRADED',
  'QUEUE_BACKLOG',
  'HIGH_ERROR_RATE',
  'SECURITY_ALERT',
  'DATA_EXPORT_BLOCKED',
  'ROLLBACK_REQUIRED',
];

export function ProductionIncidentReadiness() {
  const [runId, setRunId] = useState('');
  const [readiness, setReadiness] = useState<Record<string, unknown> | null>(null);
  const [evidencePack, setEvidencePack] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [incidentPayload, setIncidentPayload] = useState<SimulateIncidentPayload>({
    incident_category: 'API_DOWN',
    severity: 'MEDIUM',
    actor: 'admin',
  });

  const [findingPayload, setFindingPayload] = useState<RecordFindingPayload>({
    description: '',
    category: 'OBSERVABILITY_GAP',
    severity: 'MEDIUM',
  });

  const [findingId, setFindingId] = useState('');
  const [resolution, setResolution] = useState('');

  const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setLoading(true);
    setMessage(`Running: ${label}...`);
    try {
      const result = await fn();
      setMessage(`${label}: OK`);
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`${label}: ERROR — ${msg}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleReadiness = () =>
    run('Evaluate Observability Readiness', async () => {
      const result = await getObservabilityReadiness(runId || undefined) as Record<string, unknown>;
      setReadiness(result);
      return result;
    });

  const handleSimulateIncident = () =>
    run(`Simulate Incident: ${incidentPayload.incident_category}`, async () => {
      return simulateIncident({ ...incidentPayload, run_id: runId || undefined });
    });

  const handleSimulateAlert = () =>
    run('Simulate Alert Dispatch', async () => {
      return simulateAlertDispatch({
        run_id: runId || undefined,
        alert_type: 'OBSERVABILITY_TEST',
        sink: 'INTERNAL_TEST_SINK_ONLY',
        actor: 'admin',
      });
    });

  const handleRecordFinding = () =>
    run('Record Incident Finding', async () => {
      const result = await recordIncidentFinding({ ...findingPayload, run_id: runId || undefined }) as Record<string, unknown>;
      if (result?.finding_id) setFindingId(String(result.finding_id));
      return result;
    });

  const handleResolveFinding = () =>
    run('Resolve Finding', async () => {
      return resolveIncidentFinding({
        run_id: runId || undefined,
        finding_id: findingId,
        resolution: resolution || 'Resolved via admin panel',
        actor: 'admin',
      });
    });

  const handleEvidencePack = () =>
    run('Build Evidence Pack', async () => {
      const result = await getIncidentReadinessEvidencePack(runId || undefined) as Record<string, unknown>;
      setEvidencePack(result);
      return result;
    });

  return (
    <div style={{ padding: '24px', fontFamily: 'monospace', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
        Phase 118 — Production Observability &amp; Incident Readiness
      </h1>

      <div style={{
        background: '#fff3cd',
        border: '1px solid #ffc107',
        padding: '12px',
        marginBottom: '20px',
        borderRadius: '4px',
        fontSize: '13px',
      }}>
        <strong>SIMULATION ONLY:</strong> {SAFETY_NOTICE}
      </div>

      <section style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '8px' }}>Run ID (optional)</h2>
        <input
          value={runId}
          onChange={e => setRunId(e.target.value)}
          placeholder="Leave blank to auto-generate"
          style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '3px' }}
        />
      </section>

      <section style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '8px' }}>Observability Readiness</h2>
        <button onClick={handleReadiness} disabled={loading}
          style={{ padding: '6px 14px', cursor: 'pointer', marginRight: '8px' }}>
          Evaluate Readiness
        </button>
        {readiness && (
          <div style={{ marginTop: '8px', fontSize: '12px', background: '#f4f4f4', padding: '8px', borderRadius: '3px' }}>
            <div>Status: <strong>{String((readiness as any)?.observability_status ?? 'N/A')}</strong></div>
            <div>Checks: {String(JSON.stringify((readiness as any)?.observability_checks ?? {}))}</div>
          </div>
        )}
      </section>

      <section style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '8px' }}>Simulate Incident</h2>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <select
            value={incidentPayload.incident_category}
            onChange={e => setIncidentPayload(p => ({ ...p, incident_category: e.target.value as IncidentCategory }))}
            style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '3px' }}>
            {INCIDENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={incidentPayload.severity}
            onChange={e => setIncidentPayload(p => ({ ...p, severity: e.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }))}
            style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '3px' }}>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={handleSimulateIncident} disabled={loading}
          style={{ padding: '6px 14px', cursor: 'pointer', marginRight: '8px' }}>
          Simulate Incident (Simulation Only)
        </button>
        <button onClick={handleSimulateAlert} disabled={loading}
          style={{ padding: '6px 14px', cursor: 'pointer' }}>
          Simulate Alert Dispatch
        </button>
      </section>

      <section style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '8px' }}>Findings</h2>
        <textarea
          value={findingPayload.description}
          onChange={e => setFindingPayload(p => ({ ...p, description: e.target.value }))}
          placeholder="Finding description"
          rows={2}
          style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '3px', marginBottom: '6px' }}
        />
        <button onClick={handleRecordFinding} disabled={loading}
          style={{ padding: '6px 14px', cursor: 'pointer', marginRight: '8px' }}>
          Record Finding
        </button>
        {findingId && (
          <span style={{ fontSize: '12px', color: '#666' }}>Finding ID: {findingId}</span>
        )}
        {findingId && (
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
            <input
              value={resolution}
              onChange={e => setResolution(e.target.value)}
              placeholder="Resolution notes"
              style={{ flex: 1, padding: '6px', border: '1px solid #ccc', borderRadius: '3px' }}
            />
            <button onClick={handleResolveFinding} disabled={loading}
              style={{ padding: '6px 14px', cursor: 'pointer' }}>
              Resolve Finding
            </button>
          </div>
        )}
      </section>

      <section style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '8px' }}>Evidence Pack</h2>
        <button onClick={handleEvidencePack} disabled={loading}
          style={{ padding: '6px 14px', cursor: 'pointer' }}>
          Build Evidence Pack
        </button>
        {evidencePack && (
          <div style={{ marginTop: '8px', fontSize: '12px', background: '#f4f4f4', padding: '8px', borderRadius: '3px' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(evidencePack, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {message && (
        <div style={{
          padding: '8px 12px',
          background: message.includes('ERROR') ? '#fde8e8' : '#e8f5e9',
          border: `1px solid ${message.includes('ERROR') ? '#e53e3e' : '#48bb78'}`,
          borderRadius: '3px',
          fontSize: '13px',
        }}>
          {message}
        </div>
      )}

      <section style={{ marginTop: '24px', fontSize: '11px', color: '#666', borderTop: '1px solid #ddd', paddingTop: '12px' }}>
        <strong>Safety Invariants:</strong>
        <ul style={{ margin: '4px 0 0 16px' }}>
          <li>simulationOnly: true</li>
          <li>realAlertDispatched: false</li>
          <li>productionMutationEnabled: false</li>
          <li>externalSubmission: false</li>
          <li>paymentExecutionEnabled: false</li>
          <li>refundExecutionEnabled: false</li>
          <li>payoutExecutionEnabled: false</li>
          <li>fullPublicEnabled: false</li>
          <li>liveProviderConnectivityEnabled: false</li>
        </ul>
      </section>
    </div>
  );
}
