import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldAlert, ShieldCheck, CheckCircle2, XCircle, ListTodo, Lock, RefreshCw } from 'lucide-react';
import { ActivationTokenIssuanceRecord, ActivationTokenIssuanceRule } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenIssuance';
import { getTokenIssuanceDetails, evaluateTokenIssuance, recordDecision, finalizeTokenIssuance } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenIssuanceClient';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenIssuance() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<ActivationTokenIssuanceRecord | null>(null);
  const [rules, setRules] = useState<ActivationTokenIssuanceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rationale, setRationale] = useState('');
  const [securityOfficer, setSecurityOfficer] = useState(false);
  const [complianceOfficer, setComplianceOfficer] = useState(false);
  const [operationsDirector, setOperationsDirector] = useState(false);

  const isLocked = record?.activation_token_issuance_status === 'FINALIZED' ||
    record?.activation_token_issuance_status === 'ISSUANCE_RECORDED';

  const fetchDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getTokenIssuanceDetails(id);
      setRecord(data.tokenIssuance);
      setRules(data.rules);
      if (data.tokenIssuance.issuance_signatures_json) {
        setSecurityOfficer(!!data.tokenIssuance.issuance_signatures_json.security_officer_confirmed);
        setComplianceOfficer(!!data.tokenIssuance.issuance_signatures_json.compliance_officer_confirmed);
        setOperationsDirector(!!data.tokenIssuance.issuance_signatures_json.operations_director_confirmed);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch issuance details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDetails(); }, [id]);

  const handleEvaluate = async () => {
    if (!id) return;
    try {
      setLoading(true);
      await evaluateTokenIssuance(id, {
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
      await finalizeTokenIssuance(id);
      await fetchDetails();
    } catch (err: any) { setError(err.message || 'Finalization failed'); setLoading(false); }
  };

  if (loading && !record) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
        <span className="ml-2 text-gray-600 font-medium">Loading issuance gate...</span>
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

  if (!record) return <div className="text-center p-8"><p className="text-gray-500">Issuance record not found.</p></div>;

  const statusColor =
    record.activation_token_issuance_status === 'FINALIZED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : record.activation_token_issuance_status === 'ISSUANCE_RECORDED' ? 'bg-blue-50 text-blue-700 border-blue-200'
    : record.activation_token_issuance_status === 'BLOCKED' || record.activation_token_issuance_status === 'ISSUANCE_REJECTED' ? 'bg-rose-50 text-rose-700 border-rose-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Safety Warning Banner */}
      <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded-r-md">
        <div className="flex">
          <ShieldAlert className="h-6 w-6 text-indigo-500 flex-shrink-0" />
          <div className="ml-3">
            <h4 className="text-sm font-bold text-indigo-800 uppercase tracking-wider">Governed Safety Boundary Assertions — Issuance Gate</h4>
            <div className="mt-2 text-xs text-indigo-700 space-y-1 font-mono">
              <p>• Phase 160 records issuance metadata only.</p>
              <p>• Phase 160 must not create a usable activation credential.</p>
              <p>• Phase 160 must not make the token redeemable.</p>
              <p>• Phase 160 must not activate the execution plan.</p>
              <p>• Phase 160 must not make the plan executable.</p>
              <p>• Phase 160 must not create jobs, dispatch queues, or mutate runtime state.</p>
              <p className="font-semibold text-indigo-900 mt-2">Phase 160 is not a redemption gate. It only records a non-redeemable issuance event.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div>
          <div className="flex items-center space-x-3">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">Phase 160</span>
            <h1 className="text-xl font-bold text-gray-900">Token Issuance Gate</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1 font-mono">Issuance ID: {record.activation_token_issuance_id}</p>
        </div>
        <div className="mt-4 md:mt-0">
          <span className="text-xs text-gray-400 block uppercase font-bold tracking-wider text-right">Status / Result</span>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border mt-1 ${statusColor}`}>
            {record.activation_token_issuance_status} {record.activation_token_issuance_result ? `(${record.activation_token_issuance_result})` : ''}
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Metrics */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center">
            <ListTodo className="h-4 w-4 text-gray-500 mr-2" />Issuance Metrics
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
              { label: 'Security Officer', desc: 'Preflight parent is finalized and security verified.', state: securityOfficer, set: setSecurityOfficer },
              { label: 'Compliance Officer', desc: 'Write scope verified: only Phase 160 tables targeted.', state: complianceOfficer, set: setComplianceOfficer },
              { label: 'Operations Director', desc: 'Non-redeemable token record configuration verified.', state: operationsDirector, set: setOperationsDirector }
            ].map(({ label, desc, state, set }) => (
              <label key={label} className="flex items-start space-x-3 cursor-pointer">
                <input type="checkbox" checked={state} onChange={e => set(e.target.checked)} disabled={isLocked}
                  className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                <div>
                  <span className="text-sm font-semibold text-gray-800 block">{label}</span>
                  <span className="text-xs text-gray-500">{desc}</span>
                </div>
              </label>
            ))}
          </div>
          {(record.activation_token_issuance_status === 'DRAFT' || record.activation_token_issuance_status === 'BLOCKED') && (
            <button onClick={handleEvaluate}
              className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded text-xs transition duration-150">
              Evaluate Issuance Rules
            </button>
          )}
        </div>

        {/* Decision Controls */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center">
            <ShieldCheck className="h-4 w-4 text-gray-500 mr-2" />Decision Controls
          </h3>

          {record.activation_token_issuance_status === 'EVALUATED' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Issuance Rationale</label>
                <textarea value={rationale} onChange={e => setRationale(e.target.value)}
                  placeholder="Enter rationale..." className="w-full text-xs border border-gray-300 rounded p-2 focus:ring-indigo-500" rows={3} />
              </div>
              <div className="flex space-x-2">
                <button onClick={() => handleDecision('APPROVE')}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded text-xs transition">
                  Approve Issuance
                </button>
                <button onClick={() => handleDecision('REJECT')}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-medium py-2 rounded text-xs transition">
                  Reject
                </button>
              </div>
            </div>
          )}

          {record.activation_token_issuance_status === 'ISSUANCE_RECORDED' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-600">Issuance approved. Ready to finalize and lock issuance record.</p>
              <button onClick={handleFinalize}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded text-xs transition">
                Finalize & Lock Issuance
              </button>
            </div>
          )}

          {record.activation_token_issuance_status === 'FINALIZED' && (
            <div className="space-y-3">
              <div className="bg-emerald-50 text-emerald-800 p-3 rounded text-xs border border-emerald-200">
                <strong>Issuance Gate Finalized.</strong>
                <p className="mt-1">v160.0 evidence pack signed. Lineage chain locked. Token remains ISSUANCE_RECORDED_NOT_REDEEMABLE.</p>
              </div>
              <div className="space-y-1 font-mono text-[10px] text-gray-500">
                <div className="truncate">Issuance Hash: {record.activation_token_issuance_hash}</div>
                <div className="truncate">Evidence Hash: {record.token_issuance_evidence_pack_hash}</div>
              </div>
            </div>
          )}

          {(record.activation_token_issuance_status === 'ISSUANCE_REJECTED' || record.activation_token_issuance_status === 'BLOCKED') && (
            <div className="bg-rose-50 text-rose-800 p-3 rounded text-xs border border-rose-200">
              <strong>Issuance Rejected / Blocked.</strong>
              <p className="mt-1">A new Phase 159 preflight revalidation may be required.</p>
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
                  ${rule.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : rule.severity === 'WARNING' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`}>
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
