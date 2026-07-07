import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ActivationTokenRedemptionLockRecord, ActivationTokenRedemptionLockRule } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionLock';
import { getTokenRedemptionLockDetails, evaluateTokenRedemptionLock, recordDecision, finalizeTokenRedemptionLock } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionLockClient';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionLock() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<ActivationTokenRedemptionLockRecord | null>(null);
  const [rules, setRules] = useState<ActivationTokenRedemptionLockRule[]>([]);
  const [securityOfficer, setSecurityOfficer] = useState(false);
  const [complianceOfficer, setComplianceOfficer] = useState(false);
  const [operationsDirector, setOperationsDirector] = useState(false);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [rationale, setRationale] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const data = await getTokenRedemptionLockDetails(id);
        setRecord(data.tokenRedemptionLock);
        setRules(data.rules || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [id]);

  const handleEvaluate = async () => {
    if (!id) return;
    setLoading(true); setError(null); setMessage(null);
    try {
      await evaluateTokenRedemptionLock(id, {
        security_officer_confirmed: securityOfficer,
        compliance_officer_confirmed: complianceOfficer,
        operations_director_confirmed: operationsDirector
      });
      const data = await getTokenRedemptionLockDetails(id);
      setRecord(data.tokenRedemptionLock);
      setRules(data.rules || []);
      setMessage('Evaluation completed.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  const handleDecision = async () => {
    if (!id) return;
    setLoading(true); setError(null); setMessage(null);
    try {
      await recordDecision(id, decision, rationale);
      const data = await getTokenRedemptionLockDetails(id);
      setRecord(data.tokenRedemptionLock);
      setMessage(`Decision '${decision}' recorded.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  const handleFinalize = async () => {
    if (!id) return;
    setLoading(true); setError(null); setMessage(null);
    try {
      await finalizeTokenRedemptionLock(id);
      const data = await getTokenRedemptionLockDetails(id);
      setRecord(data.tokenRedemptionLock);
      setMessage('Lock finalized. Pre-redemption package is frozen and immutable.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Inter, sans-serif', maxWidth: 900 }}>
      {/* Safety boundary banner */}
      <div style={{ background: '#1a1a2e', border: '2px solid #e94560', borderRadius: 8, padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e94560', margin: 0 }}>⛔ SAFETY BOUNDARY — Phase 165</h2>
        <p style={{ color: '#a0a0b0', margin: '0.5rem 0 0' }}>
          Phase 165 is not token redemption. Phase 165 is not runtime activation.
          Phase 165 only locks and freezes the pre-redemption package.
          The token remains non-redeemable and unusable as an execution credential.
        </p>
      </div>

      <h1 style={{ color: '#ffffff' }}>
        Phase 165 — Token Redemption Lock
      </h1>

      {error && <div style={{ color: '#e94560', marginBottom: '1rem' }}>⚠ {error}</div>}
      {message && <div style={{ color: '#4ecca3', marginBottom: '1rem' }}>✔ {message}</div>}

      {!record ? (
        <p style={{ color: '#a0a0b0' }}>Loading lock record…</p>
      ) : (
        <>
          <section style={{ background: '#16213e', borderRadius: 8, padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#4ecca3' }}>Lock Record</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#e0e0e0' }}>
              <tbody>
                {[
                  ['ID', record.activation_token_redemption_lock_id],
                  ['Status', record.activation_token_redemption_lock_status],
                  ['Result', record.activation_token_redemption_lock_result],
                  ['Token Status', record.token_status],
                  ['Token Redeemable', record.token_redeemable_status],
                  ['Activation Execution Status', record.activation_execution_status],
                  ['Package Freeze Status', record.package_freeze_status],
                  ['Plan Executable Status', record.plan_executable_status],
                  ['Job Creation', record.job_creation_status],
                  ['Queue Dispatch', record.queue_dispatch_status],
                  ['Runtime Mutation', record.runtime_mutation_status],
                  ['Risk Level', record.risk_level],
                  ['Guardrail Status', record.guardrail_status],
                  ['Write Scope Status', record.write_scope_status],
                  ['Source Final Approval', record.source_activation_token_redemption_final_apv_id],
                ].map(([label, value]) => (
                  <tr key={label} style={{ borderBottom: '1px solid #2a2a4a' }}>
                    <td style={{ padding: '0.4rem 1rem 0.4rem 0', color: '#a0a0b0', whiteSpace: 'nowrap' }}>{label}</td>
                    <td style={{ padding: '0.4rem 0', fontFamily: 'monospace' }}>{String(value ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {record.activation_token_redemption_lock_status === 'DRAFT' && (
            <section style={{ background: '#16213e', borderRadius: 8, padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#4ecca3' }}>Officer Confirmations</h3>
              {[
                ['Security Officer', securityOfficer, setSecurityOfficer],
                ['Compliance Officer', complianceOfficer, setComplianceOfficer],
                ['Operations Director', operationsDirector, setOperationsDirector],
              ].map(([label, value, setter]) => (
                <label key={label as string} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e0e0e0', marginBottom: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={value as boolean}
                    onChange={e => (setter as React.Dispatch<React.SetStateAction<boolean>>)(e.target.checked)}
                    id={`chk-${(label as string).replace(/\s/g, '-').toLowerCase()}`}
                  />
                  {label as string}
                </label>
              ))}
              <button
                id="btn-evaluate"
                onClick={handleEvaluate}
                disabled={loading}
                style={{ background: '#4ecca3', color: '#0a0a1a', border: 'none', borderRadius: 6, padding: '0.5rem 1.5rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem' }}
              >
                {loading ? 'Evaluating…' : 'Evaluate Lock'}
              </button>
            </section>
          )}

          {rules.length > 0 && (
            <section style={{ background: '#16213e', borderRadius: 8, padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#4ecca3' }}>Evaluation Rules ({rules.length})</h3>
              {rules.map(r => (
                <div key={r.rule_id} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: '#0d1b2a', borderRadius: 4, borderLeft: `4px solid ${r.severity === 'CRITICAL' ? '#e94560' : r.severity === 'WARNING' ? '#f6ae2d' : '#4ecca3'}` }}>
                  <span style={{ color: '#a0a0b0', fontSize: 12 }}>[{r.severity}]</span>{' '}
                  <span style={{ color: '#e0e0e0' }}>{r.description}</span>
                </div>
              ))}
            </section>
          )}

          {['EVALUATED'].includes(record.activation_token_redemption_lock_status) && (
            <section style={{ background: '#16213e', borderRadius: 8, padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#4ecca3' }}>Record Decision</h3>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ color: '#a0a0b0', display: 'block', marginBottom: '0.25rem' }}>Decision</label>
                <select
                  id="select-decision"
                  value={decision}
                  onChange={e => setDecision(e.target.value as 'APPROVE' | 'REJECT')}
                  style={{ background: '#0d1b2a', color: '#e0e0e0', border: '1px solid #2a2a4a', borderRadius: 4, padding: '0.3rem 0.7rem' }}
                >
                  <option value="APPROVE">APPROVE</option>
                  <option value="REJECT">REJECT</option>
                </select>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ color: '#a0a0b0', display: 'block', marginBottom: '0.25rem' }}>Rationale</label>
                <textarea
                  id="txt-rationale"
                  value={rationale}
                  onChange={e => setRationale(e.target.value)}
                  rows={3}
                  style={{ width: '100%', background: '#0d1b2a', color: '#e0e0e0', border: '1px solid #2a2a4a', borderRadius: 4, padding: '0.3rem 0.7rem' }}
                />
              </div>
              <button
                id="btn-decision"
                onClick={handleDecision}
                disabled={loading || !rationale}
                style={{ background: '#e94560', color: '#ffffff', border: 'none', borderRadius: 6, padding: '0.5rem 1.5rem', fontWeight: 700, cursor: 'pointer' }}
              >
                {loading ? 'Recording…' : 'Record Decision'}
              </button>
            </section>
          )}

          {record.activation_token_redemption_lock_status === 'APPROVED' && (
            <section style={{ background: '#16213e', borderRadius: 8, padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#f6ae2d' }}>Finalize Lock</h3>
              <p style={{ color: '#a0a0b0' }}>
                Finalizing will freeze the pre-redemption package as immutable.
                This action is irreversible. The token will remain non-redeemable.
              </p>
              <button
                id="btn-finalize"
                onClick={handleFinalize}
                disabled={loading}
                style={{ background: '#f6ae2d', color: '#0a0a1a', border: 'none', borderRadius: 6, padding: '0.5rem 1.5rem', fontWeight: 700, cursor: 'pointer' }}
              >
                {loading ? 'Finalizing…' : 'Finalize Lock'}
              </button>
            </section>
          )}

          {record.activation_token_redemption_lock_status === 'FINALIZED' && (
            <div style={{ background: '#0d2b1a', border: '2px solid #4ecca3', borderRadius: 8, padding: '1rem 1.5rem' }}>
              <h3 style={{ color: '#4ecca3', margin: 0 }}>✔ Lock Finalized</h3>
              <p style={{ color: '#a0a0b0', margin: '0.5rem 0 0' }}>
                The pre-redemption package is frozen and immutable.
                Phase 165 complete. Token remains NON-REDEEMABLE.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
