import React, { useState, useCallback, useEffect } from 'react';
import { inviteIssuanceClient } from '../../api/controlledBetaInviteIssuanceClient';
import { InviteIssuanceGate, InviteIssuanceBatch, InviteRecord, InviteIssuanceReadiness } from '../../types/controlledBetaInviteIssuance';

export function ControlledBetaInviteIssuance() {
  const [gateId, setGateId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [inviteId, setInviteId] = useState('');
  
  // Creation/Form fields
  const [preparationId, setPreparationId] = useState('');
  const [evidencePackId, setEvidencePackId] = useState('');
  const [tenantId, setTenantId] = useState('tenant_beta_01');
  const [cohortId, setCohortId] = useState('cohort_beta_01');
  const [maxInvitesAllowed, setMaxInvitesAllowed] = useState(10);
  const [maxInvitesToIssue, setMaxInvitesToIssue] = useState(5);
  const [candidateParticipantId, setCandidateParticipantId] = useState('cand_part_01');
  const [recipientEmail, setRecipientEmail] = useState('user@example.com');
  const [recipientLabel, setRecipientLabel] = useState('Primary Tester');
  const [reason, setReason] = useState('Operational rotation / safety recall');

  const [gate, setGate] = useState<InviteIssuanceGate | null>(null);
  const [batch, setBatch] = useState<InviteIssuanceBatch | null>(null);
  const [readiness, setReadiness] = useState<InviteIssuanceReadiness | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [evidencePack, setEvidencePack] = useState<any | null>(null);
  const [dashboard, setDashboard] = useState<any | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const refreshState = useCallback(async (currentGateId = gateId, currentBatchId = batchId) => {
    if (!currentGateId) return;
    try {
      const readRes = await inviteIssuanceClient.getReadiness(currentGateId);
      setReadiness(readRes);
      
      const audRes = await inviteIssuanceClient.getAuditTimeline(currentGateId);
      if (audRes.ok) setAuditLog(audRes.timeline);

      const evRes = await inviteIssuanceClient.getEvidencePack(currentGateId);
      if (evRes.ok) setEvidencePack(evRes.evidencePack);

      const dashRes = await inviteIssuanceClient.getDashboard();
      if (dashRes.ok) setDashboard(dashRes.dashboard);
    } catch (e) {
      console.error(e);
    }
  }, [gateId, batchId]);

  const runAction = async (label: string, actionFn: () => Promise<any>) => {
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await actionFn();
      if (res.ok) {
        setMessage(`${label} succeeded.`);
      } else {
        setErrorMsg(`${label} failed: ${res.error || res.reason || 'Unknown error'}`);
      }
      await refreshState();
      return res;
    } catch (e: any) {
      setErrorMsg(`${label} error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGate = async () => {
    const res = await runAction('Create Gate', () => inviteIssuanceClient.createGate({
      issuance_gate_id: gateId || undefined,
      preparation_id: preparationId,
      phase132_evidence_pack_id: evidencePackId,
      tenant_id: tenantId,
      cohort_id: cohortId,
      max_invites_allowed: Number(maxInvitesAllowed),
      max_invites_to_issue: Number(maxInvitesToIssue)
    }));
    if (res?.ok && res.gate) {
      setGate(res.gate);
      setGateId(res.gate.issuance_gate_id);
      await refreshState(res.gate.issuance_gate_id);
    }
  };

  const handleBindPrep = () => {
    return runAction('Bind Preparation', () => inviteIssuanceClient.bindPreparation(gateId, preparationId, evidencePackId));
  };

  const handleCreateBatch = async () => {
    const res = await runAction('Create Batch', () => inviteIssuanceClient.createBatch(gateId, {
      issuance_batch_id: batchId || undefined,
      preparation_id: preparationId,
      tenant_id: tenantId,
      cohort_id: cohortId,
      requested_invite_count: Number(maxInvitesToIssue)
    }));
    if (res?.ok && res.batch) {
      setBatch(res.batch);
      setBatchId(res.batch.issuance_batch_id);
    }
  };

  const handleAddRecipient = () => {
    return runAction('Add Recipient', () => inviteIssuanceClient.addRecipient(batchId, {
      candidate_participant_id: candidateParticipantId,
      recipient_email: recipientEmail,
      recipient_label: recipientLabel,
      tenant_id: tenantId,
      cohort_id: cohortId
    }));
  };

  const handleValidateBatch = () => {
    return runAction('Validate Batch', () => inviteIssuanceClient.validateBatch(batchId));
  };

  const handleRunGuardrails = () => {
    return runAction('Run Guardrails', () => inviteIssuanceClient.runGuardrails(gateId));
  };

  const handleSubmit = () => {
    return runAction('Submit for Approval', () => inviteIssuanceClient.submitForApproval(gateId));
  };

  const handleApprove = () => {
    return runAction('Approve Gate', () => inviteIssuanceClient.approve(gateId));
  };

  const handleReject = () => {
    return runAction('Reject Gate', () => inviteIssuanceClient.reject(gateId, reason));
  };

  const handleBlock = () => {
    return runAction('Block Gate', () => inviteIssuanceClient.block(gateId, reason));
  };

  const handleIssueBatch = () => {
    return runAction('Issue Approved Batch', () => inviteIssuanceClient.issueBatch(batchId));
  };

  const handleRevokeInvite = () => {
    return runAction('Revoke Invite', () => inviteIssuanceClient.revokeInvite(inviteId, reason));
  };

  const handleRevokeBatch = () => {
    return runAction('Revoke Batch', () => inviteIssuanceClient.revokeBatch(batchId, reason));
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
        <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700 }}>⚠️ Controlled invite issuance only.</h3>
        <p style={{ margin: 0, fontSize: 14 }}>
          This is not public beta, not open marketplace, and not automatic expansion. Execution of invite issuance is gated under strict approved preparation and hard limits.
        </p>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Controlled Beta Invite Issuance (Phase 133)</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, marginBottom: 24 }}>
        
        {/* Left Column: Form and Actions */}
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24 }}>
          
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Gate Context Setup</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Gate ID</label>
              <input value={gateId} onChange={e => setGateId(e.target.value)} placeholder="gate_133_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Preparation ID (Phase 132)</label>
              <input value={preparationId} onChange={e => setPreparationId(e.target.value)} placeholder="prep_132_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Evidence Pack ID (Phase 132)</label>
              <input value={evidencePackId} onChange={e => setEvidencePackId(e.target.value)} placeholder="ev_132_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Tenant ID</label>
              <input value={tenantId} onChange={e => setTenantId(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Cohort ID</label>
              <input value={cohortId} onChange={e => setCohortId(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Max Invites Allowed</label>
              <input type="number" value={maxInvitesAllowed} onChange={e => setMaxInvitesAllowed(Number(e.target.value))} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Max Invites to Issue</label>
              <input type="number" value={maxInvitesToIssue} onChange={e => setMaxInvitesToIssue(Number(e.target.value))} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button onClick={handleCreateGate} disabled={loading} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Create Gate</button>
            <button onClick={handleBindPrep} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#4b5563', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Bind Prep</button>
            <button onClick={handleRunGuardrails} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Run Guardrails</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Batch &amp; Recipients Setup</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Batch ID</label>
              <input value={batchId} onChange={e => setBatchId(e.target.value)} placeholder="batch_133_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Candidate Participant ID</label>
              <input value={candidateParticipantId} onChange={e => setCandidateParticipantId(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Recipient Email</label>
              <input value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Recipient Label</label>
              <input value={recipientLabel} onChange={e => setRecipientLabel(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button onClick={handleCreateBatch} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Create Batch</button>
            <button onClick={handleAddRecipient} disabled={loading || !batchId} style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Add Recipient</button>
            <button onClick={handleValidateBatch} disabled={loading || !batchId} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Validate Batch</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Approval Workflow &amp; Issuance</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Reason / Notes</label>
            <input value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
            <button onClick={handleSubmit} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Submit Review</button>
            <button onClick={handleApprove} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Approve Gate</button>
            <button onClick={handleReject} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Reject</button>
            <button onClick={handleBlock} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Block Gate</button>
            <button onClick={handleIssueBatch} disabled={loading || !batchId || readiness?.readiness_status !== 'READY'} style={{ padding: '8px 16px', background: readiness?.readiness_status === 'READY' ? '#10b981' : '#d1d5db', color: '#fff', border: 'none', borderRadius: 4, cursor: readiness?.readiness_status === 'READY' ? 'pointer' : 'not-allowed' }}>Issue Batch</button>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Revocation Controls</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            <input value={inviteId} onChange={e => setInviteId(e.target.value)} placeholder="Invite Record ID (inv_...)" style={{ flex: 1, padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
            <button onClick={handleRevokeInvite} disabled={loading || !inviteId} style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Revoke Invite</button>
            <button onClick={handleRevokeBatch} disabled={loading || !batchId} style={{ padding: '8px 16px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Revoke Batch</button>
          </div>

        </div>

        {/* Right Column: Dashboard & Status info */}
        <div>
          
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Readiness Checklist</h3>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div><strong>Status:</strong> <span style={{ color: readiness?.readiness_status === 'READY' ? '#10b981' : '#ef4444', fontWeight: 700 }}>{readiness?.readiness_status || 'UNKNOWN'}</span></div>
              
              {readiness?.blocked_reasons && readiness.blocked_reasons.length > 0 && (
                <div style={{ color: '#ef4444', marginTop: 8 }}>
                  <strong>Blocked Reasons:</strong>
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                    {readiness.blocked_reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}

              <div style={{ marginTop: 12, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                <strong>Checks Checklist:</strong>
                <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 4 }}>
                  {readiness?.checks && Object.keys(readiness.checks).map((k) => (
                    <div key={k}>
                      {readiness.checks[k] ? '✅' : '❌'} {k}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Safety Invariants Panel</h3>
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              <div>🚫 FULL_PUBLIC_ENABLED: <span style={{ color: '#ef4444', fontWeight: 700 }}>FALSE</span></div>
              <div>🚫 OPEN_MARKETPLACE: <span style={{ color: '#ef4444', fontWeight: 700 }}>FALSE</span></div>
              <div>🚫 PUBLIC_SIGNUP: <span style={{ color: '#ef4444', fontWeight: 700 }}>FALSE</span></div>
              <div>🚫 PUBLIC_BETA: <span style={{ color: '#ef4444', fontWeight: 700 }}>FALSE</span></div>
              <div>🚫 PAYMENT_EXECUTION: <span style={{ color: '#ef4444', fontWeight: 700 }}>FALSE</span></div>
              <div>🚫 AUTO_EXPANSION: <span style={{ color: '#ef4444', fontWeight: 700 }}>FALSE</span></div>
              <div>🚫 PARTICIPANT_AUTO_ADD: <span style={{ color: '#ef4444', fontWeight: 700 }}>FALSE</span></div>
              <div>🚫 RUNTIME_ACCESS_GRANT_BEFORE_ACCEPTANCE: <span style={{ color: '#ef4444', fontWeight: 700 }}>FALSE</span></div>
              <div>🔒 DATABASE URL/SECRETS: <span style={{ color: '#10b981', fontWeight: 700 }}>REDACTED</span></div>
            </div>
          </div>

          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Audit Trail &amp; Timeline</h3>
            <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 11, background: '#f3f4f6', padding: 8, borderRadius: 4 }}>
              {auditLog.map((log, index) => (
                <div key={index} style={{ marginBottom: 6, borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>
                  <strong>{log.event_type}</strong> by {log.actor_id}<br />
                  <span style={{ color: '#6b7280' }}>{new Date(log.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Message outputs */}
      <div style={{ background: '#f3f4f6', padding: 16, borderRadius: 8, fontSize: 12 }}>
        {message && <div style={{ color: '#065f46', background: '#d1fae5', padding: 8, borderRadius: 4, marginBottom: 8 }}>{message}</div>}
        {errorMsg && <div style={{ color: '#991b1b', background: '#fee2e2', padding: 8, borderRadius: 4, marginBottom: 8 }}>{errorMsg}</div>}
        {evidencePack && (
          <div>
            <strong>Evidence Pack Integrity:</strong> <code>{evidencePack.evidence_integrity_hash}</code>
            <pre style={{ background: '#e5e7eb', padding: 8, borderRadius: 4, overflow: 'auto', maxHeight: 200 }}>
              {JSON.stringify(evidencePack, null, 2)}
            </pre>
          </div>
        )}
      </div>

    </div>
  );
}

export default ControlledBetaInviteIssuance;
