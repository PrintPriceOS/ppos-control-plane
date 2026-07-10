import React, { useState } from 'react';

const SIMULATION_TYPES = [
  { value: 'SIMULATE_COHORT_PAUSE', label: 'Simulate Cohort Pause', risk: 'HIGH', icon: '⏸️' },
  { value: 'SIMULATE_PARTICIPANT_ACCESS_RESTRICTION', label: 'Simulate Participant Access Restriction', risk: 'MEDIUM', icon: '🔒' },
  { value: 'SIMULATE_INVITE_REVOCATION', label: 'Simulate Invite Revocation', risk: 'HIGH', icon: '🚫' },
  { value: 'SIMULATE_CONTROLLED_EXPANSION', label: 'Simulate Controlled Expansion', risk: 'MEDIUM', icon: '📈' }
];

const RISK_COLORS: Record<string, string> = {
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b'
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280',
  SIMULATION_IN_PROGRESS: '#3b82f6',
  SIMULATED: '#10b981'
};

export const ControlledBetaCohortInterventionSimulation: React.FC = () => {
  const [executionId, setExecutionId] = useState('');
  const [simulationType, setSimulationType] = useState('SIMULATE_COHORT_PAUSE');
  const [simulation, setSimulation] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [signatoryName, setSignatoryName] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');

  const addLog = (msg: string) => setLog(prev => [`[${new Date().toISOString()}] ${msg}`, ...prev]);

  const apiBase = '/api/admin/beta/cohort-intervention-simulations';

  const request = async (method: string, path: string, body?: any) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const createSimulation = async () => {
    if (!executionId.trim()) { setError('Phase 140 Execution ID is required'); return; }
    setLoading(true); setError(null);
    try {
      const data = await request('POST', '', { execution_id: executionId.trim(), simulation_type: simulationType });
      setSimulation(data.simulation);
      setSteps(data.steps || []);
      addLog(`Simulation created: ${data.simulation?.simulation_id} (type: ${simulationType})`);
    } catch (e: any) { setError(normalizeUiError(e)); }
    setLoading(false);
  };

  const runStep = async (stepAction: string, body?: any) => {
    if (!simulation) return;
    setLoading(true); setError(null);
    try {
      const data = await request('POST', `/${simulation.simulation_id}/${stepAction}`, body);
      addLog(`Step '${stepAction}' completed`);
      // Refresh simulation state
      const fresh = await request('GET', `/${simulation.simulation_id}`);
      setSimulation(fresh.simulation);
      setSteps(fresh.steps || []);
      return data;
    } catch (e: any) { setError(normalizeUiError(e)); }
    setLoading(false);
  };

  const runSimulation = async () => {
    await runStep('run');
    if (simulation) {
      try {
        const ev = await request('GET', `/${simulation.simulation_id}/evidence`);
        setEvidence(ev.evidence);
        addLog(`Evidence pack v141.0 retrieved`);
      } catch {}
    }
  };

  const getStepStatus = (key: string) => steps.find(s => s.step_key === key)?.status || 'PENDING';
  const stepDot = (status: string) => status === 'COMPLETED' ? '✅' : status === 'PENDING' ? '⏳' : '❌';

  return (
    <div id="phase141-simulation-dashboard" style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
      padding: '2rem', fontFamily: "'Inter', sans-serif", color: '#e2e8f0'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '2rem' }}>🧪</span>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
            Phase 141 — High-Risk Intervention Simulation
          </h1>
        </div>
        <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.9rem' }}>
          Restricted High-Risk Cohort Intervention Simulation Gate
        </p>
        {/* Safety Banner */}
        <div style={{
          marginTop: '1rem', padding: '0.75rem 1.25rem', borderRadius: '0.5rem',
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
          display: 'flex', alignItems: 'flex-start', gap: '0.75rem'
        }}>
          <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>🛡️</span>
          <div>
            <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              SIMULATION ONLY — NO OPERATIONAL STATE IS MUTATED
            </div>
            <div style={{ color: '#fca5a5', fontSize: '0.8rem' }}>
              Phase 141 simulates high-risk interventions. It <strong>cannot</strong> pause cohorts, restrict participants, revoke invites, or expand cohorts.
              All writes go exclusively to Phase 141 simulation tables.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', maxWidth: '1400px' }}>
        {/* Left: Create Simulation */}
        <div style={{
          background: 'rgba(255,255,255,0.05)', borderRadius: '1rem',
          padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#cbd5e1' }}>
            Create Simulation from Phase 140 Execution
          </h2>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
              Phase 140 Execution ID <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="phase141-execution-id-input"
              value={executionId}
              onChange={e => setExecutionId(e.target.value)}
              placeholder="exec_..."
              style={{
                width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#f1f5f9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box'
              }}
            />
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.3rem' }}>
              Only eligible source types: EXECUTE_RISK_ESCALATION_MARKER, EXECUTE_MANUAL_INTERVENTION_TASKS, EXECUTE_PARTICIPANT_SUPPORT_TASKS
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
              Simulation Type <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              id="phase141-simulation-type-select"
              value={simulationType}
              onChange={e => setSimulationType(e.target.value)}
              style={{
                width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
                background: 'rgba(30,30,60,0.95)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#f1f5f9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box'
              }}
            >
              {SIMULATION_TYPES.map(t => (
                <option key={t.value} value={t.value}>
                  {t.icon} {t.label} [{t.risk}]
                </option>
              ))}
            </select>
          </div>

          <button
            id="phase141-create-simulation-btn"
            onClick={createSimulation}
            disabled={loading}
            style={{
              width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
              background: simulation ? 'rgba(100,100,120,0.4)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.9rem',
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s'
            }}
          >
            {loading ? 'Processing…' : simulation ? '✓ Simulation Created' : '+ Create Simulation'}
          </button>

          {error && (
            <div style={{
              marginTop: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5', fontSize: '0.8rem'
            }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Right: Simulation Status */}
        <div style={{
          background: 'rgba(255,255,255,0.05)', borderRadius: '1rem',
          padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#cbd5e1' }}>
            Simulation Status
          </h2>
          {!simulation ? (
            <div style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', padding: 12, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, marginBottom: 4, fontSize: '0.8rem' }}>No eligible Phase 140 execution gate was found.</div>
              <div style={{ fontSize: '0.72rem', color: '#475569' }}>Required parent: Phase 140 Controlled Cohort Intervention Execution Gate.</div>
              <div style={{ fontSize: '0.72rem', color: '#475569' }}>Required state: FINALIZED safe-scope execution marker.</div>
              <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: 6 }}>Next action: create and finalize a Phase 140 execution gate before running a simulation.</div>
            </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                {[
                  { label: 'ID', value: simulation.simulation_id },
                  { label: 'Status', value: simulation.simulation_status, color: STATUS_COLORS[simulation.simulation_status] },
                  { label: 'Type', value: simulation.simulation_type?.replace('SIMULATE_', '') },
                  { label: 'Cohort', value: simulation.cohort_id }
                ].map(({ label, value, color }) => (
                  <div key={label} style={{
                    padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)'
                  }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.2rem' }}>{label}</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: color || '#e2e8f0', wordBreak: 'break-all' }}>
                      {String(value || '—')}
                    </div>
                  </div>
                ))}
              </div>

              {/* Steps */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 600 }}>
                  Required Steps
                </div>
                {['impact_analysis', 'rollback_preview', 'operator_confirmation'].map(key => (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.4rem 0.6rem', borderRadius: '0.4rem',
                    background: 'rgba(255,255,255,0.03)', marginBottom: '0.25rem',
                    border: '1px solid rgba(255,255,255,0.06)'
                  }}>
                    <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                      {stepDot(getStepStatus(key))} {key.replace(/_/g, ' ')}
                    </span>
                    <span style={{
                      fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '0.25rem',
                      background: getStepStatus(key) === 'COMPLETED' ? 'rgba(16,185,129,0.2)' : 'rgba(100,116,139,0.2)',
                      color: getStepStatus(key) === 'COMPLETED' ? '#34d399' : '#94a3b8'
                    }}>
                      {getStepStatus(key)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Simulation Workflow */}
        {simulation && simulation.simulation_status !== 'SIMULATED' && (
          <div style={{
            gridColumn: '1 / -1', background: 'rgba(255,255,255,0.05)', borderRadius: '1rem',
            padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#cbd5e1' }}>
              Simulation Workflow
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              {/* Step 1: Impact Analysis */}
              <div style={{
                padding: '1rem', borderRadius: '0.75rem',
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)'
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#818cf8', marginBottom: '0.5rem' }}>
                  1. Impact Analysis
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                  Project affected entities for {simulation.simulation_type?.replace('SIMULATE_', '')}
                </div>
                <button
                  id="phase141-impact-analysis-btn"
                  onClick={() => runStep('impact-analysis')}
                  disabled={loading || getStepStatus('impact_analysis') === 'COMPLETED'}
                  style={{
                    width: '100%', padding: '0.5rem', borderRadius: '0.4rem', border: 'none',
                    background: getStepStatus('impact_analysis') === 'COMPLETED' ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.5)',
                    color: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600
                  }}
                >
                  {getStepStatus('impact_analysis') === 'COMPLETED' ? '✅ Done' : 'Run Impact Analysis'}
                </button>
              </div>

              {/* Step 2: Rollback Preview */}
              <div style={{
                padding: '1rem', borderRadius: '0.75rem',
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)'
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fbbf24', marginBottom: '0.5rem' }}>
                  2. Rollback Preview
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                  Generate projected rollback path
                </div>
                <button
                  id="phase141-rollback-preview-btn"
                  onClick={() => runStep('rollback-preview')}
                  disabled={loading || getStepStatus('impact_analysis') !== 'COMPLETED' || getStepStatus('rollback_preview') === 'COMPLETED'}
                  style={{
                    width: '100%', padding: '0.5rem', borderRadius: '0.4rem', border: 'none',
                    background: getStepStatus('rollback_preview') === 'COMPLETED' ? 'rgba(16,185,129,0.2)' :
                      getStepStatus('impact_analysis') !== 'COMPLETED' ? 'rgba(100,116,139,0.3)' : 'rgba(245,158,11,0.4)',
                    color: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600
                  }}
                >
                  {getStepStatus('rollback_preview') === 'COMPLETED' ? '✅ Done' : 'Generate Preview'}
                </button>
              </div>

              {/* Step 3: Operator Confirmation */}
              <div style={{
                padding: '1rem', borderRadius: '0.75rem',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)'
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f87171', marginBottom: '0.5rem' }}>
                  3. Operator Confirmation
                </div>
                <input
                  id="phase141-signatory-input"
                  placeholder="Signatory Name"
                  value={signatoryName}
                  onChange={e => setSignatoryName(e.target.value)}
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem', borderRadius: '0.35rem', border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.06)', color: '#f1f5f9', fontSize: '0.75rem',
                    marginBottom: '0.4rem', boxSizing: 'border-box', outline: 'none'
                  }}
                />
                <input
                  id="phase141-confirm-phrase-input"
                  placeholder="CONFIRM_PHASE_141_HIGH_RISK_SIMULATION"
                  value={confirmPhrase}
                  onChange={e => setConfirmPhrase(e.target.value)}
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem', borderRadius: '0.35rem', border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.06)', color: '#f1f5f9', fontSize: '0.73rem',
                    marginBottom: '0.5rem', boxSizing: 'border-box', outline: 'none'
                  }}
                />
                <button
                  id="phase141-operator-confirm-btn"
                  onClick={() => runStep('operator-confirmation', { signatory_name: signatoryName, confirmation_phrase: confirmPhrase })}
                  disabled={loading || getStepStatus('rollback_preview') !== 'COMPLETED' || getStepStatus('operator_confirmation') === 'COMPLETED'}
                  style={{
                    width: '100%', padding: '0.5rem', borderRadius: '0.4rem', border: 'none',
                    background: getStepStatus('operator_confirmation') === 'COMPLETED' ? 'rgba(16,185,129,0.2)' :
                      getStepStatus('rollback_preview') !== 'COMPLETED' ? 'rgba(100,116,139,0.3)' : 'rgba(239,68,68,0.4)',
                    color: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600
                  }}
                >
                  {getStepStatus('operator_confirmation') === 'COMPLETED' ? '✅ Confirmed' : 'Confirm'}
                </button>
              </div>

              {/* Step 4: Run Simulation */}
              <div style={{
                padding: '1rem', borderRadius: '0.75rem',
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)'
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399', marginBottom: '0.5rem' }}>
                  4. Run Simulation
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                  Execute simulation — writes to Phase 141 tables only
                </div>
                <button
                  id="phase141-run-simulation-btn"
                  onClick={runSimulation}
                  disabled={loading || steps.some(s => s.status !== 'COMPLETED') || simulation.simulation_status === 'SIMULATED'}
                  style={{
                    width: '100%', padding: '0.5rem', borderRadius: '0.4rem', border: 'none',
                    background: simulation.simulation_status === 'SIMULATED' ? 'rgba(16,185,129,0.2)' :
                      steps.some(s => s.status !== 'COMPLETED') ? 'rgba(100,116,139,0.3)' : 'rgba(16,185,129,0.5)',
                    color: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600
                  }}
                >
                  {simulation.simulation_status === 'SIMULATED' ? '✅ Simulated' : '▶ Run Simulation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Evidence Pack */}
        {evidence && (
          <div style={{
            gridColumn: '1 / -1', background: 'rgba(16,185,129,0.06)', borderRadius: '1rem',
            padding: '1.5rem', border: '1px solid rgba(16,185,129,0.25)'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#34d399' }}>
              Evidence Pack v141.0
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
              {[
                { label: 'Evidence ID', value: evidence.evidence_id },
                { label: 'Schema Version', value: evidence.evidence_schema_version },
                { label: 'Evidence Hash', value: evidence.evidence_pack_hash?.substring(0, 16) + '…' }
              ].map(({ label, value }) => (
                <div key={label} style={{
                  padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.2rem' }}>{label}</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e2e8f0', wordBreak: 'break-all' }}>
                    {String(value || '—')}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, marginBottom: '0.5rem' }}>
              Lineage Hash Chain
            </div>
            {(() => {
              const chain = typeof evidence.lineage_hash_chain_json === 'string'
                ? JSON.parse(evidence.lineage_hash_chain_json)
                : evidence.lineage_hash_chain_json;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {Object.entries(chain || {}).map(([key, val]) => (
                    <div key={key} style={{
                      display: 'flex', gap: '0.75rem', alignItems: 'center',
                      padding: '0.35rem 0.6rem', borderRadius: '0.35rem',
                      background: 'rgba(255,255,255,0.03)'
                    }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', minWidth: '280px' }}>{key}</span>
                      <span style={{ fontSize: '0.72rem', color: '#34d399', wordBreak: 'break-all' }}>{String(val)}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Activity Log */}
        {log.length > 0 && (
          <div style={{
            gridColumn: '1 / -1', background: 'rgba(0,0,0,0.3)', borderRadius: '1rem',
            padding: '1rem 1.5rem', border: '1px solid rgba(255,255,255,0.08)'
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', marginBottom: '0.5rem' }}>
              Activity Log
            </div>
            {log.slice(0, 10).map((entry, i) => (
              <div key={i} style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace', marginBottom: '0.2rem' }}>
                {entry}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ControlledBetaCohortInterventionSimulation;
