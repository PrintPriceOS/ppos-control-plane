import React, { useEffect, useState } from 'react';
import {
  getProductionActivationDryRunReadiness,
  createProductionActivationDryRun,
  executeProductionActivationDryRun,
  simulateProductionActivationRollback,
  getProductionActivationDryRunSteps,
  getProductionActivationDryRunAuditTimeline,
  getProductionActivationDryRunEvidencePack,
  ReadinessResponse,
  CreateDryRunResponse,
  ExecuteDryRunResponse,
  RollbackResponse,
  StepsResponse,
  AuditTimelineResponse,
  EvidencePackResponse,
} from '../../api/financialOperationsProductionActivationDryRunClient';

const SAFETY_NOTICE =
  'This is a dry-run only. No production activation, live provider connectivity, ' +
  'payment execution, refund execution, payout execution, tax/accounting submission, ' +
  'provider submission, or source record mutation will occur.';

export const ProductionActivationDryRun: React.FC = () => {
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [activeDryRunId, setActiveDryRunId] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<CreateDryRunResponse | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteDryRunResponse | null>(null);
  const [rollbackResult, setRollbackResult] = useState<RollbackResponse | null>(null);
  const [steps, setSteps] = useState<StepsResponse | null>(null);
  const [auditTimeline, setAuditTimeline] = useState<AuditTimelineResponse | null>(null);
  const [evidencePack, setEvidencePack] = useState<EvidencePackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requestedBy, setRequestedBy] = useState('admin');
  const [gateRef, setGateRef] = useState('');

  const fetchReadiness = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getProductionActivationDryRunReadiness(gateRef || undefined);
      setReadiness(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch readiness');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReadiness();
  }, []);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await createProductionActivationDryRun({
        gate_reference_id: gateRef || undefined,
        requested_by: requestedBy,
      });
      setCreateResult(res);
      if (res.ok && res.dry_run_id) {
        setActiveDryRunId(res.dry_run_id);
        await refreshDryRunData(res.dry_run_id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create dry run');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!activeDryRunId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await executeProductionActivationDryRun({ dry_run_id: activeDryRunId });
      setExecuteResult(res);
      await refreshDryRunData(activeDryRunId);
    } catch (err: any) {
      setError(err.message || 'Failed to execute dry run');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateRollback = async () => {
    if (!activeDryRunId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await simulateProductionActivationRollback({ dry_run_id: activeDryRunId });
      setRollbackResult(res);
      await refreshDryRunData(activeDryRunId);
    } catch (err: any) {
      setError(err.message || 'Failed to simulate rollback');
    } finally {
      setLoading(false);
    }
  };

  const refreshDryRunData = async (dryRunId: string) => {
    try {
      const [stepsRes, auditRes, packRes] = await Promise.all([
        getProductionActivationDryRunSteps(dryRunId),
        getProductionActivationDryRunAuditTimeline(dryRunId),
        getProductionActivationDryRunEvidencePack(dryRunId),
      ]);
      setSteps(stepsRes);
      setAuditTimeline(auditRes);
      setEvidencePack(packRes);
    } catch (_) {
      // non-fatal
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Safety Banner */}
      <div className="bg-yellow-50 border border-yellow-400 rounded p-4">
        <div className="text-sm font-semibold text-yellow-800 mb-1">PHASE 114 — DRY RUN ONLY</div>
        <div className="text-xs text-yellow-700">{SAFETY_NOTICE}</div>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">
        Controlled Production Activation Dry Run
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      {/* Readiness Section */}
      <section className="bg-white border rounded p-5 space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Dry-Run Readiness</h2>
        <div className="flex gap-3 items-center">
          <input
            className="border rounded px-3 py-1 text-sm flex-1"
            placeholder="Gate Reference ID (optional)"
            value={gateRef}
            onChange={e => setGateRef(e.target.value)}
          />
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded"
            onClick={fetchReadiness}
            disabled={loading}
          >
            Check Readiness
          </button>
        </div>
        {readiness && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">Status:</span>
              <span
                className={`text-sm font-bold ${
                  readiness.status === 'READY_FOR_DRY_RUN' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {readiness.status}
              </span>
            </div>
            {readiness.gate_reference_id && (
              <div className="text-xs text-gray-500">
                Gate Reference: {readiness.gate_reference_id}
              </div>
            )}
            {readiness.safety_invariants && (
              <div className="mt-2">
                <div className="text-xs font-semibold text-gray-600 mb-1">Safety Invariants</div>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(readiness.safety_invariants).map(([k, v]) => (
                    <div key={k} className="text-xs flex justify-between bg-gray-50 px-2 py-0.5 rounded">
                      <span className="text-gray-600">{k}</span>
                      <span className={v ? 'text-red-600' : 'text-green-600'}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Create Dry Run */}
      <section className="bg-white border rounded p-5 space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Create Dry Run</h2>
        <div className="flex gap-3 items-center">
          <input
            className="border rounded px-3 py-1 text-sm flex-1"
            placeholder="Requested By"
            value={requestedBy}
            onChange={e => setRequestedBy(e.target.value)}
          />
          <button
            className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-1.5 rounded"
            onClick={handleCreate}
            disabled={loading}
          >
            Create Dry Run
          </button>
        </div>
        {createResult && (
          <div className="text-xs bg-gray-50 rounded p-3 space-y-1">
            <div><span className="font-medium">Dry Run ID:</span> {createResult.dry_run_id}</div>
            <div><span className="font-medium">Status:</span> {createResult.dry_run_status}</div>
            <div><span className="font-medium">Gate Ref:</span> {createResult.gate_reference_id}</div>
            <div className="text-green-700 font-medium">dry_run_only: true</div>
          </div>
        )}
      </section>

      {/* Execute Dry Run + Rollback */}
      {activeDryRunId && (
        <section className="bg-white border rounded p-5 space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">Execute / Rollback</h2>
          <div className="text-xs text-gray-500">Active Dry Run ID: {activeDryRunId}</div>
          <div className="flex gap-3">
            <button
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-1.5 rounded"
              onClick={handleExecute}
              disabled={loading}
            >
              Execute Dry Run
            </button>
            <button
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-4 py-1.5 rounded"
              onClick={handleSimulateRollback}
              disabled={loading}
            >
              Simulate Rollback
            </button>
          </div>
          {executeResult && (
            <div className="text-xs bg-gray-50 rounded p-3 space-y-1">
              <div className="font-medium text-indigo-700">Execute Result: {executeResult.dry_run_status}</div>
              <div>Simulated steps: {executeResult.simulated_activation_steps?.length ?? 0}</div>
              <div className="text-green-700 font-medium">payment_execution_enabled: false</div>
              <div className="text-green-700 font-medium">live_provider_connectivity_enabled: false</div>
            </div>
          )}
          {rollbackResult && (
            <div className="text-xs bg-orange-50 rounded p-3 space-y-1">
              <div className="font-medium text-orange-700">
                Rollback ID: {rollbackResult.rollback_id}
              </div>
              <div className="text-green-700 font-medium">
                rollback_simulated_only: {String(rollbackResult.rollback_simulated_only)}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Dry Run Steps */}
      {steps && (
        <section className="bg-white border rounded p-5 space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">Dry Run Steps</h2>
          <div className="space-y-1">
            {(steps.steps || []).map((s, i) => (
              <div key={i} className="flex justify-between text-xs bg-gray-50 px-3 py-1.5 rounded">
                <span className="text-gray-700">{s.step_name || s.step_id}</span>
                <span
                  className={`font-medium ${
                    s.step_status === 'SIMULATED_PASS'
                      ? 'text-green-600'
                      : s.step_status === 'PENDING'
                      ? 'text-gray-500'
                      : 'text-red-600'
                  }`}
                >
                  {s.step_status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Audit Timeline */}
      {auditTimeline && (
        <section className="bg-white border rounded p-5 space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">Audit Timeline</h2>
          <div className="space-y-1">
            {(auditTimeline.audit_timeline || []).map((e, i) => (
              <div key={i} className="flex justify-between text-xs bg-gray-50 px-3 py-1.5 rounded">
                <span className="font-medium text-gray-700">{e.event_type}</span>
                <span className="text-gray-400">{e.created_at}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Evidence Pack Preview */}
      {evidencePack && (
        <section className="bg-white border rounded p-5 space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">Evidence Pack</h2>
          <div className="text-xs bg-gray-50 rounded p-3 space-y-1">
            <div><span className="font-medium">Dry Run ID:</span> {evidencePack.dry_run_id}</div>
            <div><span className="font-medium">Status:</span> {evidencePack.dry_run_status}</div>
            <div>
              <span className="font-medium">Activation Steps:</span>{' '}
              {evidencePack.simulated_activation_steps?.length ?? 0}
            </div>
            <div>
              <span className="font-medium">Rollback Steps:</span>{' '}
              {evidencePack.simulated_rollback_steps?.length ?? 0}
            </div>
            <div>
              <span className="font-medium">Audit Events:</span>{' '}
              {evidencePack.audit_summary?.length ?? 0}
            </div>
          </div>
          {evidencePack.safety_invariants && (
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">Safety Invariants</div>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(evidencePack.safety_invariants).map(([k, v]) => (
                  <div key={k} className="text-xs flex justify-between bg-gray-50 px-2 py-0.5 rounded">
                    <span className="text-gray-600">{k}</span>
                    <span className={v ? 'text-red-600' : 'text-green-600'}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-300 rounded p-2">
            {SAFETY_NOTICE}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProductionActivationDryRun;
