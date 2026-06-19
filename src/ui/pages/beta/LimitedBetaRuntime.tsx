import React, { useState, useCallback } from 'react';
import {
  getLimitedBetaRuntimeReadiness,
  createRuntimeScopePolicy,
  updateRuntimeScopePolicy,
  enableRuntimeForGate,
  disableRuntimeForGate,
  createRuntimeAccessGrant,
  revokeRuntimeAccessGrant,
  evaluateRuntimeAccess,
  createRuntimeSession,
  terminateRuntimeSession,
  recordRuntimeActivity,
  recordRuntimeGuardrailEvent,
  triggerRuntimeKillSwitch,
  clearRuntimeKillSwitch,
  recordRuntimeRollbackEvent,
  recordRuntimeFinding,
  resolveRuntimeFinding,
  getRuntimeAuditTimeline,
  getRuntimeEvidencePack,
  createRuntimeRestartDrill,
  snapshotRuntimeStateBeforeRestart,
  verifyRuntimeStateAfterRestart,
  compareRuntimeRestartSnapshot,
  verifyKillSwitchAfterRestart,
  verifyAccessGrantAfterRestart,
  getRuntimeRestartRecoveryAuditTimeline,
  getRuntimeRestartRecoveryEvidencePack
} from '../../api/limitedBetaRuntimeClient';

const UI_WARNING =
  'Invite-Only Limited Beta Runtime. This does not enable FULL_PUBLIC, open marketplace access, payment execution, refund execution, payout execution, provider external submission, tax/accounting submission, or uncontrolled source mutation.';

const DRILL_WARNING =
  'Restart Recovery Drill only. This does not enable FULL_PUBLIC, open marketplace, payment execution, provider submission, tax/accounting submission, or uncontrolled source mutation.';

