import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalClient } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalClient';
import { TokenRedemptionUnlockApproval, UnlockApprovalRule } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockApproval';
import { ShieldAlert, CheckCircle, AlertTriangle, Play, CheckSquare, FileText, ChevronRight, Lock, Eye, AlertOctagon } from 'lucide-react';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockApproval() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const client = new ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<TokenRedemptionUnlockApproval | null>(null);
  const [rules, setRules] = useState<UnlockApprovalRule[]>([]);

  // Confirmations state
  const [securityConfirmed, setSecurityConfirmed] = useState(false);
  const [complianceConfirmed, setComplianceConfirmed] = useState(false);

  // Decision state
  const [rationale, setRationale] = useState('');
  const [decisionType, setDecisionType] = useState<'APPROVE' | 'DENY' | 'BLOCK' | 'ESCALATE'>('APPROVE');

  const loadDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await client.getUnlockApprovalDetails(id);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockApproval);
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
      const res = await client.evaluateUnlockApproval(record.activation_token_redemption_unlock_approval_id, {
        security_officer_confirmed: securityConfirmed,
        compliance_officer_confirmed: complianceConfirmed
      });
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockApproval);
        setRules(res.rules || []);
      }
    } catch (e: any) {
      alert(`Evaluation failed: ${e.message}`);
    }
  };

  const handleDecision = async () => {
    if (!record) return;
    try {
      const res = await client.recordDecision(record.activation_token_redemption_unlock_approval_id, decisionType, rationale);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockApproval);
      }
    } catch (e: any) {
      alert(`Failed to record decision: ${e.message}`);
    }
  };

  const handleFinalize = async () => {
    if (!record) return;
    try {
      const res = await client.finalizeUnlockApproval(record.activation_token_redemption_unlock_approval_id);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockApproval);
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
            This phase approves unlock eligibility only. The token is not unlocked, not redeemable, and not redeemed. No execution plan is enabled, and no jobs or queue dispatches are created. Runtime mutation count remains zero.
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-emerald-500 mb-1">
              Phase 167 Gate Control
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
              Token Redemption Unlock Approval
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              ID: <span className="font-mono text-slate-300">{record.activation_token_redemption_unlock_approval_id}</span>
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              record.unlock_approval_status === 'FINALIZED' ? 'bg-emerald-950 border border-emerald-500 text-emerald-300' :
              record.unlock_approval_status === 'APPROVED' ? 'bg-indigo-950 border border-indigo-500 text-indigo-300' :
              record.unlock_approval_status === 'REJECTED' ? 'bg-rose-950 border border-rose-500 text-rose-300' :
              'bg-slate-900 border border-slate-700 text-slate-300'
            }`}>
              {record.unlock_approval_status}
            </span>
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 uppercase tracking-wide border border-slate-700">
              {record.unlock_approval_result}
            </span>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="bg-[#121620] border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold flex items-center space-x-2 text-slate-200">
              <FileText className="w-5 h-5 text-emerald-500" />
              <span>Lineage Metadata</span>
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Parent Phase 166 ID</span>
                <span className="font-mono text-slate-300 truncate max-w-[180px]" title={record.source_activation_token_redemption_unlock_eligibility_id}>
                  {record.source_activation_token_redemption_unlock_eligibility_id}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Parent Phase 165 ID</span>
                <span className="font-mono text-slate-300 truncate max-w-[180px]">{record.source_activation_token_redemption_lock_id}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Risk Level</span>
                <span className="font-bold text-slate-300">{record.risk_level}</span>
              </div>
              <div className="flex justify-between pb-1">
                <span className="text-slate-400">Confidence Level</span>
                <span className="font-bold text-slate-300">{record.confidence_level}</span>
              </div>
            </div>
          </div>

          {/* Scores */}
          <div className="bg-[#121620] border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold flex items-center space-x-2 text-slate-200">
              <Eye className="w-5 h-5 text-indigo-500" />
              <span>Impact Metrics</span>
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Projected Impact</span>
                <span className="font-mono text-slate-300">{record.projected_impact_score}/100</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Rollback Feasibility</span>
                <span className="font-mono text-slate-300">{record.rollback_feasibility_score}/100</span>
              </div>
              <div className="flex justify-between pb-1">
                <span className="text-slate-400">Evidence Completeness</span>
                <span className="font-mono text-slate-300">{record.evidence_completeness_score}/100</span>
              </div>
            </div>
          </div>

          {/* Safety Boundaries Details */}
          <div className="bg-[#121620] border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold flex items-center space-x-2 text-amber-500">
              <ShieldAlert className="w-5 h-5" />
              <span>Locked State Enforcement</span>
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Token Unlock Status</span>
                <span className="font-bold text-rose-400 flex items-center"><Lock className="w-3.5 h-3.5 mr-1" /> {record.token_unlock_status}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Token Redeemable Status</span>
                <span className="font-bold text-slate-300">{record.token_redeemable_status}</span>
              </div>
              <div className="flex justify-between pb-1">
                <span className="text-slate-400">Runtime Mutations Count</span>
                <span className="font-bold text-emerald-400">{record.runtime_mutation_status}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Interface Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Rules and Checks (Left/Middle Column) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-xl font-bold text-slate-200">Rules Evaluator Output</h2>
              {rules.length === 0 ? (
                <div className="text-slate-400 text-sm py-4 text-center">No rules recorded. Run evaluation to register checks.</div>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule) => (
                    <div key={rule.rule_id} className={`flex items-start space-x-3 p-3 rounded-lg border text-xs ${
                      rule.severity === 'CRITICAL' ? 'bg-rose-950/40 border-rose-900/50 text-rose-300' :
                      rule.severity === 'WARNING' ? 'bg-amber-950/40 border-amber-900/50 text-amber-300' :
                      'bg-slate-900/60 border-slate-800 text-slate-300'
                    }`}>
                      {rule.severity === 'CRITICAL' ? <ShieldAlert className="w-5 h-5 text-rose-500 flex-shrink-0" /> :
                       rule.severity === 'WARNING' ? <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" /> :
                       <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />}
                      <div>
                        <div className="font-bold">{rule.check_type}</div>
                        <div className="text-slate-400 mt-0.5">{rule.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Interactive Panel (Right Column) */}
          <div className="space-y-6">
            {/* Step 1: Confirmations & Evaluation */}
            {record.unlock_approval_status === 'DRAFT' && (
              <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-slate-200 flex items-center space-x-2">
                  <CheckSquare className="w-5 h-5 text-emerald-500" />
                  <span>Step 1: Signatures</span>
                </h2>
                <p className="text-xs text-slate-400">Provide required officer confirmations to trigger rule evaluation.</p>

                <div className="space-y-3">
                  <label className="flex items-center space-x-3 text-xs text-slate-300 bg-slate-900/50 p-3 rounded-lg border border-slate-800 cursor-pointer hover:bg-slate-900 transition-colors">
                    <input type="checkbox" checked={securityConfirmed} onChange={(e) => setSecurityConfirmed(e.target.checked)} className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0 w-4 h-4" />
                    <span>Confirm Security Officer Approval</span>
                  </label>

                  <label className="flex items-center space-x-3 text-xs text-slate-300 bg-slate-900/50 p-3 rounded-lg border border-slate-800 cursor-pointer hover:bg-slate-900 transition-colors">
                    <input type="checkbox" checked={complianceConfirmed} onChange={(e) => setComplianceConfirmed(e.target.checked)} className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0 w-4 h-4" />
                    <span>Confirm Compliance Officer Approval</span>
                  </label>
                </div>

                <button onClick={handleEvaluate} className="w-full mt-2 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold text-xs tracking-wider uppercase transition-colors flex items-center justify-center space-x-2">
                  <span>Evaluate Gate Rules</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Step 2: Governance Decision */}
            {record.unlock_approval_status === 'EVALUATED' && (
              <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-slate-200 flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-indigo-500" />
                  <span>Step 2: Governance Decision</span>
                </h2>
                <p className="text-xs text-slate-400">Record a final decision. Locked boundaries are preserved even upon approval.</p>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Decision</label>
                    <select value={decisionType} onChange={(e) => setDecisionType(e.target.value as any)} className="w-full text-xs bg-slate-950 border border-slate-850 p-2.5 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500">
                      <option value="APPROVE">APPROVE (Eligible, Not Unlocked)</option>
                      <option value="DENY">DENY (Reject Review)</option>
                      <option value="BLOCK">BLOCK (Halt Status)</option>
                      <option value="ESCALATE">ESCALATE</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Rationale</label>
                    <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} placeholder="Provide audit trail rationale..." className="w-full text-xs bg-slate-950 border border-slate-850 p-2.5 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 resize-none" />
                  </div>
                </div>

                <button onClick={handleDecision} className="w-full py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs tracking-wider uppercase transition-colors flex items-center justify-center space-x-2">
                  <span>Record Decision</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Step 3: Finalization */}
            {(record.unlock_approval_status === 'APPROVED' || record.unlock_approval_status === 'REJECTED') && (
              <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-slate-200 flex items-center space-x-2">
                  <Play className="w-5 h-5 text-emerald-500 animate-pulse" />
                  <span>Step 3: Finalization</span>
                </h2>
                <p className="text-xs text-slate-400">Finalize the record to generate the v167.0 evidence pack and lineage hash chain.</p>

                <button onClick={handleFinalize} className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 font-semibold text-xs tracking-wider uppercase transition-colors flex items-center justify-center space-x-2 text-white">
                  <span>Finalize & Lock Gate</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Locked & Immutable */}
            {record.unlock_approval_status === 'FINALIZED' && (
              <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-xl p-6 space-y-3 text-center">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
                <h2 className="text-base font-bold text-emerald-400">Gate Finalized</h2>
                <p className="text-xs text-slate-400">This gate has been finalized, signed, and locked. The state cannot be modified.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
