import React, { useState, useCallback, useEffect } from 'react';
import { runtimeActivityObservationClient } from '../../api/controlledBetaRuntimeActivityObservationClient';
import {
  RuntimeActivityObservationGate,
  RuntimeActivityEvent,
  RuntimeActivityBlockedAttempt,
  RuntimeActivityAnomalySignal,
  RuntimeActivityHealthSignal,
  ParticipantUsageSummary,
  CohortUsageSummary
} from '../../types/controlledBetaRuntimeActivityObservation';

export function ControlledBetaRuntimeActivityObservation() {
  const [observationGateId, setObservationGateId] = useState('');
  const [sessionGateId, setSessionGateId] = useState('');
  const [runtimeSessionId, setRuntimeSessionId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [tenantId, setTenantId] = useState('tenant_beta_01');
  const [cohortId, setCohortId] = useState('cohort_beta_01');

  // Event ingestion / blocked attempts inputs
  const [eventType, setEventType] = useState('API_REQUEST');
  const [eventStatus, setEventStatus] = useState('ALLOWED');
  const [featureKey, setFeatureKey] = useState('feature:analytics');
  const [actionKey, setActionKey] = useState('read');
  const [blockedReason, setBlockedReason] = useState('DAILY_LIMIT_EXCEEDED');

  // Anomaly & Health inputs
  const [anomalyKey, setAnomalyKey] = useState('RATE_LIMIT_VIOLATION');
  const [healthKey, setHealthKey] = useState('INGESTION_LAG_HIGH');

  // Finding inputs
  const [findingSeverity, setFindingSeverity] = useState('BLOCKER');
  const [findingKey, setFindingKey] = useState('UNAUTHORIZED_ATTEMPTS_SPIKE');
  const [findingId, setFindingId] = useState('');

  // Loaded state
  const [gate, setGate] = useState<RuntimeActivityObservationGate | null>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [events, setEvents] = useState<RuntimeActivityEvent[]>([]);
  const [featureUsage, setFeatureUsage] = useState<any[]>([]);
  const [dailyCounters, setDailyCounters] = useState<any[]>([]);
  const [blockedAttempts, setBlockedAttempts] = useState<RuntimeActivityBlockedAttempt[]>([]);
  const [anomalySignals, setAnomalySignals] = useState<RuntimeActivityAnomalySignal[]>([]);
  const [healthSignals, setHealthSignals] = useState<RuntimeActivityHealthSignal[]>([]);
  const [participantSummary, setParticipantSummary] = useState<ParticipantUsageSummary | null>(null);
  const [cohortSummary, setCohortSummary] = useState<CohortUsageSummary | null>(null);
  const [evidencePack, setEvidencePack] = useState<any>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const refreshState = useCallback(async (currentGateId = observationGateId) => {
    if (!currentGateId) return;
    try {
      const r = await runtimeActivityObservationClient.getReadiness(currentGateId);
      setReadiness(r);

      const audRes = await runtimeActivityObservationClient.getAuditTimeline(currentGateId);
      if (audRes.ok) setAuditLog(audRes.timeline);

      const evRes = await runtimeActivityObservationClient.getEvidencePack(currentGateId);
      if (evRes.ok) setEvidencePack(evRes.evidencePack);

      const dashRes = await runtimeActivityObservationClient.getDashboard();
      if (dashRes.ok) setDashboard(dashRes.dashboard);

      if (participantId) {
        const ps = await runtimeActivityObservationClient.getParticipantSummary(currentGateId, participantId);
        if (ps.ok) setParticipantSummary(ps.participantSummary);
      }
      if (cohortId) {
        const cs = await runtimeActivityObservationClient.getCohortSummary(cohortId, tenantId);
        if (cs.ok) setCohortSummary(cs.cohortSummary);
      }
    } catch (e) {
      console.error(e);
    }
  }, [observationGateId, participantId, cohortId, tenantId]);

  const runAction = async (actionLabel: string, actionFn: () => Promise<any>) => {
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await actionFn();
      if (res.ok) {
        setMessage(`${actionLabel} succeeded.`);
      } else {
        setErrorMsg(`${actionLabel} failed: ${res.error || res.reason || 'Unknown error'}`);
      }
      await refreshState();
      return res;
    } catch (e: any) {
      setErrorMsg(`${actionLabel} error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGate = async () => {
    const res = await runAction('Create Observation Gate', () =>
      runtimeActivityObservationClient.createGate({
        observation_gate_id: observationGateId || undefined,
        session_gate_id: sessionGateId,
        runtime_session_id: runtimeSessionId,
        participant_id: participantId,
        tenant_id: tenantId,
        cohort_id: cohortId
      })
    );
    if (res?.ok && res.gate) {
      setGate(res.gate);
      setObservationGateId(res.gate.observation_gate_id);
      await refreshState(res.gate.observation_gate_id);
    }
  };

  const handleIngestEvent = () => {
    return runAction('Ingest Activity Event', () =>
      runtimeActivityObservationClient.ingestEvent(observationGateId, {
        runtimeSessionId,
        eventType,
        status: eventStatus,
        featureKey,
        actionKey,
        metadata: { client: 'admin-dashboard' }
      })
    );
  };

  const handleRecordBlockedAttempt = () => {
    return runAction('Record Blocked Attempt', () =>
      runtimeActivityObservationClient.recordBlockedAttempt(observationGateId, {
        runtimeSessionId,
        featureKey,
        actionKey,
        blockedReason,
        severity: 'HIGH'
      })
    );
  };

  const handleRecordAnomaly = () => {
    return runAction('Record Anomaly Signal', () =>
      runtimeActivityObservationClient.recordAnomalySignal(observationGateId, {
        runtimeSessionId,
        participantId,
        tenantId,
        cohortId,
        anomalyKey,
        severity: 'HIGH'
      })
    );
  };

  const handleRecordHealth = () => {
    return runAction('Record Health Signal', () =>
      runtimeActivityObservationClient.recordHealthSignal(observationGateId, {
        runtimeSessionId,
        participantId,
        tenantId,
        cohortId,
        signalKey: healthKey,
        status: 'WARNING',
        severity: 'MEDIUM'
      })
    );
  };

  const handleRunGuardrails = () => {
    return runAction('Run Guardrails', () =>
      runtimeActivityObservationClient.runGuardrails(observationGateId)
    );
  };

  const handleCreateFinding = () => {
    return runAction('Create Finding', () =>
      runtimeActivityObservationClient.createFinding(observationGateId, {
        severity: findingSeverity,
        findingKey,
        details: { source: 'dashboard' }
      })
    );
  };

  const handleResolveFinding = () => {
    return runAction('Resolve Finding', () =>
      runtimeActivityObservationClient.resolveFinding(observationGateId, findingId)
    );
  };

  useEffect(() => {
    if (observationGateId) {
      refreshState();
    }
  }, [observationGateId, refreshState]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: 'Inter, sans-serif', color: '#1f2937' }}>
      {/* Warning Banner */}
      <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700 }}>⚠️ Controlled runtime activity observation only.</h3>
        <p style={{ margin: 0, fontSize: 14 }}>
          This does not enforce, revoke, expand, charge, submit externally, or open public beta.
        </p>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Controlled Beta Runtime Activity Observation (Phase 136)</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Left Column: Form Setup and Event Ingestion */}
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Observation Gate Setup</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Observation Gate ID</label>
              <input value={observationGateId} onChange={e => setObservationGateId(e.target.value)} placeholder="obs_136_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Session Gate ID (Phase 135)</label>
              <input value={sessionGateId} onChange={e => setSessionGateId(e.target.value)} placeholder="sg_135_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Active Session ID</label>
              <input value={runtimeSessionId} onChange={e => setRuntimeSessionId(e.target.value)} placeholder="sess_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Participant ID</label>
              <input value={participantId} onChange={e => setParticipantId(e.target.value)} placeholder="part_134_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Tenant ID</label>
              <input value={tenantId} onChange={e => setTenantId(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Cohort ID</label>
              <input value={cohortId} onChange={e => setCohortId(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button onClick={handleCreateGate} disabled={loading} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Create Gate</button>
            <button onClick={handleRunGuardrails} disabled={loading || !observationGateId} style={{ padding: '8px 16px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Run Guardrails</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Ingest Activity Event</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Event Type</label>
              <input value={eventType} onChange={e => setEventType(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Event Status</label>
              <input value={eventStatus} onChange={e => setEventStatus(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Feature Key</label>
              <input value={featureKey} onChange={e => setFeatureKey(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Action Key</label>
              <input value={actionKey} onChange={e => setActionKey(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button onClick={handleIngestEvent} disabled={loading || !observationGateId} style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Ingest Event</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Signals Ingestion</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Blocked Reason</label>
              <input value={blockedReason} onChange={e => setBlockedReason(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <button onClick={handleRecordBlockedAttempt} disabled={loading || !observationGateId} style={{ width: '100%', padding: '10px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginTop: 18 }}>Record Blocked Attempt</button>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Anomaly Key</label>
              <input value={anomalyKey} onChange={e => setAnomalyKey(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <button onClick={handleRecordAnomaly} disabled={loading || !observationGateId} style={{ width: '100%', padding: '10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginTop: 18 }}>Record Anomaly</button>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Health Key</label>
              <input value={healthKey} onChange={e => setHealthKey(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <button onClick={handleRecordHealth} disabled={loading || !observationGateId} style={{ width: '100%', padding: '10px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginTop: 18 }}>Record Health Warning</button>
            </div>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Findings Management</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Finding Key</label>
              <input value={findingKey} onChange={e => setFindingKey(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <button onClick={handleCreateFinding} disabled={loading || !observationGateId} style={{ width: '100%', padding: '10px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginTop: 18 }}>Raise Finding</button>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Finding ID to Resolve</label>
              <input value={findingId} onChange={e => setFindingId(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <button onClick={handleResolveFinding} disabled={loading || !findingId} style={{ width: '100%', padding: '10px', background: '#4b5563', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginTop: 18 }}>Resolve Finding</button>
            </div>
          </div>
        </div>

        {/* Right Column: Status Checklist and Diagnostics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Dashboard */}
          {dashboard && (
            <div style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Observation Dashboard</h3>
              <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>{dashboard.warning_banner}</p>
            </div>
          )}

          {/* Feedback */}
          {(message || errorMsg) && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              {message && <div style={{ color: '#059669', fontSize: 14, fontWeight: 600 }}>{message}</div>}
              {errorMsg && <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>{errorMsg}</div>}
            </div>
          )}

          {/* Readiness Status */}
          {readiness && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Readiness Checks</h3>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  background: readiness.ok ? '#d1fae5' : '#fee2e2',
                  color: readiness.ok ? '#065f46' : '#991b1b'
                }}>{readiness.readiness_status}</span>
              </div>
              {readiness.blocked_reasons.length > 0 && (
                <div style={{ marginBottom: 16, padding: 8, background: '#fef2f2', borderRadius: 4, color: '#991b1b', fontSize: 12 }}>
                  <strong>Blockers:</strong> {readiness.blocked_reasons.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Redacted Usage Summaries */}
          {participantSummary && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Participant Usage Summary (Redacted)</h3>
              <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>Total Sessions: <strong>{participantSummary.total_sessions}</strong></div>
                <div>Total Events: <strong>{participantSummary.total_events}</strong></div>
                <div>Allowed / Denied / Blocked: <strong>{participantSummary.allowed_events} / {participantSummary.denied_events} / {participantSummary.blocked_events}</strong></div>
                <div>Features Used: <strong>{participantSummary.features_used_count}</strong></div>
                <div>Anomalies Detected: <strong>{participantSummary.anomaly_count}</strong></div>
              </div>
            </div>
          )}

          {cohortSummary && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Cohort Usage Summary (Redacted)</h3>
              <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>Active Participants: <strong>{cohortSummary.active_participant_count}</strong></div>
                <div>Total Events: <strong>{cohortSummary.total_events}</strong></div>
                <div>Allowed / Denied: <strong>{cohortSummary.allowed_events} / {cohortSummary.denied_events}</strong></div>
              </div>
            </div>
          )}

          {/* Evidence Pack */}
          {evidencePack && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Evidence Pack (v{evidencePack.evidence_schema_version})</h3>
              <div style={{ fontSize: 11, background: '#f9fafb', padding: 8, borderRadius: 4, maxHeight: 150, overflowY: 'auto' }}>
                <pre>{JSON.stringify(evidencePack, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* Audit Logs */}
          {auditLog.length > 0 && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Audit Timeline</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 200, overflowY: 'auto' }}>
                {auditLog.map((aud, idx) => (
                  <div key={idx} style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{aud.event_type}</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>
                      By: {aud.actor_id} | {new Date(aud.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default ControlledBetaRuntimeActivityObservation;
