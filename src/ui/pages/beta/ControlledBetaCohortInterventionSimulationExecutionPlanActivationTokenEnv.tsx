import React, { useState, useEffect } from 'react';
import { controlledBetaCohortInterventionExecutionPlanActivationTokenEnvClient } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenEnvClient';
import { TokenEnvRecord, TokenEnvRuleCheck, TokenEnvEvidence, TokenEnvAuditLog } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenEnv';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280',
  READY_FOR_EVALUATION: '#3b82f6',
  EVALUATED: '#10b981',
  'READY_FOR_DECISION': '#3b82f6',
  'ENVELOPE_PREPARED': '#10b981',
  FINALIZED: '#10b981',
  BLOCKED: '#dc2626',
  FAILED: '#ef4444',
  SUPERSEDED: '#9ca3af'
};

export const ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenEnv: React.FC = () => {
  const [envList, setEnvList] = useState<TokenEnvRecord[]>([]);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null);

  // Detail states
  const [tokenEnv, setTokenEnv] = useState<TokenEnvRecord | null>(null);
  const [rules, setRules] = useState<TokenEnvRuleCheck[]>([]);
  const [evidence, setEvidence] = useState<TokenEnvEvidence | null>(null);
  const [auditLogs, setAuditLogs] = useState<TokenEnvAuditLog[]>([]);

  // Input states
  const [tokenAuthIdInput, setTokenAuthIdInput] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [selectedResult, setSelectedResult] = useState('ENVELOPE_PREPARED_NOT_ISSUED');

  // Safety Attestation Overrides
  const [overrideSecurityOfficer, setOverrideSecurityOfficer] = useState('true');
  const [overrideKillSwitch, setOverrideKillSwitch] = useState('true');
  const [overrideRollback, setOverrideRollback] = useState('true');
  const [overrideHash, setOverrideHash] = useState('true');
  const [overrideResult, setOverrideResult] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const loadList = async () => {
    setLoading(true);
    try {
      const data = await controlledBetaCohortInterventionExecutionPlanActivationTokenEnvClient.getTokenEnvList();
      setEnvList(data);
      addLog('Fetched activation token envelope records.');
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
      const data = await controlledBetaCohortInterventionExecutionPlanActivationTokenEnvClient.getTokenEnvDetails(id);
      setTokenEnv(data.tokenEnv);
      setRules(data.rules);
      setEvidence(data.evidence);
      setAuditLogs(data.auditLogs);
      setActiveEnvId(id);
      addLog(`Details loaded for token envelope record: ${id}`);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const createRecord = async () => {
    if (!tokenAuthIdInput.trim()) {
      setError('Activation Token Auth ID is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await controlledBetaCohortInterventionExecutionPlanActivationTokenEnvClient.createTokenEnv(tokenAuthIdInput.trim());
      addLog(`Activation token envelope draft ${res.activation_token_env_id} initialized.`);
      setTokenAuthIdInput('');
      await loadList();
      await loadDetails(res.activation_token_env_id);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const evaluateRecord = async () => {
    if (!tokenEnv) return;
    setLoading(true);
    setError(null);
    try {
      const overrides: any = {
        security_officer_confirmed: overrideSecurityOfficer === 'true',
        kill_switch_verified: overrideKillSwitch === 'true',
        rollback_authority_verified: overrideRollback === 'true'
      };
      if (overrideHash === 'false') {
        overrides.canary_envelope = { token_envelope_mode: 'EXECUTABLE', allow_token_issue: true };
      }
      if (overrideResult) overrides.activation_token_env_result = overrideResult;

      await controlledBetaCohortInterventionExecutionPlanActivationTokenEnvClient.evaluateTokenEnv(tokenEnv.activation_token_env_id, overrides);
      addLog(`Completed rules validation for token envelope: ${tokenEnv.activation_token_env_id}`);
      await loadDetails(tokenEnv.activation_token_env_id);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const recordDecision = async () => {
    if (!tokenEnv || !decisionRationale.trim()) {
      setError('Security justification statement required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionExecutionPlanActivationTokenEnvClient.recordDecision(tokenEnv.activation_token_env_id, selectedResult, decisionRationale.trim());
      addLog(`Submitted result decision '${selectedResult}'`);
      setDecisionRationale('');
      await loadDetails(tokenEnv.activation_token_env_id);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const finalizeRecord = async () => {
    if (!tokenEnv) return;
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionExecutionPlanActivationTokenEnvClient.finalizeTokenEnv(tokenEnv.activation_token_env_id);
      addLog(`Finalized token envelope packet. Evidence Pack v156.0 locked.`);
      await loadDetails(tokenEnv.activation_token_env_id);
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
            Activation Token Issuance Envelope Gate
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            Phase 156 Gate — Token issuance envelope preparation checks while keeping the token prepared but not issued
          </p>
        </div>
      </header>

      {/* Warning Banner */}
      <div style={{ background: '#fef3c7', borderLeft: '4px solid #d97706', padding: '16px', borderRadius: '4px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 4px 0', color: '#92400e', fontWeight: 600 }}>⚠️ WARNING: ENVELOPE PREPARATION ONLY (NON-ISSUED)</h4>
        <p style={{ margin: 0, color: '#b45309', fontSize: '13px' }}>
          Token issuance envelope preparation does not issue the token. The token remains non-redeemable. The envelope is not redeemable. The token does not activate the execution plan. The token does not make the plan executable. The token does not create jobs, dispatch queues, or mutate runtime state. A future final token issuance approval gate is required before any token can become issuable.
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
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Prepare Token Envelope</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Finalized Token Auth ID..."
                value={tokenAuthIdInput}
                onChange={(e) => setTokenAuthIdInput(e.target.value)}
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
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Envelope Records</h3>
            {loading && envList.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>Loading...</p>
            ) : envList.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>No records found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {envList.map((item) => (
                  <div
                    key={item.activation_token_env_id}
                    onClick={() => loadDetails(item.activation_token_env_id)}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: activeEnvId === item.activation_token_env_id ? '#3b82f6' : '#e2e8f0',
                      background: activeEnvId === item.activation_token_env_id ? '#eff6ff' : '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{item.activation_token_env_id}</span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: STATUS_COLORS[item.activation_token_env_status] || '#cbd5e1',
                        color: '#ffffff'
                      }}>{item.activation_token_env_status}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Token Auth ID: {item.source_activation_token_auth_id}</div>
                    {item.activation_token_env_result && (
                      <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 500, color: '#0f172a', background: '#e2e8f0', padding: '2px 4px', borderRadius: '2px', display: 'inline-block' }}>
                        {item.activation_token_env_result}
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
          {tokenEnv ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Token Envelope: {tokenEnv.activation_token_env_id}</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                      Derived from Token Auth: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{tokenEnv.source_activation_token_auth_id}</span>
                    </p>
                  </div>
                  <span style={{ padding: '6px 12px', borderRadius: '6px', background: '#f1f5f9', fontSize: '12px', fontWeight: 600 }}>
                    Status: {tokenEnv.activation_execution_status}
                  </span>
                </div>

                {/* Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Envelope Prepared</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#10b981', marginTop: '2px' }}>
                      TRUE
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Token Issued</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444', marginTop: '2px' }}>
                      FALSE
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Token Redeemable</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444', marginTop: '2px' }}>
                      FALSE
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Envelope Result</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6', marginTop: '2px' }}>{tokenEnv.activation_token_env_result || 'PENDING EVALUATION'}</div>
                  </div>
                </div>

                {/* Decision Submit */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Log Token Env Result</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: '12px', marginBottom: '12px' }}>
                    <select
                      value={selectedResult}
                      onChange={(e) => setSelectedResult(e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="ENVELOPE_PREPARED_NOT_ISSUED">Envelope Prepared (Not Issued)</option>
                      <option value="ENVELOPE_REJECTED_NOT_ISSUED">Envelope Rejected</option>
                      <option value="ENVELOPE_BLOCKED_BY_PARENT_AUTH">Blocked by Parent Token Auth</option>
                      <option value="ENVELOPE_BLOCKED_BY_GUARDRAIL">Blocked by Guardrail</option>
                      <option value="ENVELOPE_BLOCKED_BY_HASH_MISMATCH">Blocked by Hash Mismatch</option>
                      <option value="ENVELOPE_BLOCKED_BY_WRITE_SCOPE">Blocked by Write Scope</option>
                      <option value="ENVELOPE_BLOCKED_BY_REDEEMABLE_TOKEN">Blocked by Redeemable Token</option>
                      <option value="REQUIRE_AUTH_REVALIDATION">Require Token Auth Revalidation</option>
                      <option value="ESCALATE_TO_SECURITY_COMMITTEE">Escalate to Security Committee</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Security committee confirmation details..."
                      value={decisionRationale}
                      onChange={(e) => setDecisionRationale(e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                  <button
                    onClick={recordDecision}
                    disabled={tokenEnv.activation_token_env_status === 'FINALIZED'}
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
                      disabled={tokenEnv.activation_token_env_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Evaluate Token Envelope
                    </button>
                    <button
                      onClick={finalizeRecord}
                      disabled={!tokenEnv.activation_token_env_result || tokenEnv.activation_token_env_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Finalize & Lock Envelope Package
                    </button>
                  </div>
                </div>

                {/* Overrides Panel */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginTop: '20px', background: '#faf5ff', padding: '16px', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#6b21a8' }}>Safety Attestation Overrides</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Security Officer</label>
                      <select
                        value={overrideSecurityOfficer}
                        onChange={(e) => setOverrideSecurityOfficer(e.target.value)}
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
                      <option value="ENVELOPE_PREPARED_NOT_ISSUED">Force Envelope Prepared</option>
                      <option value="ENVELOPE_BLOCKED_BY_GUARDRAIL">Force Blocked</option>
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
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Evidence Package (v156.0)</h3>
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
              Select an envelope record or enter a finalized activation token auth ID to start.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
