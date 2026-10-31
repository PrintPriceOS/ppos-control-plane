import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignClient as Client } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignClient';
import { TokenRedemptionUnlockRiskOfficerCountersign, RuleResult, AuditLog } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersign';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersign() {
  const { unlockRiskOfficerCountersignId } = useParams<{ unlockRiskOfficerCountersignId: string }>();

  const [list, setList] = useState<TokenRedemptionUnlockRiskOfficerCountersign[]>([]);
  const [record, setRecord] = useState<TokenRedemptionUnlockRiskOfficerCountersign | null>(null);
  const [rules, setRules] = useState<RuleResult[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Form inputs
  const [complianceWitnessId, setComplianceWitnessId] = useState('');
  const [riskOfficerId, setRiskOfficerId] = useState('');
  const [riskOfficerRole, setRiskOfficerRole] = useState('risk_officer');
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState('APPROVE_RISK_COUNTERSIGN');
  const [rationale, setRationale] = useState('');

  // 14 Confirmations
  const [confirmations, setConfirmations] = useState({
    risk_officer_countersign_confirmation: false,
    compliance_witness_attestation_verified: false,
    final_human_seal_authorizer_unlock_seal_verified: false,
    primary_authorizer_unlock_authorization_verified: false,
    secondary_authorizer_unlock_authorization_verified: false,
    security_officer_unlock_attestation_verified: false,
    compliance_officer_unlock_attestation_verified: false,
    operations_director_unlock_attestation_verified: false,
    rollback_authority_unlock_attestation_verified: false,
    kill_switch_verified: false,
    non_execution_confirmed: false,
    final_review_unlock_readiness_verified: false,
    seal_authenticity_confirmed: false,
    pre_execution_state_sealed_confirmed: false
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchList = async () => {
    try {
      setLoading(true);
      const data = await Client.getUnlockRiskOfficerCountersignList();
      setList(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetails = async (id: string) => {
    try {
      setLoading(true);
      const data = await Client.getUnlockRiskOfficerCountersignDetails(id);
      setRecord(data.tokenRedemptionUnlockRiskOfficerCountersign);
      setRules(data.rules);
      setAuditLogs(data.auditLogs);
      setRiskOfficerId(data.tokenRedemptionUnlockRiskOfficerCountersign.risk_officer_id || '');
      setRiskOfficerRole(data.tokenRedemptionUnlockRiskOfficerCountersign.risk_officer_role || 'risk_officer');
      setReason(data.tokenRedemptionUnlockRiskOfficerCountersign.risk_officer_countersign_reason || '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (unlockRiskOfficerCountersignId) {
      fetchDetails(unlockRiskOfficerCountersignId);
    } else {
      fetchList();
      setRecord(null);
    }
  }, [unlockRiskOfficerCountersignId]);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complianceWitnessId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await Client.createUnlockRiskOfficerCountersign(complianceWitnessId);
      setMessage('Draft countersign created successfully.');
      window.location.href = `/admin/beta/cohort-intervention/activation-token-redemption-unlock-risk-officer-countersign/${data.tokenRedemptionUnlockRiskOfficerCountersign.act_token_redempt_unlock_risk_officer_countersign_id}`;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluate = async () => {
    if (!record) return;
    try {
      setLoading(true);
      setError(null);
      const id = record.act_token_redempt_unlock_risk_officer_countersign_id;
      const data = await Client.evaluateUnlockRiskOfficerCountersign(id, confirmations);
      setRecord(data.tokenRedemptionUnlockRiskOfficerCountersign);
      setRules(data.rules);
      setMessage('Evaluator ran successfully.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    try {
      setLoading(true);
      setError(null);
      const id = record.act_token_redempt_unlock_risk_officer_countersign_id;
      const data = await Client.recordDecision(id, {
        decision,
        rationale,
        risk_officer_id: riskOfficerId,
        risk_officer_role: riskOfficerRole,
        reason
      });
      setRecord(data.tokenRedemptionUnlockRiskOfficerCountersign);
      setMessage('Decision and attestation recorded.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!record) return;
    try {
      setLoading(true);
      setError(null);
      const id = record.act_token_redempt_unlock_risk_officer_countersign_id;
      const data = await Client.finalizeUnlockRiskOfficerCountersign(id);
      setRecord(data.tokenRedemptionUnlockRiskOfficerCountersign);
      setMessage('Countersign finalized successfully.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const selectAllConfirmations = () => {
    setConfirmations({
      risk_officer_countersign_confirmation: true,
      compliance_witness_attestation_verified: true,
      final_human_seal_authorizer_unlock_seal_verified: true,
      primary_authorizer_unlock_authorization_verified: true,
      secondary_authorizer_unlock_authorization_verified: true,
      security_officer_unlock_attestation_verified: true,
      compliance_officer_unlock_attestation_verified: true,
      operations_director_unlock_attestation_verified: true,
      rollback_authority_unlock_attestation_verified: true,
      kill_switch_verified: true,
      non_execution_confirmed: true,
      final_review_unlock_readiness_verified: true,
      seal_authenticity_confirmed: true,
      pre_execution_state_sealed_confirmed: true
    });
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'Outfit, sans-serif', background: '#0a0d16', color: '#e2e8f0', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Phase 175: Risk Officer Countersign Gate
            </h1>
            <p style={{ margin: '4px 0 0 0', color: '#94a3b8' }}>
              Controlled High-Risk Cohort Intervention Activation Token Redemption Unlock
            </p>
          </div>
          <Link to="/admin/beta/cohort-intervention/activation-token-redemption-unlock-risk-officer-countersign" style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '14px' }}>
            &larr; View List
          </Link>
        </header>

        {/* Warning Banner */}
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚠️ Strict Governance Warning Boundary
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6' }}>
            This phase records independent Risk Officer countersign only.
            The token is not unlocked.
            The token is not redeemable.
            The token is not redeemed.
            No execution plan is enabled.
            No jobs or queue dispatches are created.
            Runtime mutation count remains zero.
            The Risk Officer must be independent from the dual-control authorizers, final human authorizer, and compliance witness.
          </p>
        </div>

        {error && (
          <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.2)', borderLeft: '4px solid #ef4444', borderRadius: '4px', marginBottom: '20px', color: '#f87171' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.2)', borderLeft: '4px solid #10b981', borderRadius: '4px', marginBottom: '20px', color: '#34d399' }}>
            {message}
          </div>
        )}

        {!record ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
              {/* Draft Creation Form */}
              <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#f1f5f9' }}>Create Draft Countersign</h3>
                <form onSubmit={handleCreateDraft}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#94a3b8' }}>Parent Compliance Witness ID</label>
                    <input
                      type="text"
                      className="form-control"
                      value={complianceWitnessId}
                      onChange={e => setComplianceWitnessId(e.target.value)}
                      placeholder="e.g. cwn_9adb..."
                      required
                      style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }}
                    />
                  </div>
                  <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                    {loading ? 'Processing...' : 'Create Draft'}
                  </button>
                </form>
              </div>

              {/* Countersign List */}
              <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#f1f5f9' }}>Countersign Records</h3>
                {loading && list.length === 0 ? (
                  <p>Loading...</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ textAlign: 'left', padding: '10px', color: '#94a3b8' }}>ID</th>
                        <th style={{ textAlign: 'left', padding: '10px', color: '#94a3b8' }}>Parent (Phase 174)</th>
                        <th style={{ textAlign: 'left', padding: '10px', color: '#94a3b8' }}>Status</th>
                        <th style={{ textAlign: 'left', padding: '10px', color: '#94a3b8' }}>Risk Officer</th>
                        <th style={{ textAlign: 'left', padding: '10px', color: '#94a3b8' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(r => (
                        <tr key={r.act_token_redempt_unlock_risk_officer_countersign_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '10px' }}>
                            <Link to={`/admin/beta/cohort-intervention/activation-token-redemption-unlock-risk-officer-countersign/${r.act_token_redempt_unlock_risk_officer_countersign_id}`} style={{ color: '#38bdf8', textDecoration: 'none' }}>
                              {r.act_token_redempt_unlock_risk_officer_countersign_id.substring(0, 12)}...
                            </Link>
                          </td>
                          <td style={{ padding: '10px', color: '#cbd5e1' }}>{r.source_act_token_redempt_unlock_compliance_witness_id.substring(0, 12)}...</td>
                          <td style={{ padding: '10px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              background: r.unlock_risk_officer_countersign_status === 'FINALIZED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                              color: r.unlock_risk_officer_countersign_status === 'FINALIZED' ? '#10b981' : '#f59e0b'
                            }}>
                              {r.unlock_risk_officer_countersign_status}
                            </span>
                          </td>
                          <td style={{ padding: '10px', color: '#cbd5e1' }}>{r.risk_officer_id || 'N/A'}</td>
                          <td style={{ padding: '10px' }}>
                            <Link to={`/admin/beta/cohort-intervention/activation-token-redemption-unlock-risk-officer-countersign/${r.act_token_redempt_unlock_risk_officer_countersign_id}`} style={{ color: '#818cf8', textDecoration: 'none' }}>
                              Manage &rarr;
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {list.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No records found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
              {/* Detailed management view */}
              <div>
                {/* Information Card */}
                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 16px 0', color: '#f1f5f9' }}>Gating Context Info</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px' }}>
                    <div>
                      <p style={{ margin: '4px 0' }}><strong style={{ color: '#94a3b8' }}>Record ID:</strong> {record.act_token_redempt_unlock_risk_officer_countersign_id}</p>
                      <p style={{ margin: '4px 0' }}><strong style={{ color: '#94a3b8' }}>Status:</strong> {record.unlock_risk_officer_countersign_status}</p>
                      <p style={{ margin: '4px 0' }}><strong style={{ color: '#94a3b8' }}>Result:</strong> {record.unlock_risk_officer_countersign_result}</p>
                      <p style={{ margin: '4px 0' }}><strong style={{ color: '#94a3b8' }}>Parent (Phase 174):</strong> {record.source_act_token_redempt_unlock_compliance_witness_id}</p>
                    </div>
                    <div>
                      <p style={{ margin: '4px 0' }}><strong style={{ color: '#94a3b8' }}>Token Unlock:</strong> {record.token_unlock_status}</p>
                      <p style={{ margin: '4px 0' }}><strong style={{ color: '#94a3b8' }}>Redeemable:</strong> {record.token_redeemable_status}</p>
                      <p style={{ margin: '4px 0' }}><strong style={{ color: '#94a3b8' }}>Redemption:</strong> {record.token_redemption_status}</p>
                      <p style={{ margin: '4px 0' }}><strong style={{ color: '#94a3b8' }}>Execution:</strong> {record.execution_capability_status}</p>
                    </div>
                  </div>
                </div>

                {/* Evaluator Panel */}
                {record.unlock_risk_officer_countersign_status !== 'FINALIZED' && (
                  <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ margin: 0, color: '#f1f5f9' }}>Gating Rules & Confirmations</h3>
                      <button onClick={selectAllConfirmations} style={{ padding: '6px 12px', background: 'rgba(56, 189, 248, 0.2)', border: '1px solid #38bdf8', color: '#38bdf8', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                        Check All Confirmations
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                      {Object.keys(confirmations).map(key => (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: '#cbd5e1' }}>
                          <input
                            type="checkbox"
                            checked={(confirmations as any)[key]}
                            onChange={e => setConfirmations(prev => ({ ...prev, [key]: e.target.checked }))}
                          />
                          {key.replace(/_/g, ' ')}
                        </label>
                      ))}
                    </div>

                    <button onClick={handleEvaluate} disabled={loading} style={{ padding: '10px 20px', background: '#818cf8', color: '#0f172a', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                      Run Gating Evaluator Rules
                    </button>
                  </div>
                )}

                {/* Decision Panel */}
                {record.unlock_risk_officer_countersign_status === 'EVALUATED' && (
                  <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 16px 0', color: '#f1f5f9' }}>Record Attestation & Decision</h3>
                    <form onSubmit={handleRecordDecision}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#94a3b8' }}>Risk Officer ID</label>
                          <input
                            type="text"
                            value={riskOfficerId}
                            onChange={e => setRiskOfficerId(e.target.value)}
                            required
                            placeholder="e.g. user_diana"
                            style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#94a3b8' }}>Risk Officer Role</label>
                          <select
                            value={riskOfficerRole}
                            onChange={e => setRiskOfficerRole(e.target.value)}
                            style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }}
                          >
                            <option value="risk_officer">Risk Officer</option>
                            <option value="chief_risk_officer">Chief Risk Officer</option>
                            <option value="security_risk_officer">Security Risk Officer</option>
                            <option value="governance_risk_officer">Governance Risk Officer</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#94a3b8' }}>Countersign Attestation Reason</label>
                        <textarea
                          value={reason}
                          onChange={e => setReason(e.target.value)}
                          placeholder="Why is this intervention countersigned?"
                          required
                          style={{ width: '100%', height: '80px', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', resize: 'vertical' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#94a3b8' }}>Decision Action</label>
                          <select
                            value={decision}
                            onChange={e => setDecision(e.target.value)}
                            style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }}
                          >
                            <option value="APPROVE_RISK_COUNTERSIGN">Approve Risk Countersign</option>
                            <option value="REJECT_RISK_COUNTERSIGN">Reject Risk Countersign</option>
                            <option value="BLOCK">Block</option>
                            <option value="ESCALATE">Escalate</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#94a3b8' }}>Rationale</label>
                          <input
                            type="text"
                            value={rationale}
                            onChange={e => setRationale(e.target.value)}
                            placeholder="Decision rationale"
                            required
                            style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }}
                          />
                        </div>
                      </div>

                      <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: '#10b981', color: '#0f172a', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                        Record Risk Countersign Attestation
                      </button>
                    </form>
                  </div>
                )}

                {/* Finalize Panel */}
                {record.unlock_risk_officer_countersign_status === 'APPROVED' && (
                  <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '24px', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#f1f5f9' }}>Finalize Countersign Gate</h3>
                    <p style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '16px' }}>
                      All gating rules passed, and the attestation was approved. Finalize to sign the evidence pack.
                    </p>
                    <button onClick={handleFinalize} disabled={loading} style={{ padding: '12px 30px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>
                      Finalize Countersign Pack
                    </button>
                  </div>
                )}
              </div>

              {/* Sidebar: Gating Rules & Audit Logs */}
              <div>
                {/* Evaluator Rules List */}
                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '24px' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#f1f5f9' }}>Rule Evaluations ({rules.length})</h4>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {rules.map(r => (
                      <div key={r.rule_id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600, color: r.severity === 'CRITICAL' ? '#f87171' : '#38bdf8' }}>{r.check_type}</span>
                          <span style={{ color: r.severity === 'CRITICAL' ? '#f87171' : '#34d399' }}>{r.severity}</span>
                        </div>
                        <p style={{ margin: '4px 0 0 0', color: '#cbd5e1' }}>{r.description}</p>
                      </div>
                    ))}
                    {rules.length === 0 && <p style={{ color: '#94a3b8', fontSize: '13px' }}>No rules evaluated yet.</p>}
                  </div>
                </div>

                {/* Audit Logs */}
                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#f1f5f9' }}>Audits Log ({auditLogs.length})</h4>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {auditLogs.map(log => (
                      <div key={log.audit_id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                          <strong>{log.action_type}</strong>
                          <span>{log.actor_id}</span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                    {auditLogs.length === 0 && <p style={{ color: '#94a3b8', fontSize: '13px' }}>No audit logs recorded.</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
