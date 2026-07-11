import React, { useState, useEffect } from 'react';
import { controlledBetaCohortInterventionSimulationReviewClient } from '../../lib/controlledBetaCohortInterventionSimulationReviewClient';
import { normalizeUiError } from '../../utils/errorUtils';
import { ReviewRecord, ReviewFinding, ReviewDecision, ReviewEvidence, ReviewAuditLog } from '../../lib/controlledBetaCohortInterventionSimulationReview';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280',
  READY_FOR_REVIEW: '#3b82f6',
  UNDER_REVIEW: '#f59e0b',
  ACCEPTED: '#10b981',
  REJECTED: '#ef4444',
  CHANGES_REQUESTED: '#f59e0b',
  ESCALATED: '#8b5cf6',
  BLOCKED: '#dc2626',
  FINALIZED: '#10b981',
  SUPERSEDED: '#9ca3af'
};

export const ControlledBetaCohortInterventionSimulationReview: React.FC = () => {
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  
  // Active review details
  const [review, setReview] = useState<ReviewRecord | null>(null);
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [evidence, setEvidence] = useState<ReviewEvidence | null>(null);
  const [auditLogs, setAuditLogs] = useState<ReviewAuditLog[]>([]);

  // Input states
  const [simulationIdInput, setSimulationIdInput] = useState('');
  const [rationale, setRationale] = useState('');
  const [decisionType, setDecisionType] = useState('ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL');
  
  // Custom manual overrides for testing evaluator decision paths directly in the UI!
  const [overrideImpact, setOverrideImpact] = useState('');
  const [overrideRollback, setOverrideRollback] = useState('');
  const [overrideGuardrail, setOverrideGuardrail] = useState('PASS');
  const [overrideWriteScope, setOverrideWriteScope] = useState('PASS');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await controlledBetaCohortInterventionSimulationReviewClient.getReviews();
      setReviews(data);
      addLog('Fetched simulation review list');
    } catch (e: any) {
      setError(normalizeUiError(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const loadActiveReview = async (reviewId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await controlledBetaCohortInterventionSimulationReviewClient.getReview(reviewId);
      setReview(data.review);
      setFindings(data.findings);
      setDecision(data.decision);
      setEvidence(data.evidence);
      setAuditLogs(data.auditLogs);
      setActiveReviewId(reviewId);
      addLog(`Loaded review details for ${reviewId}`);
    } catch (e: any) {
      setError(normalizeUiError(e));
    }
    setLoading(false);
  };

  const createReview = async () => {
    if (!simulationIdInput.trim()) {
      setError('Simulation ID is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const newReview = await controlledBetaCohortInterventionSimulationReviewClient.createReview(simulationIdInput.trim());
      addLog(`Created review ${newReview.review_id} from simulation ${simulationIdInput}`);
      setSimulationIdInput('');
      await loadReviews();
      await loadActiveReview(newReview.review_id);
    } catch (e: any) {
      setError(normalizeUiError(e));
    }
    setLoading(false);
  };

  const evaluateReview = async () => {
    if (!review) return;
    setLoading(true);
    setError(null);
    try {
      const overrides: any = {};
      if (overrideImpact.trim()) overrides.projected_impact_score = parseFloat(overrideImpact);
      if (overrideRollback.trim()) overrides.rollback_feasibility_score = parseFloat(overrideRollback);
      if (overrideGuardrail) overrides.guardrail_status = overrideGuardrail;
      if (overrideWriteScope) overrides.write_scope_status = overrideWriteScope;

      const data = await controlledBetaCohortInterventionSimulationReviewClient.evaluateReview(review.review_id, overrides);
      addLog(`Evaluated review ${review.review_id}`);
      await loadActiveReview(review.review_id);
      await loadReviews();
    } catch (e: any) {
      setError(normalizeUiError(e));
    }
    setLoading(false);
  };

  const recordDecision = async () => {
    if (!review) return;
    if (!rationale.trim()) {
      setError('Decision rationale is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionSimulationReviewClient.recordDecision(review.review_id, decisionType, rationale.trim());
      addLog(`Decision '${decisionType}' recorded for review ${review.review_id}`);
      setRationale('');
      await loadActiveReview(review.review_id);
      await loadReviews();
    } catch (e: any) {
      setError(normalizeUiError(e));
    }
    setLoading(false);
  };

  const finalizeReview = async () => {
    if (!review) return;
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionSimulationReviewClient.finalizeReview(review.review_id);
      addLog(`Finalized review ${review.review_id} and generated Evidence Pack v142.0`);
      await loadActiveReview(review.review_id);
      await loadReviews();
    } catch (e: any) {
      setError(normalizeUiError(e));
    }
    setLoading(false);
  };

  const runWorkflowAction = async (action: 'resimulate' | 'escalate' | 'block' | 'reject' | 'supersede') => {
    if (!review) return;
    if (!rationale.trim()) {
      setError(`Rationale/reason is required for this action`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (action === 'resimulate') {
        await controlledBetaCohortInterventionSimulationReviewClient.requestResimulation(review.review_id, rationale.trim());
      } else if (action === 'escalate') {
        await controlledBetaCohortInterventionSimulationReviewClient.escalateReview(review.review_id, rationale.trim());
      } else if (action === 'block') {
        await controlledBetaCohortInterventionSimulationReviewClient.blockReview(review.review_id, rationale.trim());
      } else if (action === 'reject') {
        await controlledBetaCohortInterventionSimulationReviewClient.rejectReview(review.review_id, rationale.trim());
      } else if (action === 'supersede') {
        await controlledBetaCohortInterventionSimulationReviewClient.supersedeReview(review.review_id, rationale.trim());
      }
      addLog(`Completed action '${action}' for review ${review.review_id}`);
      setRationale('');
      await loadActiveReview(review.review_id);
      await loadReviews();
    } catch (e: any) {
      setError(normalizeUiError(e));
    }
    setLoading(false);
  };

  return (
    <div id="phase142-review-dashboard" className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 p-8 font-sans transition-colors duration-200">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-5 mb-2">
          <span className="text-4xl">⚖️</span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Phase 142 — Simulation Review Gate
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Governed Review Layer for High-Risk Cohort Intervention Simulations
            </p>
          </div>
        </div>

        {/* Safety / Non-Execution Warning Banner */}
        <div className="mt-5 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 flex items-start gap-4">
          <span className="text-2xl flex-shrink-0">🛡️</span>
          <div>
            <div className="font-extrabold text-red-800 dark:text-red-300 text-xs mb-1 uppercase tracking-wider">
              Review-Only Governance — Non-Execution Boundary
            </div>
            <div className="text-red-700 dark:text-red-400 text-xs leading-relaxed">
              This review does not execute high-risk intervention. Cohort pause, participant access restriction, invite revocation, controlled expansion, marketplace scope, payment execution, provider submission, tax/accounting submission, and enforcement behavior remain unchanged.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '2rem', alignItems: 'start' }}>
        {/* Left Side: Create & List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Create From Simulation Card */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)', backdropFilter: 'blur(12px)', borderRadius: '1rem',
            padding: '1.5rem', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 30px rgba(0,0,0,0.2)'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#cbd5e1' }}>
              Create Review from Simulation
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={simulationIdInput}
                onChange={e => setSimulationIdInput(e.target.value)}
                placeholder="sim_..."
                style={{
                  flex: 1, padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                  color: '#f1f5f9', fontSize: '0.85rem', outline: 'none'
                }}
              />
              <button
                onClick={createReview}
                disabled={loading}
                style={{
                  padding: '0.6rem 1rem', borderRadius: '0.5rem', background: '#3b82f6',
                  color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                }}
              >
                Create
              </button>
            </div>
          </div>

          {/* List Card */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)', backdropFilter: 'blur(12px)', borderRadius: '1rem',
            padding: '1.5rem', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '600px', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#cbd5e1', margin: 0 }}>
                Active Review Records
              </h2>
              <button
                onClick={loadReviews}
                style={{
                  background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.8rem'
                }}
              >
                🔄 Refresh
              </button>
            </div>

            {reviews.length === 0 ? (
              <div style={{ padding: '2rem 0', textContainer: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                No reviews registered.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {reviews.map(r => (
                  <div
                    key={r.review_id}
                    onClick={() => loadActiveReview(r.review_id)}
                    style={{
                      padding: '1rem', borderRadius: '0.75rem',
                      background: activeReviewId === r.review_id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${activeReviewId === r.review_id ? '#3b82f6' : 'rgba(255,255,255,0.06)'}`,
                      cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f1f5f9' }}>{r.review_id}</span>
                      <span style={{
                        fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '0.25rem',
                        fontWeight: 600, background: STATUS_COLORS[r.review_status], color: '#fff'
                      }}>{r.review_status}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Cohort: {r.cohort_id}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                      Type: {r.simulation_type.replace('SIMULATE_', '')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Active Review Details */}
        <div>
          {error && (
            <div style={{
              padding: '1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444',
              borderRadius: '0.5rem', color: '#fca5a5', marginBottom: '1rem', fontSize: '0.85rem'
            }}>
              ⚠️ Error: {normalizeUiError(error)}
            </div>
          )}

          {!review ? (
            <div style={{
              background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.06)',
              borderRadius: '1rem', height: '400px', display: 'flex', flexDirection: 'column',
              justifyContent: 'center', alignItems: 'center', color: '#64748b'
            }}>
              <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚖️</span>
              <div><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', padding: 24, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>No high-risk intervention simulations are available for review.</div>
              <div style={{ fontSize: 13, color: '#4b5563' }}>Required parent: Phase 141 High-Risk Intervention Simulation.</div>
              <div style={{ fontSize: 13, color: '#4b5563' }}>Required state: FINALIZED simulation result.</div>
              <div style={{ fontSize: 13, color: '#059669', marginTop: 12 }}>Next action: create a Phase 141 simulation before opening a simulation review.</div>
            </div></div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Review Main Metadata */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.3)', borderRadius: '1rem',
                padding: '1.5rem', border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignment: 'center', marginBottom: '1.25rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#f1f5f9' }}>Review {review.review_id}</h3>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Sourced from Simulation: {review.source_simulation_id}</span>
                  </div>
                  <span style={{
                    fontSize: '0.85rem', padding: '0.3rem 0.75rem', borderRadius: '0.5rem',
                    fontWeight: 700, background: STATUS_COLORS[review.review_status], color: '#fff'
                  }}>
                    {review.review_status}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>TENANT ID</div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{review.tenant_id}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>COHORT ID</div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{review.cohort_id}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>RISK LEVEL</div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: review.risk_level === 'HIGH' ? '#ef4444' : '#10b981' }}>{review.risk_level}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>CONFIDENCE LEVEL</div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{review.confidence_level}</div>
                  </div>
                </div>
              </div>

              {/* Evaluation Metrics, Guardrail & Write Scope Panels */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Metrics Card */}
                <div style={{
                  background: 'rgba(30, 41, 59, 0.3)', borderRadius: '1rem',
                  padding: '1.5rem', border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#cbd5e1' }}>Evaluation Outcomes</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                        <span>Projected Impact Score</span>
                        <span style={{ fontWeight: 700 }}>{review.projected_impact_score ?? 'N/A'}/100</span>
                      </div>
                      <div style={{ height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${review.projected_impact_score ?? 0}%`, height: '100%', background: '#ef4444' }} />
                      </div>
                    </div>
                    
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                        <span>Rollback Feasibility Score</span>
                        <span style={{ fontWeight: 700 }}>{review.rollback_feasibility_score ?? 'N/A'}/100</span>
                      </div>
                      <div style={{ height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${review.rollback_feasibility_score ?? 0}%`, height: '100%', background: '#10b981' }} />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                        <span>Evidence Completeness Score</span>
                        <span style={{ fontWeight: 700 }}>{review.evidence_completeness_score ?? 'N/A'}/100</span>
                      </div>
                      <div style={{ height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${review.evidence_completeness_score ?? 0}%`, height: '100%', background: '#3b82f6' }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Guardrails and Attestation Card */}
                <div style={{
                  background: 'rgba(30, 41, 59, 0.3)', borderRadius: '1rem',
                  padding: '1.5rem', border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#cbd5e1' }}>Safety Guardrails</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', padding: '0.6rem',
                      background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem'
                    }}>
                      <span style={{ fontSize: '0.85rem' }}>Forbidden Mutation Scan</span>
                      <span style={{ fontWeight: 700, color: review.guardrail_status === 'PASS' ? '#10b981' : '#ef4444' }}>
                        {review.guardrail_status}
                      </span>
                    </div>

                    <div style={{
                      display: 'flex', justifyContent: 'space-between', padding: '0.6rem',
                      background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem'
                    }}>
                      <span style={{ fontSize: '0.85rem' }}>Write Scope Validation</span>
                      <span style={{ fontWeight: 700, color: review.write_scope_status === 'PASS' ? '#10b981' : '#ef4444' }}>
                        {review.write_scope_status}
                      </span>
                    </div>

                    <div style={{
                      display: 'flex', justifyContent: 'space-between', padding: '0.6rem',
                      background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem'
                    }}>
                      <span style={{ fontSize: '0.85rem' }}>Suggested Decision</span>
                      <span style={{ fontWeight: 700, color: '#60a5fa' }}>
                        {review.review_summary_json?.suggested_decision || 'NEEDS_EVALUATION'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Findings Panel */}
              {findings.length > 0 && (
                <div style={{
                  background: 'rgba(30, 41, 59, 0.3)', borderRadius: '1rem',
                  padding: '1.5rem', border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#cbd5e1' }}>Evaluation Findings</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {findings.map(f => (
                      <div key={f.finding_id} style={{
                        padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.02)',
                        borderLeft: `3px solid ${f.severity === 'CRITICAL' || f.severity === 'ERROR' ? '#ef4444' : '#f59e0b'}`,
                        fontSize: '0.85rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: '0.2rem' }}>
                          <span>{f.finding_type}</span>
                          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{f.severity}</span>
                        </div>
                        <div style={{ color: '#94a3b8' }}>{f.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action: Evaluate & Decision Board */}
              {review.review_status !== 'FINALIZED' && review.review_status !== 'SUPERSEDED' && (
                <div style={{
                  background: 'rgba(30, 41, 59, 0.4)', borderRadius: '1rem',
                  padding: '1.5rem', border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <h4 style={{ margin: '0 0 1.25rem 0', color: '#cbd5e1' }}>Review Decisions Panel</h4>
                  
                  {/* Step 1: Run Evaluator */}
                  <div style={{ marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <h5 style={{ margin: '0 0 0.5rem 0', color: '#94a3b8' }}>1. Evaluate Simulation</h5>
                    
                    {/* Evaluator Overrides for Testing */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                      <input
                        value={overrideImpact}
                        onChange={e => setOverrideImpact(e.target.value)}
                        placeholder="Impact Score (1-100)"
                        style={{
                          width: '140px', padding: '0.4rem 0.5rem', borderRadius: '0.25rem',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff', fontSize: '0.75rem'
                        }}
                      />
                      <input
                        value={overrideRollback}
                        onChange={e => setOverrideRollback(e.target.value)}
                        placeholder="Rollback Score (1-100)"
                        style={{
                          width: '140px', padding: '0.4rem 0.5rem', borderRadius: '0.25rem',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff', fontSize: '0.75rem'
                        }}
                      />
                      <select
                        value={overrideGuardrail}
                        onChange={e => setOverrideGuardrail(e.target.value)}
                        style={{
                          padding: '0.4rem 0.5rem', borderRadius: '0.25rem',
                          background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff', fontSize: '0.75rem'
                        }}
                      >
                        <option value="PASS">Guardrails: PASS</option>
                        <option value="FAIL">Guardrails: FAIL</option>
                      </select>
                      <select
                        value={overrideWriteScope}
                        onChange={e => setOverrideWriteScope(e.target.value)}
                        style={{
                          padding: '0.4rem 0.5rem', borderRadius: '0.25rem',
                          background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff', fontSize: '0.75rem'
                        }}
                      >
                        <option value="PASS">Write Scope: PASS</option>
                        <option value="FAIL">Write Scope: FAIL</option>
                      </select>
                    </div>

                    <button
                      onClick={evaluateReview}
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem', borderRadius: '0.375rem', background: '#2563eb',
                        color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer'
                      }}
                    >
                      {loading ? 'Evaluating...' : 'Run Evaluator'}
                    </button>
                  </div>

                  {/* Step 2: Record Decision */}
                  <div style={{ marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <h5 style={{ margin: '0 0 0.5rem 0', color: '#94a3b8' }}>2. Record Review Decision</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>DECISION TYPE</label>
                        <select
                          value={decisionType}
                          onChange={e => setDecisionType(e.target.value)}
                          style={{
                            width: '100%', padding: '0.5rem', borderRadius: '0.375rem',
                            background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
                            color: '#fff', fontSize: '0.85rem'
                          }}
                        >
                          <option value="ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL">ACCEPT_SIMULATION_FOR_FUTURE_APPROVAL</option>
                          <option value="REJECT_SIMULATION_OUTCOME">REJECT_SIMULATION_OUTCOME</option>
                          <option value="REQUEST_RE_SIMULATION">REQUEST_RE_SIMULATION</option>
                          <option value="REQUIRE_ADDITIONAL_IMPACT_ANALYSIS">REQUIRE_ADDITIONAL_IMPACT_ANALYSIS</option>
                          <option value="REQUIRE_ROLLBACK_REVIEW">REQUIRE_ROLLBACK_REVIEW</option>
                          <option value="ESCALATE_TO_GOVERNANCE_OWNER">ESCALATE_TO_GOVERNANCE_OWNER</option>
                          <option value="BLOCK_HIGH_RISK_EXECUTION_PATH">BLOCK_HIGH_RISK_EXECUTION_PATH</option>
                        </select>
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>DECISION RATIONALE / REASON</label>
                        <textarea
                          value={rationale}
                          onChange={e => setRationale(e.target.value)}
                          placeholder="Provide detailed rationale or reason..."
                          rows={3}
                          style={{
                            width: '100%', padding: '0.5rem', borderRadius: '0.375rem',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                            color: '#fff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={recordDecision}
                        disabled={loading}
                        style={{
                          padding: '0.5rem 1rem', borderRadius: '0.375rem', background: '#10b981',
                          color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer'
                        }}
                      >
                        Record Decision
                      </button>

                      {/* Direct Workflow Buttons */}
                      <button onClick={() => runWorkflowAction('resimulate')} style={{ padding: '0.5rem 0.8rem', borderRadius: '0.375rem', background: '#f59e0b', color: '#fff', border: 'none', fontSize: '0.75rem', cursor: 'pointer' }}>Req Re-Sim</button>
                      <button onClick={() => runWorkflowAction('escalate')} style={{ padding: '0.5rem 0.8rem', borderRadius: '0.375rem', background: '#8b5cf6', color: '#fff', border: 'none', fontSize: '0.75rem', cursor: 'pointer' }}>Escalate</button>
                      <button onClick={() => runWorkflowAction('block')} style={{ padding: '0.5rem 0.8rem', borderRadius: '0.375rem', background: '#dc2626', color: '#fff', border: 'none', fontSize: '0.75rem', cursor: 'pointer' }}>Block Path</button>
                      <button onClick={() => runWorkflowAction('reject')} style={{ padding: '0.5rem 0.8rem', borderRadius: '0.375rem', background: '#ef4444', color: '#fff', border: 'none', fontSize: '0.75rem', cursor: 'pointer' }}>Reject</button>
                      <button onClick={() => runWorkflowAction('supersede')} style={{ padding: '0.5rem 0.8rem', borderRadius: '0.375rem', background: '#6b7280', color: '#fff', border: 'none', fontSize: '0.75rem', cursor: 'pointer' }}>Supersede</button>
                    </div>
                  </div>

                  {/* Step 3: Finalize */}
                  <div>
                    <h5 style={{ margin: '0 0 0.5rem 0', color: '#94a3b8' }}>3. Finalize and Lock Review</h5>
                    <button
                      onClick={finalizeReview}
                      disabled={loading || !review.review_decision}
                      style={{
                        padding: '0.6rem 1.25rem', borderRadius: '0.375rem', background: '#8b5cf6',
                        color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                        opacity: review.review_decision ? 1 : 0.5
                      }}
                    >
                      Finalize Review & Generate Evidence Pack
                    </button>
                  </div>

                </div>
              )}

              {/* Non-Execution Attestation Panel */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.3)', borderRadius: '1rem',
                padding: '1.5rem', border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <h4 style={{ margin: '0 0 1rem 0', color: '#cbd5e1' }}>Non-Execution Attestation (Safety Checks)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
                  {Object.entries(review.non_execution_attestation_json || {}).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem', background: 'rgba(255,255,255,0.01)', borderRadius: '0.25rem' }}>
                      <span style={{ color: '#94a3b8' }}>{key.replace(/_/g, ' ')}</span>
                      <span style={{ fontWeight: 700, color: val === false ? '#10b981' : '#ef4444' }}>
                        {val === false ? 'FALSE (PASS)' : 'TRUE (FAIL)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hash Tracing */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.3)', borderRadius: '1rem',
                padding: '1.5rem', border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <h4 style={{ margin: '0 0 1rem 0', color: '#cbd5e1' }}>Lineage Trace & Hashes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>SOURCE SIMULATION HASH: </span>
                    <span style={{ color: '#f1f5f9' }}>{review.source_simulation_hash}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>SOURCE SIMULATION EVIDENCE PACK HASH: </span>
                    <span style={{ color: '#f1f5f9' }}>{review.source_simulation_evidence_pack_hash}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>SOURCE EXECUTION EVIDENCE PACK HASH: </span>
                    <span style={{ color: '#f1f5f9' }}>{review.source_execution_evidence_pack_hash}</span>
                  </div>
                  {review.review_result_hash && (
                    <div>
                      <span style={{ color: '#64748b' }}>REVIEW RESULT HASH: </span>
                      <span style={{ color: '#f1f5f9' }}>{review.review_result_hash}</span>
                    </div>
                  )}
                  {review.evidence_pack_hash && (
                    <div>
                      <span style={{ color: '#64748b' }}>EVIDENCE PACK HASH (v142.0): </span>
                      <span style={{ color: '#f1f5f9' }}>{review.evidence_pack_hash}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Audit Timeline */}
              {auditLogs.length > 0 && (
                <div style={{
                  background: 'rgba(30, 41, 59, 0.3)', borderRadius: '1rem',
                  padding: '1.5rem', border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#cbd5e1' }}>Governance Audit History</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {auditLogs.map(log => (
                      <div key={log.audit_event_id} style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                        <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>
                          {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, color: '#f1f5f9' }}>
                            {log.event_type} <span style={{ fontWeight: 400, color: '#94a3b8' }}>by {log.actor_id}</span>
                          </div>
                          {log.details_json && Object.keys(log.details_json).length > 0 && (
                            <pre style={{
                              margin: '0.25rem 0 0 0', padding: '0.4rem', borderRadius: '0.25rem',
                              background: 'rgba(0,0,0,0.15)', fontSize: '0.7rem', color: '#94a3b8',
                              whiteSpace: 'pre-wrap'
                            }}>
                              {JSON.stringify(log.details_json, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
      
      {/* Console logs footer */}
      {log.length > 0 && (
        <div style={{
          marginTop: '2rem', background: '#0a0d16', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '0.75rem', padding: '1rem', maxHeight: '150px', overflowY: 'auto'
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#64748b' }}>LOGSOLE COMMAND OUTPUT</div>
          {log.map((line, idx) => (
            <div key={idx} style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#10b981', lineHeight: '1.4' }}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
};
