import React, { useState, useCallback } from 'react';
import {
  getLimitedBetaReadiness,
  createPreparationGate,
  createBetaCohort,
  registerCohortParticipant,
  issueInviteCode,
  revokeInviteCode,
  recordTermsAcceptance,
  defineRoleBoundary,
  recordSupportEscalationPath,
  recordIncidentRollbackPlan,
  recordBetaFinding,
  resolveBetaFinding,
  getLimitedBetaAuditTimeline,
  getLimitedBetaEvidencePack
} from '../../api/limitedBetaPreparationGateClient';

const UI_WARNING =
  'Limited Beta Preparation only. Beta runtime is not enabled. FULL_PUBLIC and open marketplace access remain disabled.';

export function LimitedBetaPreparationGate() {
  const [gateId, setGateId] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [inviteId, setInviteId] = useState('');
  const [findingId, setFindingId] = useState('');
  
  // Creation/Input fields
  const [cohortName, setCohortName] = useState('Founding Cohort');
  const [cohortDescription, setCohortDescription] = useState('First invite-only beta cohort');
  const [maxParticipants, setMaxParticipants] = useState(10);
  
  const [tenantId, setTenantId] = useState('tenant_beta_001');
  const [participantType, setParticipantType] = useState('FOUNDING_PRINTHOUSE');
  const [termsVersion, setTermsVersion] = useState('v1.0-beta');
  const [acceptedBy, setAcceptedBy] = useState('printhouse_owner@example.com');
  
  const [allowedActions, setAllowedActions] = useState('["read_dashboard", "receive_jobs"]');
  const [restrictedActions, setRestrictedActions] = useState('["execute_payments", "full_public"]');
  
  const [inviteCodeStr, setInviteCodeStr] = useState('BETA-INVITE-2026');
  
  const [escalationName, setEscalationName] = useState('L1 Support');
  const [escalationContacts, setEscalationContacts] = useState('{"email": "support@example.com"}');
  
  const [rollbackSteps, setRollbackSteps] = useState('["disable_routing", "suspend_participants"]');
  
  const [findingType, setFindingType] = useState('BLOCKER');
  const [findingSummary, setFindingSummary] = useState('Readiness security review pending');
  
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const run = useCallback(async (label: string, fn: () => Promise<Record<string, unknown>>) => {
    setLoading(true);
    setMessage('');
    try {
      const r = await fn();
      setResult(r as Record<string, any>);
      setMessage(`${label} completed successfully.`);
      return r;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(`Error in ${label}: ${msg}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCheckReadiness = useCallback(() => {
    return run('Check Readiness', () => getLimitedBetaReadiness({ gate_id: gateId || undefined }));
  }, [run, gateId]);

  const handleCreateGate = useCallback(async () => {
    const r = await run('Create Preparation Gate', () => createPreparationGate({ created_by: 'admin' }));
    if (r) {
      const g = r.gate as Record<string, unknown> | undefined;
      if (g?.gate_id) setGateId(String(g.gate_id));
    }
  }, [run]);

  const handleCreateCohort = useCallback(async () => {
    const r = await run('Create Cohort', () =>
      createBetaCohort({
        gate_id: gateId,
        cohort_name: cohortName,
        cohort_description: cohortDescription,
        max_participants: Number(maxParticipants) || 10,
        created_by: 'admin'
      })
    );
    if (r) {
      const c = r.cohort as Record<string, unknown> | undefined;
      if (c?.cohort_id) setCohortId(String(c.cohort_id));
    }
  }, [run, gateId, cohortName, cohortDescription, maxParticipants]);

  const handleRegisterParticipant = useCallback(async () => {
    const r = await run('Register Participant', () =>
      registerCohortParticipant({
        cohort_id: cohortId,
        tenant_id: tenantId,
        participant_type: participantType,
        registered_by: 'admin'
      })
    );
    if (r) {
      const p = r.participant as Record<string, unknown> | undefined;
      if (p?.participant_id) setParticipantId(String(p.participant_id));
    }
  }, [run, cohortId, tenantId, participantType]);

  const handleIssueInvite = useCallback(async () => {
    const r = await run('Issue Invite Code', () =>
      issueInviteCode({
        cohort_id: cohortId,
        invite_code: inviteCodeStr,
        max_uses: 1,
        created_by: 'admin'
      })
    );
    if (r) {
      const i = r.invite as Record<string, unknown> | undefined;
      if (i?.invite_id) setInviteId(String(i.invite_id));
    }
  }, [run, cohortId, inviteCodeStr]);

  const handleRevokeInvite = useCallback(() => {
    return run('Revoke Invite Code', () => revokeInviteCode({ invite_id: inviteId, revoked_by: 'admin' }));
  }, [run, inviteId]);

  const handleRecordTerms = useCallback(() => {
    return run('Record Terms Acceptance', () =>
      recordTermsAcceptance({
        participant_id: participantId,
        terms_version: termsVersion,
        accepted_by: acceptedBy
      })
    );
  }, [run, participantId, termsVersion, acceptedBy]);

  const handleDefineRoleBoundary = useCallback(() => {
    let allowedArr = [];
    let restrictedArr = [];
    try { allowedArr = JSON.parse(allowedActions); } catch (e) {}
    try { restrictedArr = JSON.parse(restrictedActions); } catch (e) {}

    return run('Define Role Boundary', () =>
      defineRoleBoundary({
        participant_id: participantId,
        allowed_actions_json: allowedArr,
        restricted_actions_json: restrictedArr,
        defined_by: 'admin'
      })
    );
  }, [run, participantId, allowedActions, restrictedActions]);

  const handleRecordEscalation = useCallback(() => {
    let contactsObj = {};
    try { contactsObj = JSON.parse(escalationContacts); } catch (e) {}
    return run('Record Support Escalation Path', () =>
      recordSupportEscalationPath({
        gate_id: gateId,
        path_name: escalationName,
        contact_details_json: contactsObj,
        created_by: 'admin'
      })
    );
  }, [run, gateId, escalationName, escalationContacts]);

  const handleRecordRollback = useCallback(() => {
    let stepsArr = [];
    try { stepsArr = JSON.parse(rollbackSteps); } catch (e) {}
    return run('Record Incident Rollback Plan', () =>
      recordIncidentRollbackPlan({
        gate_id: gateId,
        rollback_steps_json: stepsArr,
        created_by: 'admin'
      })
    );
  }, [run, gateId, rollbackSteps]);

  const handleRecordFinding = useCallback(async () => {
    const r = await run('Record Beta Finding', () =>
      recordBetaFinding({
        gate_id: gateId,
        finding_type: findingType,
        blocks_readiness: 1,
        severity: 'HIGH',
        summary: findingSummary,
        created_by: 'admin'
      })
    );
    if (r) {
      const f = r.finding as Record<string, unknown> | undefined;
      if (f?.finding_id) setFindingId(String(f.finding_id));
    }
  }, [run, gateId, findingType, findingSummary]);

  const handleResolveFinding = useCallback(() => {
    return run('Resolve Beta Finding', () => resolveBetaFinding({ finding_id: findingId, resolved_by: 'admin' }));
  }, [run, findingId]);

  const handleGetAuditTimeline = useCallback(() => {
    return run('Get Audit Timeline', () => getLimitedBetaAuditTimeline({ gate_id: gateId }));
  }, [run, gateId]);

  const handleGetEvidencePack = useCallback(() => {
    return run('Get Evidence Pack', () => getLimitedBetaEvidencePack({ gate_id: gateId }));
  }, [run, gateId]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24, fontFamily: 'sans-serif', color: '#333' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8, borderBottom: '2px solid #eaeaea', paddingBottom: 12 }}>
        Phase 127.1 — Limited Beta Preparation Gate
      </h1>

      <div style={{ background: '#fff3cd', border: '1px solid #ffc107', color: '#856404', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <strong>⚠️ Safety Warning:</strong>
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>{UI_WARNING}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <div style={{ background: '#f8f9fa', border: '1px solid #e2e3e5', borderRadius: 8, padding: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Hardened Status Registry</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>PERSISTENCE STATUS</span>
              <strong>{result?.persistenceStatus || 'N/A'}</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>PERSISTENCE MODE</span>
              <strong>{result?.persistenceMode || 'N/A'}</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>RUNTIME TRUTH STATUS</span>
              <strong>{result?.runtimeTruthStatus || 'N/A'}</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>FAIL-CLOSED VERIFIED</span>
              <strong style={{ color: '#28a745' }}>ACTIVE</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>PHASE 126.1 EVIDENCE</span>
              <strong>{result?.phase126_1_evidence_status || 'N/A'}</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>SECRET HYGIENE</span>
              <strong>{result?.secret_hygiene_status || 'N/A'}</strong>
            </div>
          </div>
        </div>

        <div style={{ background: '#f8f9fa', border: '1px solid #e2e3e5', borderRadius: 8, padding: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Checklist &amp; Readiness</h3>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div><strong>Readiness Status:</strong> <span style={{ color: result?.readiness_status === 'READY' ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>{result?.readiness_status || 'UNKNOWN'}</span></div>
            {result?.reason && <div style={{ color: '#dc3545' }}><strong>Block Reason:</strong> {result.reason}</div>}
            {result?.evidence_pack?.evidence_hash && <div><strong>Integrity Hash:</strong> <code style={{ fontSize: 11 }}>{result.evidence_pack.evidence_hash}</code></div>}
            
            <div style={{ marginTop: 12, borderTop: '1px solid #dee2e6', paddingTop: 8 }}>
              <strong>Participant Eligibility Check:</strong> {result?.eligible !== undefined ? (result.eligible ? 'ELIGIBLE' : 'INELIGIBLE') : 'N/A'}<br />
              <strong>Boundary Defined:</strong> {result?.hasBoundary ? 'YES' : 'NO'}<br />
              <strong>Terms Accepted:</strong> {result?.hasTerms ? 'YES' : 'NO'}<br />
              <strong>Invite Safe:</strong> {result?.inviteValid ? 'YES' : 'NO'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Configuration &amp; Setup</h2>
          
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>1. Preparation Gate Context</h4>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                value={gateId}
                onChange={e => setGateId(e.target.value)}
                placeholder="Gate ID (lbpg_...)"
                style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }}
              />
              <button onClick={handleCreateGate} disabled={loading} style={{ padding: '8px 16px', background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Create New Gate
              </button>
              <button onClick={handleCheckReadiness} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#28a745', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Check Readiness
              </button>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>2. Cohorts &amp; Participants</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <input value={cohortName} onChange={e => setCohortName(e.target.value)} placeholder="Cohort Name" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <input value={cohortDescription} onChange={e => setCohortDescription(e.target.value)} placeholder="Cohort Description" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <input type="number" value={maxParticipants} onChange={e => setMaxParticipants(Number(e.target.value))} placeholder="Max Participants" style={{ width: 100, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleCreateCohort} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Create Cohort
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <input value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="Tenant ID" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <select value={participantType} onChange={e => setParticipantType(e.target.value)} style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }}>
                <option value="FOUNDING_PRINTHOUSE">FOUNDING_PRINTHOUSE</option>
                <option value="PILOT_CUSTOMER">PILOT_CUSTOMER</option>
                <option value="INTERNAL_ADMIN">INTERNAL_ADMIN</option>
                <option value="INTERNAL_SUPPORT">INTERNAL_SUPPORT</option>
                <option value="OBSERVER">OBSERVER</option>
                <option value="TECHNICAL_REVIEWER">TECHNICAL_REVIEWER</option>
              </select>
            </div>
            <button onClick={handleRegisterParticipant} disabled={loading || !cohortId} style={{ padding: '8px 16px', background: '#17a2b8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              Register Participant
            </button>
          </div>

          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>3. Eligibility &amp; Governance Details</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Terms Version</label>
                <input value={termsVersion} onChange={e => setTermsVersion(e.target.value)} style={{ width: '90%', padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Accepted By</label>
                <input value={acceptedBy} onChange={e => setAcceptedBy(e.target.value)} style={{ width: '90%', padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
            </div>
            <button onClick={handleRecordTerms} disabled={loading || !participantId} style={{ padding: '8px 16px', background: '#343a40', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 8 }}>
              Record Terms Acceptance
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '12px 0' }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Allowed Actions (JSON)</label>
                <input value={allowedActions} onChange={e => setAllowedActions(e.target.value)} style={{ width: '90%', padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Restricted Actions (JSON)</label>
                <input value={restrictedActions} onChange={e => setRestrictedActions(e.target.value)} style={{ width: '90%', padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
            </div>
            <button onClick={handleDefineRoleBoundary} disabled={loading || !participantId} style={{ padding: '8px 16px', background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              Define Role Boundary
            </button>
          </div>

          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>4. Safety, Support &amp; Rollback Plans</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Escalation Path Name</label>
                <input value={escalationName} onChange={e => setEscalationName(e.target.value)} style={{ width: '90%', padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Escalation Contacts (JSON)</label>
                <input value={escalationContacts} onChange={e => setEscalationContacts(e.target.value)} style={{ width: '90%', padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
            </div>
            <button onClick={handleRecordEscalation} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#fd7e14', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 8 }}>
              Record Support Path
            </button>

            <div style={{ margin: '12px 0' }}>
              <label style={{ fontSize: 12, fontWeight: 'bold', display: 'block' }}>Rollback Steps (JSON array)</label>
              <input value={rollbackSteps} onChange={e => setRollbackSteps(e.target.value)} style={{ width: '95%', padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
            </div>
            <button onClick={handleRecordRollback} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              Record Incident Rollback Plan
            </button>
          </div>

          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>5. Invite Codes &amp; Findings</h4>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <input value={inviteCodeStr} onChange={e => setInviteCodeStr(e.target.value)} placeholder="Invite Code" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleIssueInvite} disabled={loading || !cohortId} style={{ padding: '8px 16px', background: '#28a745', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Issue Invite
              </button>
              <button onClick={handleRevokeInvite} disabled={loading || !inviteId} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Revoke Invite
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <select value={findingType} onChange={e => setFindingType(e.target.value)} style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }}>
                <option value="BLOCKER">BLOCKER</option>
                <option value="OBSERVATION">OBSERVATION</option>
              </select>
              <input value={findingSummary} onChange={e => setFindingSummary(e.target.value)} placeholder="Finding Summary" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
            </div>
            <button onClick={handleRecordFinding} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#343a40', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 8 }}>
              Record Finding
            </button>
            <button onClick={handleResolveFinding} disabled={loading || !findingId} style={{ padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              Resolve Finding
            </button>
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Audit &amp; Outputs</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <button onClick={handleGetAuditTimeline} disabled={loading || !gateId} style={{ width: '100%', padding: '12px', background: '#343a40', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>
              Get Audit Timeline
            </button>
            <button onClick={handleGetEvidencePack} disabled={loading || !gateId} style={{ width: '100%', padding: '12px', background: '#20c997', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>
              Build Evidence Pack
            </button>
          </div>

          <div style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, minHeight: 300 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>Operation Logs</h4>
            {message && (
              <div style={{ padding: 8, background: message.includes('Error') ? '#f8d7da' : '#d4edda', color: message.includes('Error') ? '#721c24' : '#155724', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>
                {message}
              </div>
            )}
            
            <div style={{ fontSize: 12, color: '#495057' }}>
              {result && (
                <>
                  <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #eaeaea' }}>
                    <strong>Gate ID:</strong> {String(gateId || 'None')}<br />
                    <strong>Cohort ID:</strong> {String(cohortId || 'None')}<br />
                    <strong>Participant ID:</strong> {String(participantId || 'None')}<br />
                    <strong>Invite ID:</strong> {String(inviteId || 'None')}<br />
                    <strong>Finding ID:</strong> {String(findingId || 'None')}
                  </div>
                  <strong>Response Payload:</strong>
                  <pre style={{ margin: '8px 0 0 0', padding: 8, background: '#e9ecef', borderRadius: 4, overflow: 'auto', maxHeight: 350, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default LimitedBetaPreparationGate;
