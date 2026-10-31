import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getUnlockComplianceWitnessList,
  getUnlockComplianceWitnessDetails,
  createUnlockComplianceWitness,
  evaluateUnlockComplianceWitness,
  recordDecision,
  finalizeUnlockComplianceWitness
} from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessClient';
import { TokenRedemptionUnlockComplianceWitness, Rule, Confirmations } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitness';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockComplianceWitness() {
  const { unlockComplianceWitnessId } = useParams<{ unlockComplianceWitnessId: string }>();
  const navigate = useNavigate();

  const [list, setList] = useState<TokenRedemptionUnlockComplianceWitness[]>([]);
  const [record, setRecord] = useState<TokenRedemptionUnlockComplianceWitness | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [parentFinalHumanSealId, setParentFinalHumanSealId] = useState<string>('');
  const [witnessId, setWitnessId] = useState<string>('');
  const [witnessRole, setWitnessRole] = useState<string>('compliance_officer');
  const [reason, setReason] = useState<string>('');
  const [rationale, setRationale] = useState<string>('');

  // 13 Confirmations Checklist
  const [confirmations, setConfirmations] = useState<Confirmations>({
    compliance_witness_attestation_confirmation: false,
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

  useEffect(() => {
    loadList();
    if (unlockComplianceWitnessId) {
      loadDetails(unlockComplianceWitnessId);
    } else {
      setRecord(null);
      setRules([]);
    }
  }, [unlockComplianceWitnessId]);

  const loadList = async () => {
    try {
      const data = await getUnlockComplianceWitnessList();
      setList(data);
    } catch (e: any) {
      setError(e.message || 'Error loading list');
    }
  };

  const loadDetails = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getUnlockComplianceWitnessDetails(id);
      setRecord(res.tokenRedemptionUnlockComplianceWitness);
      setRules(res.rules);
      if (res.tokenRedemptionUnlockComplianceWitness) {
        setWitnessId(res.tokenRedemptionUnlockComplianceWitness.compliance_witness_id || '');
        setWitnessRole(res.tokenRedemptionUnlockComplianceWitness.compliance_witness_role || 'compliance_officer');
        setReason(res.tokenRedemptionUnlockComplianceWitness.compliance_witness_reason || '');
      }
    } catch (e: any) {
      setError(e.message || 'Error loading details');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentFinalHumanSealId.trim()) return;
    setLoading(true);
    try {
      const res = await createUnlockComplianceWitness(parentFinalHumanSealId);
      navigate(`/admin/beta/cohort-intervention/activation-token-redemption-unlock-compliance-witness/${res.tokenRedemptionUnlockComplianceWitness.act_token_redempt_unlock_compliance_witness_id}`);
    } catch (e: any) {
      setError(e.message || 'Error creating draft');
      setLoading(false);
    }
  };

  const handleEvaluate = async () => {
    if (!record) return;
    setLoading(true);
    try {
      const res = await evaluateUnlockComplianceWitness(record.act_token_redempt_unlock_compliance_witness_id, confirmations);
      setRecord(res.tokenRedemptionUnlockComplianceWitness);
      setRules(res.rules);
    } catch (e: any) {
      setError(e.message || 'Error during evaluation');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordWitnessAndDecision = async (decisionVal: 'APPROVE_COMPLIANCE_WITNESS' | 'REJECT_COMPLIANCE_WITNESS' | 'BLOCK' | 'ESCALATE') => {
    if (!record) return;
    setLoading(true);
    try {
      const res = await recordDecision(record.act_token_redempt_unlock_compliance_witness_id, {
        compliance_witness_id: witnessId,
        compliance_witness_role: witnessRole,
        compliance_witness_reason: reason,
        decision: decisionVal,
        rationale
      });
      setRecord(res.tokenRedemptionUnlockComplianceWitness);
      const details = await getUnlockComplianceWitnessDetails(record.act_token_redempt_unlock_compliance_witness_id);
      setRules(details.rules);
    } catch (e: any) {
      setError(e.message || 'Error recording decision');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!record) return;
    setLoading(true);
    try {
      const res = await finalizeUnlockComplianceWitness(record.act_token_redempt_unlock_compliance_witness_id);
      setRecord(res.tokenRedemptionUnlockComplianceWitness);
      const details = await getUnlockComplianceWitnessDetails(record.act_token_redempt_unlock_compliance_witness_id);
      setRules(details.rules);
    } catch (e: any) {
      setError(e.message || 'Error finalising');
    } finally {
      setLoading(false);
    }
  };

  const isWitnessIndependent = record && witnessId && (
    witnessId !== record.primary_authorizer_id &&
    witnessId !== record.secondary_authorizer_id &&
    witnessId !== record.final_human_authorizer_id
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Controlled High-Risk Cohort Intervention</h1>
            <p className="text-sm text-slate-400 font-mono">Phase 174: Activation Token Redemption Unlock Compliance Witness Gate</p>
          </div>
          <Link
            to="/admin/beta/cohort-intervention/activation-token-redemption-unlock-compliance-witness"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded transition"
          >
            Reset view / List
          </Link>
        </div>

        {/* Global Warning Banner */}
        <div className="bg-red-950/40 border border-red-800/80 rounded-lg p-4 space-y-2">
          <h3 className="text-red-400 font-bold text-sm flex items-center gap-2 uppercase tracking-wider font-mono">
            ⚠️ Security Boundary Alert — Non-Execution Enforcement
          </h3>
          <p className="text-xs text-red-300/90 leading-relaxed font-mono">
            This phase records independent compliance witness attestation only.
            The token is not unlocked. The token is not redeemable. The token is not redeemed.
            No execution plan is enabled. No jobs or queue dispatches are created.
            Runtime mutation count remains zero.
            The compliance witness must be independent from the dual-control authorizers and final human authorizer.
          </p>
        </div>

        {error && (
          <div className="bg-rose-900/40 border border-rose-800 text-rose-200 text-xs p-4 rounded-lg font-mono">
            Error: {error}
          </div>
        )}

        {!unlockComplianceWitnessId ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Draft Creation Form */}
            <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Create Witness Attestation Draft</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-mono">Parent Final Human Seal ID</label>
                  <input
                    type="text"
                    value={parentFinalHumanSealId}
                    onChange={(e) => setParentFinalHumanSealId(e.target.value)}
                    placeholder="fhas_..."
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white font-semibold text-xs py-2 px-4 rounded transition"
                >
                  {loading ? 'Processing...' : 'Create Draft'}
                </button>
              </form>
            </div>

            {/* List Table */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Compliance Witness Attestations</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono">
                      <th className="py-2">ID</th>
                      <th className="py-2">Cohort</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Witness</th>
                      <th className="py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {list.map((item) => (
                      <tr key={item.act_token_redempt_unlock_compliance_witness_id} className="hover:bg-slate-800/30">
                        <td className="py-2 font-mono text-xs">
                          <Link
                            to={`/admin/beta/cohort-intervention/activation-token-redemption-unlock-compliance-witness/${item.act_token_redempt_unlock_compliance_witness_id}`}
                            className="text-cyan-400 hover:underline"
                          >
                            {item.act_token_redempt_unlock_compliance_witness_id.substring(0, 12)}...
                          </Link>
                        </td>
                        <td className="py-2">{item.cohort_id}</td>
                        <td className="py-2">
                          <span className="px-2 py-0.5 text-xs bg-slate-800 rounded font-semibold text-slate-300">
                            {item.unlock_compliance_witness_status}
                          </span>
                        </td>
                        <td className="py-2 font-mono text-xs">{item.compliance_witness_id || 'N/A'}</td>
                        <td className="py-2 text-xs font-mono">{item.unlock_compliance_witness_result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                      <h2 className="text-lg font-bold text-white font-mono">{record.act_token_redempt_unlock_compliance_witness_id}</h2>
                      <p className="text-xs text-slate-400 font-mono">Parent Human Seal: {record.source_act_token_redempt_unlock_final_human_auth_seal_id}</p>
                    </div>
                    <span className="px-3 py-1 bg-cyan-950 border border-cyan-800 text-cyan-200 text-xs font-semibold rounded-full uppercase">
                      {record.unlock_compliance_witness_status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs pt-4 border-t border-slate-800">
                    <div>
                      <span className="text-slate-400 block mb-0.5">Token Status</span>
                      <span className="font-mono text-white">{record.token_unlock_status}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">Redeemable</span>
                      <span className="font-mono text-white">{record.token_redeemable_status}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">Redemption</span>
                      <span className="font-mono text-white">{record.token_redemption_status}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">Risk Level</span>
                      <span className="font-mono text-white">{record.risk_level}</span>
                    </div>
                  </div>
                </div>

                {/* 13 Confirmations checklist */}
                {record.unlock_compliance_witness_status !== 'FINALIZED' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">13 Governance Confirmations Checklist</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                      {Object.keys(confirmations).map((key) => (
                        <label key={key} className="flex items-start gap-2 cursor-pointer text-slate-300 hover:text-white">
                          <input
                            type="checkbox"
                            checked={(confirmations as any)[key]}
                            onChange={(e) => setConfirmations({ ...confirmations, [key]: e.target.checked })}
                            className="mt-0.5 rounded bg-slate-950 border-slate-800 text-cyan-600 focus:ring-cyan-500"
                          />
                          <span>{key.replace(/_/g, ' ')}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={handleEvaluate}
                      disabled={loading}
                      className="mt-4 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs py-2 px-4 rounded transition"
                    >
                      {loading ? 'Evaluating...' : 'Evaluate & Log Confirmations'}
                    </button>
                  </div>
                )}

                {/* Rules Results */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Rule Evaluation Logs ({rules.length})</h2>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {rules.map((rule) => (
                      <div
                        key={rule.rule_id}
                        className={`p-3 rounded border text-xs font-mono flex justify-between items-start gap-4 ${
                          rule.severity === 'CRITICAL'
                            ? 'bg-rose-950/20 border-rose-900 text-rose-300'
                            : rule.severity === 'WARNING'
                            ? 'bg-amber-950/20 border-amber-900 text-amber-300'
                            : 'bg-slate-950/60 border-slate-850 text-slate-300'
                        }`}
                      >
                        <div>
                          <span className="font-bold text-slate-400 block mb-1">[{rule.check_type}]</span>
                          <span>{rule.description}</span>
                        </div>
                        <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900">
                          {rule.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lineage visualizer */}
                {record.lineage_hash_chain_json && (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Lineage Hash Chain</h2>
                    <div className="bg-slate-950 p-4 rounded border border-slate-850 space-y-2 max-h-60 overflow-y-auto">
                      {Object.keys(record.lineage_hash_chain_json).map((key) => (
                        <div key={key} className="flex justify-between items-center text-xs font-mono border-b border-slate-900 pb-1">
                          <span className="text-slate-400">{key}</span>
                          <span className="text-cyan-400 text-[10px]">{record.lineage_hash_chain_json[key]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* Action Sidebar */}
              <div className="lg:col-span-1 space-y-6">
                
                {/* Attestation Form */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Compliance Witness Attestation</h2>
                  
                  {/* Warning Banner */}
                  {witnessId && !isWitnessIndependent && (
                    <div className="bg-rose-950/40 border border-rose-900 text-rose-300 text-xs p-3 rounded font-mono leading-relaxed">
                      ⚠️ VIOLATION: Compliance witness must be independent and cannot duplicate the primary, secondary, or final human authorizer.
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1 font-mono">Compliance Witness ID</label>
                      <input
                        type="text"
                        value={witnessId}
                        onChange={(e) => setWitnessId(e.target.value)}
                        placeholder="user_diana"
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        disabled={record.unlock_compliance_witness_status === 'FINALIZED'}
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1 font-mono">Witness Role</label>
                      <select
                        value={witnessRole}
                        onChange={(e) => setWitnessRole(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        disabled={record.unlock_compliance_witness_status === 'FINALIZED'}
                      >
                        <option value="compliance_officer">Compliance Officer</option>
                        <option value="security_officer">Security Officer</option>
                        <option value="risk_officer">Risk Officer</option>
                        <option value="audit_officer">Audit Officer</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1 font-mono">Attestation Reason</label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Compliance attestation reason..."
                        rows={3}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        disabled={record.unlock_compliance_witness_status === 'FINALIZED'}
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1 font-mono">Governance Rationale</label>
                      <textarea
                        value={rationale}
                        onChange={(e) => setRationale(e.target.value)}
                        placeholder="Optional rationale for decision..."
                        rows={2}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        disabled={record.unlock_compliance_witness_status === 'FINALIZED'}
                      />
                    </div>

                    {record.unlock_compliance_witness_status !== 'FINALIZED' && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleRecordWitnessAndDecision('APPROVE_COMPLIANCE_WITNESS')}
                          disabled={loading || !witnessId.trim() || !isWitnessIndependent}
                          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-semibold text-xs py-2 px-3 rounded transition"
                        >
                          Approve Witness
                        </button>
                        <button
                          onClick={() => handleRecordWitnessAndDecision('REJECT_COMPLIANCE_WITNESS')}
                          disabled={loading || !witnessId.trim()}
                          className="bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white font-semibold text-xs py-2 px-3 rounded transition"
                        >
                          Reject
                        </button>
                      </div>
                    )}

                    {record.unlock_compliance_witness_status === 'APPROVED' && (
                      <button
                        onClick={handleFinalize}
                        disabled={loading}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs py-2 px-4 rounded transition uppercase font-mono tracking-wider"
                      >
                        Finalize & Freeze Package
                      </button>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )
        )}

      </div>
    </div>
  );
}
