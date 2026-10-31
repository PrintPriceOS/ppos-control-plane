import React, { useEffect, useState } from 'react';
import {
  getTokenFinalApvList,
  getTokenFinalApvDetails,
  createTokenFinalApv,
  evaluateTokenFinalApv,
  recordDecision,
  finalizeTokenFinalApv
} from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenFinalApvClient';
import {
  CohortInterventionExecutionPlanActivationTokenFinalApv,
  ActivationTokenFinalApvDetails
} from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenFinalApv';

export const ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenFinalApv: React.FC = () => {
  const [list, setList] = useState<CohortInterventionExecutionPlanActivationTokenFinalApv[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<ActivationTokenFinalApvDetails | null>(null);
  const [parentEnvId, setParentEnvId] = useState('');
  const [rationale, setRationale] = useState('');
  const [decisionResult, setDecisionResult] = useState('FINAL_APPROVED_NOT_ISSUED');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Overrides for evaluation
  const [chairSignature, setChairSignature] = useState(true);
  const [killSwitch, setKillSwitch] = useState(true);
  const [rollback, setRollback] = useState(true);

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadDetails(selectedId);
    } else {
      setDetails(null);
    }
  }, [selectedId]);

  async function loadList() {
    try {
      setLoading(true);
      const data = await getTokenFinalApvList();
      setList(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].activation_token_final_apv_id);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(id: string) {
    try {
      setLoading(true);
      const data = await getTokenFinalApvDetails(id);
      setDetails(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!parentEnvId.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const created = await createTokenFinalApv(parentEnvId.trim());
      await loadList();
      setSelectedId(created.activation_token_final_apv_id);
      setParentEnvId('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEvaluate() {
    if (!selectedId) return;
    try {
      setLoading(true);
      setError(null);
      await evaluateTokenFinalApv(selectedId, {
        security_committee_chair_confirmed: chairSignature,
        kill_switch_verified: killSwitch,
        rollback_authority_verified: rollback
      });
      await loadDetails(selectedId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecordDecision() {
    if (!selectedId || !rationale.trim()) return;
    try {
      setLoading(true);
      setError(null);
      await recordDecision(selectedId, decisionResult, rationale);
      await loadDetails(selectedId);
      setRationale('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalize() {
    if (!selectedId) return;
    try {
      setLoading(true);
      setError(null);
      await finalizeTokenFinalApv(selectedId);
      await loadDetails(selectedId);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'Inter, system-ui, sans-serif', color: '#f3f4f6', backgroundColor: '#0b0f19', minHeight: '100vh' }}>
      
      {/* Warning Banner */}
      <div style={{ backgroundColor: '#7f1d1d', border: '1px solid #f87171', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#fca5a5', fontWeight: 'bold' }}>⚠️ GOVERNANCE SAFETY WARNING</h3>
        <p style={{ margin: '0', fontSize: '14px', lineHeight: '1.5', color: '#fecaca' }}>
          Token final issuance approval does not issue the token.<br />
          The token remains non-redeemable.<br />
          The approval does not activate the execution plan.<br />
          The approval does not make the plan executable.<br />
          The approval does not create jobs, dispatch queues, or mutate runtime state.<br />
          A future token staging gate is required before any token can become issuable.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: '0', fontSize: '24px', fontWeight: 'bold' }}>Controlled Beta Intervention Activation Token Final Issuance Approval (Phase 157)</h1>
          <p style={{ margin: '4px 0 0 0', color: '#9ca3af', fontSize: '14px' }}>Governance Activation Token Final Issuance Approval Gate</p>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: '#ef4444', color: '#ffffff', padding: '12px 16px', borderRadius: '6px', marginBottom: '24px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
        
        {/* Left column: list & create */}
        <div>
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Initialize Final Approval</h3>
            <input
              type="text"
              placeholder="Parent Token Envelope ID"
              value={parentEnvId}
              onChange={e => setParentEnvId(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #374151', backgroundColor: '#1f2937', color: '#ffffff', marginBottom: '8px', boxSizing: 'border-box' }}
            />
            <button
              onClick={handleCreate}
              disabled={loading || !parentEnvId.trim()}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: 'none', backgroundColor: '#3b82f6', color: '#ffffff', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              Draft Approval
            </button>
          </div>

          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Approval Packages</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {list.map(item => (
                <div
                  key={item.activation_token_final_apv_id}
                  onClick={() => setSelectedId(item.activation_token_final_apv_id)}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: selectedId === item.activation_token_final_apv_id ? '#3b82f6' : '#374151',
                    backgroundColor: selectedId === item.activation_token_final_apv_id ? '#1e3a8a' : '#1f2937',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 'bold', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.activation_token_final_apv_id}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px', color: '#9ca3af' }}>
                    <span>{item.activation_token_final_apv_status}</span>
                    <span>{item.activation_token_final_apv_result || 'PENDING'}</span>
                  </div>
                </div>
              ))}
              {list.length === 0 && <div style={{ color: '#9ca3af', fontSize: '14px' }}>No packages drafted.</div>}
            </div>
          </div>
        </div>

        {/* Right column: details, actions, evidence */}
        <div>
          {details ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Record Info */}
              <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ margin: '0', fontSize: '20px' }}>Approval Package Details</h2>
                  <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: '#374151', fontSize: '12px', fontWeight: 'bold' }}>
                    {details.record.activation_token_final_apv_status}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px', color: '#d1d5db' }}>
                  <div><strong>Final Approval ID:</strong> {details.record.activation_token_final_apv_id}</div>
                  <div><strong>Parent Token Env ID:</strong> {details.record.source_activation_token_env_id}</div>
                  <div><strong>Cohort ID:</strong> {details.record.cohort_id || 'none'}</div>
                  <div><strong>Tenant ID:</strong> {details.record.tenant_id || 'none'}</div>
                  <div><strong>Result Code:</strong> {details.record.activation_token_final_apv_result || 'none'}</div>
                  <div><strong>Capability:</strong> {details.record.execution_capability_status}</div>
                  <div><strong>Execution Status:</strong> {details.record.activation_execution_status}</div>
                  <div><strong>Write Scope status:</strong> {details.record.write_scope_status}</div>
                </div>
              </div>

              {/* Action Board */}
              {details.record.activation_token_final_apv_status !== 'FINALIZED' && (
                <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '24px' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Verification Control Board</h3>
                  
                  {/* Step 1: Evaluate overrides */}
                  <div style={{ borderBottom: '1px solid #1f2937', paddingBottom: '16px', marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 12px 0' }}>1. Override Signatures</h4>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                        <input type="checkbox" checked={chairSignature} onChange={e => setChairSignature(e.target.checked)} />
                        Chair Signature Verified
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                        <input type="checkbox" checked={killSwitch} onChange={e => setKillSwitch(e.target.checked)} />
                        Kill-Switch Active
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                        <input type="checkbox" checked={rollback} onChange={e => setRollback(e.target.checked)} />
                        Rollback Feasible
                      </label>
                    </div>
                    <button
                      onClick={handleEvaluate}
                      disabled={loading}
                      style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', backgroundColor: '#10b981', color: '#ffffff', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      Run Evaluator Rules
                    </button>
                  </div>

                  {/* Step 2: Record Decision */}
                  {details.record.activation_token_final_apv_status === 'EVALUATED' && (
                    <div style={{ borderBottom: '1px solid #1f2937', paddingBottom: '16px', marginBottom: '16px' }}>
                      <h4 style={{ margin: '0 0 12px 0' }}>2. Record Approval Decision</h4>
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                        <select
                          value={decisionResult}
                          onChange={e => setDecisionResult(e.target.value)}
                          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #374151', backgroundColor: '#1f2937', color: '#ffffff' }}
                        >
                          <option value="FINAL_APPROVED_NOT_ISSUED">FINAL_APPROVED_NOT_ISSUED (Approve)</option>
                          <option value="FINAL_APPROVAL_REJECTED_NOT_ISSUED">FINAL_APPROVAL_REJECTED_NOT_ISSUED (Reject)</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Rationale / Justification..."
                          value={rationale}
                          onChange={e => setRationale(e.target.value)}
                          style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #374151', backgroundColor: '#1f2937', color: '#ffffff' }}
                        />
                      </div>
                      <button
                        onClick={handleRecordDecision}
                        disabled={loading || !rationale.trim()}
                        style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', backgroundColor: '#3b82f6', color: '#ffffff', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Record Decision
                      </button>
                    </div>
                  )}

                  {/* Step 3: Finalize */}
                  {details.record.activation_token_final_apv_status === 'READY_FOR_DECISION' && (
                    <div>
                      <h4 style={{ margin: '0 0 12px 0' }}>3. Lock and Finalize Final Approval</h4>
                      <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 12px 0' }}>
                        This compiles the v157.0 evidence package and generates the lineage chain hash.
                      </p>
                      <button
                        onClick={handleFinalize}
                        disabled={loading}
                        style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', backgroundColor: '#8b5cf6', color: '#ffffff', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Lock & Finalize Package
                      </button>
                    </div>
                  )}

                </div>
              )}

              {/* Evaluation rules log */}
              <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Evaluator Rule Log</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {details.rules.map(r => (
                    <div key={r.rule_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderRadius: '6px', backgroundColor: r.severity === 'CRITICAL' ? '#7f1d1d' : '#1f2937', border: '1px solid', borderColor: r.severity === 'CRITICAL' ? '#f87171' : '#374151' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{r.check_type}</div>
                        <div style={{ fontSize: '13px', marginTop: '4px', color: '#d1d5db' }}>{r.description}</div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', alignSelf: 'center', color: r.severity === 'CRITICAL' ? '#fca5a5' : '#9ca3af' }}>
                        {r.severity}
                      </span>
                    </div>
                  ))}
                  {details.rules.length === 0 && <div style={{ color: '#9ca3af', fontSize: '14px' }}>Evaluator has not run yet.</div>}
                </div>
              </div>

              {/* Evidence package view */}
              {details.evidence && (
                <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '24px' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>v157.0 Trace Evidence Pack</h3>
                  <div style={{ fontSize: '14px', color: '#d1d5db', marginBottom: '12px' }}>
                    <strong>Evidence Hash:</strong> <code style={{ backgroundColor: '#1f2937', padding: '2px 6px', borderRadius: '4px' }}>{details.evidence.evidence_pack_hash}</code>
                  </div>
                  <pre style={{ backgroundColor: '#1f2937', padding: '16px', borderRadius: '6px', overflowX: 'auto', fontSize: '12px', margin: '0', color: '#a7f3d0' }}>
                    {JSON.stringify({
                      payload: typeof details.evidence.evidence_payload_json === 'string' ? JSON.parse(details.evidence.evidence_payload_json) : details.evidence.evidence_payload_json,
                      lineage_chain: typeof details.evidence.lineage_hash_chain_json === 'string' ? JSON.parse(details.evidence.lineage_hash_chain_json) : details.evidence.lineage_hash_chain_json
                    }, null, 2)}
                  </pre>
                </div>
              )}

              {/* Audit Trails */}
              <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Audit Trail History</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  {details.audits.map(a => (
                    <div key={a.audit_event_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #1f2937' }}>
                      <span><strong>{a.event_type}</strong> by {a.actor_id}</span>
                      <span style={{ color: '#9ca3af' }}>{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px' }}>
              Select a final approval package from the left column or initialize a new draft to configure.
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