export function LimitedBetaRuntime() {
  const [gateId, setGateId] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [grantId, setGrantId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [findingId, setFindingId] = useState('');
  const [drillId, setDrillId] = useState('');
  
  // Scopes and fields
  const [policyName, setPolicyName] = useState('Scope A');
  const [allowedFeatures, setAllowedFeatures] = useState('["CUSTOMER_PORTAL_VIEW_ONLY", "PREFLIGHT_REVIEW_ONLY"]');
  const [cohortId, setCohortId] = useState('cohort_beta_01');
  const [participantId, setParticipantId] = useState('participant_beta_01');
  const [tenantId, setTenantId] = useState('tenant_beta_01');
  const [featureKey, setFeatureKey] = useState('CUSTOMER_PORTAL_VIEW_ONLY');
  const [killSwitchReason, setKillSwitchReason] = useState('EMERGENCY_ACCESS_SUSPENSION');
  const [findingSeverity, setFindingSeverity] = useState('HIGH');
  const [findingSummary, setFindingSummary] = useState('Scoped runtime validation warning');
  const [activityType, setActivityType] = useState('ACCESS_REQUEST');
  const [rollbackSteps, setRollbackSteps] = useState('["disable_runtime", "suspend_sessions"]');
  const [violationDetails, setViolationDetails] = useState('{"attempted_feature": "PAYMENT_CAPTURE"}');

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
    return run('Check Readiness', () => getLimitedBetaRuntimeReadiness({ gate_id: gateId || undefined }));
  }, [run, gateId]);

  const handleCreatePolicy = useCallback(async () => {
    let allowedArr = [];
    try { allowedArr = JSON.parse(allowedFeatures); } catch (e) {}
    const r = await run('Create Scope Policy', () =>
      createRuntimeScopePolicy({
        gate_id: gateId,
        policy_name: policyName,
        allowed_features_json: allowedArr,
        created_by: 'admin'
      })
    );
    if (r && r.policy) {
      const p = r.policy as Record<string, unknown>;
      if (p.policy_id) setPolicyId(String(p.policy_id));
    }
  }, [run, gateId, policyName, allowedFeatures]);

  const handleUpdatePolicy = useCallback(() => {
    let allowedArr = [];
    try { allowedArr = JSON.parse(allowedFeatures); } catch (e) {}
    return run('Update Scope Policy', () =>
      updateRuntimeScopePolicy({
        policy_id: policyId,
        allowed_features_json: allowedArr
      })
    );
  }, [run, policyId, allowedFeatures]);

  const handleEnableRuntime = useCallback(() => {
    return run('Enable Runtime', () => enableRuntimeForGate({ gate_id: gateId }));
  }, [run, gateId]);

  const handleDisableRuntime = useCallback(() => {
    return run('Disable Runtime', () => disableRuntimeForGate({ gate_id: gateId }));
  }, [run, gateId]);

  const handleCreateGrant = useCallback(async () => {
    const r = await run('Create Access Grant', () =>
      createRuntimeAccessGrant({
        gate_id: gateId,
        cohort_id: cohortId,
        participant_id: participantId,
        tenant_id: tenantId,
        scope_policy_id: policyId,
        granted_by: 'admin'
      })
    );
    if (r && r.grant) {
      const g = r.grant as Record<string, unknown>;
      if (g.grant_id) setGrantId(String(g.grant_id));
    }
  }, [run, gateId, cohortId, participantId, tenantId, policyId]);

  const handleRevokeGrant = useCallback(() => {
    return run('Revoke Access Grant', () => revokeRuntimeAccessGrant({ grant_id: grantId }));
  }, [run, grantId]);

  const handleEvaluateAccess = useCallback(() => {
    return run('Evaluate Access', () =>
      evaluateRuntimeAccess({
        gate_id: gateId,
        cohort_id: cohortId,
        participant_id: participantId,
        tenant_id: tenantId,
        feature_key: featureKey
      })
    );
  }, [run, gateId, cohortId, participantId, tenantId, featureKey]);

  const handleCreateSession = useCallback(async () => {
    const r = await run('Create Runtime Session', () =>
      createRuntimeSession({
        gate_id: gateId,
        cohort_id: cohortId,
        participant_id: participantId,
        tenant_id: tenantId,
        feature_key: featureKey
      })
    );
    if (r && r.session) {
      const s = r.session as Record<string, unknown>;
      if (s.session_id) setSessionId(String(s.session_id));
    }
  }, [run, gateId, cohortId, participantId, tenantId, featureKey]);

  const handleTerminateSession = useCallback(() => {
    return run('Terminate Runtime Session', () => terminateRuntimeSession({ session_id: sessionId, reason: 'ADMIN_TERMINATED' }));
  }, [run, sessionId]);

  const handleRecordActivity = useCallback(() => {
    return run('Record Activity', () =>
      recordRuntimeActivity({
        session_id: sessionId || undefined,
        gate_id: gateId,
        participant_id: participantId,
        tenant_id: tenantId,
        event_type: activityType,
        details: { description: 'Manual beta activity log' }
      })
    );
  }, [run, sessionId, gateId, participantId, tenantId, activityType]);

  const handleRecordGuardrail = useCallback(() => {
    let detailsObj = {};
    try { detailsObj = JSON.parse(violationDetails); } catch (e) {}
    return run('Record Guardrail Event', () =>
      recordRuntimeGuardrailEvent({
        gate_id: gateId,
        tenant_id: tenantId,
        participant_id: participantId,
        event_type: 'GUARDRAIL_VIOLATION_TRIGGERED',
        violation_details: detailsObj
      })
    );
  }, [run, gateId, tenantId, participantId, violationDetails]);

  const handleTriggerKillSwitch = useCallback(() => {
    return run('Trigger Kill Switch', () => triggerRuntimeKillSwitch({ gate_id: gateId, reason: killSwitchReason }));
  }, [run, gateId, killSwitchReason]);

  const handleClearKillSwitch = useCallback(() => {
    return run('Clear Kill Switch', () => clearRuntimeKillSwitch({ gate_id: gateId }));
  }, [run, gateId]);

  const handleRecordRollback = useCallback(() => {
    let stepsArr = [];
    try { stepsArr = JSON.parse(rollbackSteps); } catch (e) {}
    return run('Record Rollback Event', () =>
      recordRuntimeRollbackEvent({
        gate_id: gateId,
        triggered_by: 'admin',
        rollback_steps: stepsArr
      })
    );
  }, [run, gateId, rollbackSteps]);

  const handleRecordFinding = useCallback(async () => {
    const r = await run('Record Finding', () =>
      recordRuntimeFinding({
        gate_id: gateId,
        severity: findingSeverity,
        summary: findingSummary,
        blocks_runtime: 1
      })
    );
    if (r && r.finding) {
      const f = r.finding as Record<string, unknown>;
      if (f.finding_id) setFindingId(String(f.finding_id));
    }
  }, [run, gateId, findingSeverity, findingSummary]);

  const handleResolveFinding = useCallback(() => {
    return run('Resolve Finding', () => resolveRuntimeFinding({ finding_id: findingId }));
  }, [run, findingId]);

  const handleGetAuditTimeline = useCallback(() => {
    return run('Get Audit Timeline', () => getRuntimeAuditTimeline({ gate_id: gateId }));
  }, [run, gateId]);

  const handleGetEvidencePack = useCallback(() => {
    return run('Get Evidence Pack', () => getRuntimeEvidencePack({ gate_id: gateId }));
  }, [run, gateId]);

  // --- Restart Recovery Handlers ---

  const handleCreateRestartDrill = useCallback(async () => {
    const r = await run('Create Restart Drill', () =>
      createRuntimeRestartDrill({
        gate_id: gateId,
        cohort_id: cohortId,
        participant_id: participantId,
        tenant_id: tenantId
      })
    );
    if (r && r.drill) {
      const d = r.drill as Record<string, unknown>;
      if (d.drill_id) setDrillId(String(d.drill_id));
    }
  }, [run, gateId, cohortId, participantId, tenantId]);

  const handleSnapshotBefore = useCallback(() => {
    return run('Snapshot Before Restart', () => snapshotRuntimeStateBeforeRestart({ gate_id: gateId }));
  }, [run, gateId]);

  const handleVerifyAfter = useCallback(() => {
    return run('Verify After Restart', () => verifyRuntimeStateAfterRestart({ gate_id: gateId }));
  }, [run, gateId]);

  const handleCompareSnapshot = useCallback(() => {
    return run('Compare Snapshot', () => compareRuntimeRestartSnapshot({ drill_id: drillId }));
  }, [run, drillId]);

  const handleVerifyKillSwitch = useCallback(() => {
    return run('Verify Kill Switch', () => verifyKillSwitchAfterRestart({ drill_id: drillId, gate_id: gateId }));
  }, [run, drillId, gateId]);

  const handleVerifyAccess = useCallback(() => {
    return run('Verify Access Recovery', () => verifyAccessGrantAfterRestart({ drill_id: drillId, grant_id: grantId }));
  }, [run, drillId, grantId]);

  const handleGetRestartTimeline = useCallback(() => {
    return run('Get Restart Timeline', () => getRuntimeRestartRecoveryAuditTimeline({ drill_id: drillId, gate_id: gateId }));
  }, [run, drillId, gateId]);

  const handleGetRestartEvidence = useCallback(() => {
    return run('Get Restart Evidence Pack', () => getRuntimeRestartRecoveryEvidencePack({ drill_id: drillId, gate_id: gateId }));
  }, [run, drillId, gateId]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: 'sans-serif', color: '#333' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8, borderBottom: '2px solid #eaeaea', paddingBottom: 12 }}>
        Phase 128.1 — Invite-Only Limited Beta Runtime & Restart Recovery Console
      </h1>

      <div style={{ background: '#f8d7da', border: '1px solid #f5c6cb', color: '#721c24', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <strong>⚠️ Safety Warning:</strong>
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>{UI_WARNING}</p>
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, fontWeight: 'bold' }}>{DRILL_WARNING}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <div style={{ background: '#f8f9fa', border: '1px solid #e2e3e5', borderRadius: 8, padding: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Hardened Status & Restart Recovery Registry</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>RESTART DRILL STATUS</span>
              <strong>{result?.restartRecoveryStatus || result?.restart_recovery_status || 'N/A'}</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>RECOVERY HASH</span>
              <strong style={{ fontSize: 10, wordBreak: 'break-all' }}>{result?.recovery_integrity_hash || 'N/A'}</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>BEFORE SNAPSHOT HASH</span>
              <strong style={{ fontSize: 10, wordBreak: 'break-all' }}>{result?.before_restart_snapshot_hash || 'N/A'}</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>AFTER SNAPSHOT HASH</span>
              <strong style={{ fontSize: 10, wordBreak: 'break-all' }}>{result?.after_restart_snapshot_hash || 'N/A'}</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>PERSISTENCE STATUS</span>
              <strong>{result?.persistenceStatus || 'N/A'}</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>RUNTIME TRUTH STATUS</span>
              <strong>{result?.runtimeTruthStatus || 'N/A'}</strong>
            </div>
          </div>
        </div>

        <div style={{ background: '#f8f9fa', border: '1px solid #e2e3e5', borderRadius: 8, padding: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Safety Invariants Panel</h3>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <div><strong>Beta Runtime Allowed Scope:</strong> <span style={{ color: result?.betaRuntimeEnabled ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>{result?.betaRuntimeEnabled ? 'SCOPED_ONLY' : 'NOT_ENABLED'}</span></div>
            <div><strong>FULL PUBLIC Enabled:</strong> <span style={{ color: '#dc3545', fontWeight: 'bold' }}>FALSE</span></div>
            <div><strong>Open Marketplace Enabled:</strong> <span style={{ color: '#dc3545', fontWeight: 'bold' }}>FALSE</span></div>
            <div><strong>Payment Execution Enabled:</strong> <span style={{ color: '#dc3545', fontWeight: 'bold' }}>FALSE</span></div>
            <div><strong>Provider External Submission:</strong> <span style={{ color: '#dc3545', fontWeight: 'bold' }}>FALSE</span></div>
            <div><strong>Source Mutation Enabled:</strong> <span style={{ color: '#dc3545', fontWeight: 'bold' }}>FALSE</span></div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Actions &amp; Restart Recovery Orchestration</h2>

          {/* Restart Recovery Drill Panel */}
          <div style={{ background: '#e9ecef', border: '2px dashed #6c757d', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#495057' }}>🔄 Restart Recovery Drill Panel</h4>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <button onClick={handleCreateRestartDrill} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#495057', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Create Drill
              </button>
              <input value={drillId} onChange={e => setDrillId(e.target.value)} placeholder="Drill ID (lbrrd_...)" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleSnapshotBefore} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#343a40', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Snapshot Before
              </button>
              <button onClick={handleVerifyAfter} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#28a745', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Verify After
              </button>
              <button onClick={handleCompareSnapshot} disabled={loading || !drillId} style={{ padding: '8px 16px', background: '#17a2b8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Compare Snapshots
              </button>
              <button onClick={handleVerifyKillSwitch} disabled={loading || !drillId || !gateId} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Verify Kill Switch
              </button>
              <button onClick={handleVerifyAccess} disabled={loading || !drillId || !grantId} style={{ padding: '8px 16px', background: '#6f42c1', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Verify Access
              </button>
            </div>
          </div>

          {/* 1. Gate Readiness & Enablement */}
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>1. Beta Gate Context</h4>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input value={gateId} onChange={e => setGateId(e.target.value)} placeholder="Gate ID (lbpg_...)" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleCheckReadiness} disabled={loading} style={{ padding: '8px 16px', background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Check Readiness
              </button>
              <button onClick={handleEnableRuntime} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#28a745', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Enable Gate
              </button>
              <button onClick={handleDisableRuntime} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Disable Gate
              </button>
            </div>
          </div>

          {/* 2. Scope Policies */}
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>2. Scope Policies</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <input value={policyName} onChange={e => setPolicyName(e.target.value)} placeholder="Policy Name" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <input value={allowedFeatures} onChange={e => setAllowedFeatures(e.target.value)} placeholder="Allowed Features (JSON)" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input value={policyId} onChange={e => setPolicyId(e.target.value)} placeholder="Policy ID (for update)" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleCreatePolicy} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Create Policy
              </button>
              <button onClick={handleUpdatePolicy} disabled={loading || !policyId} style={{ padding: '8px 16px', background: '#343a40', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Update Policy
              </button>
            </div>
          </div>

          {/* 3. Access Grants & Denials */}
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>3. Access Grants &amp; Evaluation</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <input value={cohortId} onChange={e => setCohortId(e.target.value)} placeholder="Cohort ID" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <input value={participantId} onChange={e => setParticipantId(e.target.value)} placeholder="Participant ID" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <input value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="Tenant ID" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <button onClick={handleCreateGrant} disabled={loading || !policyId} style={{ padding: '8px 16px', background: '#17a2b8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Grant Scope Access
              </button>
              <input value={grantId} onChange={e => setGrantId(e.target.value)} placeholder="Grant ID" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleRevokeGrant} disabled={loading || !grantId} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Revoke Grant
              </button>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input value={featureKey} onChange={e => setFeatureKey(e.target.value)} placeholder="Feature Key" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleEvaluateAccess} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Evaluate Access
              </button>
            </div>
          </div>

          {/* 4. Active Sessions */}
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>4. Runtime Sessions</h4>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button onClick={handleCreateSession} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#28a745', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Create Session
              </button>
              <input value={sessionId} onChange={e => setSessionId(e.target.value)} placeholder="Session ID" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleTerminateSession} disabled={loading || !sessionId} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Terminate Session
              </button>
            </div>
          </div>

          {/* 5. Kill Switch & Rollbacks */}
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>5. Kill Switch &amp; Emergency Actions</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <input value={killSwitchReason} onChange={e => setKillSwitchReason(e.target.value)} placeholder="Kill Switch Reason" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <input value={rollbackSteps} onChange={e => setRollbackSteps(e.target.value)} placeholder="Rollback Steps (JSON Array)" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button onClick={handleTriggerKillSwitch} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Trigger Kill Switch
              </button>
              <button onClick={handleClearKillSwitch} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#ffc107', color: '#212529', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Clear Kill Switch
              </button>
              <button onClick={handleRecordRollback} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Record Rollback Event
              </button>
            </div>
          </div>

          {/* 6. Findings & Guardrails */}
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>6. Findings &amp; Guardrails</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <input value={findingSummary} onChange={e => setFindingSummary(e.target.value)} placeholder="Finding Summary" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <input value={violationDetails} onChange={e => setViolationDetails(e.target.value)} placeholder="Violation Details (JSON)" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button onClick={handleRecordFinding} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#343a40', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Record Finding
              </button>
              <input value={findingId} onChange={e => setFindingId(e.target.value)} placeholder="Finding ID" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleResolveFinding} disabled={loading || !findingId} style={{ padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Resolve Finding
              </button>
              <button onClick={handleRecordGuardrail} disabled={loading || !gateId} style={{ padding: '8px 16px', background: '#fd7e14', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Record Guardrail Event
              </button>
            </div>
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
            <button onClick={handleGetRestartTimeline} disabled={loading || !drillId || !gateId} style={{ width: '100%', padding: '12px', background: '#495057', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>
              Get Restart Timeline
            </button>
            <button onClick={handleGetRestartEvidence} disabled={loading || !drillId || !gateId} style={{ width: '100%', padding: '12px', background: '#fd7e14', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>
              Build Restart Evidence Pack
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
                    <strong>Drill ID:</strong> {String(drillId || 'None')}<br />
                    <strong>Session ID:</strong> {String(sessionId || 'None')}<br />
                    <strong>Policy ID:</strong> {String(policyId || 'None')}<br />
                    <strong>Grant ID:</strong> {String(grantId || 'None')}<br />
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

export default LimitedBetaRuntime;
