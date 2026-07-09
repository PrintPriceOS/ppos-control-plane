import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationClient } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationClient';
import { TokenRedemptionUnlockDualControlAuthorization, UnlockDualControlAuthorizationRule } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorization';
import { ShieldAlert, CheckCircle, AlertTriangle, CheckSquare, Lock, Eye, AlertOctagon, Users } from 'lucide-react';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorization() {
  const { unlockDualControlAuthorizationId } = useParams<{ unlockDualControlAuthorizationId: string }>();
  const navigate = useNavigate();
  const client = new ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<TokenRedemptionUnlockDualControlAuthorization | null>(null);
  const [rules, setRules] = useState<UnlockDualControlAuthorizationRule[]>([]);

  // Authorizer identity states
  const [primaryAuthorizerInput, setPrimaryAuthorizerInput] = useState('');
  const [primaryRoleInput, setPrimaryRoleInput] = useState('operations_director');
  const [secondaryAuthorizerInput, setSecondaryAuthorizerInput] = useState('');
  const [secondaryRoleInput, setSecondaryRoleInput] = useState('compliance_officer');

  // Confirmations state
  const [primaryConfirmed, setPrimaryConfirmed] = useState(false);
  const [secondaryConfirmed, setSecondaryConfirmed] = useState(false);
  const [securityAttestationVerified, setSecurityAttestationVerified] = useState(false);
  const [complianceAttestationVerified, setComplianceAttestationVerified] = useState(false);
  const [opsDirectorAttestationVerified, setOpsDirectorAttestationVerified] = useState(false);
  const [rollbackAttestationVerified, setRollbackAttestationVerified] = useState(false);
  const [killSwitchConfirmed, setKillSwitchConfirmed] = useState(false);
  const [nonExecConfirmed, setNonExecConfirmed] = useState(false);
  const [readinessConfirmed, setReadinessConfirmed] = useState(false);
  const [sealConfirmed, setSealConfirmed] = useState(false);
  const [freezeConfirmed, setFreezeConfirmed] = useState(false);

  // Decision state
  const [rationale, setRationale] = useState('');
  const [decisionType, setDecisionType] = useState<'APPROVE_DUAL_CONTROL' | 'REJECT_DUAL_CONTROL' | 'BLOCK' | 'ESCALATE'>('APPROVE_DUAL_CONTROL');

  const loadDetails = async () => {
    if (!unlockDualControlAuthorizationId) return;
    try {
      setLoading(true);
      const res = await client.getUnlockDualControlAuthorizationDetails(unlockDualControlAuthorizationId);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockDualControlAuthorization);
        setRules(res.rules || []);
        if (res.tokenRedemptionUnlockDualControlAuthorization.primary_authorizer_id) {
          setPrimaryAuthorizerInput(res.tokenRedemptionUnlockDualControlAuthorization.primary_authorizer_id);
        }
        if (res.tokenRedemptionUnlockDualControlAuthorization.primary_authorizer_role) {
          setPrimaryRoleInput(res.tokenRedemptionUnlockDualControlAuthorization.primary_authorizer_role);
        }
        if (res.tokenRedemptionUnlockDualControlAuthorization.secondary_authorizer_id) {
          setSecondaryAuthorizerInput(res.tokenRedemptionUnlockDualControlAuthorization.secondary_authorizer_id);
        }
        if (res.tokenRedemptionUnlockDualControlAuthorization.secondary_authorizer_role) {
          setSecondaryRoleInput(res.tokenRedemptionUnlockDualControlAuthorization.secondary_authorizer_role);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [unlockDualControlAuthorizationId]);

  const handleRecordPrimary = async () => {
    if (!record) return;
    try {
      const res = await client.recordPrimaryAuthorizer(record.activation_token_redemption_unlock_dual_control_authorization_id, primaryAuthorizerInput, primaryRoleInput);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockDualControlAuthorization);
        alert('Primary authorizer identity recorded.');
      }
    } catch (e: any) {
      alert(`Failed to record primary authorizer: ${e.message}`);
    }
  };

  const handleRecordSecondary = async () => {
    if (!record) return;
    try {
      const res = await client.recordSecondaryAuthorizer(record.activation_token_redemption_unlock_dual_control_authorization_id, secondaryAuthorizerInput, secondaryRoleInput);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockDualControlAuthorization);
        alert('Secondary authorizer identity recorded.');
      }
    } catch (e: any) {
      alert(`Failed to record secondary authorizer: ${e.message}`);
    }
  };

  const handleEvaluate = async () => {
    if (!record) return;
    try {
      const res = await client.evaluateUnlockDualControlAuthorization(record.activation_token_redemption_unlock_dual_control_authorization_id, {
        primary_authorizer_unlock_authorization_confirmation: primaryConfirmed,
        secondary_authorizer_unlock_authorization_confirmation: secondaryConfirmed,
        security_officer_unlock_attestation_verified: securityAttestationVerified,
        compliance_officer_unlock_attestation_verified: complianceAttestationVerified,
        operations_director_unlock_attestation_verified: opsDirectorAttestationVerified,
        rollback_authority_unlock_attestation_verified: rollbackAttestationVerified,
        kill_switch_verified: killSwitchConfirmed,
        non_execution_confirmed: nonExecConfirmed,
        final_review_unlock_readiness_verified: readinessConfirmed,
        seal_authenticity_confirmed: sealConfirmed,
        pre_execution_state_sealed_confirmed: freezeConfirmed
      });
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockDualControlAuthorization);
        setRules(res.rules || []);
      }
    } catch (e: any) {
      alert(`Evaluation failed: ${e.message}`);
    }
  };

  const handleDecision = async () => {
    if (!record) return;
    try {
      const res = await client.recordDecision(record.activation_token_redemption_unlock_dual_control_authorization_id, decisionType, rationale);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockDualControlAuthorization);
      }
    } catch (e: any) {
      alert(`Failed to record decision: ${e.message}`);
    }
  };

  const handleFinalize = async () => {
    if (!record) return;
    try {
      const res = await client.finalizeUnlockDualControlAuthorization(record.activation_token_redemption_unlock_dual_control_authorization_id);
      if (res.success) {
        setRecord(res.tokenRedemptionUnlockDualControlAuthorization);
      }
    } catch (e: any) {
      alert(`Finalization failed: ${e.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090b0f] text-slate-200">
        <div className="animate-spin text-[#38bdf8]"><Lock className="w-12 h-12" /></div>
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
    <div className="min-h-screen bg-[#090b0f] text-slate-100 font-sans selection:bg-[#38bdf8] selection:text-white">
      {/* Safety/Non-Execution Banner */}
      <div className="bg-gradient-to-r from-[#0c1524] via-[#101b2d] to-[#0c1524] border-b border-sky-900/40 p-4">
        <div className="max-w-7xl mx-auto flex items-center space-x-3 text-sky-300">
          <ShieldAlert className="w-6 h-6 animate-pulse flex-shrink-0" />
          <div className="text-sm font-medium">
            <span className="font-bold uppercase tracking-wider text-sky-200 mr-2">[SAFETY BOUNDARY ENFORCED]:</span>
            This phase records dual-control authorization only. The token is not unlocked. The token is not redeemable. The token is not redeemed. No execution plan is enabled. No jobs or queue dispatches are created. Runtime mutation count remains zero. Two independent authorizers are required.
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-6 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono text-sky-400 mb-1 uppercase tracking-wider">
              <span>Phase 172</span>
              <span>•</span>
              <span>Dual-Control Authorization Gate</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              {record.activation_token_redemption_unlock_dual_control_authorization_id}
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Parent Operator Attestation ID: <span className="font-mono text-slate-300">{record.source_act_token_redempt_unlock_operator_attestation_id}</span>
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase tracking-wider ${
              record.unlock_dual_control_authorization_status === 'FINALIZED' ? 'bg-sky-950 border border-sky-800 text-sky-300' :
              record.unlock_dual_control_authorization_status === 'APPROVED' ? 'bg-sky-900/60 border border-sky-800 text-sky-300' :
              'bg-slate-900 border border-slate-700 text-slate-300'
            }`}>
              {record.unlock_dual_control_authorization_status}
            </span>
          </div>
        </div>

        {/* Dual Control Separation Panel */}
        <div className="bg-[#0e121a] border border-slate-800 rounded-xl p-6 space-y-6">
          <h2 className="text-lg font-bold flex items-center space-x-2 border-b border-slate-800 pb-3">
            <Users className="w-5 h-5 text-sky-400" />
            <span>Dual-Control Separation Configuration</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Primary Authorizer */}
            <div className="space-y-4 p-4 bg-[#131924] border border-slate-800 rounded-lg">
              <h3 className="text-sm font-semibold text-slate-200">1. Primary Authorizer</h3>
              {record.primary_authorizer_id ? (
                <div className="text-xs font-mono text-slate-400 space-y-1">
                  <div>ID: <span className="text-slate-200">{record.primary_authorizer_id}</span></div>
                  <div>Role: <span className="text-slate-200">{record.primary_authorizer_role}</span></div>
                  <div>Timestamp: <span className="text-slate-200">{record.primary_authorized_at}</span></div>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={primaryAuthorizerInput}
                    onChange={(e) => setPrimaryAuthorizerInput(e.target.value)}
                    placeholder="Enter Primary Authorizer ID"
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-sm text-slate-200 focus:outline-none"
                  />
                  <select
                    value={primaryRoleInput}
                    onChange={(e) => setPrimaryRoleInput(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-sm text-slate-200 focus:outline-none"
                  >
                    <option value="operations_director">Operations Director</option>
                    <option value="compliance_officer">Compliance Officer</option>
                    <option value="security_officer">Security Officer</option>
                    <option value="system_admin">System Admin</option>
                  </select>
                  <button onClick={handleRecordPrimary} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded text-xs font-semibold">
                    Record Primary identity
                  </button>
                </div>
              )}
            </div>

            {/* Secondary Authorizer */}
            <div className="space-y-4 p-4 bg-[#131924] border border-slate-800 rounded-lg">
              <h3 className="text-sm font-semibold text-slate-200">2. Secondary Authorizer</h3>
              {record.secondary_authorizer_id ? (
                <div className="text-xs font-mono text-slate-400 space-y-1">
                  <div>ID: <span className="text-slate-200">{record.secondary_authorizer_id}</span></div>
                  <div>Role: <span className="text-slate-200">{record.secondary_authorizer_role}</span></div>
                  <div>Timestamp: <span className="text-slate-200">{record.secondary_authorized_at}</span></div>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={secondaryAuthorizerInput}
                    onChange={(e) => setSecondaryAuthorizerInput(e.target.value)}
                    placeholder="Enter Secondary Authorizer ID"
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-sm text-slate-200 focus:outline-none"
                  />
                  <select
                    value={secondaryRoleInput}
                    onChange={(e) => setSecondaryRoleInput(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-sm text-slate-200 focus:outline-none"
                  >
                    <option value="operations_director">Operations Director</option>
                    <option value="compliance_officer">Compliance Officer</option>
                    <option value="security_officer">Security Officer</option>
                    <option value="system_admin">System Admin</option>
                  </select>
                  <button onClick={handleRecordSecondary} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded text-xs font-semibold">
                    Record Secondary Identity
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Controls & Verification */}
          <div className="lg:col-span-2 space-y-8">
            {/* Step 1: Governance Verification */}
            <div className="bg-[#0e121a] border border-slate-800 rounded-xl p-6 space-y-6">
              <h2 className="text-lg font-bold flex items-center space-x-2 border-b border-slate-800 pb-3">
                <CheckSquare className="w-5 h-5 text-sky-400" />
                <span>Dual-Control Governance Confirmations</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: 'Primary Authorizer Unlock Authorization Confirmation', state: primaryConfirmed, setter: setPrimaryConfirmed },
                  { label: 'Secondary Authorizer Unlock Authorization Confirmation', state: secondaryConfirmed, setter: setSecondaryConfirmed },
                  { label: 'Security Officer Unlock Attestation Verified', state: securityAttestationVerified, setter: setSecurityAttestationVerified },
                  { label: 'Compliance Officer Unlock Attestation Verified', state: complianceAttestationVerified, setter: setComplianceAttestationVerified },
                  { label: 'Operations Director Unlock Attestation Verified', state: opsDirectorAttestationVerified, setter: setOpsDirectorAttestationVerified },
                  { label: 'Rollback Authority Unlock Attestation Verified', state: rollbackAttestationVerified, setter: setRollbackAttestationVerified },
                  { label: 'Kill Switch Verified', state: killSwitchConfirmed, setter: setKillSwitchConfirmed },
                  { label: 'Non-Execution Confirmed', state: nonExecConfirmed, setter: setNonExecConfirmed },
                  { label: 'Final Review Unlock Readiness Verified', state: readinessConfirmed, setter: setReadinessConfirmed },
                  { label: 'Seal Authenticity Confirmed', state: sealConfirmed, setter: setSealConfirmed },
                  { label: 'Pre-Execution State Sealed Confirmed', state: freezeConfirmed, setter: setFreezeConfirmed },
                ].map((item, idx) => (
                  <label key={idx} className="flex items-center space-x-3 p-3 bg-[#131924] hover:bg-[#1a2230] rounded-lg cursor-pointer border border-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={item.state}
                      disabled={record.unlock_dual_control_authorization_status !== 'DRAFT'}
                      onChange={(e) => item.setter(e.target.checked)}
                      className="rounded border-slate-700 text-sky-500 focus:ring-sky-500 bg-slate-950 w-4 h-4"
                    />
                    <span className="text-sm font-medium text-slate-300">{item.label}</span>
                  </label>
                ))}
              </div>

              {record.unlock_dual_control_authorization_status === 'DRAFT' && (
                <button
                  onClick={handleEvaluate}
                  className="w-full py-3 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-sky-500/10 transition-all"
                >
                  Run Governance Rules Check
                </button>
              )}
            </div>

            {/* Step 2: Rationale & Decision */}
            {record.unlock_dual_control_authorization_status === 'EVALUATED' && (
              <div className="bg-[#0e121a] border border-slate-800 rounded-xl p-6 space-y-6">
                <h2 className="text-lg font-bold flex items-center space-x-2 border-b border-slate-800 pb-3">
                  <Eye className="w-5 h-5 text-sky-400" />
                  <span>Record Dual-Control Decision</span>
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">Decision Type</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(['APPROVE_DUAL_CONTROL', 'REJECT_DUAL_CONTROL', 'BLOCK', 'ESCALATE'] as const).map((dec) => (
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
                      placeholder="Provide reasoning for this dual-control decision..."
                      className="w-full h-24 p-3 bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-lg text-sm text-slate-200 focus:outline-none"
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
            {(record.unlock_dual_control_authorization_status === 'APPROVED' || record.unlock_dual_control_authorization_status === 'REJECTED') && (
              <div className="bg-gradient-to-b from-[#111622] to-[#0b0e16] border border-slate-800 rounded-xl p-6 text-center space-y-4">
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto animate-pulse" />
                <h3 className="text-lg font-bold text-slate-200">Pending Dual-Control Finalization</h3>
                <p className="text-sm text-slate-400 max-w-lg mx-auto">
                  A decision has been recorded. Finalization will seal the Phase 172 evidence pack, establish the lineage hash chain, and freeze the gate state.
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
              <h3 className="text-sm font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">Dual-Control Ledger</h3>
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
