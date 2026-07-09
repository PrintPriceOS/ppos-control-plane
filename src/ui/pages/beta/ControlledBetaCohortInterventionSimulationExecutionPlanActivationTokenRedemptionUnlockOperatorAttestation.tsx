import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationClient } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationClient';
import { TokenRedemptionUnlockOperatorAttestation, UnlockOperatorAttestationRule } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestation';
import { ShieldAlert, CheckCircle, AlertTriangle, CheckSquare, Lock, Eye, AlertOctagon } from 'lucide-react';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockOperatorAttestation() {
  const { unlockOperatorAttestationId } = useParams<{ unlockOperatorAttestationId: string }>();
  const navigate = useNavigate();
  const client = new ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<TokenRedemptionUnlockOperatorAttestation | null>(null);
  const [rules, setRules] = useState<UnlockOperatorAttestationRule[]>([]);

  // 10 Confirmations State
  const [securityConfirmed, setSecurityConfirmed] = useState(false);
  const [complianceConfirmed, setComplianceConfirmed] = useState(false);
  const [opsDirectorConfirmed, setOpsDirectorConfirmed] = useState(false);
  const [rollbackConfirmed, setRollbackConfirmed] = useState(false);
  const [killSwitchConfirmed, setKillSwitchConfirmed] = useState(false);
  const [nonExecConfirmed, setNonExecConfirmed] = useState(false);
  const [readinessConfirmed, setReadinessConfirmed] = useState(false);
  const [sealConfirmed, setSealConfirmed] = useState(false);
  const [freezeConfirmed, setFreezeConfirmed] = useState(false);
  const [operatorConfirmed, setOperatorConfirmed] = useState(false);

  // Decision state
  const [rationale, setRationale] = useState('');
  const [decisionType, setDecisionType] = useState<'APPROVE_ATTESTATION' | 'REJECT_ATTESTATION' | 'BLOCK' | 'ESCALATE'>('APPROVE_ATTESTATION');

  const loadDetails = async () => {
    if (!unlockOperatorAttestationId) return;
    try {
      setLoading(true);
      const res = await client.getUnlockOperatorAttestationDetails(unlockOperatorAttestationId);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockOperatorAttestation);
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
  }, [unlockOperatorAttestationId]);

  const handleEvaluate = async () => {
    if (!record) return;
    try {
      const res = await client.evaluateUnlockOperatorAttestation(record.activation_token_redemption_unlock_operator_attestation_id, {
        security_officer_unlock_attestation_confirmation: securityConfirmed,
        compliance_officer_unlock_attestation_confirmation: complianceConfirmed,
        operations_director_unlock_attestation_confirmation: opsDirectorConfirmed,
        rollback_authority_unlock_attestation_confirmation: rollbackConfirmed,
        kill_switch_verified: killSwitchConfirmed,
        non_execution_confirmed: nonExecConfirmed,
        final_review_unlock_readiness_verified: readinessConfirmed,
        seal_authenticity_confirmed: sealConfirmed,
        pre_execution_state_sealed_confirmed: freezeConfirmed,
        operator_attestation_confirmed: operatorConfirmed
      });
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockOperatorAttestation);
        setRules(res.rules || []);
      }
    } catch (e: any) {
      alert(`Evaluation failed: ${e.message}`);
    }
  };

  const handleDecision = async () => {
    if (!record) return;
    try {
      const res = await client.recordDecision(record.activation_token_redemption_unlock_operator_attestation_id, decisionType, rationale);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockOperatorAttestation);
      }
    } catch (e: any) {
      alert(`Failed to record decision: ${e.message}`);
    }
  };

  const handleFinalize = async () => {
    if (!record) return;
    try {
      const res = await client.finalizeUnlockOperatorAttestation(record.activation_token_redemption_unlock_operator_attestation_id);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockOperatorAttestation);
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
      <div className="bg-gradient-to-r from-[#1b120c] via-[#241010] to-[#1b120c] border-b border-amber-900/40 p-4">
        <div className="max-w-7xl mx-auto flex items-center space-x-3 text-amber-300">
          <ShieldAlert className="w-6 h-6 animate-pulse flex-shrink-0" />
          <div className="text-sm font-medium">
            <span className="font-bold uppercase tracking-wider text-amber-200 mr-2">[SAFETY BOUNDARY ENFORCED]:</span>
            This phase records operator attestation only. The token is not unlocked. The token is not redeemable. The token is not redeemed. No execution plan is enabled. No jobs or queue dispatches are created. Runtime mutation count remains zero.
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-6 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono text-emerald-500 mb-1 uppercase tracking-wider">
              <span>Phase 171</span>
              <span>•</span>
              <span>Unlock Operator Attestation Gate</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              {record.activation_token_redemption_unlock_operator_attestation_id}
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Parent Freeze ID: <span className="font-mono text-slate-300">{record.source_activation_token_redemption_unlock_pre_execution_freeze_id}</span>
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase tracking-wider ${
              record.unlock_operator_attestation_status === 'FINALIZED' ? 'bg-emerald-950 border border-emerald-800 text-emerald-300' :
              record.unlock_operator_attestation_status === 'APPROVED' ? 'bg-sky-950 border border-sky-800 text-sky-300' :
              'bg-slate-900 border border-slate-700 text-slate-300'
            }`}>
              {record.unlock_operator_attestation_status}
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
                  { label: 'Security Officer Unlock Attestation Confirmation', state: securityConfirmed, setter: setSecurityConfirmed },
                  { label: 'Compliance Officer Unlock Attestation Confirmation', state: complianceConfirmed, setter: setComplianceConfirmed },
                  { label: 'Operations Director Unlock Attestation Confirmation', state: opsDirectorConfirmed, setter: setOpsDirectorConfirmed },
                  { label: 'Rollback Authority Unlock Attestation Confirmation', state: rollbackConfirmed, setter: setRollbackConfirmed },
                  { label: 'Kill Switch Verified', state: killSwitchConfirmed, setter: setKillSwitchConfirmed },
                  { label: 'Non-Execution Confirmed', state: nonExecConfirmed, setter: setNonExecConfirmed },
                  { label: 'Final Review Unlock Readiness Verified', state: readinessConfirmed, setter: setReadinessConfirmed },
                  { label: 'Seal Authenticity Confirmed', state: sealConfirmed, setter: setSealConfirmed },
                  { label: 'Pre-Execution State Sealed Confirmed', state: freezeConfirmed, setter: setFreezeConfirmed },
                  { label: 'Operator Attestation Confirmed', state: operatorConfirmed, setter: setOperatorConfirmed },
                ].map((item, idx) => (
                  <label key={idx} className="flex items-center space-x-3 p-3 bg-[#131924] hover:bg-[#1a2230] rounded-lg cursor-pointer border border-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={item.state}
                      disabled={record.unlock_operator_attestation_status !== 'DRAFT'}
                      onChange={(e) => item.setter(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-950 w-4 h-4"
                    />
                    <span className="text-sm font-medium text-slate-300">{item.label}</span>
                  </label>
                ))}
              </div>

              {record.unlock_operator_attestation_status === 'DRAFT' && (
                <button
                  onClick={handleEvaluate}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-emerald-500/10 transition-all"
                >
                  Run Governance Rules Check
                </button>
              )}
            </div>

            {/* Step 2: Rationale & Decision */}
            {record.unlock_operator_attestation_status === 'EVALUATED' && (
              <div className="bg-[#0e121a] border border-slate-800 rounded-xl p-6 space-y-6">
                <h2 className="text-lg font-bold flex items-center space-x-2 border-b border-slate-800 pb-3">
                  <Eye className="w-5 h-5 text-sky-400" />
                  <span>2. Record Operator Attestation Decision</span>
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">Decision Type</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(['APPROVE_ATTESTATION', 'REJECT_ATTESTATION', 'BLOCK', 'ESCALATE'] as const).map((dec) => (
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
                      placeholder="Provide reasoning for this operator attestation decision..."
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
            {(record.unlock_operator_attestation_status === 'APPROVED' || record.unlock_operator_attestation_status === 'REJECTED') && (
              <div className="bg-gradient-to-b from-[#111622] to-[#0b0e16] border border-slate-800 rounded-xl p-6 text-center space-y-4">
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto animate-pulse" />
                <h3 className="text-lg font-bold text-slate-200">Pending Operator Attestation Finalization</h3>
                <p className="text-sm text-slate-400 max-w-lg mx-auto">
                  A decision has been recorded. Finalization will seal the Phase 171 evidence pack, establish the lineage hash chain, and freeze the gate state.
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
              <h3 className="text-sm font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">Operator Attestation Ledger</h3>
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
