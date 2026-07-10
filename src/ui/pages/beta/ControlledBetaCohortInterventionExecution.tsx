import React, { useState, useEffect, useCallback } from 'react';
import { cohortInterventionExecutionClient } from '../../api/controlledBetaCohortInterventionExecutionClient';
import { normalizeUiError } from '../../utils/errorUtils';
import { cohortInterventionApprovalClient } from '../../api/controlledBetaCohortInterventionApprovalClient';
import {
  CohortInterventionExecution,
  CohortInterventionExecutionStep
} from '../../types/controlledBetaCohortInterventionExecution';
import { CohortInterventionApproval } from '../../types/controlledBetaCohortInterventionApproval';

export function ControlledBetaCohortInterventionExecution() {
  const [executions, setExecutions] = useState<CohortInterventionExecution[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string>('');
  const [selectedExecution, setSelectedExecution] = useState<CohortInterventionExecution | null>(null);
  const [steps, setSteps] = useState<CohortInterventionExecutionStep[]>([]);
  const [evidencePack, setEvidencePack] = useState<any | null>(null);

  // Finalized Phase 139 approvals to choose from
  const [finalizedApprovals, setFinalizedApprovals] = useState<CohortInterventionApproval[]>([]);
  const [sourceApprovalId, setSourceApprovalId] = useState<string>('');

  // Form states
  const [operatorSignature, setOperatorSignature] = useState<string>('');
  const [operatorPhrase, setOperatorPhrase] = useState<string>('');
  const [cancelReason, setCancelReason] = useState<string>('');
  const [supersedeReason, setSupersedeReason] = useState<string>('');
  const [targetSupersedeId, setTargetSupersedeId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchExecutionsList = useCallback(async () => {
    try {
      const res = await cohortInterventionExecutionClient.listExecutions();
      if (res.ok) {
        setExecutions(res.executions);
      }
    } catch (err: any) {
      console.error('Error fetching executions:', err);
    }
  }, []);

  const fetchFinalizedApprovalsList = useCallback(async () => {
    try {
      const res = await cohortInterventionApprovalClient.listApprovals();
      if (res.ok) {
        const filtered = res.approvals.filter(
          a => (a.approval_status === 'FINALIZED' || a.approval_status === 'APPROVED') &&
               a.approval_decision === 'APPROVE_FOR_FUTURE_EXECUTION'
        );
        setFinalizedApprovals(filtered);
        if (filtered.length > 0 && !sourceApprovalId) {
          setSourceApprovalId(filtered[0].approval_id);
        }
      }
    } catch (err: any) {
      console.error('Error fetching approvals:', err);
    }
  }, [sourceApprovalId]);

  const loadExecutionDetails = useCallback(async (executionId: string) => {
    if (!executionId) return;
    setLoading(true);
    try {
      const res = await cohortInterventionExecutionClient.getExecution(executionId);
      if (res.ok) {
        setSelectedExecution(res.execution);
        setSteps(res.steps);

        if (res.execution.execution_status === 'EXECUTED') {
          const evRes = await cohortInterventionExecutionClient.getEvidencePack(executionId);
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
      console.error('Error loading execution details:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateExecution = async () => {
    if (!sourceApprovalId) {
      setErrorMsg('A finalized Phase 139 approval is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionExecutionClient.createExecutionFromApproval(sourceApprovalId);
      if (res.ok) {
        setMessage(`Execution package created: ${res.execution.execution_id}`);
        setSelectedExecutionId(res.execution.execution_id);
        await fetchExecutionsList();
        await loadExecutionDetails(res.execution.execution_id);
      } else {
        setErrorMsg('Failed to create execution package.');
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDryRun = async () => {
    if (!selectedExecutionId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionExecutionClient.generateDryRun(selectedExecutionId);
      if (res.ok) {
        setMessage(`Dry-run preview generated: ${res.dry_run_hash}`);
        await loadExecutionDetails(selectedExecutionId);
      } else {
        setErrorMsg('Failed to generate dry run');
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRollbackPlan = async () => {
    if (!selectedExecutionId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionExecutionClient.createRollbackPlan(selectedExecutionId);
      if (res.ok) {
        setMessage('Rollback mitigation plan established.');
        await loadExecutionDetails(selectedExecutionId);
      } else {
        setErrorMsg('Failed to create rollback plan');
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedExecutionId) return;
    if (!operatorSignature.trim()) {
      setErrorMsg('Operator signature is required.');
      return;
    }
    if (operatorPhrase !== 'CONFIRM_PHASE_140_CONTROLLED_EXECUTION') {
      setErrorMsg('Confirmation phrase must match exactly.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionExecutionClient.confirmExecution(selectedExecutionId, operatorSignature, operatorPhrase);
      if (res.ok) {
        setMessage('Operator confirmation recorded.');
        setOperatorSignature('');
        setOperatorPhrase('');
        await loadExecutionDetails(selectedExecutionId);
      } else {
        setErrorMsg('Failed to record operator confirmation');
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!selectedExecutionId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionExecutionClient.executeIntervention(selectedExecutionId);
      if (res.ok) {
        setMessage('Safe-scope cohort intervention executed successfully.');
        await loadExecutionDetails(selectedExecutionId);
        await fetchExecutionsList();
      } else {
        setErrorMsg('Execution failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Execution blocked by guardrails.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedExecutionId) return;
    if (!cancelReason.trim()) {
      setErrorMsg('Cancellation reason is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionExecutionClient.cancelExecution(selectedExecutionId, cancelReason);
      if (res.ok) {
        setMessage('Execution cancelled.');
        setCancelReason('');
        await loadExecutionDetails(selectedExecutionId);
        await fetchExecutionsList();
      } else {
        setErrorMsg('Cancellation failed');
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async () => {
    if (!selectedExecutionId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionExecutionClient.rollbackExecution(selectedExecutionId);
      if (res.ok) {
        setMessage('Rollback executed for safe-scope items.');
        await loadExecutionDetails(selectedExecutionId);
        await fetchExecutionsList();
      } else {
        setErrorMsg('Rollback failed');
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSupersede = async () => {
    if (!selectedExecutionId || !targetSupersedeId) return;
    if (!supersedeReason.trim()) {
      setErrorMsg('Supersede reason is required.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionExecutionClient.supersedeExecution(selectedExecutionId, targetSupersedeId, supersedeReason);
      if (res.ok) {
        setMessage(`Execution ${selectedExecutionId} marked as superseded.`);
        setSupersedeReason('');
        setTargetSupersedeId('');
        await loadExecutionDetails(selectedExecutionId);
        await fetchExecutionsList();
      } else {
        setErrorMsg('Supersede failed');
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExecutionsList();
    fetchFinalizedApprovalsList();
  }, [fetchExecutionsList, fetchFinalizedApprovalsList]);

  useEffect(() => {
    if (selectedExecutionId) {
      loadExecutionDetails(selectedExecutionId);
    }
  }, [selectedExecutionId, loadExecutionDetails]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: 'Inter, sans-serif', color: '#1f2937' }}>
      {/* WARNING BANNER */}
      <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', color: '#92400e', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700 }}>⚠️ Safe-Scope Execution Gate Only</h3>
        <p style={{ margin: 0, fontSize: 14 }}>
          Execution is limited to explicitly approved safe-scope beta intervention markers/tasks. This phase does not enable public marketplace, payment execution, provider submission, tax/accounting submission, cohort expansion, participant revocation, invite revocation, or automatic enforcement.
        </p>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Controlled Cohort Intervention Execution Gate (Phase 140)</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        {/* Left column: Create and Select */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Create from Approval</h2>
            {finalizedApprovals.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Source Approval</label>
                  <select value={sourceApprovalId} onChange={e => setSourceApprovalId(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff' }}>
                    {finalizedApprovals.map(a => (
                      <option key={a.approval_id} value={a.approval_id}>
                        {a.approval_id} ({a.preparation_type})
                      </option>
                    ))}
                  </select>
                </div>
                <button onClick={handleCreateExecution} disabled={loading} style={{ width: '100%', padding: 10, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  Build Execution Package
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>No finalized/approved decisions found. Approve a preparation package first.</p>
            )}
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Select Execution Record</h2>
            <select value={selectedExecutionId} onChange={e => setSelectedExecutionId(e.target.value)} style={{ width: '100%', padding: 10, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff' }}>
              <option value="">-- Choose Execution --</option>
              {executions.map(e => (
                <option key={e.execution_id} value={e.execution_id}>
                  {e.execution_id} ({e.execution_status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right column: Details / Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {selectedExecution ? (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Execution Details</h2>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>ID: <code>{selectedExecution.execution_id}</code></span>
                </div>
                <span style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  background: selectedExecution.execution_status === 'EXECUTED' ? '#d1fae5' : selectedExecution.execution_status === 'CANCELLED' ? '#fee2e2' : '#f3f4f6',
                  color: selectedExecution.execution_status === 'EXECUTED' ? '#065f46' : selectedExecution.execution_status === 'CANCELLED' ? '#991b1b' : '#374151'
                }}>{selectedExecution.execution_status}</span>
              </div>

              {/* Execution Actions */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                <button onClick={handleGenerateDryRun} disabled={loading || selectedExecution.execution_status === 'EXECUTED' || selectedExecution.execution_status === 'CANCELLED'} style={{ padding: '8px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  Generate Dry-Run Preview
                </button>
                <button onClick={handleCreateRollbackPlan} disabled={loading || selectedExecution.execution_status === 'EXECUTED' || selectedExecution.execution_status === 'CANCELLED'} style={{ padding: '8px 16px', background: '#0891b2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  Create Rollback Plan
                </button>
                <button onClick={handleExecute} disabled={loading || selectedExecution.execution_status !== 'CONFIRMED_FOR_EXECUTION'} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>
                  🚀 Run Safe Execution
                </button>
                {selectedExecution.execution_status === 'EXECUTED' && (
                  <button onClick={handleRollback} disabled={loading} style={{ padding: '8px 16px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                    Execute Rollback Plan
                  </button>
                )}
              </div>

              {/* Step verification list */}
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Checklist Steps</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {steps.map(step => (
                  <div key={step.step_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, border: '1px solid #f3f4f6', borderRadius: 6, background: step.status === 'COMPLETED' ? '#ecfdf5' : '#ffffff' }}>
                    <div style={{ fontSize: 13 }}>
                      Step: <strong>{step.step_key}</strong> — {step.description}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: step.status === 'COMPLETED' ? '#059669' : '#d97706' }}>{step.status}</span>
                  </div>
                ))}
              </div>

              {/* Operator Confirmation Panel */}
              {selectedExecution.execution_status !== 'EXECUTED' && selectedExecution.execution_status !== 'CANCELLED' && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 24, background: '#f9fafb' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Operator Execution Sign-Off</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Confirmation Phrase (Type: <code>CONFIRM_PHASE_140_CONTROLLED_EXECUTION</code>)</label>
                      <input value={operatorPhrase} onChange={e => setOperatorPhrase(e.target.value)} placeholder="Type confirmation phrase here..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Operator Signature</label>
                      <input value={operatorSignature} onChange={e => setOperatorSignature(e.target.value)} placeholder="Your full name / identifier..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
                    </div>
                    <button onClick={handleConfirm} disabled={loading || !operatorSignature || operatorPhrase !== 'CONFIRM_PHASE_140_CONTROLLED_EXECUTION'} style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                      Submit Sign-Off
                    </button>
                  </div>
                </div>
              )}

              {/* Lineage Hashes Tracing */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f3f4f6', marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 700 }}>Lineage Hash Integrity</h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: '1.6' }}>
                  <li>Source Approval Hash: <code>{selectedExecution.lineage_hashes_json.source_approval_hash}</code></li>
                  <li>Source Approval Evidence Pack Hash: <code>{selectedExecution.lineage_hashes_json.source_approval_evidence_pack_hash}</code></li>
                  <li>Source Prep Hash: <code>{selectedExecution.lineage_hashes_json.source_preparation_hash}</code></li>
                </ul>
              </div>

              {/* Safe Scope Attestation Displays */}
              <div style={{ border: '1px solid #d1fae5', borderRadius: 8, padding: 16, background: '#ecfdf5', marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 700, color: '#065f46' }}>🛡️ Safe Scope Attestation</h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#065f46', lineHeight: '1.6' }}>
                  <li>Cohort Pause Executed: <strong>{String(selectedExecution.safe_scope_attestation_json.cohort_pause_executed)}</strong></li>
                  <li>Participant Access Restricted: <strong>{String(selectedExecution.safe_scope_attestation_json.participant_access_restricted)}</strong></li>
                  <li>Invite Access Revoked: <strong>{String(selectedExecution.safe_scope_attestation_json.invite_revoked)}</strong></li>
                  <li>Only Safe-scope Operational Marker/Task Created: <strong>{String(selectedExecution.safe_scope_attestation_json.only_safe_scope_marker_or_task_created)}</strong></li>
                </ul>
              </div>

              {/* Evidence Pack */}
              {evidencePack && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Execution Evidence Pack (v{evidencePack.evidence_schema_version})</h3>
                  <div style={{ fontSize: 12, background: '#f9fafb', padding: 12, borderRadius: 6, maxHeight: 150, overflowY: 'auto' }}>
                    <div>Source Approval Hash: <code>{evidencePack.source_approval_hash}</code></div>
                    <div>Dry-Run Hash: <code>{evidencePack.dry_run_hash}</code></div>
                    <div>Evidence Pack Hash: <code>{evidencePack.evidence_pack_hash}</code></div>
                    <pre style={{ marginTop: 10 }}>{JSON.stringify(evidencePack.evidence_data_json, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* Lifecycle Actions */}
              {selectedExecution.execution_status !== 'EXECUTED' && selectedExecution.execution_status !== 'CANCELLED' && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Cancel Execution</h3>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Reason for cancellation..." style={{ padding: 6, border: '1px solid #d1d5db', borderRadius: 4, flex: 1 }} />
                      <button onClick={handleCancel} disabled={!cancelReason} style={{ padding: '6px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Cancel Package</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Supersede Action */}
              {selectedExecution.execution_status !== 'SUPERSEDED' && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Supersede this Execution</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Replacement Execution ID</label>
                      <input value={targetSupersedeId} onChange={e => setTargetSupersedeId(e.target.value)} placeholder="exc_..." style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Supersede Reason</label>
                      <input value={supersedeReason} onChange={e => setSupersedeReason(e.target.value)} placeholder="Ex: replacement execution package ready" style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} />
                    </div>
                  </div>
                  <button onClick={handleSupersede} disabled={loading || !targetSupersedeId || !supersedeReason} style={{ padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                    Apply Supersede
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: '#f9fafb', border: '1px dotted #d1d5db', borderRadius: 8, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280', padding: 24, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>No finalized intervention approvals were found.</div>
              <div style={{ fontSize: 13, color: '#4b5563' }}>Required parent: Phase 139 Governed Cohort Intervention Approval.</div>
              <div style={{ fontSize: 13, color: '#4b5563' }}>Required state: FINALIZED approval.</div>
              <div style={{ fontSize: 13, color: '#059669', marginTop: 12 }}>Next action: approve a Phase 139 preparation before creating a safe-scope execution gate.</div>
            </div>
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

export default ControlledBetaCohortInterventionExecution;
