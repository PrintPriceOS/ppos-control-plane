import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getUnlockFinalHumanAuthorizationSealDetails,
  createUnlockFinalHumanAuthorizationSeal,
  evaluateUnlockFinalHumanAuthorizationSeal,
  recordDecision,
  finalizeUnlockFinalHumanAuthorizationSeal,
  getUnlockFinalHumanAuthorizationSealList
} from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealClient';
import {
  TokenRedemptionUnlockFinalHumanAuthorizationSeal,
  Rule,
  Confirmations
} from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSeal';

const ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSeal: React.FC = () => {
  const { unlockFinalHumanAuthorizationSealId } = useParams<{ unlockFinalHumanAuthorizationSealId?: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<TokenRedemptionUnlockFinalHumanAuthorizationSeal[]>([]);
  const [record, setRecord] = useState<TokenRedemptionUnlockFinalHumanAuthorizationSeal | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);

  // Form states
  const [parentDualControlId, setParentDualControlId] = useState<string>('');
  const [finalAuthorizerId, setFinalAuthorizerId] = useState<string>('');
  const [finalAuthorizerRole, setFinalAuthorizerRole] = useState<string>('operations_director');
  const [reason, setReason] = useState<string>('');
  const [rationale, setRationale] = useState<string>('');

  const [confirmations, setConfirmations] = useState<Confirmations>({
    final_human_seal_authorizer_unlock_authorization_seal_confirmation: false,
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

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (unlockFinalHumanAuthorizationSealId) {
        const details = await getUnlockFinalHumanAuthorizationSealDetails(unlockFinalHumanAuthorizationSealId);
        setRecord(details.tokenRedemptionUnlockFinalHumanAuthorizationSeal);
        setRules(details.rules);
        setFinalAuthorizerId(details.tokenRedemptionUnlockFinalHumanAuthorizationSeal.final_human_authorizer_id || '');
        setFinalAuthorizerRole(details.tokenRedemptionUnlockFinalHumanAuthorizationSeal.final_human_authorizer_role || 'operations_director');
        setReason(details.tokenRedemptionUnlockFinalHumanAuthorizationSeal.final_human_authorization_seal_reason || '');
      } else {
        const dataList = await getUnlockFinalHumanAuthorizationSealList();
        setList(dataList);
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Error fetching data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [unlockFinalHumanAuthorizationSealId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentDualControlId.trim()) return;
    setLoading(true);
    try {
      const res = await createUnlockFinalHumanAuthorizationSeal(parentDualControlId);
      navigate(`/admin/beta/cohort-intervention/activation-token-redemption-unlock-final-human-authorization-seal/${res.tokenRedemptionUnlockFinalHumanAuthorizationSeal.act_token_redempt_unlock_final_human_authorization_seal_id}`);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Error creating draft');
      setLoading(false);
    }
  };

  const handleEvaluate = async () => {
    if (!record) return;
    setLoading(true);
    try {
      const res = await evaluateUnlockFinalHumanAuthorizationSeal(record.act_token_redempt_unlock_final_human_authorization_seal_id, confirmations);
      setRecord(res.tokenRedemptionUnlockFinalHumanAuthorizationSeal);
      setRules(res.rules);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Error during evaluation');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordAuthorizerAndDecision = async (decision: 'APPROVE_FINAL_SEAL' | 'REJECT_FINAL_SEAL' | 'BLOCK' | 'ESCALATE') => {
    if (!record) return;
    setLoading(true);
    try {
      const res = await recordDecision(record.act_token_redempt_unlock_final_human_authorization_seal_id, {
        final_human_authorizer_id: finalAuthorizerId,
        final_human_authorizer_role: finalAuthorizerRole,
        final_human_authorization_seal_reason: reason,
        decision,
        rationale
      });
      setRecord(res.tokenRedemptionUnlockFinalHumanAuthorizationSeal);
      const details = await getUnlockFinalHumanAuthorizationSealDetails(record.act_token_redempt_unlock_final_human_authorization_seal_id);
      setRules(details.rules);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Error recording decision');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!record) return;
    setLoading(true);
    try {
      const res = await finalizeUnlockFinalHumanAuthorizationSeal(record.act_token_redempt_unlock_final_human_authorization_seal_id);
      setRecord(res.tokenRedemptionUnlockFinalHumanAuthorizationSeal);
      const details = await getUnlockFinalHumanAuthorizationSealDetails(record.act_token_redempt_unlock_final_human_authorization_seal_id);
      setRules(details.rules);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Error finalising');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !record && list.length === 0) {
    return <div className="p-8 text-white">Loading governance deck...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Controlled Beta Cohort Intervention Unlock Final Human Authorization Seal Gate
            </h1>
            <p className="text-sm text-slate-400">Phase 173 — Safety Boundary Protection System</p>
          </div>
          <Link
            to="/admin/beta/cohort-intervention/activation-token-redemption-unlock-final-human-authorization-seal"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition"
          >
            All Seals
          </Link>
        </header>

        {error && (
          <div className="bg-red-950/50 border border-red-500/50 text-red-200 p-4 rounded text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Warning Banner */}
        <div className="bg-amber-950/40 border-l-4 border-amber-500 p-4 rounded text-amber-200 text-sm space-y-2">
          <h3 className="font-bold text-amber-400">[SAFETY BOUNDARY ENFORCED] - READ-ONLY GOVERNANCE TARGET</h3>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>This phase records final human authorization seal only.</li>
            <li>The activation token remains completely locked (`NOT_UNLOCKED`).</li>
            <li>The token is not redeemable and not redeemed.</li>
            <li>No execution plan is enabled, and no jobs or queue dispatches are created.</li>
            <li>Runtime mutation count remains zero.</li>
            <li>A final human authorizer is required and must be independent from both dual-control authorizers.</li>
          </ul>
        </div>

        {!unlockFinalHumanAuthorizationSealId ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Active Seals Registry</h2>
              {list.length === 0 ? (
                <p className="text-slate-500 text-sm">No seals found in registry.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-medium">
                        <th className="py-2">ID</th>
                        <th className="py-2">Cohort</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Final Authorizer</th>
                        <th className="py-2">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {list.map((item) => (
                        <tr key={item.act_token_redempt_unlock_final_human_authorization_seal_id} className="hover:bg-slate-800/30">
                          <td className="py-2 font-mono text-xs">
                            <Link
                              to={`/admin/beta/cohort-intervention/activation-token-redemption-unlock-final-human-authorization-seal/${item.act_token_redempt_unlock_final_human_authorization_seal_id}`}
                              className="text-cyan-400 hover:underline"
                            >
                              {item.act_token_redempt_unlock_final_human_authorization_seal_id.substring(0, 12)}...
                            </Link>
                          </td>
                          <td className="py-2">{item.cohort_id}</td>
                          <td className="py-2">
                            <span className="px-2 py-0.5 text-xs bg-slate-800 rounded font-semibold text-slate-300">
                              {item.unlock_final_human_authorization_seal_status}
                            </span>
                          </td>
                          <td className="py-2 font-mono text-xs">{item.final_human_authorizer_id || 'N/A'}</td>
                          <td className="py-2 text-xs font-mono">{item.unlock_final_human_authorization_seal_result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Initiate Final Human Seal</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Parent Dual Control ID
                  </label>
                  <input
                    type="text"
                    value={parentDualControlId}
                    onChange={(e) => setParentDualControlId(e.target.value)}
                    placeholder="dcau_..."
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm focus:outline-none focus:border-cyan-500 font-mono"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 rounded text-sm font-semibold text-white transition"
                >
                  Create Draft Seal
                </button>
              </form>
            </div>
          </div>
        ) : (
          record && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* State Overview */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-lg font-bold text-white font-mono">{record.act_token_redempt_unlock_final_human_authorization_seal_id}</h2>
                      <p className="text-xs text-slate-400 font-mono">Parent Dual-Control: {record.source_act_token_redempt_unlock_dual_control_authorization_id}</p>
                    </div>
                    <span className="px-3 py-1 bg-cyan-950 border border-cyan-800 text-cyan-200 text-xs font-semibold rounded-full uppercase">
                      {record.unlock_final_human_authorization_seal_status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                    <div className="bg-slate-950 p-3 rounded">
                      <div className="text-slate-400 font-semibold mb-1">Security Boundary</div>
                      <div className="font-mono text-emerald-400">PRESERVED</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded">
                      <div className="text-slate-400 font-semibold mb-1">Token Status</div>
                      <div className="font-mono text-amber-400">{record.token_unlock_status}</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded">
                      <div className="text-slate-400 font-semibold mb-1">Execution Mode</div>
                      <div className="font-mono text-slate-300">{record.unlock_final_human_authorization_seal_mode}</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded">
                      <div className="text-slate-400 font-semibold mb-1">Job Creation</div>
                      <div className="font-mono text-slate-300">{record.job_creation_status}</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded">
                      <div className="text-slate-400 font-semibold mb-1">Queue Dispatch</div>
                      <div className="font-mono text-slate-300">{record.queue_dispatch_status}</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded">
                      <div className="text-slate-400 font-semibold mb-1">Runtime Mutations</div>
                      <div className="font-mono text-slate-300">{record.runtime_mutation_status}</div>
                    </div>
                  </div>
                </div>

                {/* Setup authorizer & decision if draft/evaluated/approved */}
                {record.unlock_final_human_authorization_seal_status !== 'FINALIZED' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-6">
                    <h2 className="text-lg font-bold text-white">Human Seal Authorizer & Decision Desk</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                          Final Human Authorizer ID
                        </label>
                        <input
                          type="text"
                          value={finalAuthorizerId}
                          onChange={(e) => setFinalAuthorizerId(e.target.value)}
                          placeholder="e.g. user_charlie"
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm focus:outline-none focus:border-cyan-500 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                          Role
                        </label>
                        <select
                          value={finalAuthorizerRole}
                          onChange={(e) => setFinalAuthorizerRole(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm focus:outline-none focus:border-cyan-500 text-white"
                        >
                          <option value="operations_director">Operations Director</option>
                          <option value="compliance_officer">Compliance Officer</option>
                          <option value="security_officer">Security Officer</option>
                          <option value="system_admin">System Admin</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                        Attestation & Seal Reason
                      </label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="State reason for confirming final human authorization seal..."
                        rows={2}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm focus:outline-none focus:border-cyan-500 text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                        Decision Rationale (if approving/rejecting)
                      </label>
                      <textarea
                        value={rationale}
                        onChange={(e) => setRationale(e.target.value)}
                        placeholder="State the decision rationale..."
                        rows={2}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm focus:outline-none focus:border-cyan-500 text-white"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        onClick={() => handleRecordAuthorizerAndDecision('APPROVE_FINAL_SEAL')}
                        disabled={loading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded disabled:bg-slate-800 transition"
                      >
                        Record Approval Decision
                      </button>
                      <button
                        onClick={() => handleRecordAuthorizerAndDecision('REJECT_FINAL_SEAL')}
                        disabled={loading}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded disabled:bg-slate-800 transition"
                      >
                        Record Reject Decision
                      </button>
                      <button
                        onClick={handleFinalize}
                        disabled={loading || (record.unlock_final_human_authorization_seal_status !== 'APPROVED' && record.unlock_final_human_authorization_seal_status !== 'REJECTED')}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded disabled:bg-slate-800 transition"
                      >
                        Finalize Seal Gate
                      </button>
                    </div>
                  </div>
                )}

                {/* Lineage & Evidence details if Finalized */}
                {record.unlock_final_human_authorization_seal_status === 'FINALIZED' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
                    <h2 className="text-lg font-bold text-white">Lineage Chain & Evidence Pack</h2>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 font-semibold">Evidence Pack Hash:</span>{' '}
                        <code className="font-mono text-cyan-400 bg-slate-950 px-2 py-0.5 rounded">{record.evidence_pack_hash}</code>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold">Final Human Authorizer Hash:</span>{' '}
                        <code className="font-mono text-slate-300 bg-slate-950 px-2 py-0.5 rounded">
                          {record.final_human_authorizer_id ? 'Redacted (SHA-256 Hashed)' : 'N/A'}
                        </code>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirmations Column */}
              <div className="space-y-6">
                {record.unlock_final_human_authorization_seal_status !== 'FINALIZED' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
                    <h2 className="text-lg font-bold text-white">Required Confirmations (12)</h2>
                    <div className="space-y-3">
                      {Object.keys(confirmations).map((key) => (
                        <label key={key} className="flex items-start space-x-3 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={(confirmations as any)[key]}
                            onChange={(e) =>
                              setConfirmations({
                                ...confirmations,
                                [key]: e.target.checked
                              })
                            }
                            className="mt-0.5 bg-slate-950 border border-slate-800 rounded text-cyan-500 focus:ring-0 focus:ring-offset-0"
                          />
                          <span>{key.replace(/_/g, ' ').toUpperCase()}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={handleEvaluate}
                      disabled={loading}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 rounded text-xs font-semibold text-white transition mt-4"
                    >
                      Run Gating Rules Evaluation
                    </button>
                  </div>
                )}

                {/* Gating Rules List */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
                  <h2 className="text-lg font-bold text-white">Evaluated Gating Rules ({rules.length})</h2>
                  {rules.length === 0 ? (
                    <p className="text-slate-500 text-xs">No gating rules evaluated yet.</p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                      {rules.map((rule) => (
                        <div key={rule.rule_id} className={`p-3 rounded text-xs border ${
                          rule.severity === 'CRITICAL' ? 'bg-red-950/20 border-red-500/30 text-red-200' :
                          rule.severity === 'WARNING' ? 'bg-amber-950/20 border-amber-500/30 text-amber-200' :
                          'bg-slate-950 border-slate-800 text-slate-300'
                        }`}>
                          <div className="font-semibold uppercase tracking-wider mb-1 text-[10px] text-slate-400">
                            {rule.check_type} • {rule.severity}
                          </div>
                          <div>{rule.description}</div>
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
};

export default ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSeal;
