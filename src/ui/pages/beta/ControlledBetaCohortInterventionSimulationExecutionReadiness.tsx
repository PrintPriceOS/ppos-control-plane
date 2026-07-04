import React, { useState, useEffect } from 'react';
import { controlledBetaCohortInterventionExecutionReadinessClient } from '../../lib/controlledBetaCohortInterventionExecutionReadinessClient';
import { ReadinessRecord, ReadinessCheck, ReadinessEvidence, ReadinessAuditLog } from '../../lib/controlledBetaCohortInterventionExecutionReadiness';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280',
  READY_FOR_EVALUATION: '#3b82f6',
  EVALUATED: '#10b981',
  READY_FOR_DECISION: '#3b82f6',
  READINESS_APPROVED: '#10b981',
  READINESS_REJECTED: '#ef4444',
  BLOCKED: '#dc2626',
  FINALIZED: '#10b981',
  SUPERSEDED: '#9ca3af'
};

export const ControlledBetaCohortInterventionSimulationExecutionReadiness: React.FC = () => {
  const [readinessList, setReadinessList] = useState<ReadinessRecord[]>([]);
  const [activeReadinessId, setActiveReadinessId] = useState<string | null>(null);

  // Details states
  const [record, setRecord] = useState<ReadinessRecord | null>(null);
  const [checks, setChecks] = useState<ReadinessCheck[]>([]);
  const [evidence, setEvidence] = useState<ReadinessEvidence | null>(null);
  const [auditLogs, setAuditLogs] = useState<ReadinessAuditLog[]>([]);

  // Input states
  const [approvalIdInput, setApprovalIdInput] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [selectedDecision, setSelectedDecision] = useState('APPROVE_EXECUTION_READINESS_NOT_EXECUTED');

  // Override states
  const [overrideKillSwitch, setOverrideKillSwitch] = useState('true');
  const [overrideRollback, setOverrideRollback] = useState('true');
  const [overrideCanary, setOverrideCanary] = useState('true');
  const [overrideDecision, setOverrideDecision] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const loadList = async () => {
    setLoading(true);
    try {
      const data = await controlledBetaCohortInterventionExecutionReadinessClient.getReadinessList();
      setReadinessList(data);
      addLog('Loaded readiness verification logs.');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadList();
  }, []);

  const loadDetails = async (readinessId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await controlledBetaCohortInterventionExecutionReadinessClient.getReadinessDetails(readinessId);
      setRecord(data.readiness);
      setChecks(data.checks);
      setEvidence(data.evidence);
      setAuditLogs(data.auditLogs);
      setActiveReadinessId(readinessId);
      addLog(`Details loaded for: ${readinessId}`);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const createRecord = async () => {
    if (!approvalIdInput.trim()) {
      setError('Approval ID is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await controlledBetaCohortInterventionExecutionReadinessClient.createReadiness(approvalIdInput.trim());
      addLog(`Readiness draft ${res.readiness_id} initialized.`);
      setApprovalIdInput('');
      await loadList();
      await loadDetails(res.readiness_id);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const evaluateRecord = async () => {
    if (!record) return;
    setLoading(true);
    setError(null);
    try {
      const overrides: any = {
        kill_switch_configured: overrideKillSwitch === 'true',
        rollback_authority_assigned: overrideRollback === 'true',
        canary_available: overrideCanary === 'true'
      };
      if (overrideDecision) overrides.readiness_decision = overrideDecision;

      await controlledBetaCohortInterventionExecutionReadinessClient.evaluateReadiness(record.readiness_id, overrides);
      addLog(`Evaluation completed for readiness package: ${record.readiness_id}`);
      await loadDetails(record.readiness_id);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const recordDecision = async () => {
    if (!record || !decisionRationale.trim()) {
      setError('Justification rationale required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionExecutionReadinessClient.recordDecision(record.readiness_id, selectedDecision, decisionRationale.trim());
      addLog(`Recorded readiness decision '${selectedDecision}'`);
      setDecisionRationale('');
      await loadDetails(record.readiness_id);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const finalizeRecord = async () => {
    if (!record) return;
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionExecutionReadinessClient.finalizeReadiness(record.readiness_id);
      addLog(`Finalized readiness gate package. Evidence Pack v145.0 locked.`);
      await loadDetails(record.readiness_id);
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
            High-Risk Execution Readiness Gate
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            Phase 145 Gate — Validate safety mechanisms, kill-switches, and rollback paths
          </p>
        </div>
      </header>

      {/* Warning Banner */}
      <div style={{ background: '#fef3c7', borderLeft: '4px solid #d97706', padding: '16px', borderRadius: '4px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 4px 0', color: '#92400e', fontWeight: 600 }}>⚠️ WARNING: SAFE WORKFLOW BOUNDARIES PRESERVED</h4>
        <p style={{ margin: 0, color: '#b45309', fontSize: '13px' }}>
          This interface verifies execution readiness metrics only. Real operational intervention deployment capabilities remain fully disabled. Zero active execution capability pathways exist inside this validation logic.
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
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Initialize Readiness</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Finalized Approval ID..."
                value={approvalIdInput}
                onChange={(e) => setApprovalIdInput(e.target.value)}
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
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Readiness Packages</h3>
            {loading && readinessList.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>Loading...</p>
            ) : readinessList.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>No readiness records found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {readinessList.map((r) => (
                  <div
                    key={r.readiness_id}
                    onClick={() => loadDetails(r.readiness_id)}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: activeReadinessId === r.readiness_id ? '#3b82f6' : '#e2e8f0',
                      background: activeReadinessId === r.readiness_id ? '#eff6ff' : '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{r.readiness_id}</span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: STATUS_COLORS[r.readiness_status] || '#cbd5e1',
                        color: '#ffffff'
                      }}>{r.readiness_status}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Approval ID: {r.source_approval_id}</div>
                    {r.readiness_decision && (
                      <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 500, color: '#0f172a', background: '#e2e8f0', padding: '2px 4px', borderRadius: '2px', display: 'inline-block' }}>
                        {r.readiness_decision}
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
          {record ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Readiness Record: {record.readiness_id}</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                      Derived from Approval: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.source_approval_id}</span>
                    </p>
                  </div>
                  <span style={{ padding: '6px 12px', borderRadius: '6px', background: '#f1f5f9', fontSize: '12px', fontWeight: 600 }}>
                    Readiness: {record.execution_readiness_status}
                  </span>
                </div>

                {/* Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Kill-Switch Status</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: record.kill_switch_status === 'PASS' ? '#10b981' : '#ef4444', marginTop: '2px' }}>
                      {record.kill_switch_status}
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Rollback Auth Status</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: record.rollback_authority_status === 'PASS' ? '#10b981' : '#ef4444', marginTop: '2px' }}>
                      {record.rollback_authority_status}
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Risk Profile</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{record.risk_level}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Readiness Decision</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6', marginTop: '2px' }}>{record.readiness_decision || 'PENDING EVALUATION'}</div>
                  </div>
                </div>

                {/* Decision Submit */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Log Readiness Decision</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '12px', marginBottom: '12px' }}>
                    <select
                      value={selectedDecision}
                      onChange={(e) => setSelectedDecision(e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="APPROVE_EXECUTION_READINESS_NOT_EXECUTED">Approve Readiness (Not Executed)</option>
                      <option value="REJECT_EXECUTION_READINESS">Reject Execution Readiness</option>
                      <option value="BLOCK_EXECUTION_PATH">Block Execution Path</option>
                      <option value="REQUIRE_ROLLBACK_REVIEW">Require Rollback Review</option>
                      <option value="REQUIRE_KILL_SWITCH_REVIEW">Require Kill-Switch Review</option>
                      <option value="REQUIRE_RATE_LIMIT_REVIEW">Require Rate Limit Review</option>
                      <option value="REQUIRE_RE_APPROVAL">Require Re-approval</option>
                      <option value="ESCALATE_TO_GOVERNANCE_OWNER">Escalate to Owner</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Governance justification and safety notes..."
                      value={decisionRationale}
                      onChange={(e) => setDecisionRationale(e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                  <button
                    onClick={recordDecision}
                    disabled={record.readiness_status === 'FINALIZED'}
                    style={{ padding: '8px 16px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                  >
                    Submit Decision
                  </button>
                </div>

                {/* Evaluation Controls */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginTop: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Evaluation & Locking</h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={evaluateRecord}
                      disabled={record.readiness_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Evaluate Readiness
                    </button>
                    <button
                      onClick={finalizeRecord}
                      disabled={!record.readiness_decision || record.readiness_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Finalize & Lock Readiness
                    </button>
                  </div>
                </div>

                {/* Overrides Panel */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginTop: '20px', background: '#faf5ff', padding: '16px', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#6b21a8' }}>Emergency Verification Overrides</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Emergency Kill-Switch</label>
                      <select
                        value={overrideKillSwitch}
                        onChange={(e) => setOverrideKillSwitch(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="true">Configured (Pass)</option>
                        <option value="false">Missing (Fail)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Rollback Authority</label>
                      <select
                        value={overrideRollback}
                        onChange={(e) => setOverrideRollback(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="true">Assigned (Pass)</option>
                        <option value="false">Unassigned (Fail)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Canary Pathways</label>
                      <select
                        value={overrideCanary}
                        onChange={(e) => setOverrideCanary(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="true">Enforced (Pass)</option>
                        <option value="false">Disabled (Fail)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Force Decision</label>
                      <select
                        value={overrideDecision}
                        onChange={(e) => setOverrideDecision(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="">Default (Automated)</option>
                        <option value="APPROVE_EXECUTION_READINESS_NOT_EXECUTED">Force Approve</option>
                        <option value="REJECT_EXECUTION_READINESS">Force Reject</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Checks */}
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Verification Checks ({checks.length})</h3>
                {checks.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>No verification checks loaded.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {checks.map((c) => (
                      <div key={c.check_id} style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>
                            {c.check_type}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: c.severity === 'CRITICAL' ? '#ef4444' : c.severity === 'WARNING' ? '#f59e0b' : '#3b82f6'
                          }}>{c.severity}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', color: '#334155' }}>{c.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Evidence Pack */}
              {evidence && (
                <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Evidence Package (v145.0)</h3>
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
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>No audits registered yet.</p>
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
              Select a readiness package or enter a finalized Phase 144 approval ID to start checking metrics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
