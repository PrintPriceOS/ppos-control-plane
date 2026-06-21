import React, { useState, useEffect, useCallback } from 'react';
import { cohortInterventionApprovalClient } from '../../api/controlledBetaCohortInterventionApprovalClient';
import { cohortInterventionPreparationClient } from '../../api/controlledBetaCohortInterventionPreparationClient';
import {
  CohortInterventionApproval,
  CohortInterventionApprovalStep,
  CohortInterventionApprovalEvidence
} from '../../types/controlledBetaCohortInterventionApproval';
import { CohortInterventionPreparation } from '../../types/controlledBetaCohortInterventionPreparation';

export function ControlledBetaCohortInterventionApproval() {
  const [approvals, setApprovals] = useState<CohortInterventionApproval[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string>('');
  const [selectedApproval, setSelectedApproval] = useState<CohortInterventionApproval | null>(null);
  const [steps, setSteps] = useState<CohortInterventionApprovalStep[]>([]);
  const [evidencePack, setEvidencePack] = useState<CohortInterventionApprovalEvidence | null>(null);

  // Finalized Phase 138 preparations to choose from
  const [finalizedPreps, setFinalizedPreps] = useState<CohortInterventionPreparation[]>([]);
  const [sourcePrepId, setSourcePrepId] = useState<string>('');

  // Form states
  const [decision, setDecision] = useState<string>('APPROVE_FOR_FUTURE_EXECUTION');
  const [rationale, setRationale] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [changesReason, setChangesReason] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('');
  const [escalateReason, setEscalateReason] = useState<string>('');
  const [supersedeReason, setSupersedeReason] = useState<string>('');
  const [targetSupersedeId, setTargetSupersedeId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchApprovalsList = useCallback(async () => {
    try {
      const res = await cohortInterventionApprovalClient.listApprovals();
      if (res.ok) {
        setApprovals(res.approvals);
      }
    } catch (err: any) {
      console.error('Error fetching approvals:', err);
    }
  }, []);

  const fetchFinalizedPrepsList = useCallback(async () => {
    try {
      const res = await cohortInterventionPreparationClient.listPreparations();
      if (res.ok) {
        const filtered = res.preparations.filter(p => p.preparation_status === 'FINALIZED');
        setFinalizedPreps(filtered);
        if (filtered.length > 0 && !sourcePrepId) {
          setSourcePrepId(filtered[0].preparation_id);
        }
      }
    } catch (err: any) {
      console.error('Error fetching preparations:', err);
    }
  }, [sourcePrepId]);

  const loadApprovalDetails = useCallback(async (approvalId: string) => {
    if (!approvalId) return;
    setLoading(true);
    try {
      const res = await cohortInterventionApprovalClient.getApproval(approvalId);
      if (res.ok) {
        setSelectedApproval(res.approval);
        setSteps(res.steps);

        if (res.approval.approval_status === 'FINALIZED') {
          const evRes = await cohortInterventionApprovalClient.getEvidencePack(approvalId);
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
      console.error('Error loading approval details:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateApproval = async () => {
    if (!sourcePrepId) {
      setErrorMsg('A finalized preparation package is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionApprovalClient.createApprovalFromPreparation(sourcePrepId);
      if (res.ok) {
        setMessage(`Approval package created: ${res.approval.approval_id}`);
        setSelectedApprovalId(res.approval.approval_id);
        await fetchApprovalsList();
        await loadApprovalDetails(res.approval.approval_id);
      } else {
        setErrorMsg('Failed to create approval package.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSignStep = async (role: string) => {
    if (!selectedApprovalId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionApprovalClient.signStep(selectedApprovalId, role);
      if (res.ok) {
        setMessage(`Signed off as role: ${role}`);
        await loadApprovalDetails(selectedApprovalId);
      } else {
        setErrorMsg('Failed to sign step');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordDecision = async () => {
    if (!selectedApprovalId) return;
    if (!rationale.trim()) {
      setErrorMsg('Decision rationale is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionApprovalClient.recordDecision(selectedApprovalId, decision, rationale);
      if (res.ok) {
        setMessage(`Decision updated: ${decision}`);
        setRationale('');
        await loadApprovalDetails(selectedApprovalId);
        await fetchApprovalsList();
      } else {
        setErrorMsg('Failed to update decision');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedApprovalId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionApprovalClient.finalizeApproval(selectedApprovalId);
      if (res.ok) {
        setMessage('Intervention approval finalized and locked.');
        await loadApprovalDetails(selectedApprovalId);
        await fetchApprovalsList();
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
    if (!selectedApprovalId) return;
    if (!rejectReason.trim()) {
      setErrorMsg('Rejection reason is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionApprovalClient.rejectApproval(selectedApprovalId, rejectReason);
      if (res.ok) {
        setMessage('Approval package rejected.');
        setRejectReason('');
        await loadApprovalDetails(selectedApprovalId);
        await fetchApprovalsList();
      } else {
        setErrorMsg('Rejection failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!selectedApprovalId) return;
    if (!changesReason.trim()) {
      setErrorMsg('Changes request rationale is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionApprovalClient.requestChanges(selectedApprovalId, changesReason);
      if (res.ok) {
        setMessage('Changes requested for preparation package.');
        setChangesReason('');
        await loadApprovalDetails(selectedApprovalId);
        await fetchApprovalsList();
      } else {
        setErrorMsg('Request changes call failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToPrep = async () => {
    if (!selectedApprovalId) return;
    if (!returnReason.trim()) {
      setErrorMsg('Return reason is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionApprovalClient.returnToPreparation(selectedApprovalId, returnReason);
      if (res.ok) {
        setMessage('Intervention package returned to preparation.');
        setReturnReason('');
        await loadApprovalDetails(selectedApprovalId);
        await fetchApprovalsList();
      } else {
        setErrorMsg('Return call failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEscalate = async () => {
    if (!selectedApprovalId) return;
    if (!escalateReason.trim()) {
      setErrorMsg('Escalation reason is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionApprovalClient.escalateApproval(selectedApprovalId, escalateReason);
      if (res.ok) {
        setMessage('Intervention package escalated.');
        setEscalateReason('');
        await loadApprovalDetails(selectedApprovalId);
        await fetchApprovalsList();
      } else {
        setErrorMsg('Escalation failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSupersede = async () => {
    if (!selectedApprovalId || !targetSupersedeId) return;
    if (!supersedeReason.trim()) {
      setErrorMsg('Supersede reason is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionApprovalClient.supersedeApproval(selectedApprovalId, targetSupersedeId, supersedeReason);
      if (res.ok) {
        setMessage(`Approval ${selectedApprovalId} marked as superseded.`);
        setSupersedeReason('');
        setTargetSupersedeId('');
        await loadApprovalDetails(selectedApprovalId);
        await fetchApprovalsList();
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
    fetchApprovalsList();
    fetchFinalizedPrepsList();
  }, [fetchApprovalsList, fetchFinalizedPrepsList]);

  useEffect(() => {
    if (selectedApprovalId) {
      loadApprovalDetails(selectedApprovalId);
    }
  }, [selectedApprovalId, loadApprovalDetails]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: 'Inter, sans-serif', color: '#1f2937' }}>
      {/* WARNING BANNER */}
      <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', color: '#92400e', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700 }}>⚠️ Approval is not execution</h3>
        <p style={{ margin: 0, fontSize: 14 }}>
          Approval does not execute intervention. Cohort access, participant access, invite access, marketplace scope, payment execution, provider submission, tax/accounting submission, and enforcement behavior remain unchanged.
        </p>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Governed Cohort Intervention Approval Gate (Phase 139)</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        {/* Left column: Create and Select */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Create from Preparation</h2>
            {finalizedPreps.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Source Finalized Prep</label>
                  <select value={sourcePrepId} onChange={e => setSourcePrepId(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff' }}>
                    {finalizedPreps.map(p => (
                      <option key={p.preparation_id} value={p.preparation_id}>
                        {p.preparation_id} ({p.preparation_type})
                      </option>
                    ))}
                  </select>
                </div>
                <button onClick={handleCreateApproval} disabled={loading} style={{ width: '100%', padding: 10, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  Build Approval Package
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>No finalized preparations found. Finalize a preparation first.</p>
            )}
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Select Active Approval</h2>
            <select value={selectedApprovalId} onChange={e => setSelectedApprovalId(e.target.value)} style={{ width: '100%', padding: 10, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff' }}>
              <option value="">-- Choose Approval --</option>
              {approvals.map(a => (
                <option key={a.approval_id} value={a.approval_id}>
                  {a.approval_id} ({a.approval_status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right column: Details / Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {selectedApproval ? (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Approval Details</h2>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>ID: <code>{selectedApproval.approval_id}</code></span>
                </div>
                <span style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  background: selectedApproval.approval_status === 'FINALIZED' ? '#d1fae5' : selectedApproval.approval_status === 'REJECTED' ? '#fee2e2' : '#f3f4f6',
                  color: selectedApproval.approval_status === 'FINALIZED' ? '#065f46' : selectedApproval.approval_status === 'REJECTED' ? '#991b1b' : '#374151'
                }}>{selectedApproval.approval_status}</span>
              </div>

              {/* Finalization Buttons */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <button onClick={handleFinalize} disabled={loading || selectedApproval.approval_status === 'FINALIZED' || selectedApproval.approval_status === 'REJECTED' || selectedApproval.approval_status === 'SUPERSEDED'} style={{ padding: '8px 16px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  Finalize & Lock Approval
                </button>
              </div>

              {/* Policy Rules */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f9fafb', marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: 16, fontWeight: 700, color: '#111827' }}>Governance Policy</h3>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  Policy Name: <strong>{selectedApproval.approval_policy_json.policy_name}</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  Required Roles: <strong>{selectedApproval.approval_policy_json.required_roles.join(', ')}</strong>
                </div>
              </div>

              {/* Steps/Signatures */}
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Step Signatures</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {steps.map(step => (
                  <div key={step.step_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, border: '1px solid #f3f4f6', borderRadius: 6, background: step.status === 'SIGNED' ? '#ecfdf5' : '#ffffff' }}>
                    <div style={{ fontSize: 13 }}>
                      Role: <strong>{step.role}</strong> {step.status === 'SIGNED' && <span style={{ color: '#059669', marginLeft: 8 }}>(Signed by {step.approver_id})</span>}
                    </div>
                    {step.status !== 'SIGNED' && (
                      <button
                        onClick={() => handleSignStep(step.role)}
                        disabled={selectedApproval.approval_status === 'FINALIZED'}
                        style={{ padding: '4px 8px', fontSize: 11, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                      >
                        Sign Role
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Set Decision Form */}
              {selectedApproval.approval_status !== 'FINALIZED' && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 24 }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Record Approval Decision</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Decision</label>
                      <select value={decision} onChange={e => setDecision(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff' }}>
                        <option value="APPROVE_FOR_FUTURE_EXECUTION">APPROVE_FOR_FUTURE_EXECUTION</option>
                        <option value="REJECT_INTERVENTION">REJECT_INTERVENTION</option>
                        <option value="REQUEST_CHANGES">REQUEST_CHANGES</option>
                        <option value="RETURN_TO_PREPARATION">RETURN_TO_PREPARATION</option>
                        <option value="ESCALATE_FOR_MANUAL_REVIEW">ESCALATE_FOR_MANUAL_REVIEW</option>
                        <option value="REQUIRE_ADDITIONAL_EVIDENCE">REQUIRE_ADDITIONAL_EVIDENCE</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Rationale</label>
                      <textarea value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Provide compliance rationale..." style={{ width: '100%', height: 60, padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
                    </div>
                    <button onClick={handleRecordDecision} disabled={loading || !rationale} style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                      Submit Decision
                    </button>
                  </div>
                </div>
              )}

              {/* Decision Display */}
              {selectedApproval.approval_decision && (
                <div style={{ border: '1px solid #d1fae5', borderRadius: 8, padding: 16, background: '#ecfdf5', marginBottom: 24 }}>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: 15, fontWeight: 700, color: '#065f46' }}>Recorded Decision</h3>
                  <div style={{ fontSize: 13, color: '#065f46' }}>
                    Decision: <strong>{selectedApproval.approval_decision}</strong>
                  </div>
                  {selectedApproval.rejected_reason && (
                    <div style={{ fontSize: 13, color: '#065f46', marginTop: 4 }}>
                      Rationale: <em>{selectedApproval.rejected_reason}</em>
                    </div>
                  )}
                </div>
              )}

              {/* Non-Execution Attestation Status */}
              <div style={{ border: '1px solid #fee2e2', borderRadius: 8, padding: 16, background: '#fef2f2', marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 700, color: '#991b1b' }}>🛡️ Safety Attestation Proof</h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#991b1b', lineHeight: '1.6' }}>
                  <li>Executed intervention mutation: <strong>{String(selectedApproval.non_execution_attestation_json.approval_executed_intervention)}</strong></li>
                  <li>Cohort access state mutated: <strong>{String(selectedApproval.non_execution_attestation_json.cohort_access_mutated)}</strong></li>
                  <li>Participant bound mutated: <strong>{String(selectedApproval.non_execution_attestation_json.participant_access_mutated)}</strong></li>
                  <li>Execution job/queue created: <strong>{String(selectedApproval.non_execution_attestation_json.execution_job_created)}</strong></li>
                </ul>
              </div>

              {/* Blockers JSON */}
              {selectedApproval.approval_blockers_json && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#fffbeb', marginBottom: 24 }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 700, color: '#b45309' }}>Blocker Verification Status</h3>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#78350f', lineHeight: '1.6' }}>
                    <li>Missing required signatures: <strong style={{ color: selectedApproval.approval_blockers_json.missing_required_signatures ? '#dc2626' : '#059669' }}>{String(selectedApproval.approval_blockers_json.missing_required_signatures)}</strong></li>
                    <li>Non execution attestation invalid: <strong style={{ color: selectedApproval.approval_blockers_json.non_execution_attestation_invalid ? '#dc2626' : '#059669' }}>{String(selectedApproval.approval_blockers_json.non_execution_attestation_invalid)}</strong></li>
                    <li>Guardrail checks failed: <strong style={{ color: selectedApproval.approval_blockers_json.guardrail_failed ? '#dc2626' : '#059669' }}>{String(selectedApproval.approval_blockers_json.guardrail_failed)}</strong></li>
                    <li>Source preparation not finalized: <strong style={{ color: selectedApproval.approval_blockers_json.source_preparation_not_finalized ? '#dc2626' : '#059669' }}>{String(selectedApproval.approval_blockers_json.source_preparation_not_finalized)}</strong></li>
                  </ul>
                </div>
              )}

              {/* Evidence Pack */}
              {evidencePack && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Lock Evidence Pack (v{evidencePack.evidence_schema_version})</h3>
                  <div style={{ fontSize: 12, background: '#f9fafb', padding: 12, borderRadius: 6, maxHeight: 150, overflowY: 'auto' }}>
                    <div>Input Prep Hash: <code>{evidencePack.input_preparation_hash}</code></div>
                    <div>Approval Result Hash: <code>{evidencePack.approval_result_hash}</code></div>
                    <div>Evidence Pack Hash: <code>{evidencePack.evidence_pack_hash}</code></div>
                    <pre style={{ marginTop: 10 }}>{JSON.stringify(evidencePack.evidence_data_json, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* Lifecycle Actions */}
              {selectedApproval.approval_status !== 'FINALIZED' && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Workflow Rejections / Escalations</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {/* Request Changes */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input value={changesReason} onChange={e => setChangesReason(e.target.value)} placeholder="Changes request reason..." style={{ padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }} />
                        <button onClick={handleRequestChanges} disabled={!changesReason} style={{ padding: '6px 12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Changes</button>
                      </div>

                      {/* Return to Prep */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input value={returnReason} onChange={e => setReturnReason(e.target.value)} placeholder="Return to prep reason..." style={{ padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }} />
                        <button onClick={handleReturnToPrep} disabled={!returnReason} style={{ padding: '6px 12px', background: '#4b5563', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Return</button>
                      </div>

                      {/* Escalate */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input value={escalateReason} onChange={e => setEscalateReason(e.target.value)} placeholder="Escalation reason..." style={{ padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }} />
                        <button onClick={handleEscalate} disabled={!escalateReason} style={{ padding: '6px 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Escalate</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Supersede Action */}
              {selectedApproval.approval_status !== 'SUPERSEDED' && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Supersede this Approval</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Replacement Approval ID</label>
                      <input value={targetSupersedeId} onChange={e => setTargetSupersedeId(e.target.value)} placeholder="apv_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Enforced Reason</label>
                      <input value={supersedeReason} onChange={e => setSupersedeReason(e.target.value)} placeholder="Ex: new preparation finalized" style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
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
              Select an active approval or create one from a finalized Phase 138 preparation.
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

export default ControlledBetaCohortInterventionApproval;
