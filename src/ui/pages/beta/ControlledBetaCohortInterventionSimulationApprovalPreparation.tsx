import React, { useState, useEffect } from 'react';
import { controlledBetaCohortInterventionSimulationApprovalPreparationClient } from '../../lib/controlledBetaCohortInterventionSimulationApprovalPreparationClient';
import { PrepRecord, PrepFinding, PrepEvidence, PrepAuditLog } from '../../lib/controlledBetaCohortInterventionSimulationApprovalPreparation';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280',
  READY_FOR_EVALUATION: '#3b82f6',
  EVALUATED: '#10b981',
  READY_FOR_FINALIZATION: '#3b82f6',
  FINALIZED: '#10b981',
  RE_SIMULATION_REQUESTED: '#f59e0b',
  ESCALATED: '#8b5cf6',
  REJECTED: '#ef4444',
  SUPERSEDED: '#9ca3af'
};

export const ControlledBetaCohortInterventionSimulationApprovalPreparation: React.FC = () => {
  const [preps, setPreps] = useState<PrepRecord[]>([]);
  const [activePrepId, setActivePrepId] = useState<string | null>(null);

  // Active prep details
  const [prep, setPrep] = useState<PrepRecord | null>(null);
  const [findings, setFindings] = useState<PrepFinding[]>([]);
  const [evidence, setEvidence] = useState<PrepEvidence | null>(null);
  const [auditLogs, setAuditLogs] = useState<PrepAuditLog[]>([]);

  // Input states
  const [reviewIdInput, setReviewIdInput] = useState('');
  const [actionReason, setActionReason] = useState('');

  // Evaluator overrides
  const [overrideOutcome, setOverrideOutcome] = useState('');
  const [overrideImpact, setOverrideImpact] = useState('');
  const [overrideRollback, setOverrideRollback] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const loadPreps = async () => {
    setLoading(true);
    try {
      const data = await controlledBetaCohortInterventionSimulationApprovalPreparationClient.getPreps();
      setPreps(data);
      addLog('Fetched approval preparation list');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPreps();
  }, []);

  const loadActivePrep = async (prepId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await controlledBetaCohortInterventionSimulationApprovalPreparationClient.getPrep(prepId);
      setPrep(data.prep);
      setFindings(data.findings);
      setEvidence(data.evidence);
      setAuditLogs(data.auditLogs);
      setActivePrepId(prepId);
      addLog(`Loaded details for preparation ${prepId}`);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const createPrep = async () => {
    if (!reviewIdInput.trim()) {
      setError('Review ID is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const newPrep = await controlledBetaCohortInterventionSimulationApprovalPreparationClient.createPrep(reviewIdInput.trim());
      addLog(`Created draft prep ${newPrep.prep_id} from review ${reviewIdInput}`);
      setReviewIdInput('');
      await loadPreps();
      await loadActivePrep(newPrep.prep_id);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const evaluatePrep = async () => {
    if (!prep) return;
    setLoading(true);
    setError(null);
    try {
      const overrides: any = {};
      if (overrideOutcome) overrides.prep_outcome = overrideOutcome;
      if (overrideImpact) overrides.projected_impact_score = parseFloat(overrideImpact);
      if (overrideRollback) overrides.rollback_feasibility_score = parseFloat(overrideRollback);

      await controlledBetaCohortInterventionSimulationApprovalPreparationClient.evaluatePrep(prep.prep_id, overrides);
      addLog(`Evaluated preparation ${prep.prep_id}`);
      await loadActivePrep(prep.prep_id);
      await loadPreps();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const finalizePrep = async () => {
    if (!prep) return;
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionSimulationApprovalPreparationClient.finalizePrep(prep.prep_id);
      addLog(`Finalized preparation package ${prep.prep_id} (Evidence Pack v143.0 built)`);
      await loadActivePrep(prep.prep_id);
      await loadPreps();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const requestResimulation = async () => {
    if (!prep || !actionReason.trim()) {
      setError('Reason required for re-simulation request');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionSimulationApprovalPreparationClient.requestResimulation(prep.prep_id, actionReason);
      addLog(`Re-simulation requested for prep ${prep.prep_id}`);
      setActionReason('');
      await loadActivePrep(prep.prep_id);
      await loadPreps();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const escalatePrep = async () => {
    if (!prep || !actionReason.trim()) {
      setError('Reason required for escalation');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionSimulationApprovalPreparationClient.escalatePrep(prep.prep_id, actionReason);
      addLog(`Escalated prep ${prep.prep_id} to governance owner`);
      setActionReason('');
      await loadActivePrep(prep.prep_id);
      await loadPreps();
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
            High-Risk Cohort Intervention Approval Preparation
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            Phase 143 Gate — Analytical preparation & evidence lineage verification
          </p>
        </div>
      </header>

      {/* Warning Banner */}
      <div style={{ background: '#fef3c7', borderLeft: '4px solid #d97706', padding: '16px', borderRadius: '4px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 4px 0', color: '#92400e', fontWeight: 600 }}>⚠️ WARNING: SAFE WORKFLOW BOUNDARY PRESERVED</h4>
        <p style={{ margin: 0, color: '#b45309', fontSize: '13px' }}>
          This page represents an approval preparation gate only. Finalizing a package does not grant execution capabilities, mutated states, or job scheduling of any high-risk operational action.
        </p>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px', borderRadius: '6px', marginBottom: '24px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px' }}>
        {/* Left column: List and draft creator */}
        <div>
          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Prepare Draft</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Finalized Review ID..."
                value={reviewIdInput}
                onChange={(e) => setReviewIdInput(e.target.value)}
                style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
              />
              <button
                onClick={createPrep}
                style={{ padding: '8px 12px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
              >
                Create
              </button>
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Preparation Packages</h3>
            {loading && preps.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>Loading...</p>
            ) : preps.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>No preparation packages found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {preps.map((p) => (
                  <div
                    key={p.prep_id}
                    onClick={() => loadActivePrep(p.prep_id)}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: activePrepId === p.prep_id ? '#3b82f6' : '#e2e8f0',
                      background: activePrepId === p.prep_id ? '#eff6ff' : '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{p.prep_id}</span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: STATUS_COLORS[p.prep_status] || '#cbd5e1',
                        color: '#ffffff'
                      }}>{p.prep_status}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Cohort: {p.cohort_id}</div>
                    {p.prep_outcome && (
                      <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 500, color: '#0f172a', background: '#e2e8f0', padding: '2px 4px', borderRadius: '2px', display: 'inline-block' }}>
                        {p.prep_outcome}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Prep details and controls */}
        <div>
          {prep ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Preparation Package: {prep.prep_id}</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                      Derived from Review: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{prep.source_review_id}</span>
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ padding: '6px 12px', borderRadius: '6px', background: '#f1f5f9', fontSize: '12px', fontWeight: 600 }}>
                      Safety: {prep.execution_capability_status}
                    </span>
                  </div>
                </div>

                {/* Info grids */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Simulation Type</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{prep.simulation_type}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Risk Level</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{prep.risk_level}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Confidence Level</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{prep.confidence_level}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Outcome Suggested</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6', marginTop: '2px' }}>{prep.prep_outcome || 'PENDING EVALUATION'}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Projected Impact</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                      {prep.projected_impact_score !== null ? `${prep.projected_impact_score}%` : 'N/A'}
                    </div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Rollback Feasibility</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                      {prep.rollback_feasibility_score !== null ? `${prep.rollback_feasibility_score}%` : 'N/A'}
                    </div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Evidence Completeness</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                      {prep.evidence_completeness_score !== null ? `${prep.evidence_completeness_score}%` : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Actions panel */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Workflow Controls</h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={evaluatePrep}
                      disabled={prep.prep_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Evaluate Package
                    </button>
                    <button
                      onClick={finalizePrep}
                      disabled={prep.prep_status !== 'EVALUATED'}
                      style={{ padding: '8px 16px', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Finalize & Lock Package
                    </button>
                  </div>
                </div>

                {/* Re-simulation / Escalation actions */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginTop: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Request Modifications</h4>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input
                      type="text"
                      placeholder="Reason or rationale..."
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={requestResimulation}
                      style={{ padding: '6px 12px', background: '#f59e0b', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Request Re-simulation
                    </button>
                    <button
                      onClick={escalatePrep}
                      style={{ padding: '6px 12px', background: '#8b5cf6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Escalate to Owner
                    </button>
                  </div>
                </div>

                {/* Testing overrides */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginTop: '20px', background: '#faf5ff', padding: '16px', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#6b21a8' }}>Simulation & Testing Overrides</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Suggested Outcome</label>
                      <select
                        value={overrideOutcome}
                        onChange={(e) => setOverrideOutcome(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="">Default (From Review)</option>
                        <option value="PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL">Prepare Cohort Pause</option>
                        <option value="PREPARE_HIGH_RISK_REJECTION_PACKAGE">Prepare Rejection</option>
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
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Evidence Pack (v143.0)</h3>
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
              Select a preparation package or create a new draft to view details and execute workflow transitions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
