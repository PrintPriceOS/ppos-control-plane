import React, { useState, useEffect, useCallback } from 'react';
import { cohortInterventionPreparationClient } from '../../api/controlledBetaCohortInterventionPreparationClient';
import { runtimeActivityReviewClient } from '../../api/controlledBetaRuntimeActivityReviewClient';
import {
  CohortInterventionPreparation,
  CohortInterventionPreparationItem,
  CohortInterventionPreparationEvidence
} from '../../types/controlledBetaCohortInterventionPreparation';
import { RuntimeActivityReview } from '../../types/controlledBetaRuntimeActivityReview';

export function ControlledBetaCohortInterventionPreparation() {
  const [preparations, setPreparations] = useState<CohortInterventionPreparation[]>([]);
  const [selectedPrepId, setSelectedPrepId] = useState<string>('');
  const [selectedPrep, setSelectedPrep] = useState<CohortInterventionPreparation | null>(null);
  const [checklistItems, setChecklistItems] = useState<CohortInterventionPreparationItem[]>([]);
  const [evidencePack, setEvidencePack] = useState<CohortInterventionPreparationEvidence | null>(null);

  // Completed Phase 137 finalized reviews to choose from
  const [finalizedReviews, setFinalizedReviews] = useState<RuntimeActivityReview[]>([]);
  const [sourceReviewId, setSourceReviewId] = useState<string>('');

  // Rejection / Supersede / Approve Form inputs
  const [rejectReason, setRejectReason] = useState<string>('');
  const [supersedeReason, setSupersedeReason] = useState<string>('');
  const [targetSupersedeId, setTargetSupersedeId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchPrepsList = useCallback(async () => {
    try {
      const res = await cohortInterventionPreparationClient.listPreparations();
      if (res.ok) {
        setPreparations(res.preparations);
      }
    } catch (err: any) {
      console.error('Error fetching preparations:', err);
    }
  }, []);

  const fetchFinalizedReviewsList = useCallback(async () => {
    try {
      const res = await runtimeActivityReviewClient.listReviews();
      if (res.ok) {
        // filter finalized reviews
        const filtered = res.reviews.filter(r => r.review_status === 'FINALIZED');
        setFinalizedReviews(filtered);
        if (filtered.length > 0 && !sourceReviewId) {
          setSourceReviewId(filtered[0].review_id);
        }
      }
    } catch (err: any) {
      console.error('Error fetching reviews:', err);
    }
  }, [sourceReviewId]);

  const loadPrepDetails = useCallback(async (prepId: string) => {
    if (!prepId) return;
    setLoading(true);
    try {
      const res = await cohortInterventionPreparationClient.getPreparation(prepId);
      if (res.ok) {
        setSelectedPrep(res.preparation);
        setChecklistItems(res.items);

        if (res.preparation.preparation_status === 'FINALIZED') {
          const evRes = await cohortInterventionPreparationClient.getEvidencePack(prepId);
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
      console.error('Error loading preparation details:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreatePrep = async () => {
    if (!sourceReviewId) {
      setErrorMsg('A finalized source review is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionPreparationClient.createPreparationFromReview(sourceReviewId);
      if (res.ok) {
        setMessage(`Intervention preparation generated: ${res.preparation.preparation_id}`);
        setSelectedPrepId(res.preparation.preparation_id);
        await fetchPrepsList();
        await loadPrepDetails(res.preparation.preparation_id);
      } else {
        setErrorMsg('Failed to generate intervention preparation.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleItemStatus = async (itemId: string, currentStatus: string) => {
    if (!selectedPrepId) return;
    const nextStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionPreparationClient.updateItemStatus(selectedPrepId, itemId, nextStatus);
      if (res.ok) {
        setMessage('Checklist item updated.');
        await loadPrepDetails(selectedPrepId);
      } else {
        setErrorMsg('Failed to update item status');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRole = async (role: string) => {
    if (!selectedPrepId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionPreparationClient.approveRole(selectedPrepId, role);
      if (res.ok) {
        setMessage(`Role ${role} approved.`);
        await loadPrepDetails(selectedPrepId);
      } else {
        setErrorMsg('Approval failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedPrepId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionPreparationClient.finalizePreparation(selectedPrepId);
      if (res.ok) {
        setMessage('Intervention package finalized and locked.');
        await loadPrepDetails(selectedPrepId);
        await fetchPrepsList();
      } else {
        setErrorMsg('Finalization failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Finalization blocked by safety rules.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedPrepId) return;
    if (!rejectReason.trim()) {
      setErrorMsg('Rejection reason is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionPreparationClient.rejectPreparation(selectedPrepId, rejectReason);
      if (res.ok) {
        setMessage('Preparation package rejected.');
        setRejectReason('');
        await loadPrepDetails(selectedPrepId);
        await fetchPrepsList();
      } else {
        setErrorMsg('Rejection failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSupersede = async () => {
    if (!selectedPrepId || !targetSupersedeId) return;
    if (!supersedeReason.trim()) {
      setErrorMsg('Supersede reason is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionPreparationClient.supersedePreparation(selectedPrepId, targetSupersedeId, supersedeReason);
      if (res.ok) {
        setMessage(`Intervention ${selectedPrepId} marked as superseded.`);
        setSupersedeReason('');
        setTargetSupersedeId('');
        await loadPrepDetails(selectedPrepId);
        await fetchPrepsList();
      } else {
        setErrorMsg('Supersede failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrepsList();
    fetchFinalizedReviewsList();
  }, [fetchPrepsList, fetchFinalizedReviewsList]);

  useEffect(() => {
    if (selectedPrepId) {
      loadPrepDetails(selectedPrepId);
    }
  }, [selectedPrepId, loadPrepDetails]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: 'Inter, sans-serif', color: '#1f2937' }}>
      {/* WARNING BANNER */}
      <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', color: '#92400e', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700 }}>⚠️ review-only proposed action package</h3>
        <p style={{ margin: 0, fontSize: 14 }}>
          This interface is strictly for preparing governed intervention packages. No operational mutations, billing changes, participant revocations, cohort pauses, or provider submissions are executed.
        </p>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Governed Cohort Intervention Preparation Gate (Phase 138)</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        {/* Left column: Create and Select */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Prepare from Finalized Review</h2>
            {finalizedReviews.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Source Finalized Review</label>
                  <select value={sourceReviewId} onChange={e => setSourceReviewId(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff' }}>
                    {finalizedReviews.map(r => (
                      <option key={r.review_id} value={r.review_id}>
                        {r.review_id} ({r.cohort_id}) - Risk: {r.risk_level}
                      </option>
                    ))}
                  </select>
                </div>
                <button onClick={handleCreatePrep} disabled={loading} style={{ width: '100%', padding: 10, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  Build Preparation Package
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>No finalized reviews found from Phase 137. Finalize a health review first.</p>
            )}
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Select Active Preparation</h2>
            <select value={selectedPrepId} onChange={e => setSelectedPrepId(e.target.value)} style={{ width: '100%', padding: 10, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff' }}>
              <option value="">-- Choose Preparation --</option>
              {preparations.map(p => (
                <option key={p.preparation_id} value={p.preparation_id}>
                  {p.preparation_id} ({p.preparation_type}) - {p.preparation_status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right column: Details / Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {selectedPrep ? (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Preparation Details</h2>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>ID: <code>{selectedPrep.preparation_id}</code></span>
                </div>
                <span style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  background: selectedPrep.preparation_status === 'FINALIZED' ? '#d1fae5' : selectedPrep.preparation_status === 'REJECTED' ? '#fee2e2' : '#f3f4f6',
                  color: selectedPrep.preparation_status === 'FINALIZED' ? '#065f46' : selectedPrep.preparation_status === 'REJECTED' ? '#991b1b' : '#374151'
                }}>{selectedPrep.preparation_status}</span>
              </div>

              {/* Status and Action Buttons */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <button onClick={handleFinalize} disabled={loading || selectedPrep.preparation_status === 'FINALIZED' || selectedPrep.preparation_status === 'REJECTED' || selectedPrep.preparation_status === 'SUPERSEDED'} style={{ padding: '8px 16px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  Finalize & Sign Package
                </button>
              </div>

              {/* Summary Card */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f9fafb', marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: 16, fontWeight: 700, color: '#111827' }}>Intervention Summary</h3>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  Type: <strong>{selectedPrep.preparation_type}</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  Cohort ID: <strong>{selectedPrep.cohort_id}</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  Source Review: <strong>{selectedPrep.source_review_id}</strong>
                </div>
                <div style={{ fontSize: 13, color: '#4b5563' }}>
                  Summary: <em>{selectedPrep.intervention_summary_json.summary}</em>
                </div>
              </div>

              {/* Checklist Items */}
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Checklist Tasks ({checklistItems.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {checklistItems.map(item => (
                  <div key={item.item_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, border: '1px solid #f3f4f6', borderRadius: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={item.item_status === 'COMPLETED'}
                        disabled={selectedPrep.preparation_status === 'FINALIZED'}
                        onChange={() => handleToggleItemStatus(item.item_id, item.item_status)}
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                      <span style={{ fontSize: 13, textDecoration: item.item_status === 'COMPLETED' ? 'line-through' : 'none', color: item.item_status === 'COMPLETED' ? '#9ca3af' : '#1f2937' }}>
                        {item.description}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: item.item_status === 'COMPLETED' ? '#d1fae5' : '#fef3c7', color: item.item_status === 'COMPLETED' ? '#065f46' : '#92400e' }}>
                      {item.item_status}
                    </span>
                  </div>
                ))}
              </div>

              {/* Approvals Section */}
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Required Approvals</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {selectedPrep.required_approvals_json.map((app, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, border: '1px solid #f3f4f6', borderRadius: 6, background: app.approved ? '#ecfdf5' : '#ffffff' }}>
                    <div style={{ fontSize: 13 }}>
                      Role: <strong>{app.role}</strong> {app.approved && <span style={{ color: '#059669', marginLeft: 8 }}>(Approved by {app.approved_by})</span>}
                    </div>
                    {!app.approved && (
                      <button
                        onClick={() => handleApproveRole(app.role)}
                        disabled={selectedPrep.preparation_status === 'FINALIZED'}
                        style={{ padding: '4px 8px', fontSize: 11, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                      >
                        Approve Role
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Non-Execution Attestation Checkbox Status */}
              <div style={{ border: '1px solid #d1fae5', borderRadius: 8, padding: 16, background: '#ecfdf5', marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 700, color: '#065f46' }}>🛡️ Safety Attestation Proof</h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#065f46', lineHeight: '1.6' }}>
                  <li>Non-execution planning acknowledged: <strong>{String(selectedPrep.non_execution_attestation_json.non_execution_acknowledged)}</strong></li>
                  <li>Readiness-only context verified: <strong>{String(selectedPrep.non_execution_attestation_json.readiness_only_attested)}</strong></li>
                  <li>Attested by: <strong>{selectedPrep.non_execution_attestation_json.attested_by}</strong></li>
                  <li>Timestamp: <strong>{selectedPrep.non_execution_attestation_json.timestamp}</strong></li>
                </ul>
              </div>

              {/* Evidence Pack */}
              {evidencePack && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Lock Evidence Pack (v{evidencePack.evidence_schema_version})</h3>
                  <div style={{ fontSize: 12, background: '#f9fafb', padding: 12, borderRadius: 6, maxHeight: 150, overflowY: 'auto' }}>
                    <div>Input Review Hash: <code>{evidencePack.input_review_hash}</code></div>
                    <div>Preparation Result Hash: <code>{evidencePack.preparation_result_hash}</code></div>
                    <div>Evidence Pack Hash: <code>{evidencePack.evidence_pack_hash}</code></div>
                    <pre style={{ marginTop: 10 }}>{JSON.stringify(evidencePack.evidence_data_json, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* Finalization Blockers JSON */}
              {selectedPrep.finalization_blockers_json && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#fffbeb', marginBottom: 24 }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 700, color: '#b45309' }}>Blocker Verification Status</h3>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#78350f', lineHeight: '1.6' }}>
                    <li>Missing required approvals: <strong style={{ color: selectedPrep.finalization_blockers_json.missing_required_approvals ? '#dc2626' : '#059669' }}>{String(selectedPrep.finalization_blockers_json.missing_required_approvals)}</strong></li>
                    <li>Non execution attestation invalid: <strong style={{ color: selectedPrep.finalization_blockers_json.non_execution_attestation_invalid ? '#dc2626' : '#059669' }}>{String(selectedPrep.finalization_blockers_json.non_execution_attestation_invalid)}</strong></li>
                    <li>Guardrail checks failed: <strong style={{ color: selectedPrep.finalization_blockers_json.guardrail_failed ? '#dc2626' : '#059669' }}>{String(selectedPrep.finalization_blockers_json.guardrail_failed)}</strong></li>
                    <li>Source review not finalized: <strong style={{ color: selectedPrep.finalization_blockers_json.source_review_not_finalized ? '#dc2626' : '#059669' }}>{String(selectedPrep.finalization_blockers_json.source_review_not_finalized)}</strong></li>
                  </ul>
                </div>
              )}

              {/* Reject Action */}
              {selectedPrep.preparation_status !== 'REJECTED' && selectedPrep.preparation_status !== 'FINALIZED' && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20, marginBottom: 20 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Reject this Preparation</h3>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Rejection Reason</label>
                      <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason description..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
                    </div>
                    <button onClick={handleReject} disabled={loading || !rejectReason} style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                      Apply Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Supersede Action */}
              {selectedPrep.preparation_status !== 'SUPERSEDED' && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Supersede this Preparation</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Replacement Prep ID</label>
                      <input value={targetSupersedeId} onChange={e => setTargetSupersedeId(e.target.value)} placeholder="prp_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Enforced Reason</label>
                      <input value={supersedeReason} onChange={e => setSupersedeReason(e.target.value)} placeholder="Ex: new review finalized" style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
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
              Select an active preparation or create one from a finalized Phase 137 review.
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

export default ControlledBetaCohortInterventionPreparation;
