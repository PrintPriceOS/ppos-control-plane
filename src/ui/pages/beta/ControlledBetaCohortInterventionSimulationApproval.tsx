import React, { useState, useEffect } from 'react';
import { controlledBetaCohortInterventionSimulationApprovalClient } from '../../lib/controlledBetaCohortInterventionSimulationApprovalClient';
import { ApprovalRecord, ApprovalFinding, ApprovalEvidence, ApprovalAuditLog } from '../../lib/controlledBetaCohortInterventionSimulationApproval';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280',
  READY_FOR_EVALUATION: '#3b82f6',
  EVALUATED: '#10b981',
  READY_FOR_DECISION: '#3b82f6',
  APPROVED: '#10b981',
  REJECTED: '#ef4444',
  BLOCKED: '#dc2626',
  ESCALATED: '#8b5cf6',
  SUPERSEDED: '#9ca3af',
  FINALIZED: '#10b981'
};

export const ControlledBetaCohortInterventionSimulationApproval: React.FC = () => {
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [activeApprovalId, setActiveApprovalId] = useState<string | null>(null);

  // Active approval details
  const [approval, setApproval] = useState<ApprovalRecord | null>(null);
  const [findings, setFindings] = useState<ApprovalFinding[]>([]);
  const [evidence, setEvidence] = useState<ApprovalEvidence | null>(null);
  const [auditLogs, setAuditLogs] = useState<ApprovalAuditLog[]>([]);

  // Input states
  const [prepIdInput, setPrepIdInput] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [selectedDecision, setSelectedDecision] = useState('APPROVE_HIGH_RISK_COHORT_PAUSE');

  // Evaluator overrides
  const [overrideDecision, setOverrideDecision] = useState('');
  const [overrideImpact, setOverrideImpact] = useState('');
  const [overrideRollback, setOverrideRollback] = useState('');
  const [overrideEligibility, setOverrideEligibility] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const loadApprovals = async () => {
    setLoading(true);
    try {
      const data = await controlledBetaCohortInterventionSimulationApprovalClient.getApprovals();
      setApprovals(data);
      addLog('Fetched approvals list');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadApprovals();
  }, []);

  const loadActiveApproval = async (approvalId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await controlledBetaCohortInterventionSimulationApprovalClient.getApproval(approvalId);
      setApproval(data.approval);
      setFindings(data.findings);
      setEvidence(data.evidence);
      setAuditLogs(data.auditLogs);
      setActiveApprovalId(approvalId);
      addLog(`Loaded details for approval ${approvalId}`);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const createApproval = async () => {
    if (!prepIdInput.trim()) {
      setError('Preparation ID is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const newApproval = await controlledBetaCohortInterventionSimulationApprovalClient.createApproval(prepIdInput.trim());
      addLog(`Created draft approval ${newApproval.approval_id} from prep ${prepIdInput}`);
      setPrepIdInput('');
      await loadApprovals();
      await loadActiveApproval(newApproval.approval_id);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const evaluateApproval = async () => {
    if (!approval) return;
    setLoading(true);
    setError(null);
    try {
      const overrides: any = {};
      if (overrideDecision) overrides.approval_decision = overrideDecision;
      if (overrideImpact) overrides.projected_impact_score = parseFloat(overrideImpact);
      if (overrideRollback) overrides.rollback_feasibility_score = parseFloat(overrideRollback);
      if (overrideEligibility) overrides.future_execution_eligibility_status = overrideEligibility;

      await controlledBetaCohortInterventionSimulationApprovalClient.evaluateApproval(approval.approval_id, overrides);
      addLog(`Evaluated approval package ${approval.approval_id}`);
      await loadActiveApproval(approval.approval_id);
      await loadApprovals();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const recordDecision = async () => {
    if (!approval || !decisionRationale.trim()) {
      setError('Rationale required to submit decision');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionSimulationApprovalClient.recordDecision(approval.approval_id, selectedDecision, decisionRationale.trim());
      addLog(`Decision '${selectedDecision}' recorded for approval ${approval.approval_id}`);
      setDecisionRationale('');
      await loadActiveApproval(approval.approval_id);
      await loadApprovals();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const finalizeApproval = async () => {
    if (!approval) return;
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionSimulationApprovalClient.finalizeApproval(approval.approval_id);
      addLog(`Finalized approval package ${approval.approval_id} (Evidence Pack v144.0 built)`);
      await loadActiveApproval(approval.approval_id);
      await loadApprovals();
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
            Governed Cohort Intervention Approval Gate
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            Phase 144 Gate — Governed approval/rejection and future execution eligibility
          </p>
        </div>
      </header>

      {/* Warning Banner */}
      <div style={{ background: '#fef3c7', borderLeft: '4px solid #d97706', padding: '16px', borderRadius: '4px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 4px 0', color: '#92400e', fontWeight: 600 }}>⚠️ WARNING: SAFE WORKFLOW BOUNDARY PRESERVED</h4>
        <p style={{ margin: 0, color: '#b45309', fontSize: '13px' }}>
          This page represents a governed approval gate only. Approving a simulation review does not execute any operational runtime mutations or job queues. Zero execution capability is enabled in this phase.
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
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Acknowledge Prep</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Finalized Prep ID..."
                value={prepIdInput}
                onChange={(e) => setPrepIdInput(e.target.value)}
                style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
              />
              <button
                onClick={createApproval}
                style={{ padding: '8px 12px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
              >
                Draft
              </button>
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Approval Records</h3>
            {loading && approvals.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>Loading...</p>
            ) : approvals.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>No approval records found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {approvals.map((a) => (
                  <div
                    key={a.approval_id}
                    onClick={() => loadActiveApproval(a.approval_id)}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: activeApprovalId === a.approval_id ? '#3b82f6' : '#e2e8f0',
                      background: activeApprovalId === a.approval_id ? '#eff6ff' : '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{a.approval_id}</span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: STATUS_COLORS[a.approval_status] || '#cbd5e1',
                        color: '#ffffff'
                      }}>{a.approval_status}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Prep ID: {a.source_prep_id}</div>
                    {a.approval_decision && (
                      <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 500, color: '#0f172a', background: '#e2e8f0', padding: '2px 4px', borderRadius: '2px', display: 'inline-block' }}>
                        {a.approval_decision}
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
          {approval ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Approval Record: {approval.approval_id}</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                      Derived from Prep Package: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{approval.source_prep_id}</span>
                    </p>
                  </div>
                  <span style={{ padding: '6px 12px', borderRadius: '6px', background: '#f1f5f9', fontSize: '12px', fontWeight: 600 }}>
                    Eligibility: {approval.future_execution_eligibility_status}
                  </span>
                </div>

                {/* Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Simulation Type</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{approval.simulation_type}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Risk Level</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{approval.risk_level}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Confidence Level</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{approval.confidence_level}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Approval Decision</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6', marginTop: '2px' }}>{approval.approval_decision || 'PENDING DECISION'}</div>
                  </div>
                </div>

                {/* Scores Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Projected Impact</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                      {approval.projected_impact_score !== null ? `${approval.projected_impact_score}%` : 'N/A'}
                    </div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Rollback Feasibility</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                      {approval.rollback_feasibility_score !== null ? `${approval.rollback_feasibility_score}%` : 'N/A'}
                    </div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Evidence Completeness</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                      {approval.evidence_completeness_score !== null ? `${approval.evidence_completeness_score}%` : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Submit Decision Panel */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Governed Decision</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '12px', marginBottom: '12px' }}>
                    <select
                      value={selectedDecision}
                      onChange={(e) => setSelectedDecision(e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="APPROVE_HIGH_RISK_COHORT_PAUSE">Approve Cohort Pause</option>
                      <option value="APPROVE_HIGH_RISK_PARTICIPANT_RESTRICTION">Approve Participant Restriction</option>
                      <option value="APPROVE_HIGH_RISK_INVITE_REVOCATION">Approve Invite Revocation</option>
                      <option value="APPROVE_HIGH_RISK_CONTROLLED_EXPANSION">Approve Controlled Expansion</option>
                      <option value="REJECT_HIGH_RISK_INTERVENTION">Reject Intervention</option>
                      <option value="BLOCK_HIGH_RISK_INTERVENTION">Block Intervention</option>
                      <option value="REQUEST_RE_PREPARATION">Request Re-preparation</option>
                      <option value="REQUEST_RE_SIMULATION">Request Re-simulation</option>
                      <option value="ESCALATE_TO_GOVERNANCE_OWNER">Escalate to Owner</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Rationale / justification statement..."
                      value={decisionRationale}
                      onChange={(e) => setDecisionRationale(e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                  <button
                    onClick={recordDecision}
                    disabled={approval.approval_status === 'FINALIZED'}
                    style={{ padding: '8px 16px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                  >
                    Submit Decision
                  </button>
                </div>

                {/* Workflow Controls */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginTop: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Workflow Controls</h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={evaluateApproval}
                      disabled={approval.approval_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Evaluate Package
                    </button>
                    <button
                      onClick={finalizeApproval}
                      disabled={!approval.approval_decision || approval.approval_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Finalize & Lock Approval
                    </button>
                  </div>
                </div>

                {/* Overrides Panel */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginTop: '20px', background: '#faf5ff', padding: '16px', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#6b21a8' }}>Simulation & Testing Overrides</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Override Decision</label>
                      <select
                        value={overrideDecision}
                        onChange={(e) => setOverrideDecision(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="">Default (From Review)</option>
                        <option value="APPROVE_HIGH_RISK_COHORT_PAUSE">Approve Pause</option>
                        <option value="REJECT_HIGH_RISK_INTERVENTION">Reject</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Override Impact Score</label>
                      <input
                        type="number"
                        placeholder="e.g. 45"
                        value={overrideImpact}
                        onChange={(e) => setOverrideImpact(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Override Rollback Score</label>
                      <input
                        type="number"
                        placeholder="e.g. 85"
                        value={overrideRollback}
                        onChange={(e) => setOverrideRollback(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Override Eligibility</label>
                      <select
                        value={overrideEligibility}
                        onChange={(e) => setOverrideEligibility(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="">Default</option>
                        <option value="ELIGIBLE_FOR_FUTURE_CONTROLLED_EXECUTION_GATE">Eligible</option>
                        <option value="BLOCKED_BY_APPROVAL_DECISION">Blocked</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Findings */}
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Findings ({findings.length})</h3>
                {findings.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>No findings recorded yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {findings.map((f) => (
                      <div key={f.finding_id} style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>
                            {f.finding_type}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: f.severity === 'CRITICAL' ? '#ef4444' : f.severity === 'WARNING' ? '#f59e0b' : '#3b82f6'
                          }}>{f.severity}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', color: '#334155' }}>{f.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Evidence Pack */}
              {evidence && (
                <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Evidence Pack (v144.0)</h3>
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
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>No audit logs recorded.</p>
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
              Select an approval record or enter a finalized preparation ID to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
