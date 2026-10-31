import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  FileText,
  Lock,
  ArrowRight,
  ListTodo,
  RefreshCw
} from 'lucide-react';
import {
  ActivationTokenStagingRecord,
  ActivationTokenStagingRule
} from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenStaging';
import {
  getTokenStagingDetails,
  evaluateTokenStaging,
  recordDecision,
  finalizeTokenStaging
} from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenStagingClient';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenStaging() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<ActivationTokenStagingRecord | null>(null);
  const [rules, setRules] = useState<ActivationTokenStagingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rationale, setRationale] = useState('');

  // Signatures checkboxes
  const [securityOfficer, setSecurityOfficer] = useState(false);
  const [complianceOfficer, setComplianceOfficer] = useState(false);
  const [operationsDirector, setOperationsDirector] = useState(false);

  const fetchDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getTokenStagingDetails(id);
      setRecord(data.tokenStaging);
      setRules(data.rules);
      
      if (data.tokenStaging.staging_signatures_json) {
        setSecurityOfficer(!!data.tokenStaging.staging_signatures_json.security_officer_confirmed);
        setComplianceOfficer(!!data.tokenStaging.staging_signatures_json.compliance_officer_confirmed);
        setOperationsDirector(!!data.tokenStaging.staging_signatures_json.operations_director_confirmed);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch token staging details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const handleEvaluate = async () => {
    if (!id) return;
    try {
      setLoading(true);
      await evaluateTokenStaging(id, {
        security_officer_confirmed: securityOfficer,
        compliance_officer_confirmed: complianceOfficer,
        operations_director_confirmed: operationsDirector
      });
      await fetchDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to evaluate staging rules');
      setLoading(false);
    }
  };

  const handleDecision = async (decision: 'APPROVE' | 'REJECT') => {
    if (!id) return;
    try {
      setLoading(true);
      await recordDecision(id, decision, rationale);
      await fetchDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to record decision');
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!id) return;
    try {
      setLoading(true);
      await finalizeTokenStaging(id);
      await fetchDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to finalize token staging');
      setLoading(false);
    }
  };

  if (loading && !record) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
        <span className="ml-2 text-gray-600 font-medium">Loading staging gate...</span>
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

  if (!record) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg">
        <p className="text-gray-500">Staging record not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Safety Warning Banner */}
      <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-md">
        <div className="flex">
          <ShieldAlert className="h-6 w-6 text-amber-500 flex-shrink-0" />
          <div className="ml-3">
            <h4 className="text-sm font-bold text-amber-800 uppercase tracking-wider">Governed Safety Boundary Assertions</h4>
            <div className="mt-2 text-xs text-amber-700 space-y-1 font-mono">
              <p>• Token staging does not issue the token.</p>
              <p>• The token remains staged and non-redeemable.</p>
              <p>• The staging process does not activate the execution plan.</p>
              <p>• The staging process does not make the plan executable.</p>
              <p>• The staging process does not create jobs, dispatch queues, or mutate runtime state.</p>
              <p>• A future token issuance gate is required before any token can become redeemable.</p>
              <p className="font-semibold text-amber-900 mt-2">Staged token metadata is not a usable activation credential.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div>
          <div className="flex items-center space-x-3">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">Phase 158</span>
            <h1 className="text-xl font-bold text-gray-900">Token Staging Gate Dashboard</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1 font-mono">Staging ID: {record.activation_token_staging_id}</p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center space-x-3">
          <div className="text-right">
            <span className="text-xs text-gray-400 block uppercase font-bold tracking-wider">Status / Result</span>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border mt-1
              ${record.activation_token_staging_status === 'FINALIZED' || record.activation_token_staging_status === 'STAGED'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : record.activation_token_staging_status === 'BLOCKED' || record.activation_token_staging_status === 'REJECTED'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
              {record.activation_token_staging_status} {record.activation_token_staging_result ? `(${record.activation_token_staging_result})` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Grid details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: Parameters & attestation status */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center">
            <ListTodo className="h-4 w-4 text-gray-500 mr-2" />
            Staging Metadata Metrics
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Risk Assessment:</span>
              <span className="font-semibold text-gray-900">{record.risk_level}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Confidence Level:</span>
              <span className="font-semibold text-gray-900">{record.confidence_level}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Projected Impact:</span>
              <span className="font-semibold text-gray-900">{record.projected_impact_score}/100</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Rollback Feasibility:</span>
              <span className="font-semibold text-gray-900">{record.rollback_feasibility_score}/100</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Evidence Score:</span>
              <span className="font-semibold text-gray-900">{record.evidence_completeness_score}%</span>
            </div>
            <hr />
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Guardrails:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                record.guardrail_status === 'PASS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>{record.guardrail_status}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Write Scope:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                record.write_scope_status === 'PASS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>{record.write_scope_status}</span>
            </div>
          </div>
        </div>

        {/* Center column: Signatures & Checklist */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center">
            <Lock className="h-4 w-4 text-gray-500 mr-2" />
            Officer Approvals Checklist
          </h3>
          
          <div className="space-y-4">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={securityOfficer}
                onChange={(e) => setSecurityOfficer(e.target.checked)}
                disabled={record.activation_token_staging_status === 'FINALIZED' || record.activation_token_staging_status === 'STAGED'}
                className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-semibold text-gray-800 block">Security Officer Confirmation</span>
                <span className="text-xs text-gray-500">Staged token metadata has zero active activation pathways.</span>
              </div>
            </label>

            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={complianceOfficer}
                onChange={(e) => setComplianceOfficer(e.target.checked)}
                disabled={record.activation_token_staging_status === 'FINALIZED' || record.activation_token_staging_status === 'STAGED'}
                className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-semibold text-gray-800 block">Compliance Officer Confirmation</span>
                <span className="text-xs text-gray-500">Limits verified: only Phase 158 staging schema tables targeted.</span>
              </div>
            </label>

            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={operationsDirector}
                onChange={(e) => setOperationsDirector(e.target.checked)}
                disabled={record.activation_token_staging_status === 'FINALIZED' || record.activation_token_staging_status === 'STAGED'}
                className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-semibold text-gray-800 block">Operations Director Confirmation</span>
                <span className="text-xs text-gray-500">Parent final approval metadata matches hash and is active.</span>
              </div>
            </label>
          </div>

          {(record.activation_token_staging_status === 'DRAFT' || record.activation_token_staging_status === 'BLOCKED') && (
            <button
              onClick={handleEvaluate}
              className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded text-xs transition duration-150"
            >
              Evaluate Staging Rules
            </button>
          )}
        </div>

        {/* Right column: Governance & Staging Actions */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center">
            <ShieldCheck className="h-4 w-4 text-gray-500 mr-2" />
            Decision Controls
          </h3>

          {record.activation_token_staging_status === 'EVALUATED' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Staging Rationale</label>
                <textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Enter notes..."
                  className="w-full text-xs border border-gray-300 rounded p-2 focus:ring-indigo-500"
                  rows={3}
                />
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleDecision('APPROVE')}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded text-xs transition duration-150"
                >
                  Approve Staging
                </button>
                <button
                  onClick={() => handleDecision('REJECT')}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-medium py-2 rounded text-xs transition duration-150"
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          {record.activation_token_staging_status === 'STAGED' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-600">Decision approved. Ready to finalize token staging metadata.</p>
              <button
                onClick={handleFinalize}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded text-xs transition duration-150"
              >
                Finalize & Lock Staging
              </button>
            </div>
          )}

          {record.activation_token_staging_status === 'FINALIZED' && (
            <div className="space-y-3">
              <div className="bg-emerald-50 text-emerald-800 p-3 rounded text-xs border border-emerald-200">
                <strong>Staging Gate Finalized.</strong>
                <p className="mt-1">Lineage chain locked and v158.0 evidence pack successfully signed.</p>
              </div>
              <div className="space-y-1 font-mono text-[10px] text-gray-500">
                <div className="truncate">Staging Hash: {record.activation_token_staging_hash}</div>
                <div className="truncate">Evidence Hash: {record.token_staging_evidence_pack_hash}</div>
              </div>
            </div>
          )}

          {record.activation_token_staging_status === 'REJECTED' && (
            <div className="bg-rose-50 text-rose-800 p-3 rounded text-xs border border-rose-200">
              <strong>Staging Rejected.</strong>
              <p className="mt-1">Rejection decision logged. A new token final approval run must be requested.</p>
            </div>
          )}
        </div>
      </div>

      {/* Rules list */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Evaluated Rules Audit Logs</h3>
        {rules.length === 0 ? (
          <p className="text-xs text-gray-400">No evaluations recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.rule_id} className="flex justify-between items-start text-xs border-b pb-2 border-gray-100">
                <div>
                  <span className="font-semibold text-gray-700">{rule.check_type}</span>
                  <p className="text-gray-500 mt-0.5">{rule.description}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase
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
