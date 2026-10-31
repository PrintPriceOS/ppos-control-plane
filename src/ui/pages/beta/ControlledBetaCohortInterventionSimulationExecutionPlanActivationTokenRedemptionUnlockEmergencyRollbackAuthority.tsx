import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityClient as Client } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityClient';
import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthority as RecordType } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthority';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthority() {
  const { unlockEmergencyRollbackAuthorityId } = useParams<{ unlockEmergencyRollbackAuthorityId: string }>();

  const [list, setList] = useState<RecordType[]>([]);
  const [record, setRecord] = useState<RecordType | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Form inputs
  const [legalPolicyHoldId, setLegalPolicyHoldId] = useState('');
  const [rollbackOfficerId, setRollbackOfficerId] = useState('');
  const [rollbackOfficerRole, setRollbackOfficerRole] = useState('rollback_officer');
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState('APPROVE_EMERGENCY_ROLLBACK_AUTHORITY');
  const [rationale, setRationale] = useState('');

  // 15 Confirmations
  const [confirmations, setConfirmations] = useState({
    emergency_rollback_authority_confirmation: false,
    rollback_officer_assigned_confirmed: false,
    emergency_stop_authority_ready_confirmed: false,
    rollback_channel_available_confirmed: false,
    rollback_runbook_available_confirmed: false,
    kill_switch_verified: false,
    non_execution_confirmed: false,
    legal_policy_hold_clearance_verified: false,
    risk_officer_countersign_verified: false,
    compliance_witness_attestation_verified: false,
    final_human_seal_authorizer_unlock_seal_verified: false,
    primary_authorizer_unlock_authorization_verified: false,
    secondary_authorizer_unlock_authorization_verified: false,
    seal_authenticity_confirmed: false,
    pre_execution_state_sealed_confirmed: false
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchList = async () => {
    try {
      setLoading(true);
      const data = await Client.getUnlockEmergencyRollbackAuthorityList();
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
      const data = await Client.getUnlockEmergencyRollbackAuthorityDetails(id);
      setRecord(data.tokenRedemptionUnlockEmergencyRollbackAuthority);
      setRules(data.rules);
      setAuditLogs(data.auditLogs);
      setRollbackOfficerId(data.tokenRedemptionUnlockEmergencyRollbackAuthority.rollback_officer_id || '');
      setRollbackOfficerRole(data.tokenRedemptionUnlockEmergencyRollbackAuthority.rollback_officer_role || 'rollback_officer');
      setReason(data.tokenRedemptionUnlockEmergencyRollbackAuthority.rollback_authority_confirmation_reason || '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (unlockEmergencyRollbackAuthorityId) {
      fetchDetails(unlockEmergencyRollbackAuthorityId);
    } else {
      fetchList();
      setRecord(null);
    }
  }, [unlockEmergencyRollbackAuthorityId]);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legalPolicyHoldId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await Client.createUnlockEmergencyRollbackAuthority(legalPolicyHoldId);
      setMessage('Draft confirmation created successfully.');
      window.location.href = `/admin/beta/cohort-intervention/activation-token-redemption-unlock-emergency-rollback-authority/${data.tokenRedemptionUnlockEmergencyRollbackAuthority.act_token_redempt_unlock_emergency_rollback_authority_id}`;
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
      const id = record.act_token_redempt_unlock_emergency_rollback_authority_id;
      const data = await Client.evaluateUnlockEmergencyRollbackAuthority(id, confirmations);
      setRecord(data.tokenRedemptionUnlockEmergencyRollbackAuthority);
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
      const id = record.act_token_redempt_unlock_emergency_rollback_authority_id;
      const data = await Client.recordDecision(id, {
        decision,
        rationale,
        rollback_officer_id: rollbackOfficerId,
        rollback_officer_role: rollbackOfficerRole,
        reason
      });
      setRecord(data.tokenRedemptionUnlockEmergencyRollbackAuthority);
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
      const id = record.act_token_redempt_unlock_emergency_rollback_authority_id;
      await Client.finalizeUnlockEmergencyRollbackAuthority(id);
      setMessage('Record finalized successfully.');
      fetchDetails(id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 bg-slate-900 text-white min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Phase 177 — Unlock Emergency Rollback Authority Confirmation Gate
          </h1>
          {unlockEmergencyRollbackAuthorityId && (
            <Link
              to="/admin/beta/cohort-intervention/activation-token-redemption-unlock-emergency-rollback-authority"
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition"
            >
              Back to List
            </Link>
          )}
        </div>

        {/* Warning Banner */}
        <div className="bg-amber-950/60 border border-amber-500/50 p-4 rounded-lg mb-8 text-amber-200 text-sm">
          <p className="font-bold mb-1">⚠️ Safety Boundary Gating Warning</p>
          <ul className="list-disc list-inside space-y-1">
            <li>This phase records Emergency Rollback Authority confirmation only.</li>
            <li>The token is not unlocked.</li>
            <li>The token is not redeemable.</li>
            <li>The token is not redeemed.</li>
            <li>No execution plan is enabled.</li>
            <li>No jobs or queue dispatches are created.</li>
            <li>Runtime mutation count remains zero.</li>
            <li>Emergency rollback authority, rollback channel, and rollback runbook must be confirmed ready.</li>
          </ul>
        </div>

        {error && (
          <div className="bg-red-950/80 border border-red-500 p-4 rounded-lg mb-6 text-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-emerald-950/80 border border-emerald-500 p-4 rounded-lg mb-6 text-emerald-200">
            {message}
          </div>
        )}

        {!unlockEmergencyRollbackAuthorityId ? (
          <div>
            {/* Create Draft Form */}
            <form onSubmit={handleCreateDraft} className="bg-slate-800 p-6 rounded-lg mb-8 border border-slate-700">
              <h2 className="text-xl font-bold mb-4">Initialize Emergency Rollback Authority Gate</h2>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Parent Legal/Policy Hold Confirmation ID</label>
                <input
                  type="text"
                  value={legalPolicyHoldId}
                  onChange={(e) => setLegalPolicyHoldId(e.target.value)}
                  placeholder="e.g. lph_..."
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium disabled:opacity-50 transition"
              >
                Create Draft Record
              </button>
            </form>

            {/* List */}
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
              <h2 className="text-xl font-bold mb-4 font-mono text-indigo-400">&gt; Active Confirmation Records</h2>
              {list.length === 0 ? (
                <p className="text-slate-400">No active records found.</p>
              ) : (
                <div className="space-y-4">
                  {list.map((item) => (
                    <div key={item.act_token_redempt_unlock_emergency_rollback_authority_id} className="p-4 bg-slate-900 rounded border border-slate-700 flex justify-between items-center">
                      <div>
                        <div className="font-mono text-sm text-indigo-400">{item.act_token_redempt_unlock_emergency_rollback_authority_id}</div>
                        <div className="text-xs text-slate-400">Parent: {item.source_act_token_redempt_unlock_legal_policy_hold_id}</div>
                        <div className="text-xs text-slate-400">Status: <span className="font-semibold">{item.unlock_emergency_rollback_authority_status}</span></div>
                      </div>
                      <Link
                        to={`/admin/beta/cohort-intervention/activation-token-redemption-unlock-emergency-rollback-authority/${item.act_token_redempt_unlock_emergency_rollback_authority_id}`}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-xs transition"
                      >
                        Open Console
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          record && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left & Middle Column: Controls and Evaluation */}
              <div className="lg:col-span-2 space-y-8">
                {/* Status Card */}
                <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                  <h2 className="text-lg font-bold mb-4 font-mono text-indigo-400">&gt; Gate Status</h2>
                  <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                    <div>Status: <span className="text-indigo-400 font-bold">{record.unlock_emergency_rollback_authority_status}</span></div>
                    <div>Result: <span className="text-amber-400 font-bold">{record.unlock_emergency_rollback_authority_result}</span></div>
                    <div>Mode: <span className="text-slate-400">{record.unlock_emergency_rollback_authority_mode}</span></div>
                    <div>Boundary Status: <span className="text-emerald-400">SECURE_LOCKED</span></div>
                  </div>
                </div>

                {/* Rollback Officer Form */}
                {record.unlock_emergency_rollback_authority_status === 'DRAFT' && (
                  <form onSubmit={handleRecordDecision} className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                    <h2 className="text-lg font-bold mb-4 font-mono text-indigo-400">&gt; Rollback Officer Assignment</h2>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-xs font-medium mb-1">Officer ID</label>
                        <input
                          type="text"
                          value={rollbackOfficerId}
                          onChange={(e) => setRollbackOfficerId(e.target.value)}
                          placeholder="e.g. officer_name"
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Officer Role</label>
                        <select
                          value={rollbackOfficerRole}
                          onChange={(e) => setRollbackOfficerRole(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm"
                        >
                          <option value="rollback_officer">Rollback Officer</option>
                          <option value="emergency_stop_authority">Emergency Stop Authority</option>
                          <option value="operations_director">Operations Director</option>
                          <option value="site_reliability_leader">Site Reliability Leader</option>
                          <option value="chief_safety_officer">Chief Safety Officer</option>
                        </select>
                      </div>
                    </div>
                    <div className="mb-4">
                      <label className="block text-xs font-medium mb-1">Attestation Reason</label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Confirm that rollback systems are validated and online..."
                        className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm h-20"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-xs font-medium mb-1">Decision</label>
                        <select
                          value={decision}
                          onChange={(e) => setDecision(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm"
                        >
                          <option value="APPROVE_EMERGENCY_ROLLBACK_AUTHORITY">APPROVE_EMERGENCY_ROLLBACK_AUTHORITY</option>
                          <option value="REJECT">REJECT</option>
                          <option value="BLOCK">BLOCK</option>
                          <option value="ESCALATE">ESCALATE</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Decision Rationale</label>
                        <input
                          type="text"
                          value={rationale}
                          onChange={(e) => setRationale(e.target.value)}
                          placeholder="e.g. Approved readiness criteria"
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm"
                          required
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-semibold transition"
                    >
                      Record Officer, Decision and Attestation
                    </button>
                  </form>
                )}

                {/* 15 Confirmations Gating Checklist */}
                <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                  <h2 className="text-lg font-bold mb-4 font-mono text-indigo-400">&gt; 15-Point Safety & Rollback Confirmation Checklist</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-6">
                    {Object.keys(confirmations).map((k) => (
                      <label key={k} className="flex items-center space-x-2 p-2 bg-slate-900 rounded border border-slate-700/50 hover:bg-slate-800 cursor-pointer transition">
                        <input
                          type="checkbox"
                          checked={(confirmations as any)[k]}
                          onChange={(e) => setConfirmations({ ...confirmations, [k]: e.target.checked })}
                          disabled={record.unlock_emergency_rollback_authority_status !== 'DRAFT'}
                          className="rounded text-indigo-600 bg-slate-950 border-slate-700 focus:ring-0"
                        />
                        <span className="font-mono text-xs text-slate-300 truncate">{k.replace(/_/g, ' ')}</span>
                      </label>
                    ))}
                  </div>

                  {record.unlock_emergency_rollback_authority_status === 'DRAFT' && (
                    <button
                      onClick={handleEvaluate}
                      disabled={loading}
                      className="w-full py-2 bg-teal-600 hover:bg-teal-500 rounded text-sm font-semibold transition"
                    >
                      Run Evaluator
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column: Finalize panel & Rules logs */}
              <div className="space-y-8">
                {/* Finalize Panel */}
                <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                  <h2 className="text-lg font-bold mb-4 font-mono text-indigo-400">&gt; Settle Gate</h2>
                  {record.unlock_emergency_rollback_authority_status === 'APPROVED' ? (
                    <div>
                      <p className="text-sm text-slate-400 mb-4">
                        Officer decision has been recorded as APPROVED. Proceed to finalize and seal the evidence.
                      </p>
                      <button
                        onClick={handleFinalize}
                        disabled={loading}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-semibold transition"
                      >
                        Finalize & Generate Evidence Pack
                      </button>
                    </div>
                  ) : record.unlock_emergency_rollback_authority_status === 'FINALIZED' ? (
                    <div className="text-center py-4 text-emerald-400 font-bold font-mono">
                      ✅ RECORD FINALIZED & SEALED
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 italic">
                      Officer attestation and approval must be recorded to finalize.
                    </p>
                  )}
                </div>

                {/* Evaluator Rules Log */}
                <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                  <h2 className="text-lg font-bold mb-4 font-mono text-indigo-400">&gt; Rule Evaluation Logs</h2>
                  {rules.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No evaluations run yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                      {rules.map((rule, idx) => (
                        <div key={idx} className="p-2 bg-slate-900 rounded border border-slate-700 text-xs">
                          <div className="flex justify-between font-mono font-semibold">
                            <span className="truncate max-w-[150px]">{rule.check_type}</span>
                            <span className={rule.evaluation_status === 'PASSED' ? 'text-emerald-400' : 'text-red-400'}>
                              {rule.evaluation_status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
