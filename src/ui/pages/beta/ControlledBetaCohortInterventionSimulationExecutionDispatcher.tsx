import React, { useState, useEffect } from 'react';
import { controlledBetaCohortInterventionExecutionDispatcherClient } from '../../lib/controlledBetaCohortInterventionExecutionDispatcherClient';
import { DispatcherRecord, DispatcherRuleCheck, DispatcherEvidence, DispatcherAuditLog } from '../../lib/controlledBetaCohortInterventionExecutionDispatcher';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280',
  READY_FOR_EVALUATION: '#3b82f6',
  EVALUATED: '#10b981',
  READY_FOR_DRY_RUN: '#3b82f6',
  DRY_RUN_COMPLETED: '#10b981',
  FINALIZED: '#10b981',
  BLOCKED: '#dc2626',
  FAILED: '#ef4444',
  SUPERSEDED: '#9ca3af'
};

export const ControlledBetaCohortInterventionSimulationExecutionDispatcher: React.FC = () => {
  const [dispatcherList, setDispatcherList] = useState<DispatcherRecord[]>([]);
  const [activeDispatcherId, setActiveDispatcherId] = useState<string | null>(null);

  // Detail states
  const [dispatcher, setDispatcher] = useState<DispatcherRecord | null>(null);
  const [rules, setRules] = useState<DispatcherRuleCheck[]>([]);
  const [evidence, setEvidence] = useState<DispatcherEvidence | null>(null);
  const [auditLogs, setAuditLogs] = useState<DispatcherAuditLog[]>([]);

  // Input states
  const [envelopeIdInput, setEnvelopeIdInput] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [selectedResult, setSelectedResult] = useState('DRY_RUN_EXECUTED_NOT_MUTATED');

  // Safety Attestation Overrides
  const [overrideOperator, setOverrideOperator] = useState('true');
  const [overrideKillSwitch, setOverrideKillSwitch] = useState('true');
  const [overrideDispatcher, setOverrideDispatcher] = useState('true');
  const [overrideResult, setOverrideResult] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const loadList = async () => {
    setLoading(true);
    try {
      const data = await controlledBetaCohortInterventionExecutionDispatcherClient.getDispatcherList();
      setDispatcherList(data);
      addLog('Fetched dry-run execution dispatcher validation logs.');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadList();
  }, []);

  const loadDetails = async (dispatcherId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await controlledBetaCohortInterventionExecutionDispatcherClient.getDispatcherDetails(dispatcherId);
      setDispatcher(data.dispatcher);
      setRules(data.rules);
      setEvidence(data.evidence);
      setAuditLogs(data.auditLogs);
      setActiveDispatcherId(dispatcherId);
      addLog(`Details loaded for dry-run dispatcher: ${dispatcherId}`);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const createRecord = async () => {
    if (!envelopeIdInput.trim()) {
      setError('Envelope ID is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await controlledBetaCohortInterventionExecutionDispatcherClient.createDispatcher(envelopeIdInput.trim());
      addLog(`Dispatcher draft ${res.dispatcher_id} initialized.`);
      setEnvelopeIdInput('');
      await loadList();
      await loadDetails(res.dispatcher_id);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const evaluateRecord = async () => {
    if (!dispatcher) return;
    setLoading(true);
    setError(null);
    try {
      const overrides: any = {
        operator_confirmed: overrideOperator === 'true',
        kill_switch_verified: overrideKillSwitch === 'true'
      };
      if (overrideDispatcher === 'false') {
        overrides.canary_envelope = { dispatch_mode: 'REAL_EXECUTION', allow_real_job_creation: true }; // triggers failure block
      }
      if (overrideResult) overrides.dispatcher_result = overrideResult;

      await controlledBetaCohortInterventionExecutionDispatcherClient.evaluateDispatcher(dispatcher.dispatcher_id, overrides);
      addLog(`Completed rules validation for dry-run dispatcher: ${dispatcher.dispatcher_id}`);
      await loadDetails(dispatcher.dispatcher_id);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const recordDecision = async () => {
    if (!dispatcher || !decisionRationale.trim()) {
      setError('Governance justification statement required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionExecutionDispatcherClient.recordDecision(dispatcher.dispatcher_id, selectedResult, decisionRationale.trim());
      addLog(`Submitted result decision '${selectedResult}'`);
      setDecisionRationale('');
      await loadDetails(dispatcher.dispatcher_id);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const finalizeRecord = async () => {
    if (!dispatcher) return;
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionExecutionDispatcherClient.finalizeDispatcher(dispatcher.dispatcher_id);
      addLog(`Finalized dry-run dispatcher packet. Evidence Pack v148.0 locked.`);
      await loadDetails(dispatcher.dispatcher_id);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'Inter, system-ui, sans-serif', color: '#1e293b', background: '#f8fafc', minHeight: '100vh' }}>
      <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, letterSpacing: '-0.025em', color: '#0f172a' }}>
            High-Risk Dry-Run Dispatcher Gate
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            Phase 148 Gate — Dry-run queue routing, simulated job dispatcher limits, and rollback hooks verification
          </p>
        </div>
      </header>

      {/* Warning Banner */}
      <div style={{ background: '#fef3c7', borderLeft: '4px solid #d97706', padding: '16px', borderRadius: '4px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 4px 0', color: '#92400e', fontWeight: 600 }}>⚠️ WARNING: DRY-RUN VERIFICATION ONLY</h4>
        <p style={{ margin: 0, color: '#b45309', fontSize: '13px' }}>
          Dry-run dispatcher validation does not authorize real execution. Dry-run dispatcher validation does not create jobs. Dry-run dispatcher validation does not mutate runtime state.
        </p>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px', borderRadius: '6px', marginBottom: '24px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px' }}>
        {/* Left Column */}
        <div>
          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Initialize Dry-Run Dispatcher</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Finalized Envelope ID..."
                value={envelopeIdInput}
                onChange={(e) => setEnvelopeIdInput(e.target.value)}
                style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
              />
              <button
                onClick={createRecord}
                style={{ padding: '8px 12px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
              >
                Draft
              </button>
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Dry-Run Dispatchers</h3>
            {loading && dispatcherList.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>Loading...</p>
            ) : dispatcherList.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>No dispatchers found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {dispatcherList.map((dsp) => (
                  <div
                    key={dsp.dispatcher_id}
                    onClick={() => loadDetails(dsp.dispatcher_id)}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: activeDispatcherId === dsp.dispatcher_id ? '#3b82f6' : '#e2e8f0',
                      background: activeDispatcherId === dsp.dispatcher_id ? '#eff6ff' : '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{dsp.dispatcher_id}</span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: STATUS_COLORS[dsp.dispatcher_status] || '#cbd5e1',
                        color: '#ffffff'
                      }}>{dsp.dispatcher_status}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Envelope ID: {dsp.source_envelope_id}</div>
                    {dsp.dispatcher_result && (
                      <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 500, color: '#0f172a', background: '#e2e8f0', padding: '2px 4px', borderRadius: '2px', display: 'inline-block' }}>
                        {dsp.dispatcher_result}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div>
          {dispatcher ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Dry-Run Dispatcher: {dispatcher.dispatcher_id}</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                      Derived from Envelope: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{dispatcher.source_envelope_id}</span>
                    </p>
                  </div>
                  <span style={{ padding: '6px 12px', borderRadius: '6px', background: '#f1f5f9', fontSize: '12px', fontWeight: 600 }}>
                    Status: {dispatcher.dispatcher_execution_status}
                  </span>
                </div>

                {/* Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Dispatch Mode</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#10b981', marginTop: '2px' }}>
                      DRY_RUN_ONLY
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Queue Dispatch</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                      SIMULATED_ONLY
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Job Creation</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                      {dispatcher.job_creation_status}
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Dispatcher Result</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6', marginTop: '2px' }}>{dispatcher.dispatcher_result || 'PENDING EVALUATION'}</div>
                  </div>
                </div>

                {/* Decision Submit */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Log Dispatcher Result</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: '12px', marginBottom: '12px' }}>
                    <select
                      value={selectedResult}
                      onChange={(e) => setSelectedResult(e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="DRY_RUN_EXECUTED_NOT_MUTATED">Dry-Run Executed (Not Mutated)</option>
                      <option value="DRY_RUN_BLOCKED_BY_GUARDRAIL">Blocked by Guardrail</option>
                      <option value="DRY_RUN_BLOCKED_BY_PARENT_ENVELOPE">Blocked by Parent Envelope</option>
                      <option value="DRY_RUN_BLOCKED_BY_QUEUE_POLICY">Blocked by Queue Policy</option>
                      <option value="DRY_RUN_BLOCKED_BY_ROLLBACK_POLICY">Blocked by Rollback Policy</option>
                      <option value="DRY_RUN_BLOCKED_BY_WRITE_SCOPE">Blocked by Write Scope</option>
                      <option value="REQUIRE_NO_OP_REVALIDATION">Require NO_OP Revalidation</option>
                      <option value="ESCALATE_TO_GOVERNANCE_OWNER">Escalate to Owner</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Operator confirmation details and status..."
                      value={decisionRationale}
                      onChange={(e) => setDecisionRationale(e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                  <button
                    onClick={recordDecision}
                    disabled={dispatcher.dispatcher_status === 'FINALIZED'}
                    style={{ padding: '8px 16px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                  >
                    Submit Result
                  </button>
                </div>

                {/* Workflow Controls */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginTop: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Workflow Controls</h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={evaluateRecord}
                      disabled={dispatcher.dispatcher_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Evaluate Dry-Run Dispatcher
                    </button>
                    <button
                      onClick={finalizeRecord}
                      disabled={!dispatcher.dispatcher_result || dispatcher.dispatcher_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Finalize & Lock Dispatcher
                    </button>
                  </div>
                </div>

                {/* Overrides Panel */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginTop: '20px', background: '#faf5ff', padding: '16px', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#6b21a8' }}>Safety Attestation Overrides</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Operator Present</label>
                      <select
                        value={overrideOperator}
                        onChange={(e) => setOverrideOperator(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="true">Confirmed (Pass)</option>
                        <option value="false">Missing (Fail)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Kill-Switch Status</label>
                      <select
                        value={overrideKillSwitch}
                        onChange={(e) => setOverrideKillSwitch(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="true">Verified (Pass)</option>
                        <option value="false">Missing (Fail)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Dry-Run Config</label>
                      <select
                        value={overrideDispatcher}
                        onChange={(e) => setOverrideDispatcher(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="true">DRY_RUN Enforced</option>
                        <option value="false">Invalid (Real Dispatch)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Force Result</label>
                      <select
                        value={overrideResult}
                        onChange={(e) => setOverrideResult(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="">Default (Automated)</option>
                        <option value="DRY_RUN_EXECUTED_NOT_MUTATED">Force Executed</option>
                        <option value="DRY_RUN_BLOCKED_BY_GUARDRAIL">Force Blocked</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rules */}
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Validation Rules ({rules.length})</h3>
                {rules.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>No validation rules loaded.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {rules.map((r) => (
                      <div key={r.rule_id} style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>
                            {r.check_type}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: r.severity === 'CRITICAL' ? '#ef4444' : r.severity === 'WARNING' ? '#f59e0b' : '#3b82f6'
                          }}>{r.severity}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', color: '#334155' }}>{r.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Evidence Pack */}
              {evidence && (
                <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Evidence Package (v148.0)</h3>
                  <div style={{ padding: '12px', background: '#faf5ff', borderRadius: '6px', border: '1px solid #d8b4fe', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#6b21a8' }}>Evidence Pack Hash</div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600, color: '#581c87', marginTop: '2px', wordBreak: 'break-all' }}>
                      {evidence.evidence_pack_hash}
                    </div>
                  </div>
                  <details style={{ cursor: 'pointer' }}>
                    <summary style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6' }}>View Payload JSON & Lineage Chain</summary>
                    <pre style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '11px', overflowX: 'auto', marginTop: '8px', cursor: 'default' }}>
                      {JSON.stringify(typeof evidence.evidence_payload_json === 'string' ? JSON.parse(evidence.evidence_payload_json) : evidence.evidence_payload_json, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

              {/* Audit Logs */}
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Audit Trail ({auditLogs.length})</h3>
                {auditLogs.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>No audit logs registered.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {auditLogs.map((l) => (
                      <div key={l.audit_event_id} style={{ display: 'flex', gap: '12px', fontSize: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                        <span style={{ color: '#64748b', minWidth: '80px' }}>{new Date(l.created_at).toLocaleTimeString()}</span>
                        <span style={{ fontWeight: 600, color: '#334155' }}>{l.event_type}</span>
                        <span style={{ color: '#64748b' }}>by {l.actor_id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: '#ffffff', padding: '48px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b' }}>
              Select a dry-run dispatcher record or enter a finalized envelope ID to start.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
