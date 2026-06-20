import React, { useState, useCallback } from 'react';
import {
  getControlledBetaCohortActivationReadiness,
  createControlledCohortActivation,
  bindActivationToGate,
  bindActivationToCohort,
  bindActivationToTenant,
  addActivationParticipant,
  removeActivationParticipant,
  issueActivationInvite,
  revokeActivationInvite,
  defineActivationScope,
  defineSessionLimits,
  activateControlledCohort,
  pauseControlledCohort,
  resumeControlledCohort,
  terminateControlledCohort,
  evaluateParticipantActivationAccess,
  recordActivationMonitoringEvent,
  recordActivationSupportEvent,
  recordActivationIncidentEvent,
  triggerActivationKillSwitch,
  clearActivationKillSwitch,
  recordActivationFinding,
  resolveActivationFinding,
  getControlledActivationEvidencePack,
  getControlledActivationAuditTimeline
} from '../../api/controlledBetaCohortActivationClient';

const UI_WARNING =
  'First Controlled Invite-Only Beta Cohort Activation. This does not enable FULL_PUBLIC, open marketplace access, payment execution, refund execution, payout execution, provider external submission, tax/accounting submission, or uncontrolled source mutation.';

export function ControlledBetaCohortActivation() {
  const [activationId, setActivationId] = useState('');
  const [gateId, setGateId] = useState('lbpg_phase127_01');
  const [cohortId, setCohortId] = useState('cohort_beta_01');
  const [tenantId, setTenantId] = useState('tenant_beta_01');

  // Input states
  const [participantId, setParticipantId] = useState('participant_beta_01');
  const [inviteId, setInviteId] = useState('');
  const [findingId, setFindingId] = useState('');
  const [allowedFeatures, setAllowedFeatures] = useState('["CUSTOMER_PORTAL_VIEW_ONLY", "PREFLIGHT_REVIEW_ONLY"]');
  const [maxParticipants, setMaxParticipants] = useState(5);
  const [maxSessions, setMaxSessions] = useState(2);
  const [maxTotalSessions, setMaxTotalSessions] = useState(10);
  const [maxDuration, setMaxDuration] = useState(60);
  const [maxActions, setMaxActions] = useState(100);

  const [featureKey, setFeatureKey] = useState('CUSTOMER_PORTAL_VIEW_ONLY');
  const [eventType, setEventType] = useState('SESSION_START');
  const [ticketDetails, setTicketDetails] = useState('User reported login query.');
  const [incidentType, setIncidentType] = useState('LATENCY_SPIKE');
  const [incidentSeverity, setIncidentSeverity] = useState('HIGH');
  const [incidentSummary, setIncidentSummary] = useState('Minor latency warning in cohort runtime');
  const [killSwitchReason, setKillSwitchReason] = useState('EMERGENCY_ACCESS_SUSPENSION');
  const [findingSeverity, setFindingSeverity] = useState('HIGH');
  const [findingSummary, setFindingSummary] = useState('Scoped activation finding warning');

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

  const handleCreateActivation = useCallback(async () => {
    const r = await run('Create Activation', () =>
      createControlledCohortActivation({
        gate_id: gateId,
        cohort_id: cohortId,
        tenant_id: tenantId
      })
    );
    if (r && r.activation) {
      const a = r.activation as Record<string, unknown>;
      if (a.activation_id) setActivationId(String(a.activation_id));
    }
  }, [run, gateId, cohortId, tenantId]);

  const handleCheckReadiness = useCallback(() => {
    return run('Check Readiness', () => getControlledBetaCohortActivationReadiness({ activation_id: activationId || undefined }));
  }, [run, activationId]);

  const handleBindGate = useCallback(() => {
    return run('Bind to Gate', () => bindActivationToGate({ activation_id: activationId, gate_id: gateId }));
  }, [run, activationId, gateId]);

  const handleBindCohort = useCallback(() => {
    return run('Bind to Cohort', () => bindActivationToCohort({ activation_id: activationId, cohort_id: cohortId }));
  }, [run, activationId, cohortId]);

  const handleBindTenant = useCallback(() => {
    return run('Bind to Tenant', () => bindActivationToTenant({ activation_id: activationId, tenant_id: tenantId }));
  }, [run, activationId, tenantId]);

  const handleAddParticipant = useCallback(() => {
    return run('Add Participant', () =>
      addActivationParticipant({
        activation_id: activationId,
        participant_id: participantId,
        approved: true,
        terms_accepted: true,
        role_boundary_defined: true
      })
    );
  }, [run, activationId, participantId]);

  const handleRemoveParticipant = useCallback(() => {
    return run('Remove Participant', () => removeActivationParticipant({ participant_id: participantId }));
  }, [run, participantId]);

  const handleIssueInvite = useCallback(async () => {
    const r = await run('Issue Invite', () =>
      issueActivationInvite({
        activation_id: activationId,
        participant_id: participantId
      })
    );
    if (r && r.invite) {
      const i = r.invite as Record<string, unknown>;
      if (i.invite_id) setInviteId(String(i.invite_id));
    }
  }, [run, activationId, participantId]);

  const handleRevokeInvite = useCallback(() => {
    return run('Revoke Invite', () => revokeActivationInvite({ invite_id: inviteId }));
  }, [run, inviteId]);

  const handleDefineScope = useCallback(() => {
    let featuresArr = [];
    try { featuresArr = JSON.parse(allowedFeatures); } catch (e) {}
    return run('Define Scope Binding', () =>
      defineActivationScope({
        activation_id: activationId,
        allowed_features_json: featuresArr
      })
    );
  }, [run, activationId, allowedFeatures]);

  const handleDefineLimits = useCallback(() => {
    return run('Define Session Limits', () =>
      defineSessionLimits({
        activation_id: activationId,
        max_participants: Number(maxParticipants),
        max_sessions_per_participant: Number(maxSessions),
        max_total_active_sessions: Number(maxTotalSessions),
        max_runtime_minutes_per_session: Number(maxDuration),
        max_actions_per_hour: Number(maxActions)
      })
    );
  }, [run, activationId, maxParticipants, maxSessions, maxTotalSessions, maxDuration, maxActions]);

  const handleActivateCohort = useCallback(() => {
    return run('Activate Cohort', () => activateControlledCohort({ activation_id: activationId }));
  }, [run, activationId]);

  const handlePauseCohort = useCallback(() => {
    return run('Pause Cohort', () => pauseControlledCohort({ activation_id: activationId }));
  }, [run, activationId]);

  const handleResumeCohort = useCallback(() => {
    return run('Resume Cohort', () => resumeControlledCohort({ activation_id: activationId }));
  }, [run, activationId]);

  const handleTerminateCohort = useCallback(() => {
    return run('Terminate Cohort', () => terminateControlledCohort({ activation_id: activationId }));
  }, [run, activationId]);

  const handleEvaluateAccess = useCallback(() => {
    return run('Evaluate Access', () =>
      evaluateParticipantActivationAccess({
        activation_id: activationId,
        participant_id: participantId,
        feature_key: featureKey
      })
    );
  }, [run, activationId, participantId, featureKey]);

  const handleRecordMonitoring = useCallback(() => {
    return run('Record Monitoring Event', () =>
      recordActivationMonitoringEvent({
        activation_id: activationId,
        event_type: eventType,
        details: { description: 'Manual monitoring event entry' }
      })
    );
  }, [run, activationId, eventType]);

  const handleRecordSupport = useCallback(() => {
    return run('Record Support Event', () =>
      recordActivationSupportEvent({
        activation_id: activationId,
        ticket_details: ticketDetails
      })
    );
  }, [run, activationId, ticketDetails]);

  const handleRecordIncident = useCallback(() => {
    return run('Record Incident Event', () =>
      recordActivationIncidentEvent({
        activation_id: activationId,
        incident_type: incidentType,
        severity: incidentSeverity,
        summary: incidentSummary
      })
    );
  }, [run, activationId, incidentType, incidentSeverity, incidentSummary]);

  const handleTriggerKillSwitch = useCallback(() => {
    return run('Trigger Kill Switch', () => triggerActivationKillSwitch({ activation_id: activationId, reason: killSwitchReason }));
  }, [run, activationId, killSwitchReason]);

  const handleClearKillSwitch = useCallback(() => {
    return run('Clear Kill Switch', () => clearActivationKillSwitch({ activation_id: activationId }));
  }, [run, activationId]);

  const handleRecordFinding = useCallback(async () => {
    const r = await run('Record Finding', () =>
      recordActivationFinding({
        activation_id: activationId,
        severity: findingSeverity,
        summary: findingSummary,
        blocks_runtime: true
      })
    );
    if (r && r.finding) {
      const f = r.finding as Record<string, unknown>;
      if (f.finding_id) setFindingId(String(f.finding_id));
    }
  }, [run, activationId, findingSeverity, findingSummary]);

  const handleResolveFinding = useCallback(() => {
    return run('Resolve Finding', () => resolveActivationFinding({ finding_id: findingId }));
  }, [run, findingId]);

  const handleGetEvidencePack = useCallback(() => {
    return run('Get Evidence Pack', () => getControlledActivationEvidencePack({ activation_id: activationId }));
  }, [run, activationId]);

  const handleGetAuditTimeline = useCallback(() => {
    return run('Get Audit Timeline', () => getControlledActivationAuditTimeline({ activation_id: activationId }));
  }, [run, activationId]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: 'sans-serif', color: '#333' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8, borderBottom: '2px solid #eaeaea', paddingBottom: 12 }}>
        Phase 129 — Controlled Invite-Only Beta Cohort Activation Console
      </h1>

      <div style={{ background: '#e2f0d9', border: '1px solid #a9d08e', color: '#385723', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <strong>⚠️ Strict Governance Warning:</strong>
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>{UI_WARNING}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <div style={{ background: '#f8f9fa', border: '1px solid #e2e3e5', borderRadius: 8, padding: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Active Activation Scopes & Readiness</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>ACTIVATION ID</span>
              <strong>{activationId || 'N/A'}</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>READINESS STATUS</span>
              <strong>{result?.readiness_status || result?.readinessStatus || 'N/A'}</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>PERSISTENCE STATUS</span>
              <strong>{result?.persistenceStatus || result?.persistence_status || 'N/A'}</strong>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #dee2e6' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#6c757d' }}>RUNTIME TRUTH</span>
              <strong>{result?.runtimeTruthStatus || result?.runtime_truth_status || 'N/A'}</strong>
            </div>
          </div>
        </div>

        <div style={{ background: '#f8f9fa', border: '1px solid #e2e3e5', borderRadius: 8, padding: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Safety Invariant Safeguards</h3>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <div><strong>Controlled Beta Runtime Scoped:</strong> <span style={{ color: result?.betaRuntimeEnabled ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>{result?.betaRuntimeEnabled ? 'SCOPED_ONLY' : 'NOT_ENABLED'}</span></div>
            <div><strong>FULL PUBLIC Enabled:</strong> <span style={{ color: '#dc3545', fontWeight: 'bold' }}>FALSE</span></div>
            <div><strong>Open Marketplace Enabled:</strong> <span style={{ color: '#dc3545', fontWeight: 'bold' }}>FALSE</span></div>
            <div><strong>Payment Execution Enabled:</strong> <span style={{ color: '#dc3545', fontWeight: 'bold' }}>FALSE</span></div>
            <div><strong>Provider External Submission:</strong> <span style={{ color: '#dc3545', fontWeight: 'bold' }}>FALSE</span></div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Activation Console Operations</h2>

          {/* 1. Context Creation */}
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>1. Create &amp; Bind Activation Context</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <input value={gateId} onChange={e => setGateId(e.target.value)} placeholder="Gate ID" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <input value={cohortId} onChange={e => setCohortId(e.target.value)} placeholder="Cohort ID" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <input value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="Tenant ID" style={{ padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleCreateActivation} disabled={loading} style={{ padding: '8px 16px', background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Create Context
              </button>
              <input value={activationId} onChange={e => setActivationId(e.target.value)} placeholder="Activation ID" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleCheckReadiness} disabled={loading || !activationId} style={{ padding: '8px 16px', background: '#28a745', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Verify Readiness
              </button>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <button onClick={handleBindGate} disabled={loading || !activationId} style={{ padding: '6px 12px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                Bind Gate
              </button>
              <button onClick={handleBindCohort} disabled={loading || !activationId} style={{ padding: '6px 12px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                Bind Cohort
              </button>
              <button onClick={handleBindTenant} disabled={loading || !activationId} style={{ padding: '6px 12px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                Bind Tenant
              </button>
            </div>
          </div>

          {/* 2. Participant & Invites */}
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>2. Participant Governance &amp; Invites</h4>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
              <input value={participantId} onChange={e => setParticipantId(e.target.value)} placeholder="Participant ID" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleAddParticipant} disabled={loading || !activationId} style={{ padding: '8px 16px', background: '#17a2b8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Add Participant
              </button>
              <button onClick={handleRemoveParticipant} disabled={loading || !participantId} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Remove
              </button>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button onClick={handleIssueInvite} disabled={loading || !activationId} style={{ padding: '8px 16px', background: '#fd7e14', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Issue Invite
              </button>
              <input value={inviteId} onChange={e => setInviteId(e.target.value)} placeholder="Invite ID" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleRevokeInvite} disabled={loading || !inviteId} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Revoke Invite
              </button>
            </div>
          </div>

          {/* 3. Scopes & Limits */}
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>3. Define Allowed Scopes &amp; Limits</h4>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#6c757d', marginBottom: 4 }}>Allowed Features (JSON Array)</label>
              <input value={allowedFeatures} onChange={e => setAllowedFeatures(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: '#6c757d' }}>Max Part.</label>
                <input type="number" value={maxParticipants} onChange={e => setMaxParticipants(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: '#6c757d' }}>Max Sess/Part</label>
                <input type="number" value={maxSessions} onChange={e => setMaxSessions(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: '#6c757d' }}>Max Total Sess</label>
                <input type="number" value={maxTotalSessions} onChange={e => setMaxTotalSessions(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: '#6c757d' }}>Max Duration (m)</label>
                <input type="number" value={maxDuration} onChange={e => setMaxDuration(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: '#6c757d' }}>Max Act/Hr</label>
                <input type="number" value={maxActions} onChange={e => setMaxActions(Number(e.target.value))} style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleDefineScope} disabled={loading || !activationId} style={{ padding: '8px 16px', background: '#6f42c1', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Define Scope
              </button>
              <button onClick={handleDefineLimits} disabled={loading || !activationId} style={{ padding: '8px 16px', background: '#343a40', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Define Limits
              </button>
            </div>
          </div>

          {/* 4. Controls */}
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>4. Cohort Activation Actions</h4>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleActivateCohort} disabled={loading || !activationId} style={{ flex: 1, padding: '10px', background: '#28a745', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
                Activate Cohort
              </button>
              <button onClick={handlePauseCohort} disabled={loading || !activationId} style={{ flex: 1, padding: '10px', background: '#ffc107', color: '#212529', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
                Pause Cohort
              </button>
              <button onClick={handleResumeCohort} disabled={loading || !activationId} style={{ flex: 1, padding: '10px', background: '#17a2b8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
                Resume Cohort
              </button>
              <button onClick={handleTerminateCohort} disabled={loading || !activationId} style={{ flex: 1, padding: '10px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
                Terminate Cohort
              </button>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
              <input value={featureKey} onChange={e => setFeatureKey(e.target.value)} placeholder="Evaluate Feature Access Key" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleEvaluateAccess} disabled={loading || !activationId} style={{ padding: '8px 16px', background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Evaluate Access
              </button>
            </div>
          </div>

          {/* 5. Incidents & Emergency Kill Switch */}
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>5. Monitoring, Support, Incidents &amp; Kill Switch</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 2 }}>Monitoring Type</label>
                <input value={eventType} onChange={e => setEventType(e.target.value)} style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 2 }}>Ticket Details</label>
                <input value={ticketDetails} onChange={e => setTicketDetails(e.target.value)} style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={handleRecordMonitoring} disabled={loading || !activationId} style={{ padding: '8px 12px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                Record Monitoring
              </button>
              <button onClick={handleRecordSupport} disabled={loading || !activationId} style={{ padding: '8px 12px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                Record Support
              </button>
            </div>

            <div style={{ borderTop: '1px solid #eaeaea', paddingTop: 12, marginTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
                <input value={incidentType} onChange={e => setIncidentType(e.target.value)} placeholder="Incident Type" style={{ padding: 6, borderRadius: 4, border: '1px solid #ced4da' }} />
                <input value={incidentSeverity} onChange={e => setIncidentSeverity(e.target.value)} placeholder="Incident Severity" style={{ padding: 6, borderRadius: 4, border: '1px solid #ced4da' }} />
                <input value={incidentSummary} onChange={e => setIncidentSummary(e.target.value)} placeholder="Incident Summary" style={{ padding: 6, borderRadius: 4, border: '1px solid #ced4da' }} />
              </div>
              <button onClick={handleRecordIncident} disabled={loading || !activationId} style={{ padding: '8px 16px', background: '#fd7e14', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginBottom: 12 }}>
                Record Incident (BLOCKER/CRITICAL auto-pauses)
              </button>
            </div>

            <div style={{ borderTop: '1px solid #eaeaea', paddingTop: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input value={killSwitchReason} onChange={e => setKillSwitchReason(e.target.value)} placeholder="Reason for Kill Switch" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
                <button onClick={handleTriggerKillSwitch} disabled={loading || !activationId} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  Trigger Kill Switch
                </button>
                <button onClick={handleClearKillSwitch} disabled={loading || !activationId} style={{ padding: '8px 16px', background: '#ffc107', color: '#212529', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  Clear Kill Switch
                </button>
              </div>
            </div>
          </div>

          {/* 6. Findings */}
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>6. Findings Registry</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <input value={findingSeverity} onChange={e => setFindingSeverity(e.target.value)} placeholder="Severity" style={{ padding: 6, borderRadius: 4, border: '1px solid #ced4da' }} />
              <input value={findingSummary} onChange={e => setFindingSummary(e.target.value)} placeholder="Finding Summary" style={{ padding: 6, borderRadius: 4, border: '1px solid #ced4da' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button onClick={handleRecordFinding} disabled={loading || !activationId} style={{ padding: '8px 16px', background: '#343a40', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Record Finding
              </button>
              <input value={findingId} onChange={e => setFindingId(e.target.value)} placeholder="Finding ID" style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ced4da' }} />
              <button onClick={handleResolveFinding} disabled={loading || !findingId} style={{ padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Resolve Finding
              </button>
            </div>
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Audit &amp; Evidence</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <button onClick={handleGetAuditTimeline} disabled={loading || !activationId} style={{ width: '100%', padding: '12px', background: '#343a40', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>
              Get Audit Timeline
            </button>
            <button onClick={handleGetEvidencePack} disabled={loading || !activationId} style={{ width: '100%', padding: '12px', background: '#20c997', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>
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
                    <strong>Activation ID:</strong> {String(activationId || 'None')}<br />
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

export default ControlledBetaCohortActivation;
