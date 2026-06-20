import React, { useState, useCallback, useEffect } from 'react';
import { inviteAcceptanceClient } from '../../api/controlledBetaInviteAcceptanceClient';
import { InviteAcceptanceGate, InviteAcceptanceClaim, OnboardingParticipant, TermsAcceptance, SessionLimits, AccessPolicy, InviteAcceptanceReadiness } from '../../types/controlledBetaInviteAcceptance';

export function ControlledBetaInviteAcceptance() {
  const [gateId, setGateId] = useState('');
  const [inviteRecordId, setInviteRecordId] = useState('');
  const [tenantId, setTenantId] = useState('tenant_beta_01');
  const [cohortId, setCohortId] = useState('cohort_beta_01');
  
  // Claim fields
  const [claimCode, setClaimCode] = useState('');
  const [claimToken, setClaimToken] = useState('');

  // Identity fields
  const [externalRef, setExternalRef] = useState('ext_user_01');
  const [email, setEmail] = useState('user@example.com');
  const [label, setLabel] = useState('Beta Tester 01');

  // Terms fields
  const [termsVersion, setTermsVersion] = useState('v1.0-beta');
  const [termsHash, setTermsHash] = useState('hash_terms_v1_0');
  const [acceptedBy, setAcceptedBy] = useState('admin');

  // Session Limits fields
  const [maxSessions, setMaxSessions] = useState(1);
  const [maxConcurrentSessions, setMaxConcurrentSessions] = useState(1);
  const [sessionTtl, setSessionTtl] = useState(60);
  const [dailyActionLimit, setDailyActionLimit] = useState(100);

  // Access Policy fields
  const [allowedFeatures, setAllowedFeatures] = useState('feature:read,feature:write');
  const [deniedFeatures, setDeniedFeatures] = useState('feature:admin');

  // Actions reason
  const [reason, setReason] = useState('Verification checklist passed');

  // State
  const [gate, setGate] = useState<InviteAcceptanceGate | null>(null);
  const [readiness, setReadiness] = useState<InviteAcceptanceReadiness | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [evidencePack, setEvidencePack] = useState<any | null>(null);
  const [dashboard, setDashboard] = useState<any | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const refreshState = useCallback(async (currentGateId = gateId) => {
    if (!currentGateId) return;
    try {
      const readRes = await inviteAcceptanceClient.getReadiness(currentGateId);
      setReadiness(readRes);
      
      const audRes = await inviteAcceptanceClient.getAuditTimeline(currentGateId);
      if (audRes.ok) setAuditLog(audRes.timeline);

      const evRes = await inviteAcceptanceClient.getEvidencePack(currentGateId);
      if (evRes.ok) setEvidencePack(evRes.evidencePack);

      const dashRes = await inviteAcceptanceClient.getDashboard();
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
    const res = await runAction('Create Gate', () => inviteAcceptanceClient.createGate({
      acceptance_gate_id: gateId || undefined,
      invite_record_id: inviteRecordId,
      tenant_id: tenantId,
      cohort_id: cohortId
    }));
    if (res?.ok && res.gate) {
      setGate(res.gate);
      setGateId(res.gate.acceptance_gate_id);
      await refreshState(res.gate.acceptance_gate_id);
    }
  };

  const handleClaimInvite = () => {
    return runAction('Claim Invite', () => inviteAcceptanceClient.claimInvite(gateId, {
      code: claimCode,
      token: claimToken
    }));
  };

  const handleBindIdentity = () => {
    return runAction('Bind Identity', () => inviteAcceptanceClient.bindIdentity(gateId, {
      externalRef,
      email,
      label
    }));
  };

  const handleAcceptTerms = () => {
    if (!gate?.participant_id) {
      setErrorMsg('Cannot accept terms: Participant identity not bound yet.');
      return;
    }
    return runAction('Accept Terms', () => inviteAcceptanceClient.acceptTerms(gateId, {
      participantId: gate.participant_id!,
      termsVersion,
      termsHash,
      acceptedBy,
      method: 'CLICKWRAP'
    }));
  };

  const handleSetSessionLimits = () => {
    if (!gate?.participant_id) {
      setErrorMsg('Cannot set session limits: Participant identity not bound yet.');
      return;
    }
    return runAction('Set Session Limits', () => inviteAcceptanceClient.setSessionLimits(gateId, {
      participantId: gate.participant_id!,
      max_sessions: Number(maxSessions),
      max_concurrent_sessions: Number(maxConcurrentSessions),
      session_ttl_minutes: Number(sessionTtl),
      daily_action_limit: Number(dailyActionLimit)
    }));
  };

  const handleSetAccessPolicy = () => {
    if (!gate?.participant_id) {
      setErrorMsg('Cannot set access policy: Participant identity not bound yet.');
      return;
    }
    return runAction('Set Access Policy', () => inviteAcceptanceClient.setAccessPolicy(gateId, {
      participantId: gate.participant_id!,
      policy_status: 'ACTIVE',
      allowed_features_json: allowedFeatures.split(',').map(f => f.trim()),
      denied_features_json: deniedFeatures.split(',').map(f => f.trim())
    }));
  };

  const handleRunGuardrails = () => {
    return runAction('Run Guardrails', () => inviteAcceptanceClient.runGuardrails(gateId));
  };

  const handleSubmit = () => {
    return runAction('Submit for Onboarding Approval', () => inviteAcceptanceClient.submitForApproval(gateId));
  };

  const handleApprove = () => {
    return runAction('Approve Onboarding', () => inviteAcceptanceClient.approve(gateId));
  };

  const handleReject = () => {
    return runAction('Reject Onboarding', () => inviteAcceptanceClient.reject(gateId, reason));
  };

  const handleBlock = () => {
    return runAction('Block Onboarding', () => inviteAcceptanceClient.block(gateId, reason));
  };

  const handleGrantRuntimeAccess = () => {
    return runAction('Grant Controlled Runtime Access', () => inviteAcceptanceClient.grantRuntimeAccess(gateId));
  };

  const handleRevoke = () => {
    return runAction('Revoke Participant Access', () => inviteAcceptanceClient.revoke(gateId, reason));
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
        <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700 }}>⚠️ Controlled invite acceptance and participant onboarding only.</h3>
        <p style={{ margin: 0, fontSize: 14 }}>
          This is not public signup, not public beta, and not open marketplace. Runtime access is strictly confined to the approved scope.
        </p>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Controlled Beta Invite Acceptance (Phase 134)</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, marginBottom: 24 }}>
        
        {/* Left Column: Form and Actions */}
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24 }}>
          
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Gate Context Setup</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Gate ID</label>
              <input value={gateId} onChange={e => setGateId(e.target.value)} placeholder="agate_134_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Invite Record ID (Phase 133)</label>
              <input value={inviteRecordId} onChange={e => setInviteRecordId(e.target.value)} placeholder="inv_133_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
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
            <button onClick={handleRunGuardrails} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Run Guardrails</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Claim &amp; Verification</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Invite Code</label>
              <input type="password" value={claimCode} onChange={e => setClaimCode(e.target.value)} placeholder="Code is not displayed raw in database/evidence" style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Invite Token</label>
              <input type="password" value={claimToken} onChange={e => setClaimToken(e.target.value)} placeholder="Token is not displayed raw in database/evidence" style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button onClick={handleClaimInvite} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Submit Claim Verification</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Participant Details &amp; Identity Binding</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>External Ref</label>
              <input value={externalRef} onChange={e => setExternalRef(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Label</label>
              <input value={label} onChange={e => setLabel(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button onClick={handleBindIdentity} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Bind Identity</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Terms Acceptance</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Terms Version</label>
              <input value={termsVersion} onChange={e => setTermsVersion(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Terms Hash</label>
              <input value={termsHash} onChange={e => setTermsHash(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Accepted By</label>
              <input value={acceptedBy} onChange={e => setAcceptedBy(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button onClick={handleAcceptTerms} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Record Terms Acceptance</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Session Limits</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Max Sessions</label>
              <input type="number" value={maxSessions} onChange={e => setMaxSessions(Number(e.target.value))} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Concurrent Sessions</label>
              <input type="number" value={maxConcurrentSessions} onChange={e => setMaxConcurrentSessions(Number(e.target.value))} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>TTL (Minutes)</label>
              <input type="number" value={sessionTtl} onChange={e => setSessionTtl(Number(e.target.value))} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Daily Action Limit</label>
              <input type="number" value={dailyActionLimit} onChange={e => setDailyActionLimit(Number(e.target.value))} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button onClick={handleSetSessionLimits} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Define Limits</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Access Policy</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Allowed Features (comma separated)</label>
              <input value={allowedFeatures} onChange={e => setAllowedFeatures(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Denied Features (comma separated)</label>
              <input value={deniedFeatures} onChange={e => setDeniedFeatures(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button onClick={handleSetAccessPolicy} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Define Access Policy</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Approval Workflow &amp; Runtime Grant</h2>
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Reason / Notes</label>
            <input value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button onClick={handleSubmit} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#4b5563', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Submit Onboarding</button>
            <button onClick={handleApprove} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Approve Onboarding</button>
            <button onClick={handleReject} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Reject Onboarding</button>
            <button onClick={handleBlock} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Block Onboarding</button>
            <button onClick={handleGrantRuntimeAccess} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>Grant Runtime Access</button>
            <button onClick={handleRevoke} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Revoke Onboarding</button>
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
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Ready</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#059669' }}>{dashboard.ready_gates || 0}</div>
                </div>
                <div style={{ background: '#fff', padding: 8, borderRadius: 4, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Blocked</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{dashboard.blocked_gates || 0}</div>
                </div>
                <div style={{ background: '#fff', padding: 8, borderRadius: 4, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Approved</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb' }}>{dashboard.approved_gates || 0}</div>
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
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Onboarding Readiness</h3>
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

          {/* Evidence Pack Pack */}
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
