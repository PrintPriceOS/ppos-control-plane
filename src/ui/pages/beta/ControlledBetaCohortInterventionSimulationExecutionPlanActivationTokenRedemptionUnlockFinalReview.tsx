import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewClient } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewClient';
import { TokenRedemptionUnlockFinalReview, UnlockFinalReviewRule } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReview';
import { ShieldAlert, CheckCircle, AlertTriangle, CheckSquare, Lock, Eye, AlertOctagon } from 'lucide-react';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockFinalReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const client = new ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<TokenRedemptionUnlockFinalReview | null>(null);
  const [rules, setRules] = useState<UnlockFinalReviewRule[]>([]);

  // 7 Confirmations State
  const [securityConfirmed, setSecurityConfirmed] = useState(false);
  const [complianceConfirmed, setComplianceConfirmed] = useState(false);
  const [opsDirectorConfirmed, setOpsDirectorConfirmed] = useState(false);
  const [rollbackConfirmed, setRollbackConfirmed] = useState(false);
  const [killSwitchConfirmed, setKillSwitchConfirmed] = useState(false);
  const [nonExecConfirmed, setNonExecConfirmed] = useState(false);
  const [noUnlockConfirmed, setNoUnlockConfirmed] = useState(false);

  // Decision state
  const [rationale, setRationale] = useState('');
  const [decisionType, setDecisionType] = useState<'APPROVE_FINAL_REVIEW' | 'REJECT_FINAL_REVIEW' | 'BLOCK' | 'ESCALATE'>('APPROVE_FINAL_REVIEW');

  const loadDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await client.getUnlockFinalReviewDetails(id);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockFinalReview);
        setRules(res.rules || []);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [id]);

  const handleEvaluate = async () => {
    if (!record) return;
    try {
      const res = await client.evaluateUnlockFinalReview(record.activation_token_redemption_unlock_final_review_id, {
        security_officer_confirmation: securityConfirmed,
        compliance_officer_confirmation: complianceConfirmed,
        operations_director_confirmation: opsDirectorConfirmed,
        rollback_authority_confirmation: rollbackConfirmed,
        kill_switch_confirmation: killSwitchConfirmed,
        non_execution_confirmation: nonExecConfirmed,
        final_review_no_unlock_confirmation: noUnlockConfirmed
      });
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockFinalReview);
        setRules(res.rules || []);
      }
    } catch (e: any) {
      alert(`Evaluation failed: ${e.message}`);
    }
  };

  const handleDecision = async () => {
    if (!record) return;
    try {
      const res = await client.recordDecision(record.activation_token_redemption_unlock_final_review_id, decisionType, rationale);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockFinalReview);
      }
    } catch (e: any) {
      alert(`Failed to record decision: ${e.message}`);
    }
  };

  const handleFinalize = async () => {
    if (!record) return;
    try {
      const res = await client.finalizeUnlockFinalReview(record.activation_token_redemption_unlock_final_review_id);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockFinalReview);
      }
    } catch (e: any) {
      alert(`Finalization failed: ${e.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090b0f] text-slate-200">
        <div className="animate-spin text-emerald-500"><Lock className="w-12 h-12" /></div>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="min-h-screen bg-[#090b0f] text-slate-200 p-8 flex flex-col items-center justify-center">
        <AlertOctagon className="w-16 h-16 text-rose-500 mb-4 animate-bounce" />
        <h1 className="text-2xl font-bold tracking-tight text-rose-500 mb-2">Error Loading Gate</h1>
        <p className="text-slate-400 mb-6">{error || 'Record not found'}</p>
        <button onClick={() => navigate(-1)} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090b0f] text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
      {/* 1. Top Safety/Non-Execution Banner */}
      <div className="bg-gradient-to-r from-amber-950 via-red-950 to-amber-950 border-b border-amber-800 p-4">
        <div className="max-w-7xl mx-auto flex items-center space-x-3 text-amber-300">
          <ShieldAlert className="w-6 h-6 animate-pulse flex-shrink-0" />
          <div className="text-sm font-medium">
            <span className="font-bold uppercase tracking-wider text-amber-200 mr-2">[SAFETY BOUNDARY ENFORCED]:</span>
            This phase performs final review only. The token is not unlocked, the token is not redeemable, the token is not redeemed. No execution plan is enabled, no jobs or queue dispatches are created. Runtime mutation count remains zero.
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-6 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono text-emerald-500 mb-1 uppercase tracking-wider">
              <span>Phase 168</span>
              <span>•</span>
              <span>Unlock Final Review Gate</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              {record.activation_token_redemption_unlock_final_review_id}
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Parent Approval ID: <span className="font-mono text-slate-300">{record.source_activation_token_redemption_unlock_approval_id}</span>
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase tracking-wider ${
              record.unlock_final_review_status === 'FINALIZED' ? 'bg-emerald-950 border border-emerald-800 text-emerald-300' :
              record.unlock_final_review_status === 'APPROVED' ? 'bg-sky-950 border border-sky-800 text-sky-300' :
              'bg-slate-900 border border-slate-700 text-slate-300'
            }`}>
              {record.unlock_final_review_status}
            </span>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Controls & Verification */}
          <div className="lg:col-span-2 space-y-8">
            {/* Step 1: Governance Verification */}
            <div className="bg-[#0e121a] border border-slate-800 rounded-xl p-6 space-y-6">
              <h2 className="text-lg font-bold flex items-center space-x-2 border-b border-slate-800 pb-3">
                <CheckSquare className="w-5 h-5 text-emerald-400" />
                <span>1. Multi-Officer Governance Confirmations</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: 'Security Officer Unlock Approval', state: securityConfirmed, setter: setSecurityConfirmed },
                  { label: 'Compliance Officer Unlock Approval', state: complianceConfirmed, setter: setComplianceConfirmed },
                  { label: 'Operations Director Unlock Approval', state: opsDirectorConfirmed, setter: setOpsDirectorConfirmed },
                  { label: 'Rollback Authority Unlock Approval', state: rollbackConfirmed, setter: setRollbackConfirmed },
                  { label: 'Kill Switch Verified', state: killSwitchConfirmed, setter: setKillSwitchConfirmed },
                  { label: 'Non-Execution Confirmed', state: nonExecConfirmed, setter: setNonExecConfirmed },
                  { label: 'Final Review No Unlock Confirmed', state: noUnlockConfirmed, setter: setNoUnlockConfirmed },
                ].map((item, idx) => (
                  <label key={idx} className="flex items-center space-x-3 p-3 bg-[#131924] hover:bg-[#1a2230] rounded-lg cursor-pointer border border-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={item.state}
                      disabled={record.unlock_final_review_status !== 'DRAFT'}
                      onChange={(e) => item.setter(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-950 w-4 h-4"
                    />
                    <span className="text-sm font-medium text-slate-300">{item.label}</span>
                  </label>
                ))}
              </div>

              {record.unlock_final_review_status === 'DRAFT' && (
                <button
                  onClick={handleEvaluate}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-emerald-500/10 transition-all"
                >
                  Run Governance Rules Check
                </button>
              )}
            </div>

            {/* Step 2: Rationale & Decision */}
            {record.unlock_final_review_status === 'EVALUATED' && (
              <div className="bg-[#0e121a] border border-slate-800 rounded-xl p-6 space-y-6">
                <h2 className="text-lg font-bold flex items-center space-x-2 border-b border-slate-800 pb-3">
                  <Eye className="w-5 h-5 text-sky-400" />
                  <span>2. Record Final Review Decision</span>
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">Decision Type</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(['APPROVE_FINAL_REVIEW', 'REJECT_FINAL_REVIEW', 'BLOCK', 'ESCALATE'] as const).map((dec) => (
                        <button
                          key={dec}
                          onClick={() => setDecisionType(dec)}
                          className={`py-2 text-xs font-mono font-semibold rounded-lg border transition-all ${
                            decisionType === dec ? 'bg-sky-950 border-sky-500 text-sky-200' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          {dec.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">Decision Rationale</label>
                    <textarea
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                      placeholder="Provide reasoning for this final review decision..."
                      className="w-full h-24 p-3 bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder-slate-600 font-sans"
                    />
                  </div>

                  <button
                    onClick={handleDecision}
                    disabled={!rationale.trim()}
                    className="w-full py-3 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-sky-500/10 transition-all"
                  >
                    Record Decision
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Finalization */}
            {(record.unlock_final_review_status === 'APPROVED' || record.unlock_final_review_status === 'REJECTED') && (
              <div className="bg-gradient-to-b from-[#111622] to-[#0b0e16] border border-slate-800 rounded-xl p-6 text-center space-y-4">
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto animate-pulse" />
                <h3 className="text-lg font-bold text-slate-200">Pending Final Review Lock Finalization</h3>
                <p className="text-sm text-slate-400 max-w-lg mx-auto">
                  A decision has been recorded. Finalization will seal the Phase 168 evidence pack, establish the lineage hash chain, and freeze the gate state.
                </p>
                <button
                  onClick={handleFinalize}
                  className="px-8 py-3 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-slate-900 text-sm font-bold rounded-lg shadow-lg hover:shadow-amber-500/10 transition-all"
                >
                  Finalize and Seal Gate
                </button>
              </div>
            )}

            {/* Evaluated Rules Listing */}
            {rules.length > 0 && (
              <div className="bg-[#0e121a] border border-slate-800 rounded-xl p-6 space-y-4">
                <h3 className="text-sm font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">Evaluated Rules Ledger</h3>
                <div className="space-y-3">
                  {rules.map((rule, idx) => (
                    <div key={idx} className="flex items-start space-x-3 p-3 bg-[#090b0f] border border-slate-900 rounded-lg">
                      {rule.severity === 'CRITICAL' ? (
                        <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                      ) : rule.severity === 'WARNING' ? (
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="text-sm font-semibold text-slate-200">{rule.check_type}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{rule.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar: State Summary & Lineage */}
          <div className="space-y-8">
            <div className="bg-[#0e121a] border border-slate-800 rounded-xl p-6 space-y-6">
              <h3 className="text-sm font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">Final Review Ledger</h3>
              <div className="space-y-4">
                {[
                  { label: 'Token Unlock Status', val: record.token_unlock_status },
                  { label: 'Token Redeemable Status', val: record.token_redeemable_status },
                  { label: 'Execution Capability', val: record.execution_capability_status },
                  { label: 'Plan Executable Status', val: record.plan_executable_status },
                  { label: 'Write Scope Status', val: record.write_scope_status },
                  { label: 'Runtime Mutation Status', val: record.runtime_mutation_status }
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs py-2 border-b border-slate-900">
                    <span className="text-slate-400">{item.label}</span>
                    <span className="font-mono text-slate-200 font-semibold">{item.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
