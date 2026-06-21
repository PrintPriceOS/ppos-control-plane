import React, { useState, useEffect, useCallback } from 'react';
import { runtimeActivityReviewClient } from '../../api/controlledBetaRuntimeActivityReviewClient';
import {
  RuntimeActivityReview,
  RuntimeActivityReviewDecision,
  RuntimeActivityReviewFinding,
  RuntimeActivityReviewEvidence
} from '../../types/controlledBetaRuntimeActivityReview';

export function ControlledBetaRuntimeActivityReview() {
  const [reviews, setReviews] = useState<RuntimeActivityReview[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState<string>('');
  const [selectedReview, setSelectedReview] = useState<RuntimeActivityReview | null>(null);
  const [decision, setDecision] = useState<RuntimeActivityReviewDecision | null>(null);
  const [findings, setFindings] = useState<RuntimeActivityReviewFinding[]>([]);
  const [evidencePack, setEvidencePack] = useState<RuntimeActivityReviewEvidence | null>(null);

  // Form states for creation
  const [tenantId, setTenantId] = useState('tenant_beta_01');
  const [cohortId, setCohortId] = useState('cohort_beta_01');
  const [windowStart, setWindowStart] = useState(new Date(Date.now() - 86400000 * 7).toISOString().substring(0, 16));
  const [windowEnd, setWindowEnd] = useState(new Date().toISOString().substring(0, 16));

  // Supersede reason
  const [supersedeReason, setSupersedeReason] = useState('');
  const [targetSupersedeId, setTargetSupersedeId] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchReviewsList = useCallback(async () => {
    try {
      const res = await runtimeActivityReviewClient.listReviews();
      if (res.ok) {
        setReviews(res.reviews);
      }
    } catch (err: any) {
      console.error('Error fetching reviews:', err);
    }
  }, []);

  const loadReviewDetails = useCallback(async (reviewId: string) => {
    if (!reviewId) return;
    setLoading(true);
    try {
      const res = await runtimeActivityReviewClient.getReview(reviewId);
      if (res.ok) {
        setSelectedReview(res.review);
        setDecision(res.decision || null);
        setFindings(res.findings);

        // Fetch evidence pack if review is finalized
        if (res.review.review_status === 'FINALIZED') {
          const evRes = await runtimeActivityReviewClient.getEvidencePack(reviewId);
          if (evRes.ok) {
            setEvidencePack(evRes.evidencePack);
          } else {
            setEvidencePack(null);
          }
        } else {
          setEvidencePack(null);
        }
      }
    } catch (err: any) {
      console.error('Error loading review details:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateReview = async () => {
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await runtimeActivityReviewClient.createReview({
        tenantId,
        cohortId,
        windowStart: new Date(windowStart).toISOString(),
        windowEnd: new Date(windowEnd).toISOString()
      });
      if (res.ok) {
        setMessage(`Review created successfully: ${res.review.review_id}`);
        setSelectedReviewId(res.review.review_id);
        await fetchReviewsList();
        await loadReviewDetails(res.review.review_id);
      } else {
        setErrorMsg('Failed to create review');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluate = async () => {
    if (!selectedReviewId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await runtimeActivityReviewClient.evaluateReview(selectedReviewId);
      if (res.ok) {
        setMessage('Review evaluation completed.');
        await loadReviewDetails(selectedReviewId);
      } else {
        setErrorMsg('Evaluation failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedReviewId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await runtimeActivityReviewClient.finalizeReview(selectedReviewId);
      if (res.ok) {
        setMessage('Review finalized and locked.');
        await loadReviewDetails(selectedReviewId);
      } else {
        setErrorMsg('Finalization failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSupersede = async () => {
    if (!selectedReviewId || !targetSupersedeId) return;
    if (!supersedeReason.trim()) {
      setErrorMsg('Supersede reason is exigent and required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await runtimeActivityReviewClient.supersedeReview(selectedReviewId, {
        supersededByReviewId: targetSupersedeId,
        reason: supersedeReason
      });
      if (res.ok) {
        setMessage(`Review ${selectedReviewId} marked as superseded.`);
        setSupersedeReason('');
        setTargetSupersedeId('');
        await loadReviewDetails(selectedReviewId);
      } else {
        setErrorMsg('Supersede call failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviewsList();
  }, [fetchReviewsList]);

  useEffect(() => {
    if (selectedReviewId) {
      loadReviewDetails(selectedReviewId);
    }
  }, [selectedReviewId, loadReviewDetails]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: 'Inter, sans-serif', color: '#1f2937' }}>
      {/* Warning Header */}
      <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700 }}>⚠️ Cohort Health Review Gate</h3>
        <p style={{ margin: 0, fontSize: 14 }}>
          This review does not automatically change cohort access, participant access, marketplace scope, payment execution, provider submission, tax/accounting submission, or enforcement behavior.
        </p>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Runtime Activity Review & Recommendation Gate (Phase 137)</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        {/* Left pane: Review selector and creation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Snapshot a New Review</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600 }}>Tenant ID</label>
                <input value={tenantId} onChange={e => setTenantId(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600 }}>Cohort ID</label>
                <input value={cohortId} onChange={e => setCohortId(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600 }}>Window Start</label>
                <input type="datetime-local" value={windowStart} onChange={e => setWindowStart(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600 }}>Window End</label>
                <input type="datetime-local" value={windowEnd} onChange={e => setWindowEnd(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
              </div>
            </div>
            <button onClick={handleCreateReview} disabled={loading} style={{ width: '100%', padding: 10, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
              Create Snapshot Review
            </button>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Select Cohort Review</h2>
            <select value={selectedReviewId} onChange={e => setSelectedReviewId(e.target.value)} style={{ width: '100%', padding: 10, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff' }}>
              <option value="">-- Choose Review --</option>
              {reviews.map(r => (
                <option key={r.review_id} value={r.review_id}>
                  {r.review_id} ({r.cohort_id}) - {r.review_status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right pane: Details and Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {selectedReview ? (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Review Details: {selectedReview.review_id}</h2>
                <span style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  background: selectedReview.review_status === 'FINALIZED' ? '#d1fae5' : '#f3f4f6',
                  color: selectedReview.review_status === 'FINALIZED' ? '#065f46' : '#374151'
                }}>{selectedReview.review_status}</span>
              </div>

              {/* Status and Action Buttons */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <button onClick={handleEvaluate} disabled={loading || selectedReview.review_status === 'FINALIZED'} style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  Evaluate Health
                </button>
                <button onClick={handleFinalize} disabled={loading || selectedReview.review_status === 'FINALIZED'} style={{ padding: '8px 16px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  Finalize & Lock Review
                </button>
              </div>

              {/* Recommendations Card */}
              {decision && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f9fafb', marginBottom: 24 }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: 16, fontWeight: 700, color: '#111827' }}>Decision Recommendation</h3>
                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    Recommendation: <strong style={{ color: '#2563eb' }}>{decision.recommended_decision}</strong>
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    Execution Status: <strong>{decision.decision_execution_status}</strong>
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    Reason: <em>{decision.execution_blocked_reason}</em>
                  </div>
                </div>
              )}

              {/* Non-Mutation Attestation Display */}
              <div style={{ border: '1px solid #d1fae5', borderRadius: 8, padding: 16, background: '#ecfdf5', marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 700, color: '#065f46' }}>🛡️ Safety Attestation Proof</h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#065f46', lineHeight: '1.6' }}>
                  <li>Cohort access state mutated: <strong>{String(selectedReview.non_mutation_attestation_json.cohort_access_mutated)}</strong></li>
                  <li>Participant runtime bound mutated: <strong>{String(selectedReview.non_mutation_attestation_json.participant_access_mutated)}</strong></li>
                  <li>External provider payment mutation: <strong>{String(selectedReview.non_mutation_attestation_json.payment_execution_triggered)}</strong></li>
                  <li>External provider submission mutation: <strong>{String(selectedReview.non_mutation_attestation_json.provider_submission_triggered)}</strong></li>
                </ul>
              </div>

              {/* Findings */}
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Generated Findings ({findings.length})</h3>
              {findings.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 24 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                      <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Finding Key</th>
                      <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map(f => (
                      <tr key={f.finding_id}>
                        <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>{f.finding_key}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: f.severity === 'HIGH' || f.severity === 'CRITICAL' ? '#fee2e2' : '#fef3c7',
                            color: f.severity === 'HIGH' || f.severity === 'CRITICAL' ? '#991b1b' : '#92400e'
                          }}>{f.severity}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>No findings generated for this review window.</p>
              )}

              {/* Evidence Pack */}
              {evidencePack && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Lock Evidence Pack (v{evidencePack.evidence_schema_version})</h3>
                  <div style={{ fontSize: 12, background: '#f9fafb', padding: 12, borderRadius: 6, maxHeight: 150, overflowY: 'auto' }}>
                    <div>Snapshot Hash: <code>{evidencePack.input_snapshot_hash}</code></div>
                    <div>Evaluation Hash: <code>{evidencePack.evaluation_result_hash}</code></div>
                    <div>Evidence Pack Hash: <code>{evidencePack.evidence_pack_hash}</code></div>
                    <pre style={{ marginTop: 10 }}>{JSON.stringify(evidencePack.evidence_data_json, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* Supersede Review */}
              {selectedReview.review_status !== 'SUPERSEDED' && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Supersede this Review</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Replacement Review ID</label>
                      <input value={targetSupersedeId} onChange={e => setTargetSupersedeId(e.target.value)} placeholder="rev_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Enforced Reason</label>
                      <input value={supersedeReason} onChange={e => setSupersedeReason(e.target.value)} placeholder="Ex: snapshots completed with newer logs" style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
                    </div>
                  </div>
                  <button onClick={handleSupersede} disabled={loading || !targetSupersedeId || !supersedeReason} style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                    Apply Supersede
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: '#f9fafb', border: '1px dotted #d1d5db', borderRadius: 8, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
              Select a review snapshot from the list or create a new review snapshot to view metrics and recommendations.
            </div>
          )}

          {/* Feedback message */}
          {(message || errorMsg) && (
            <div style={{ padding: 16, borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb' }}>
              {message && <div style={{ color: '#059669', fontSize: 14, fontWeight: 600 }}>{message}</div>}
              {errorMsg && <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>{errorMsg}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ControlledBetaRuntimeActivityReview;
