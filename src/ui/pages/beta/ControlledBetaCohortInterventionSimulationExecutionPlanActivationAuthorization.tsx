import React, { useState, useEffect } from 'react';
import { controlledBetaCohortInterventionExecutionPlanActivationAuthorizationClient } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationAuthorizationClient';
import { AuthorizationRecord, AuthorizationRuleCheck, AuthorizationEvidence, AuthorizationAuditLog } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationAuthorization';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280',
  READY_FOR_EVALUATION: '#3b82f6',
  EVALUATED: '#10b981',
  'READY_FOR_DECISION': '#3b82f6',
  'AUTHORIZED': '#10b981',
  'REJECTED': '#dc2626',
  FINALIZED: '#10b981',
  BLOCKED: '#dc2626',
  FAILED: '#ef4444',
  SUPERSEDED: '#9ca3af'
};

export const ControlledBetaCohortInterventionSimulationExecutionPlanActivationAuthorization: React.FC = () => {
  const [authorizationList, setAuthorizationList] = useState<AuthorizationRecord[]>([]);
  const [activeAuthId, setActiveAuthId] = useState<string | null>(null);

  // Detail states
  const [auth, setAuth] = useState<AuthorizationRecord | null>(null);
  const [rules, setRules] = useState<AuthorizationRuleCheck[]>([]);
  const [evidence, setEvidence] = useState<AuthorizationEvidence | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuthorizationAuditLog[]>([]);

  // Input states
  const [readinessIdInput, setReadinessIdInput] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [selectedResult, setSelectedResult] = useState('AUTHORIZED_NOT_ACTIVE');

  // Safety Attestation Overrides
  const [overrideOperator, setOverrideOperator] = useState('true');
  const [overrideKillSwitch, setOverrideKillSwitch] = useState('true');
  const [overrideRollback, setOverrideRollback] = useState('true');
  const [overrideSigner, setOverrideSigner] = useState('true');
  const [overrideHash, setOverrideHash] = useState('true');
  const [overrideResult, setOverrideResult] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const loadList = async () => {
    setLoading(true);
    try {
      const data = await controlledBetaCohortInterventionExecutionPlanActivationAuthorizationClient.getAuthorizationList();
      setAuthorizationList(data);
      addLog('Fetched activation authorization logs.');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadList();
  }, []);

  const loadDetails = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await controlledBetaCohortInterventionExecutionPlanActivationAuthorizationClient.getAuthorizationDetails(id);
      setAuth(data.authorization);
      setRules(data.rules);
      setEvidence(data.evidence);
      setAuditLogs(data.auditLogs);
      setActiveAuthId(id);
      addLog(`Details loaded for authorization record: ${id}`);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const createRecord = async () => {
    if (!readinessIdInput.trim()) {
      setError('Readiness ID is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await controlledBetaCohortInterventionExecutionPlanActivationAuthorizationClient.createAuthorization(readinessIdInput.trim());
      addLog(`Activation authorization draft ${res.activation_auth_id} initialized.`);
      setReadinessIdInput('');
      await loadList();
      await loadDetails(res.activation_auth_id);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const evaluateRecord = async () => {
    if (!auth) return;
    setLoading(true);
    setError(null);
    try {
      const overrides: any = {
        operator_confirmed: overrideOperator === 'true',
        kill_switch_verified: overrideKillSwitch === 'true',
        rollback_authority_verified: overrideRollback === 'true',
        governance_signer_present: overrideSigner === 'true'
      };
      if (overrideHash === 'false') {
        overrides.canary_envelope = { authorization_mode: 'EXECUTABLE', allow_real_activation: true }; // triggers failure block
      }
      if (overrideResult) overrides.activation_auth_result = overrideResult;

      await controlledBetaCohortInterventionExecutionPlanActivationAuthorizationClient.evaluateAuthorization(auth.activation_auth_id, overrides);
      addLog(`Completed rules validation for authorization: ${auth.activation_auth_id}`);
      await loadDetails(auth.activation_auth_id);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const recordDecision = async () => {
    if (!auth || !decisionRationale.trim()) {
      setError('Governance justification statement required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionExecutionPlanActivationAuthorizationClient.recordDecision(auth.activation_auth_id, selectedResult, decisionRationale.trim());
      addLog(`Submitted result decision '${selectedResult}'`);
      setDecisionRationale('');
      await loadDetails(auth.activation_auth_id);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const finalizeRecord = async () => {
    if (!auth) return;
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionExecutionPlanActivationAuthorizationClient.finalizeAuthorization(auth.activation_auth_id);
      addLog(`Finalized authorization packet. Evidence Pack v151.0 locked.`);
      await loadDetails(auth.activation_auth_id);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'Inter, system-ui, sans-serif', color: '#1e293b', background: '#f8fafc', minHeight: '100vh' }}>
      <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, letterSpacing: '-0.025em', color: '#0f172a' }}>
            Activation Authorization Verification Gate
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            Phase 151 Gate — Evaluates plan activation authorization conditions while maintaining strict non-active boundaries
          </p>
        </div>
      </header>

      {/* Warning Banner */}
      <div style={{ background: '#fef3c7', borderLeft: '4px solid #d97706', padding: '16px', borderRadius: '4px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 4px 0', color: '#92400e', fontWeight: 600 }}>⚠️ WARNING: ACTIVATION AUTHORIZATION ONLY (NON-ACTIVE)</h4>
        <p style={{ margin: 0, color: '#b45309', fontSize: '13px' }}>
          Activation authorization does not activate the execution plan. Activation authorization does not make the plan executable. Activation authorization does not create jobs, dispatch queues, or mutate runtime state. A future activation lock gate is required before any executable transition can be considered.
        </p>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px', borderRadius: '6px', marginBottom: '24px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px' }}>
        {/* Left Column */}
        <div>
          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Authorize Plan Activation</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Finalized Readiness ID..."
                value={readinessIdInput}
                onChange={(e) => setReadinessIdInput(e.target.value)}
                style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
              />
              <button
                onClick={createRecord}
                style={{ padding: '8px 12px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
              >
                Draft
              </button>
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Authorization Records</h3>
            {loading && authorizationList.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>Loading...</p>
            ) : authorizationList.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>No records found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {authorizationList.map((item) => (
                  <div
                    key={item.activation_auth_id}
                    onClick={() => loadDetails(item.activation_auth_id)}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: activeAuthId === item.activation_auth_id ? '#3b82f6' : '#e2e8f0',
                      background: activeAuthId === item.activation_auth_id ? '#eff6ff' : '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{item.activation_auth_id}</span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: STATUS_COLORS[item.activation_auth_status] || '#cbd5e1',
                        color: '#ffffff'
                      }}>{item.activation_auth_status}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Readiness ID: {item.source_activation_readiness_id}</div>
                    {item.activation_auth_result && (
                      <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 500, color: '#0f172a', background: '#e2e8f0', padding: '2px 4px', borderRadius: '2px', display: 'inline-block' }}>
                        {item.activation_auth_result}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div>
          {auth ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Activation Authorization: {auth.activation_auth_id}</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                      Derived from Readiness: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{auth.source_activation_readiness_id}</span>
                    </p>
                  </div>
                  <span style={{ padding: '6px 12px', borderRadius: '6px', background: '#f1f5f9', fontSize: '12px', fontWeight: 600 }}>
                    Status: {auth.activation_execution_status}
                  </span>
                </div>

                {/* Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Activation Capable</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444', marginTop: '2px' }}>
                      FALSE
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Authorization Mode</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                      {auth.activation_auth_status}
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Real Jobs</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                      {auth.job_creation_status}
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Authorization Result</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6', marginTop: '2px' }}>{auth.activation_auth_result || 'PENDING EVALUATION'}</div>
                  </div>
                </div>

                {/* Decision Submit */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Log Activation Authorization Result</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: '12px', marginBottom: '12px' }}>
                    <select
                      value={selectedResult}
                      onChange={(e) => setSelectedResult(e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="AUTHORIZED_NOT_ACTIVE">Authorized (Not Active)</option>
                      <option value="AUTHORIZATION_REJECTED_NOT_ACTIVE">Authorization Rejected</option>
                      <option value="AUTHORIZATION_BLOCKED_BY_PARENT_READINESS">Blocked by Parent Readiness</option>
                      <option value="AUTHORIZATION_BLOCKED_BY_GUARDRAIL">Blocked by Guardrail</option>
                      <option value="AUTHORIZATION_BLOCKED_BY_EXECUTABLE_FLAG">Blocked by Executable Flag</option>
                      <option value="AUTHORIZATION_BLOCKED_BY_WRITE_SCOPE">Blocked by Write Scope</option>
                      <option value="REQUIRE_ACTIVATION_READINESS_REVALIDATION">Require Readiness Revalidation</option>
                      <option value="ESCALATE_TO_GOVERNANCE_OWNER">Escalate to Owner</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Operator confirmation details and status..."
                      value={decisionRationale}
                      onChange={(e) => setDecisionRationale(e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                  <button
                    onClick={recordDecision}
                    disabled={auth.activation_auth_status === 'FINALIZED'}
                    style={{ padding: '8px 16px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                  >
                    Submit Result
                  </button>
                </div>

                {/* Workflow Controls */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginTop: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Workflow Controls</h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={evaluateRecord}
                      disabled={auth.activation_auth_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Evaluate Authorization
                    </button>
                    <button
                      onClick={finalizeRecord}
                      disabled={!auth.activation_auth_result || auth.activation_auth_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Finalize & Lock Authorization
                    </button>
                  </div>
                </div>

                {/* Overrides Panel */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginTop: '20px', background: '#faf5ff', padding: '16px', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#6b21a8' }}>Safety Attestation Overrides</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Operator Present</label>
                      <select
                        value={overrideOperator}
                        onChange={(e) => setOverrideOperator(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="true">Confirmed</option>
                        <option value="false">Missing</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Kill-Switch Status</label>
                      <select
                        value={overrideKillSwitch}
                        onChange={(e) => setOverrideKillSwitch(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="true">Verified</option>
                        <option value="false">Missing</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Rollback Authority</label>
                      <select
                        value={overrideRollback}
                        onChange={(e) => setOverrideRollback(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="true">Verified</option>
                        <option value="false">Missing</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Gov Signer</label>
                      <select
                        value={overrideSigner}
                        onChange={(e) => setOverrideSigner(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="true">Present</option>
                        <option value="false">Missing</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Parent Hash</label>
                      <select
                        value={overrideHash}
                        onChange={(e) => setOverrideHash(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="true">Matches</option>
                        <option value="false">Mismatch</option>
                      </select>
                    </div>
                  </div>
                  {/* Result forcing override */}
                  <div style={{ marginTop: '12px' }}>
                    <label style={{ fontSize: '11px', color: '#6b21a8' }}>Force Evaluated Result</label>
                    <select
                      value={overrideResult}
                      onChange={(e) => setOverrideResult(e.target.value)}
                      style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                    >
                      <option value="">Default (Automated)</option>
                      <option value="AUTHORIZED_NOT_ACTIVE">Force Authorized</option>
                      <option value="AUTHORIZATION_BLOCKED_BY_GUARDRAIL">Force Blocked</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Rules */}
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Validation Rules ({rules.length})</h3>
                {rules.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>No validation rules loaded.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {rules.map((r) => (
                      <div key={r.rule_id} style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>
                            {r.check_type}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: r.severity === 'CRITICAL' ? '#ef4444' : r.severity === 'WARNING' ? '#f59e0b' : '#3b82f6'
                          }}>{r.severity}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', color: '#334155' }}>{r.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Evidence Pack */}
              {evidence && (
                <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Evidence Package (v151.0)</h3>
                  <div style={{ padding: '12px', background: '#faf5ff', borderRadius: '6px', border: '1px solid #d8b4fe', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#6b21a8' }}>Evidence Pack Hash</div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600, color: '#581c87', marginTop: '2px', wordBreak: 'break-all' }}>
                      {evidence.evidence_pack_hash}
                    </div>
                  </div>
                  <details style={{ cursor: 'pointer' }}>
                    <summary style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6' }}>View Payload JSON & Lineage Chain</summary>
                    <pre style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '11px', overflowX: 'auto', marginTop: '8px', cursor: 'default' }}>
                      {JSON.stringify(typeof evidence.evidence_payload_json === 'string' ? JSON.parse(evidence.evidence_payload_json) : evidence.evidence_payload_json, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

              {/* Audit Logs */}
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Audit Trail ({auditLogs.length})</h3>
                {auditLogs.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>No audit logs registered.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {auditLogs.map((l) => (
                      <div key={l.audit_event_id} style={{ display: 'flex', gap: '12px', fontSize: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                        <span style={{ color: '#64748b', minWidth: '80px' }}>{new Date(l.created_at).toLocaleTimeString()}</span>
                        <span style={{ fontWeight: 600, color: '#334155' }}>{l.event_type}</span>
                        <span style={{ color: '#64748b' }}>by {l.actor_id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: '#ffffff', padding: '48px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b' }}>
              Select an authorization record or enter a finalized readiness ID to start.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
