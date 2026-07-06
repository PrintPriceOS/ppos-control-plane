import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldAlert, ShieldCheck, CheckCircle2, XCircle, ListTodo, Lock, RefreshCw } from 'lucide-react';
import { ActivationTokenRedemptionAuthRecord, ActivationTokenRedemptionAuthRule } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionAuthorization';
import { getTokenRedemptionAuthDetails, evaluateTokenRedemptionAuth, recordDecision, finalizeTokenRedemptionAuth } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationClient';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionAuthorization() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<ActivationTokenRedemptionAuthRecord | null>(null);
  const [rules, setRules] = useState<ActivationTokenRedemptionAuthRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rationale, setRationale] = useState('');
  const [securityOfficer, setSecurityOfficer] = useState(false);
  const [complianceOfficer, setComplianceOfficer] = useState(false);
  const [operationsDirector, setOperationsDirector] = useState(false);

  const isLocked = record?.activation_token_redemption_auth_status === 'FINALIZED' ||
    record?.activation_token_redemption_auth_status === 'AUTH_PASSED';

  const fetchDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getTokenRedemptionAuthDetails(id);
      setRecord(data.tokenRedemptionAuth);
      setRules(data.rules);
      if (data.tokenRedemptionAuth.redemption_auth_signatures_json) {
        setSecurityOfficer(!!data.tokenRedemptionAuth.redemption_auth_signatures_json.security_officer_confirmed);
        setComplianceOfficer(!!data.tokenRedemptionAuth.redemption_auth_signatures_json.compliance_officer_confirmed);
        setOperationsDirector(!!data.tokenRedemptionAuth.redemption_auth_signatures_json.operations_director_confirmed);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch authorization details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDetails(); }, [id]);

  const handleEvaluate = async () => {
    if (!id) return;
    try {
      setLoading(true);
      await evaluateTokenRedemptionAuth(id, {
        security_officer_confirmed: securityOfficer,
        compliance_officer_confirmed: complianceOfficer,
        operations_director_confirmed: operationsDirector
      });
      await fetchDetails();
    } catch (err: any) { setError(err.message || 'Evaluation failed'); setLoading(false); }
  };

  const handleDecision = async (decision: 'APPROVE' | 'REJECT') => {
    if (!id) return;
    try {
      setLoading(true);
      await recordDecision(id, decision, rationale);
      await fetchDetails();
    } catch (err: any) { setError(err.message || 'Decision failed'); setLoading(false); }
  };

  const handleFinalize = async () => {
    if (!id) return;
    try {
      setLoading(true);
      await finalizeTokenRedemptionAuth(id);
      await fetchDetails();
    } catch (err: any) { setError(err.message || 'Finalization failed'); setLoading(false); }
  };

  if (loading && !record) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
        <span className="ml-2 text-gray-600 font-medium">Loading redemption authorization gate...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border-l-4 border-red-500 rounded-md">
        <div className="flex">
          <XCircle className="h-6 w-6 text-red-500" />
          <div className="ml-3">
            <h3 className="text-sm font-semibold text-red-800">Operational Error</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button onClick={fetchDetails} className="mt-2 text-xs font-medium text-red-600 underline">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  if (!record) return <div className="text-center p-8"><p className="text-gray-500">Authorization record not found.</p></div>;

  const statusColor =
    record.activation_token_redemption_auth_status === 'FINALIZED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : record.activation_token_redemption_auth_status === 'AUTH_PASSED' ? 'bg-blue-50 text-blue-700 border-blue-200'
    : record.activation_token_redemption_auth_status === 'BLOCKED' || record.activation_token_redemption_auth_status === 'AUTH_FAILED' ? 'bg-rose-50 text-rose-700 border-rose-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Safety Warning Banner */}
      <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-md">
        <div className="flex">
          <ShieldAlert className="h-6 w-6 text-emerald-500 flex-shrink-0" />
          <div className="ml-3">
            <h4 className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Governed Safety Boundary Assertions — Redemption Authorization Gate</h4>
            <div className="mt-2 text-xs text-emerald-700 space-y-1 font-mono">
              <p>• Phase 162 may authorize future token redemption.</p>
              <p>• Phase 162 must not redeem the token.</p>
              <p>• Phase 162 must not make the token redeemable.</p>
              <p>• Phase 162 must not activate execution plans.</p>
              <p>• Phase 162 must not make plans executable.</p>
              <p>• Phase 162 must not create jobs, dispatch queues, or mutate runtime state.</p>
              <p className="font-semibold text-emerald-900 mt-2">Phase 162 is not token redemption. It only authorizes a future redemption path. The token remains non-redeemable.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div>
          <div className="flex items-center space-x-3">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Phase 162</span>
            <h1 className="text-xl font-bold text-gray-900">Token Redemption Authorization Gate</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1 font-mono">Authorization ID: {record.activation_token_redemption_auth_id}</p>
        </div>
        <div className="mt-4 md:mt-0">
          <span className="text-xs text-gray-400 block uppercase font-bold tracking-wider text-right">Status / Result</span>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border mt-1 ${statusColor}`}>
            {record.activation_token_redemption_auth_status} {record.activation_token_redemption_auth_result ? `(${record.activation_token_redemption_auth_result})` : ''}
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Metrics */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center">
            <ListTodo className="h-4 w-4 text-gray-500 mr-2" />Authorization Metrics
          </h3>
          <div className="space-y-3 text-sm">
            {[
              ['Risk Level', record.risk_level],
              ['Confidence', record.confidence_level],
              ['Impact Score', `${record.projected_impact_score}/100`],
              ['Rollback Score', `${record.rollback_feasibility_score}/100`],
              ['Evidence Score', `${record.evidence_completeness_score}%`]
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between">
                <span className="text-gray-500">{label}:</span>
                <span className="font-semibold text-gray-900">{val}</span>
              </div>
            ))}
            <hr />
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Guardrails:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${record.guardrail_status === 'PASS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{record.guardrail_status}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Write Scope:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${record.write_scope_status === 'PASS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{record.write_scope_status}</span>
            </div>
          </div>
        </div>

        {/* Officer Signatures */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center">
            <Lock className="h-4 w-4 text-gray-500 mr-2" />Officer Approvals
          </h3>
          <div className="space-y-4">
            {[
              { label: 'Security Officer', desc: 'Parent Phase 161 readiness check is finalized and verified.', state: securityOfficer, set: setSecurityOfficer },
              { label: 'Compliance Officer', desc: 'Write scope verified: only Phase 162 tables targeted.', state: complianceOfficer, set: setComplianceOfficer },
              { label: 'Operations Director', desc: 'Non-redeemable token record configuration verified.', state: operationsDirector, set: setOperationsDirector }
            ].map(({ label, desc, state, set }) => (
              <label key={label} className="flex items-start space-x-3 cursor-pointer">
                <input type="checkbox" checked={state} onChange={e => set(e.target.checked)} disabled={isLocked}
                  className="mt-1 h-4 w-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500" />
                <div>
                  <span className="text-sm font-semibold text-gray-800 block">{label}</span>
                  <span className="text-xs text-gray-500">{desc}</span>
                </div>
              </label>
            ))}
          </div>
          {(record.activation_token_redemption_auth_status === 'DRAFT' || record.activation_token_redemption_auth_status === 'BLOCKED') && (
            <button onClick={handleEvaluate}
              className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded text-xs transition duration-150">
              Evaluate Authorization Rules
            </button>
          )}
        </div>

        {/* Decision Controls */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center">
            <ShieldCheck className="h-4 w-4 text-gray-500 mr-2" />Decision Controls
          </h3>

          {record.activation_token_redemption_auth_status === 'EVALUATED' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Authorization Rationale</label>
                <textarea value={rationale} onChange={e => setRationale(e.target.value)}
                  placeholder="Enter rationale..." className="w-full text-xs border border-gray-300 rounded p-2 focus:ring-emerald-500" rows={3} />
              </div>
              <div className="flex space-x-2">
                <button onClick={() => handleDecision('APPROVE')}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded text-xs transition">
                  Approve Auth
                </button>
                <button onClick={() => handleDecision('REJECT')}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-medium py-2 rounded text-xs transition">
                  Reject
                </button>
              </div>
            </div>
          )}

          {record.activation_token_redemption_auth_status === 'AUTH_PASSED' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-600">Authorization approved. Ready to finalize and lock authorization record.</p>
              <button onClick={handleFinalize}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded text-xs transition">
                Finalize & Lock Auth
              </button>
            </div>
          )}

          {record.activation_token_redemption_auth_status === 'FINALIZED' && (
            <div className="space-y-3">
              <div className="bg-emerald-50 text-emerald-800 p-3 rounded text-xs border border-emerald-200">
                <strong>Authorization Gate Finalized.</strong>
                <p className="mt-1">v162.0 evidence pack signed. Lineage chain locked. Token remains non-redeemable.</p>
              </div>
              <div className="space-y-1 font-mono text-[10px] text-gray-500">
                <div className="truncate">Auth Hash: {record.activation_token_redemption_auth_hash}</div>
                <div className="truncate">Evidence Hash: {record.token_redemption_auth_evidence_pack_hash}</div>
              </div>
            </div>
          )}

          {(record.activation_token_redemption_auth_status === 'AUTH_FAILED' || record.activation_token_redemption_auth_status === 'BLOCKED') && (
            <div className="bg-rose-50 text-rose-800 p-3 rounded text-xs border border-rose-200">
              <strong>Authorization Failed / Blocked.</strong>
              <p className="mt-1">A new Phase 161 readiness check or preflight revalidation may be required.</p>
            </div>
          )}
        </div>
      </div>

      {/* Rules audit log */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Evaluated Rules Audit Log</h3>
        {rules.length === 0 ? (
          <p className="text-xs text-gray-400">No evaluations recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {rules.map(rule => (
              <div key={rule.rule_id} className="flex justify-between items-start text-xs border-b pb-2 border-gray-100">
                <div>
                  <span className="font-semibold text-gray-700">{rule.check_type}</span>
                  <p className="text-gray-500 mt-0.5">{rule.description}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex-shrink-0 ml-2
                  ${rule.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : rule.severity === 'WARNING' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {rule.severity}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
