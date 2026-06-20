import React, { useState, useCallback, useEffect } from 'react';
import { runtimeSessionClient } from '../../api/controlledBetaRuntimeSessionClient';
import { RuntimeSessionGate, RuntimeSession, RuntimeSessionLimits, RuntimeSessionReadiness } from '../../types/controlledBetaRuntimeSession';

export function ControlledBetaRuntimeSession() {
  const [gateId, setGateId] = useState('');
  const [acceptanceGateId, setAcceptanceGateId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [tenantId, setTenantId] = useState('tenant_beta_01');
  const [cohortId, setCohortId] = useState('cohort_beta_01');

  // Limit fields
  const [maxSessions, setMaxSessions] = useState(1);
  const [maxConcurrentSessions, setMaxConcurrentSessions] = useState(1);
  const [sessionTtl, setSessionTtl] = useState(60);
  const [dailyActionLimit, setDailyActionLimit] = useState(100);
  const [allowedFeatures, setAllowedFeatures] = useState('feature:read,feature:write');

  // Evaluate features & heartbeats
  const [activeSessionId, setActiveSessionId] = useState('');
  const [evalFeatureKey, setEvalFeatureKey] = useState('feature:read');
  const [evalResult, setEvalResult] = useState<any>(null);

  // Actions reason
  const [reason, setReason] = useState('Routine admin action');

  // State
  const [gate, setGate] = useState<RuntimeSessionGate | null>(null);
  const [readiness, setReadiness] = useState<RuntimeSessionReadiness | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [evidencePack, setEvidencePack] = useState<any | null>(null);
  const [dashboard, setDashboard] = useState<any | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const refreshState = useCallback(async (currentGateId = gateId) => {
    if (!currentGateId) return;
    try {
      const readRes = await runtimeSessionClient.getReadiness(currentGateId);
      setReadiness(readRes);

      const audRes = await runtimeSessionClient.getAuditTimeline(currentGateId);
      if (audRes.ok) setAuditLog(audRes.timeline);

      const evRes = await runtimeSessionClient.getEvidencePack(currentGateId);
      if (evRes.ok) setEvidencePack(evRes.evidencePack);

      const dashRes = await runtimeSessionClient.getDashboard();
      if (dashRes.ok) setDashboard(dashRes.dashboard);
    } catch (e) {
      console.error(e);
    }
  }, [gateId]);

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
    const res = await runAction('Create Session Gate', () => runtimeSessionClient.createGate({
      session_gate_id: gateId || undefined,
      acceptance_gate_id: acceptanceGateId,
      participant_id: participantId,
      tenant_id: tenantId,
      cohort_id: cohortId
    }));
    if (res?.ok && res.gate) {
      setGate(res.gate);
      setGateId(res.gate.session_gate_id);
      await refreshState(res.gate.session_gate_id);
    }
  };

  const handleBindAcceptance = () => {
    return runAction('Bind Onboarding Acceptance', () => runtimeSessionClient.bindAcceptance(gateId, acceptanceGateId));
  };

  const handleSetLimits = () => {
    return runAction('Set Session Limits', () => runtimeSessionClient.setSessionLimits(gateId, {
      participantId,
      max_sessions: maxSessions,
      max_concurrent_sessions: maxConcurrentSessions,
      session_ttl_minutes: sessionTtl,
      daily_action_limit: dailyActionLimit,
      feature_scope_json: { allowed: allowedFeatures.split(',').map(f => f.trim()) }
    }));
  };

  const handleRunGuardrails = () => {
    return runAction('Run Guardrails', () => runtimeSessionClient.runGuardrails(gateId));
  };

  const handleSubmit = () => {
    return runAction('Submit for Approval', () => runtimeSessionClient.submitForApproval(gateId));
  };

  const handleApprove = () => {
    return runAction('Approve Gate', () => runtimeSessionClient.approve(gateId));
  };

  const handleReject = () => {
    return runAction('Reject Gate', () => runtimeSessionClient.reject(gateId, reason));
  };

  const handleBlock = () => {
    return runAction('Block Gate', () => runtimeSessionClient.block(gateId, reason));
  };

  const handleCreateSession = async () => {
    const res = await runAction('Create Controlled Session', () => runtimeSessionClient.createSession(gateId));
    if (res?.ok && res.session) {
      setActiveSessionId(res.session.runtime_session_id);
      setMessage(`Session created. Hashed token returned.`);
    }
  };

  const handleEvaluateAccess = async () => {
    setLoading(true);
    try {
      const res = await runtimeSessionClient.evaluateFeatureAccess(activeSessionId, { featureKey: evalFeatureKey });
      setEvalResult(res);
      if (res.ok) {
        setMessage('Feature access GRANTED');
      } else {
        setErrorMsg(`Feature access DENIED: ${res.access_reason}`);
      }
    } catch (e: any) {
      setErrorMsg(`Evaluation error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendHeartbeat = () => {
    return runAction('Send Heartbeat', () => runtimeSessionClient.sendHeartbeat(activeSessionId, { ui: true }));
  };

  const handleSendEvent = () => {
    return runAction('Send Session Event', () => runtimeSessionClient.sendEvent(activeSessionId, {
      eventType: 'ACTION_PERFORMED',
      status: 'SUCCESS',
      featureKey: evalFeatureKey,
      details: { page: 'runtime-sessions' }
    }));
  };

  const handleCloseSession = () => {
    return runAction('Close Session', () => runtimeSessionClient.closeSession(activeSessionId, reason));
  };

  const handleRevokeSession = () => {
    return runAction('Revoke Session', () => runtimeSessionClient.revokeSession(activeSessionId, reason));
  };

  const handleRevokeParticipant = () => {
    return runAction('Revoke All Sessions for Participant', () => runtimeSessionClient.revokeParticipantSessions(participantId, reason));
  };

  const handleExpireSessions = () => {
    return runAction('Expire Sessions', () => runtimeSessionClient.expireSessions());
  };

  useEffect(() => {
    if (gateId) {
      refreshState();
    }
  }, [gateId, refreshState]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: 'Inter, sans-serif', color: '#1f2937' }}>

      {/* Warning Banner */}
      <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700 }}>⚠️ Controlled runtime sessions only.</h3>
        <p style={{ margin: 0, fontSize: 14 }}>
          This is not public beta, not open marketplace, and not unrestricted runtime access.
        </p>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Controlled Beta Runtime Sessions (Phase 135)</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, marginBottom: 24 }}>

        {/* Left Column: Form and Actions */}
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24 }}>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Gate Context Setup</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Session Gate ID</label>
              <input value={gateId} onChange={e => setGateId(e.target.value)} placeholder="sg_135_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Acceptance Gate ID (Phase 134)</label>
              <input value={acceptanceGateId} onChange={e => setAcceptanceGateId(e.target.value)} placeholder="agate_134_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
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

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
            <button onClick={handleCreateGate} disabled={loading} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Create Gate</button>
            <button onClick={handleBindAcceptance} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#4b5563', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Bind Acceptance</button>
            <button onClick={handleRunGuardrails} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Run Guardrails</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Session Limits definition</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Max Sessions</label>
              <input type="number" value={maxSessions} onChange={e => setMaxSessions(Number(e.target.value))} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Max Concurrent</label>
              <input type="number" value={maxConcurrentSessions} onChange={e => setMaxConcurrentSessions(Number(e.target.value))} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>TTL (Minutes)</label>
              <input type="number" value={sessionTtl} onChange={e => setSessionTtl(Number(e.target.value))} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Daily Actions</label>
              <input type="number" value={dailyActionLimit} onChange={e => setDailyActionLimit(Number(e.target.value))} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div style={{ gridColumn: 'span 4' }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Allowed Features (comma separated)</label>
              <input value={allowedFeatures} onChange={e => setAllowedFeatures(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button onClick={handleSetLimits} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Set Limits</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Approval Workflow &amp; Session Creation</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Workflow Reason / Notes</label>
            <input value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
            <button onClick={handleSubmit} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#4b5563', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Submit Gate</button>
            <button onClick={handleApprove} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Approve Gate</button>
            <button onClick={handleReject} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Reject Gate</button>
            <button onClick={handleBlock} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Block Gate</button>
            <button onClick={handleCreateSession} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>Create Session</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Active Session Control</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Active Session ID</label>
              <input value={activeSessionId} onChange={e => setActiveSessionId(e.target.value)} placeholder="sess_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Feature Key to Evaluate</label>
              <input value={evalFeatureKey} onChange={e => setEvalFeatureKey(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button onClick={handleEvaluateAccess} disabled={loading || !activeSessionId} style={{ padding: '8px 16px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Evaluate Access</button>
            <button onClick={handleSendHeartbeat} disabled={loading || !activeSessionId} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Send Heartbeat</button>
            <button onClick={handleSendEvent} disabled={loading || !activeSessionId} style={{ padding: '8px 16px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Send Event</button>
            <button onClick={handleCloseSession} disabled={loading || !activeSessionId} style={{ padding: '8px 16px', background: '#374151', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Close Session</button>
            <button onClick={handleRevokeSession} disabled={loading || !activeSessionId} style={{ padding: '8px 16px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Revoke Session</button>
            <button onClick={handleRevokeParticipant} disabled={loading || !participantId} style={{ padding: '8px 16px', background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Revoke Participant</button>
            <button onClick={handleExpireSessions} disabled={loading} style={{ padding: '8px 16px', background: '#1f2937', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Expire TTL Sessions</button>
          </div>

        </div>

        {/* Right Column: Status Board & Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Dashboard Panel */}
          {dashboard && (
            <div style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Dashboard Metrics</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: '#fff', padding: 8, borderRadius: 4, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Total Gates</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{dashboard.total_gates || 0}</div>
                </div>
                <div style={{ background: '#fff', padding: 8, borderRadius: 4, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Active Sessions</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#059669' }}>{dashboard.active_sessions || 0}</div>
                </div>
                <div style={{ background: '#fff', padding: 8, borderRadius: 4, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Closed</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#4b5563' }}>{dashboard.closed_sessions || 0}</div>
                </div>
                <div style={{ background: '#fff', padding: 8, borderRadius: 4, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Revoked</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{dashboard.revoked_sessions || 0}</div>
                </div>
              </div>
            </div>
          )}

          {/* Feedback Messages */}
          {(message || errorMsg) && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              {message && <div style={{ color: '#059669', fontSize: 14, fontWeight: 600 }}>{message}</div>}
              {errorMsg && <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>{errorMsg}</div>}
            </div>
          )}

          {/* Readiness Status Checklist */}
          {readiness && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Runtime Readiness</h3>
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

              <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(readiness.checks).map(([key, passed]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#4b5563' }}>{key}</span>
                    <span style={{ fontWeight: 700, color: passed ? '#059669' : '#dc2626' }}>
                      {passed ? '✓ PASSED' : '✗ FAILED'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Safety Invariant Panel */}
          <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 700, color: '#92400e' }}>🛡️ Safety Invariant Audit</h3>
            <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6, color: '#92400e' }}>
              <div>• Full Public Signup: <strong>DISABLED</strong></div>
              <div>• Open Marketplace: <strong>DISABLED</strong></div>
              <div>• Payment Execution: <strong>DISABLED</strong></div>
              <div>• External Submissions: <strong>DISABLED</strong></div>
              <div>• Source Mutation: <strong>DISABLED</strong></div>
            </div>
          </div>

          {/* Evidence Pack */}
          {evidencePack && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Evidence Pack (v{evidencePack.evidence_schema_version})</h3>
              <div style={{ fontSize: 11, background: '#f9fafb', padding: 8, borderRadius: 4, maxHeight: 150, overflowY: 'auto' }}>
                <pre>{JSON.stringify(evidencePack, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* Audit Timeline */}
          {auditLog.length > 0 && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Audit Timeline</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 200, overflowY: 'auto' }}>
                {auditLog.map((aud, index) => (
                  <div key={index} style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 6 }}>
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
