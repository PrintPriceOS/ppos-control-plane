import React, { useState, useCallback } from 'react';
import {
  createPilotRun,
  registerPilotTenant,
  activatePilotTenant,
  suspendPilotTenant,
  getPilotReadiness,
  recordPilotFinding,
  resolvePilotFinding,
  createPilotRollbackPoint,
  simulatePilotRollback,
  getPilotAuditTimeline,
  getPilotEvidencePack,
} from '../../api/controlledProductionPilotActivationClient';

const SAFETY_NOTICE =
  'Controlled pilot only. FULL_PUBLIC remains disabled. No unrestricted live provider connectivity, ' +
  'payment execution, refund execution, payout execution, tax/accounting submission, ' +
  'provider submission, or source record mutation is enabled.';

export function ControlledProductionPilotActivation() {
  const [pilotRunId, setPilotRunId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [findingDesc, setFindingDesc] = useState('');
  const [findingType, setFindingType] = useState('INFO');
  const [findingId, setFindingId] = useState('');
  const [rollbackName, setRollbackName] = useState('');
  const [rollbackId, setRollbackId] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const run = useCallback(async (label: string, fn: () => Promise<Record<string, unknown>>) => {
    setLoading(true);
    setMessage('');
    try {
      const r = await fn();
      setResult(r);
      setMessage(`${label} completed.`);
      return r;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(`Error in ${label}: ${msg}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    const r = await run('Create Pilot Run', () => createPilotRun({ created_by: 'admin' }));
    if (r) {
      const pr = r.pilot_run as Record<string, unknown> | undefined;
      if (pr?.pilot_run_id) setPilotRunId(String(pr.pilot_run_id));
    }
  }, [run]);

  const handleReadiness = useCallback(() =>
    run('Evaluate Readiness', () => getPilotReadiness(pilotRunId || undefined)),
    [pilotRunId, run]);

  const handleRegisterTenant = useCallback(() =>
    run('Register Tenant', () => registerPilotTenant({
      pilot_run_id: pilotRunId, tenant_id: tenantId, tenant_name: tenantName, registered_by: 'admin',
    })),
    [pilotRunId, tenantId, tenantName, run]);

  const handleActivateTenant = useCallback(() =>
    run('Activate Tenant', () => activatePilotTenant({ pilot_run_id: pilotRunId, tenant_id: tenantId })),
    [pilotRunId, tenantId, run]);

  const handleSuspendTenant = useCallback(() =>
    run('Suspend Tenant', () => suspendPilotTenant({ pilot_run_id: pilotRunId, tenant_id: tenantId, reason: 'Manual suspension' })),
    [pilotRunId, tenantId, run]);

  const handleRecordFinding = useCallback(() =>
    run('Record Finding', () => recordPilotFinding({
      pilot_run_id: pilotRunId, finding_type: findingType, description: findingDesc, created_by: 'admin',
    })),
    [pilotRunId, findingType, findingDesc, run]);

  const handleResolveFinding = useCallback(() =>
    run('Resolve Finding', () => resolvePilotFinding({ finding_id: findingId, resolved_by: 'admin', resolution: 'Resolved via UI' })),
    [findingId, run]);

  const handleCreateRollbackPoint = useCallback(() =>
    run('Create Rollback Point', () => createPilotRollbackPoint({
      pilot_run_id: pilotRunId, rollback_point_name: rollbackName || undefined, created_by: 'admin',
    })),
    [pilotRunId, rollbackName, run]);

  const handleSimulateRollback = useCallback(() =>
    run('Simulate Rollback', () => simulatePilotRollback({ rollback_id: rollbackId })),
    [rollbackId, run]);

  const handleAuditTimeline = useCallback(() =>
    run('Audit Timeline', () => getPilotAuditTimeline(pilotRunId)),
    [pilotRunId, run]);

  const handleEvidencePack = useCallback(() =>
    run('Evidence Pack', () => getPilotEvidencePack(pilotRunId)),
    [pilotRunId, run]);

  const inputClass = 'border rounded px-2 py-1 text-sm w-full';
  const btnClass = 'px-3 py-1 rounded text-sm font-medium text-white';
  const primaryBtn = `${btnClass} bg-blue-600 hover:bg-blue-700`;
  const warningBtn = `${btnClass} bg-amber-600 hover:bg-amber-700`;
  const successBtn = `${btnClass} bg-green-600 hover:bg-green-700`;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Controlled Production Pilot Activation</h1>

      <div className="bg-amber-50 border border-amber-300 rounded p-4 text-sm text-amber-900">
        {SAFETY_NOTICE}
      </div>

      {message && (
        <div className={`p-3 rounded text-sm ${message.startsWith('Error') ? 'bg-red-50 text-red-800 border border-red-300' : 'bg-green-50 text-green-800 border border-green-300'}`}>
          {message}
        </div>
      )}

      {/* Pilot Run */}
      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">Pilot Run</h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Pilot Run ID</label>
            <input className={inputClass} value={pilotRunId} onChange={e => setPilotRunId(e.target.value)} placeholder="Auto-generated on create" />
          </div>
          <button className={primaryBtn} onClick={handleCreate} disabled={loading}>Create Run</button>
          <button className={successBtn} onClick={handleReadiness} disabled={loading || !pilotRunId}>Evaluate Readiness</button>
        </div>
      </section>

      {/* Tenant Management */}
      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">Tenant Management (Allowlist-Only)</h2>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tenant ID</label>
            <input className={inputClass} value={tenantId} onChange={e => setTenantId(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tenant Name</label>
            <input className={inputClass} value={tenantName} onChange={e => setTenantName(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <button className={primaryBtn} onClick={handleRegisterTenant} disabled={loading || !pilotRunId || !tenantId}>Register Tenant</button>
          <button className={successBtn} onClick={handleActivateTenant} disabled={loading || !pilotRunId || !tenantId}>Activate Tenant</button>
          <button className={warningBtn} onClick={handleSuspendTenant} disabled={loading || !pilotRunId || !tenantId}>Suspend Tenant</button>
        </div>
      </section>

      {/* Findings */}
      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">Findings</h2>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select className={inputClass} value={findingType} onChange={e => setFindingType(e.target.value)}>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="BLOCKER">BLOCKER</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <input className={inputClass} value={findingDesc} onChange={e => setFindingDesc(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <button className={primaryBtn} onClick={handleRecordFinding} disabled={loading || !pilotRunId}>Record Finding</button>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Finding ID to Resolve</label>
            <input className={inputClass} value={findingId} onChange={e => setFindingId(e.target.value)} />
          </div>
          <button className={successBtn} onClick={handleResolveFinding} disabled={loading || !findingId}>Resolve</button>
        </div>
      </section>

      {/* Rollback */}
      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">Rollback Points</h2>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rollback Point Name</label>
            <input className={inputClass} value={rollbackName} onChange={e => setRollbackName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rollback ID (for simulation)</label>
            <input className={inputClass} value={rollbackId} onChange={e => setRollbackId(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <button className={primaryBtn} onClick={handleCreateRollbackPoint} disabled={loading || !pilotRunId}>Create Rollback Point</button>
          <button className={warningBtn} onClick={handleSimulateRollback} disabled={loading || !rollbackId}>Simulate Rollback</button>
        </div>
      </section>

      {/* Audit & Evidence */}
      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">Audit & Evidence</h2>
        <div className="flex gap-2">
          <button className={primaryBtn} onClick={handleAuditTimeline} disabled={loading || !pilotRunId}>View Audit Timeline</button>
          <button className={successBtn} onClick={handleEvidencePack} disabled={loading || !pilotRunId}>Build Evidence Pack</button>
        </div>
      </section>

      {/* Result Display */}
      {result && (
        <section className="bg-gray-50 border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Result</h2>
          <pre className="text-xs overflow-auto max-h-96 bg-white p-3 rounded border">
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
