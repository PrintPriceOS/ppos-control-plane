import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldClient as Client } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldClient';
import { TokenRedemptionUnlockLegalPolicyHold, RuleResult, AuditLog } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHold';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHold() {
  const { unlockLegalPolicyHoldId } = useParams<{ unlockLegalPolicyHoldId: string }>();

  const [list, setList] = useState<TokenRedemptionUnlockLegalPolicyHold[]>([]);
  const [record, setRecord] = useState<TokenRedemptionUnlockLegalPolicyHold | null>(null);
  const [rules, setRules] = useState<RuleResult[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Form inputs
  const [riskOfficerCountersignId, setRiskOfficerCountersignId] = useState('');
  const [legalPolicyOfficerId, setLegalPolicyOfficerId] = useState('');
  const [legalPolicyOfficerRole, setLegalPolicyOfficerRole] = useState('legal_officer');
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState('APPROVE_LEGAL_POLICY_HOLD');
  const [rationale, setRationale] = useState('');

  // 14 Confirmations
  const [confirmations, setConfirmations] = useState({
    legal_policy_hold_clearance_confirmation: false,
    no_active_legal_hold_confirmed: false,
    no_active_policy_hold_confirmed: false,
    no_active_compliance_freeze_confirmed: false,
    risk_officer_countersign_verified: false,
    compliance_witness_attestation_verified: false,
    final_human_seal_authorizer_unlock_seal_verified: false,
    primary_authorizer_unlock_authorization_verified: false,
    secondary_authorizer_unlock_authorization_verified: false,
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
      const data = await Client.getUnlockLegalPolicyHoldList();
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
      const data = await Client.getUnlockLegalPolicyHoldDetails(id);
      setRecord(data.tokenRedemptionUnlockLegalPolicyHold);
      setRules(data.rules);
      setAuditLogs(data.auditLogs);
      setLegalPolicyOfficerId(data.tokenRedemptionUnlockLegalPolicyHold.legal_policy_officer_id || '');
      setLegalPolicyOfficerRole(data.tokenRedemptionUnlockLegalPolicyHold.legal_policy_officer_role || 'legal_officer');
      setReason(data.tokenRedemptionUnlockLegalPolicyHold.legal_policy_hold_confirmation_reason || '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (unlockLegalPolicyHoldId) {
      fetchDetails(unlockLegalPolicyHoldId);
    } else {
      fetchList();
      setRecord(null);
    }
  }, [unlockLegalPolicyHoldId]);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!riskOfficerCountersignId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await Client.createUnlockLegalPolicyHold(riskOfficerCountersignId);
      setMessage('Draft confirmation created successfully.');
      window.location.href = `/admin/beta/cohort-intervention/activation-token-redemption-unlock-legal-policy-hold/${data.tokenRedemptionUnlockLegalPolicyHold.act_token_redempt_unlock_legal_policy_hold_id}`;
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
      const id = record.act_token_redempt_unlock_legal_policy_hold_id;
      const data = await Client.evaluateUnlockLegalPolicyHold(id, confirmations);
      setRecord(data.tokenRedemptionUnlockLegalPolicyHold);
      setRules(data.rules);
      setMessage('Evaluator completed.');
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
      const id = record.act_token_redempt_unlock_legal_policy_hold_id;
      const data = await Client.recordDecision(id, {
        decision,
        rationale,
        legal_policy_officer_id: legalPolicyOfficerId,
        legal_policy_officer_role: legalPolicyOfficerRole,
        reason
      });
      setRecord(data.tokenRedemptionUnlockLegalPolicyHold);
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
      const id = record.act_token_redempt_unlock_legal_policy_hold_id;
      const data = await Client.finalizeUnlockLegalPolicyHold(id);
      setRecord(data.tokenRedemptionUnlockLegalPolicyHold);
      setMessage('Record finalized successfully.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleConfirmation = (key: keyof typeof confirmations) => {
    setConfirmations(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'Outfit, sans-serif', maxWidth: '1200px', margin: '0 auto', color: '#111827' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.025em' }}>
          Controlled Beta Cohort Intervention - Unlock Legal / Policy Hold confirmation
        </h1>
        <p style={{ color: '#6b7280', fontSize: '15px' }}>Phase 176 - Safety Boundary Gating Control Console</p>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {message && (
        <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #d1fae5', color: '#065f46', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
          {message}
        </div>
      )}

      {/* Warning Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a, #0d9488)',
        borderRadius: '12px',
        padding: '24px',
        color: '#ffffff',
        marginBottom: '32px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 12px 0' }}>⚠️ Mandatory Gating warning</h3>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', lineHeight: '1.6' }}>
          <li>This phase records Legal / Policy hold confirmation only.</li>
          <li>The token is not unlocked.</li>
          <li>The token is not redeemable.</li>
          <li>The token is not redeemed.</li>
          <li>No execution plan is enabled.</li>
          <li>No jobs or queue dispatches are created.</li>
          <li>Runtime mutation count remains zero.</li>
          <li>No active legal hold, policy hold or compliance freeze may be present.</li>
        </ul>
      </div>

      {!record ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px' }}>
          {/* Create Draft Form */}
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Create New Draft Confirmation</h3>
            <form onSubmit={handleCreateDraft}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                  Parent Risk Officer Countersign ID
                </label>
                <input
                  type="text"
                  value={riskOfficerCountersignId}
                  onChange={e => setRiskOfficerCountersignId(e.target.value)}
                  placeholder="e.g. roc_123456"
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none' }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', padding: '10px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }}
              >
                {loading ? 'Processing...' : 'Create Draft'}
              </button>
            </form>
          </div>

          {/* List View */}
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Active Confirmation Records</h3>
            {list.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '14px' }}>No active records found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {list.map(item => (
                  <Link
                    key={item.act_token_redempt_unlock_legal_policy_hold_id}
                    to={`/admin/beta/cohort-intervention/activation-token-redemption-unlock-legal-policy-hold/${item.act_token_redempt_unlock_legal_policy_hold_id}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      textDecoration: 'none',
                      color: 'inherit',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '15px' }}>{item.act_token_redempt_unlock_legal_policy_hold_id}</div>
                      <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                        Parent: {item.source_act_token_redempt_unlock_risk_officer_countersign_id}
                      </div>
                    </div>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: item.unlock_legal_policy_hold_status === 'FINALIZED' ? '#d1fae5' : '#f3f4f6',
                      color: item.unlock_legal_policy_hold_status === 'FINALIZED' ? '#065f46' : '#374151'
                    }}>
                      {item.unlock_legal_policy_hold_status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          {/* Detail View */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
            <div>
              {/* Confirmations Checklist */}
              {record.unlock_legal_policy_hold_status === 'DRAFT' && (
                <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>1. Evaluate Safety Confirmations Checklist</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    {Object.keys(confirmations).map(key => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={confirmations[key as keyof typeof confirmations]}
                          onChange={() => toggleConfirmation(key as keyof typeof confirmations)}
                        />
                        {key.replace(/_/g, ' ')}
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={handleEvaluate}
                    style={{ padding: '10px 20px', backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }}
                  >
                    Evaluate Confirmations
                  </button>
                </div>
              )}

              {/* Form Input */}
              {record.unlock_legal_policy_hold_status === 'EVALUATED' && (
                <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>2. Record Attestation & Decision</h3>
                  <form onSubmit={handleRecordDecision}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Legal Officer ID</label>
                        <input
                          type="text"
                          value={legalPolicyOfficerId}
                          onChange={e => setLegalPolicyOfficerId(e.target.value)}
                          required
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Legal Officer Role</label>
                        <select
                          value={legalPolicyOfficerRole}
                          onChange={e => setLegalPolicyOfficerRole(e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                        >
                          <option value="legal_officer">Legal Officer</option>
                          <option value="policy_officer">Policy Officer</option>
                          <option value="compliance_legal_officer">Compliance Legal Officer</option>
                          <option value="governance_legal_officer">Governance Legal Officer</option>
                          <option value="general_counsel">General Counsel</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Confirmation Reason</label>
                      <input
                        type="text"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Decision</label>
                        <select
                          value={decision}
                          onChange={e => setDecision(e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                        >
                          <option value="APPROVE_LEGAL_POLICY_HOLD">Approve Clearance</option>
                          <option value="REJECT_LEGAL_POLICY_HOLD">Reject Clearance</option>
                          <option value="BLOCK">Block</option>
                          <option value="ESCALATE">Escalate</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Decision Rationale</label>
                        <input
                          type="text"
                          value={rationale}
                          onChange={e => setRationale(e.target.value)}
                          required
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      style={{ padding: '10px 20px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }}
                    >
                      Submit Decision
                    </button>
                  </form>
                </div>
              )}

              {/* Finalize step */}
              {record.unlock_legal_policy_hold_status === 'APPROVED' && (
                <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>3. Finalize & Sign Evidence Pack</h3>
                  <p style={{ fontSize: '14px', color: '#4b5563', marginBottom: '16px' }}>
                    All rules evaluated successfully. You are now ready to seal this record.
                  </p>
                  <button
                    onClick={handleFinalize}
                    style={{ padding: '10px 20px', backgroundColor: '#059669', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }}
                  >
                    Seal & Finalize
                  </button>
                </div>
              )}

              {/* Evaluated Rules Log */}
              {rules.length > 0 && (
                <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Evaluated Gating Rules</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {rules.map(rule => (
                      <div
                        key={rule.rule_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px',
                          borderRadius: '6px',
                          backgroundColor: rule.severity === 'CRITICAL' ? '#fef2f2' : '#f9fafb',
                          border: `1px solid ${rule.severity === 'CRITICAL' ? '#fee2e2' : '#e5e7eb'}`
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{rule.check_type}</div>
                          <div style={{ fontSize: '13px', color: '#4b5563', marginTop: '2px' }}>{rule.description}</div>
                        </div>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: rule.severity === 'CRITICAL' ? '#fee2e2' : '#e5e7eb',
                          color: rule.severity === 'CRITICAL' ? '#991b1b' : '#374151'
                        }}>
                          {rule.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar metadata */}
            <div>
              <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Record ID</h4>
                  <div style={{ fontSize: '14px', fontWeight: 600, wordBreak: 'break-all' }}>{record.act_token_redempt_unlock_legal_policy_hold_id}</div>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Status</h4>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{record.unlock_legal_policy_hold_status}</div>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Safety Result</h4>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: record.unlock_legal_policy_hold_result.includes('FAILED') ? '#b91c1c' : '#047857' }}>
                    {record.unlock_legal_policy_hold_result}
                  </div>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Hashed Evidence Pack</h4>
                  <div style={{ fontSize: '12px', wordBreak: 'break-all', fontFamily: 'monospace', color: '#374151' }}>
                    {record.evidence_pack_hash || 'PENDING'}
                  </div>
                </div>
                <Link
                  to="/admin/beta/cohort-intervention/activation-token-redemption-unlock-legal-policy-hold"
                  style={{ display: 'inline-block', marginTop: '16px', fontSize: '14px', color: '#4f46e5', textDecoration: 'none', fontWeight: 500 }}
                >
                  ← Back to List
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
