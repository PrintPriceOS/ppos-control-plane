import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureClient as Client } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureClient';
import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosure as RecordType } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosure';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosure() {
  const { unlockGovernanceReadinessClosureId } = useParams<{ unlockGovernanceReadinessClosureId: string }>();

  const [list, setList] = useState<RecordType[]>([]);
  const [record, setRecord] = useState<RecordType | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Form inputs
  const [finalNonExecutionEvidenceSealId, setFinalNonExecutionEvidenceSealId] = useState('');
  const [governanceClosureOfficerId, setGovernanceClosureOfficerId] = useState('');
  const [governanceClosureOfficerRole, setGovernanceClosureOfficerRole] = useState('compliance_officer');
  const [rationale, setRationale] = useState('');
  const [decision, setDecision] = useState('APPROVE_GOVERNANCE_READINESS_CLOSURE');

  // 18 Confirmations
  const [confirmations, setConfirmations] = useState({
    governance_readiness_closure_confirmation: false,
    phase160_to_phase179_chain_complete_confirmed: false,
    final_non_execution_evidence_seal_verified: false,
    kill_switch_dry_run_verified: false,
    emergency_rollback_authority_verified: false,
    legal_policy_hold_clearance_verified: false,
    risk_officer_countersign_verified: false,
    compliance_witness_attestation_verified: false,
    final_human_authorization_seal_verified: false,
    dual_control_authorization_verified: false,
    operator_attestation_verified: false,
    pre_execution_freeze_verified: false,
    readiness_seal_verified: false,
    final_review_verified: false,
    token_never_unlocked_confirmed: false,
    token_never_redeemable_confirmed: false,
    token_never_redeemed_confirmed: false,
    zero_runtime_mutation_confirmed: false
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchList = async () => {
    try {
      setLoading(true);
      const data = await Client.getUnlockGovernanceReadinessClosureList();
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
      const data = await Client.getUnlockGovernanceReadinessClosureDetails(id);
      setRecord(data.tokenRedemptionUnlockGovernanceReadinessClosure);
      setRules(data.rules);
      setAuditLogs(data.auditLogs);
      setGovernanceClosureOfficerId(data.tokenRedemptionUnlockGovernanceReadinessClosure.governance_closure_officer_id || '');
      setGovernanceClosureOfficerRole(data.tokenRedemptionUnlockGovernanceReadinessClosure.governance_closure_officer_role || 'compliance_officer');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (unlockGovernanceReadinessClosureId) {
      fetchDetails(unlockGovernanceReadinessClosureId);
    } else {
      fetchList();
      setRecord(null);
    }
  }, [unlockGovernanceReadinessClosureId]);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalNonExecutionEvidenceSealId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await Client.createUnlockGovernanceReadinessClosure(finalNonExecutionEvidenceSealId);
      setMessage('Draft governance readiness closure created successfully.');
      window.location.href = `/admin/beta/cohort-intervention/activation-token-redemption-unlock-governance-readiness-closure/${data.tokenRedemptionUnlockGovernanceReadinessClosure.act_token_redempt_unlock_governance_readiness_closure_id}`;
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
      const id = record.act_token_redempt_unlock_governance_readiness_closure_id;
      const data = await Client.evaluateUnlockGovernanceReadinessClosure(id, confirmations);
      setRecord(data.tokenRedemptionUnlockGovernanceReadinessClosure);
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
      const id = record.act_token_redempt_unlock_governance_readiness_closure_id;
      const data = await Client.recordDecision(
        id,
        decision as any,
        rationale,
        governanceClosureOfficerId,
        governanceClosureOfficerRole
      );
      setRecord(data.tokenRedemptionUnlockGovernanceReadinessClosure);
      setMessage('Governance closure decision recorded successfully.');
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
      const id = record.act_token_redempt_unlock_governance_readiness_closure_id;
      const data = await Client.finalizeUnlockGovernanceReadinessClosure(id);
      setRecord(data.tokenRedemptionUnlockGovernanceReadinessClosure);
      setMessage('Governance readiness closure finalized successfully.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (key: keyof typeof confirmations) => {
    setConfirmations(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="p-8 max-w-6xl mx-auto text-slate-100 bg-slate-900 min-h-screen">
      <div className="mb-8">
        <Link to="/admin/beta/cohort-intervention/activation-token-redemption-unlock-governance-readiness-closure" className="text-emerald-400 hover:underline">
          &larr; Back to Closure Records
        </Link>
      </div>

      <div className="bg-slate-950 border border-slate-700 rounded-xl p-6 mb-8 text-slate-300">
        <h2 className="text-xl font-bold mb-2 uppercase tracking-wide text-white">⚠️ Safety Boundary & Governance Closure Warning</h2>
        <p className="text-sm leading-relaxed">
          This phase closes governance readiness only. The token is not unlocked. The token is not redeemable. The token is not redeemed. No execution plan is enabled. No jobs or queue dispatches are created. Runtime mutation count remains zero. This closure does not authorize unlock or redemption.
        </p>
      </div>

      <h1 className="text-3xl font-extrabold mb-8 tracking-tight text-white">
        Governance Readiness Closure Gate
      </h1>

      {error && (
        <div className="bg-rose-900/50 border border-rose-700 rounded-xl p-4 mb-6 text-rose-200">
          <strong>Error:</strong> {error}
        </div>
      )}

      {message && (
        <div className="bg-emerald-900/50 border border-emerald-700 rounded-xl p-4 mb-6 text-emerald-200">
          {message}
        </div>
      )}

      {!record ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700">
            <h2 className="text-xl font-bold mb-4 text-white">Trigger New Governance Closure</h2>
            <form onSubmit={handleCreateDraft}>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Parent Final Evidence Seal ID</label>
                <input
                  type="text"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500"
                  value={finalNonExecutionEvidenceSealId}
                  onChange={e => setFinalNonExecutionEvidenceSealId(e.target.value)}
                  placeholder="fnees_..."
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Create Governance Closure Draft
              </button>
            </form>
          </div>

          <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700">
            <h2 className="text-xl font-bold mb-4 text-white">Active Closure Records</h2>
            {list.length === 0 ? (
              <p className="text-slate-400">No active governance closure gates found.</p>
            ) : (
              <div className="space-y-3">
                {list.map(item => (
                  <Link
                    key={item.act_token_redempt_unlock_governance_readiness_closure_id}
                    to={`/admin/beta/cohort-intervention/activation-token-redemption-unlock-governance-readiness-closure/${item.act_token_redempt_unlock_governance_readiness_closure_id}`}
                    className="block p-4 bg-slate-900 border border-slate-700 hover:border-slate-500 rounded-xl transition-all"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-emerald-400 text-sm">
                        {item.act_token_redempt_unlock_governance_readiness_closure_id}
                      </span>
                      <span className="px-3 py-1 text-xs font-bold rounded bg-slate-800 text-slate-300">
                        {item.unlock_governance_readiness_closure_status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-xl font-bold mb-4 text-white">Governance Closure Status Overview</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400 block">Record ID</span>
                  <span className="font-mono text-white">{record.act_token_redempt_unlock_governance_readiness_closure_id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Gate Status</span>
                  <span className="text-emerald-400 font-bold">{record.unlock_governance_readiness_closure_status}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Verification Result</span>
                  <span className="text-white font-mono">{record.unlock_governance_readiness_closure_result}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Mode</span>
                  <span className="text-white font-mono">{record.unlock_governance_readiness_closure_mode}</span>
                </div>
              </div>
            </div>

            {record.unlock_governance_readiness_closure_status === 'DRAFT' && (
              <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700">
                <h2 className="text-xl font-bold mb-4 text-white">18 Confirmations Checklist</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.keys(confirmations).map(k => {
                    const key = k as keyof typeof confirmations;
                    return (
                      <label key={key} className="flex items-start space-x-3 cursor-pointer p-2 bg-slate-900/50 rounded-lg hover:bg-slate-900 border border-slate-700/50">
                        <input
                          type="checkbox"
                          checked={confirmations[key]}
                          onChange={() => handleCheckboxChange(key)}
                          className="mt-1 rounded text-emerald-500 bg-slate-950 border-slate-700 focus:ring-0 focus:ring-offset-0"
                        />
                        <span className="text-xs text-slate-300 font-medium">
                          {key.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <button
                  onClick={handleEvaluate}
                  disabled={loading}
                  className="mt-6 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-colors"
                >
                  Evaluate Invariant Rules
                </button>
              </div>
            )}

            {record.unlock_governance_readiness_closure_status === 'EVALUATED' && (
              <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700">
                <h2 className="text-xl font-bold mb-4 text-white">Submit Governance Closure Decision</h2>
                <form onSubmit={handleRecordDecision}>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm mb-2">Governance Officer ID</label>
                      <input
                        type="text"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500"
                        value={governanceClosureOfficerId}
                        onChange={e => setGovernanceClosureOfficerId(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-2">Verification Role</label>
                      <select
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500"
                        value={governanceClosureOfficerRole}
                        onChange={e => setGovernanceClosureOfficerRole(e.target.value)}
                      >
                        <option value="governance_officer">Governance Officer</option>
                        <option value="compliance_officer">Compliance Officer</option>
                        <option value="security_officer">Security Officer</option>
                        <option value="chief_governance_officer">Chief Governance Officer</option>
                        <option value="audit_officer">Audit Officer</option>
                      </select>
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm mb-2">Verification Decision</label>
                    <select
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500"
                      value={decision}
                      onChange={e => setDecision(e.target.value)}
                    >
                      <option value="APPROVE_GOVERNANCE_READINESS_CLOSURE">Approve Governance Readiness Closure</option>
                      <option value="REJECT_GOVERNANCE_READINESS_CLOSURE">Reject Governance Readiness Closure</option>
                    </select>
                  </div>
                  <div className="mb-6">
                    <label className="block text-sm mb-2">Rationale / Observations</label>
                    <textarea
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500"
                      value={rationale}
                      onChange={e => setRationale(e.target.value)}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-colors"
                  >
                    Submit Decision
                  </button>
                </form>
              </div>
            )}

            {record.unlock_governance_readiness_closure_status === 'APPROVED' && (
              <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700">
                <h2 className="text-xl font-bold mb-4 text-white">Finalize Governance Closure</h2>
                <p className="text-sm text-slate-300 mb-6">
                  Seals the final governance readiness closure, computes the final lineage hashes back to Phase 164, and locks the safety state.
                </p>
                <button
                  onClick={handleFinalize}
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-colors"
                >
                  Finalize and Seal Gate
                </button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {rules.length > 0 && (
              <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700">
                <h3 className="font-bold text-white mb-4">Checklist Evaluation Results</h3>
                <div className="space-y-3">
                  {rules.map(rule => (
                    <div key={rule.rule_log_id} className="p-3 bg-slate-900 rounded-xl border border-slate-700/50 flex justify-between items-center text-xs">
                      <div>
                        <strong className="block text-slate-300">{rule.rule_code}</strong>
                        <span className="text-slate-500">{rule.severity}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded font-bold ${rule.evaluation_status === 'PASSED' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                        {rule.evaluation_status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
