import React, { useState, useEffect } from 'react';
import { controlledBetaCohortInterventionExecutionPlanClient } from '../../lib/controlledBetaCohortInterventionExecutionPlanClient';
import { PlanRecord, PlanRuleCheck, PlanEvidence, PlanAuditLog } from '../../lib/controlledBetaCohortInterventionExecutionPlan';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280',
  READY_FOR_EVALUATION: '#3b82f6',
  EVALUATED: '#10b981',
  MATERIALIZED: '#10b981',
  FINALIZED: '#10b981',
  BLOCKED: '#dc2626',
  FAILED: '#ef4444',
  SUPERSEDED: '#9ca3af'
};

export const ControlledBetaCohortInterventionSimulationExecutionPlan: React.FC = () => {
  const [planList, setPlanList] = useState<PlanRecord[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  // Detail states
  const [plan, setPlan] = useState<PlanRecord | null>(null);
  const [rules, setRules] = useState<PlanRuleCheck[]>([]);
  const [evidence, setEvidence] = useState<PlanEvidence | null>(null);
  const [auditLogs, setAuditLogs] = useState<PlanAuditLog[]>([]);

  // Input states
  const [dispatcherIdInput, setDispatcherIdInput] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [selectedResult, setSelectedResult] = useState('PLAN_MATERIALIZED_NOT_EXECUTED');

  // Safety Attestation Overrides
  const [overrideOperator, setOverrideOperator] = useState('true');
  const [overrideKillSwitch, setOverrideKillSwitch] = useState('true');
  const [overridePlan, setOverridePlan] = useState('true');
  const [overrideResult, setOverrideResult] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const loadList = async () => {
    setLoading(true);
    try {
      const data = await controlledBetaCohortInterventionExecutionPlanClient.getPlanList();
      setPlanList(data);
      addLog('Fetched execution plan materialization logs.');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadList();
  }, []);

  const loadDetails = async (planId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await controlledBetaCohortInterventionExecutionPlanClient.getPlanDetails(planId);
      setPlan(data.plan);
      setRules(data.rules);
      setEvidence(data.evidence);
      setAuditLogs(data.auditLogs);
      setActivePlanId(planId);
      addLog(`Details loaded for execution plan: ${planId}`);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const createRecord = async () => {
    if (!dispatcherIdInput.trim()) {
      setError('Dispatcher ID is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await controlledBetaCohortInterventionExecutionPlanClient.createPlan(dispatcherIdInput.trim());
      addLog(`Execution plan draft ${res.plan_id} initialized.`);
      setDispatcherIdInput('');
      await loadList();
      await loadDetails(res.plan_id);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const evaluateRecord = async () => {
    if (!plan) return;
    setLoading(true);
    setError(null);
    try {
      const overrides: any = {
        operator_confirmed: overrideOperator === 'true',
        kill_switch_verified: overrideKillSwitch === 'true'
      };
      if (overridePlan === 'false') {
        overrides.canary_envelope = { plan_mode: 'EXECUTABLE', allow_real_execution: true }; // triggers failure block
      }
      if (overrideResult) overrides.plan_result = overrideResult;

      await controlledBetaCohortInterventionExecutionPlanClient.evaluatePlan(plan.plan_id, overrides);
      addLog(`Completed rules validation for execution plan: ${plan.plan_id}`);
      await loadDetails(plan.plan_id);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const recordDecision = async () => {
    if (!plan || !decisionRationale.trim()) {
      setError('Governance justification statement required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionExecutionPlanClient.recordDecision(plan.plan_id, selectedResult, decisionRationale.trim());
      addLog(`Submitted result decision '${selectedResult}'`);
      setDecisionRationale('');
      await loadDetails(plan.plan_id);
      await loadList();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const finalizeRecord = async () => {
    if (!plan) return;
    setLoading(true);
    setError(null);
    try {
      await controlledBetaCohortInterventionExecutionPlanClient.finalizePlan(plan.plan_id);
      addLog(`Finalized execution plan packet. Evidence Pack v149.0 locked.`);
      await loadDetails(plan.plan_id);
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
            High-Risk Execution Plan Materialization Gate
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            Phase 149 Gate — Immutable plan materialization, future activation gates checks, and operator safety sign-off
          </p>
        </div>
      </header>

      {/* Warning Banner */}
      <div style={{ background: '#fef3c7', borderLeft: '4px solid #d97706', padding: '16px', borderRadius: '4px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 4px 0', color: '#92400e', fontWeight: 600 }}>⚠️ WARNING: MATERIALIZED EXECUTION PLAN ONLY (NON-EXECUTABLE)</h4>
        <p style={{ margin: 0, color: '#b45309', fontSize: '13px' }}>
          This is a materialized execution plan, not an executable execution plan. No operational execution capability is enabled by Phase 149. A future activation gate is required before any executable state can exist.
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
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Materialize Plan</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Finalized Dispatcher ID..."
                value={dispatcherIdInput}
                onChange={(e) => setDispatcherIdInput(e.target.value)}
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
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Materialized Plans</h3>
            {loading && planList.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>Loading...</p>
            ) : planList.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>No plans found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {planList.map((pln) => (
                  <div
                    key={pln.plan_id}
                    onClick={() => loadDetails(pln.plan_id)}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: activePlanId === pln.plan_id ? '#3b82f6' : '#e2e8f0',
                      background: activePlanId === pln.plan_id ? '#eff6ff' : '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{pln.plan_id}</span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: STATUS_COLORS[pln.plan_status] || '#cbd5e1',
                        color: '#ffffff'
                      }}>{pln.plan_status}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Dispatcher ID: {pln.source_dispatcher_id}</div>
                    {pln.plan_result && (
                      <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 500, color: '#0f172a', background: '#e2e8f0', padding: '2px 4px', borderRadius: '2px', display: 'inline-block' }}>
                        {pln.plan_result}
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
          {plan ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Materialized Plan: {plan.plan_id}</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                      Derived from Dispatcher: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{plan.source_dispatcher_id}</span>
                    </p>
                  </div>
                  <span style={{ padding: '6px 12px', borderRadius: '6px', background: '#f1f5f9', fontSize: '12px', fontWeight: 600 }}>
                    Status: {plan.plan_execution_status}
                  </span>
                </div>

                {/* Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Plan Executable</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444', marginTop: '2px' }}>
                      FALSE
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Plan Mode</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                      {plan.execution_plan_status}
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Real Jobs</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                      {plan.job_creation_status}
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Plan Result</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6', marginTop: '2px' }}>{plan.plan_result || 'PENDING EVALUATION'}</div>
                  </div>
                </div>

                {/* Decision Submit */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Log Execution Plan Result</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: '12px', marginBottom: '12px' }}>
                    <select
                      value={selectedResult}
                      onChange={(e) => setSelectedResult(e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="PLAN_MATERIALIZED_NOT_EXECUTED">Plan Materialized (Not Executed)</option>
                      <option value="PLAN_BLOCKED_BY_GUARDRAIL">Blocked by Guardrail</option>
                      <option value="PLAN_BLOCKED_BY_PARENT_DISPATCHER">Blocked by Parent Dispatcher</option>
                      <option value="PLAN_BLOCKED_BY_WRITE_SCOPE">Blocked by Write Scope</option>
                      <option value="PLAN_BLOCKED_BY_EXECUTABLE_FLAG">Blocked by Executable Flag</option>
                      <option value="REQUIRE_DRY_RUN_REVALIDATION">Require Dry-Run Revalidation</option>
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
                    disabled={plan.plan_status === 'FINALIZED'}
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
                      disabled={plan.plan_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Evaluate Execution Plan
                    </button>
                    <button
                      onClick={finalizeRecord}
                      disabled={!plan.plan_result || plan.plan_status === 'FINALIZED'}
                      style={{ padding: '8px 16px', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Finalize & Lock Plan
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
                      <label style={{ fontSize: '11px', color: '#6b21a8' }}>Plan Config</label>
                      <select
                        value={overridePlan}
                        onChange={(e) => setOverridePlan(e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', marginTop: '4px' }}
                      >
                        <option value="true">Materialized Only</option>
                        <option value="false">Invalid (Executable)</option>
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
                        <option value="PLAN_MATERIALIZED_NOT_EXECUTED">Force Executed</option>
                        <option value="PLAN_BLOCKED_BY_GUARDRAIL">Force Blocked</option>
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
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Evidence Package (v149.0)</h3>
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
              Select a materialized plan record or enter a finalized dispatcher ID to start.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
