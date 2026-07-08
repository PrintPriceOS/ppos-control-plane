import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ActivationTokenRedemptionUnlockEligibilityRecord, ActivationTokenRedemptionUnlockEligibilityRule } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibility';
import { getUnlockEligibilityDetails, evaluateUnlockEligibility, recordDecision, finalizeUnlockEligibility } from '../../lib/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityClient';

export default function ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockEligibility() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<ActivationTokenRedemptionUnlockEligibilityRecord | null>(null);
  const [rules, setRules] = useState<ActivationTokenRedemptionUnlockEligibilityRule[]>([]);
  const [securityOfficer, setSecurityOfficer] = useState(false);
  const [complianceOfficer, setComplianceOfficer] = useState(false);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [rationale, setRationale] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const data = await getUnlockEligibilityDetails(id);
        setRecord(data as unknown as ActivationTokenRedemptionUnlockEligibilityRecord);
        if (data && data.unlock_eligibility_rules_json) {
          const rulesList = Array.isArray(data.unlock_eligibility_rules_json)
            ? data.unlock_eligibility_rules_json
            : Object.values(data.unlock_eligibility_rules_json);
          setRules(rulesList as ActivationTokenRedemptionUnlockEligibilityRule[]);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [id]);

  const handleEvaluate = async () => {
    if (!id) return;
    setLoading(true); setError(null); setMessage(null);
    try {
      await evaluateUnlockEligibility(id, {
        security_officer_confirmed: securityOfficer,
        compliance_officer_confirmed: complianceOfficer
      });
      const data = await getUnlockEligibilityDetails(id);
      setRecord(data as unknown as ActivationTokenRedemptionUnlockEligibilityRecord);
      if (data && data.unlock_eligibility_rules_json) {
        const rulesList = Array.isArray(data.unlock_eligibility_rules_json)
          ? data.unlock_eligibility_rules_json
          : Object.values(data.unlock_eligibility_rules_json);
        setRules(rulesList as ActivationTokenRedemptionUnlockEligibilityRule[]);
      }
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
      const data = await getUnlockEligibilityDetails(id);
      setRecord(data as unknown as ActivationTokenRedemptionUnlockEligibilityRecord);
      setMessage(`Decision '${decision}' recorded.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  const handleFinalize = async () => {
    if (!id) return;
    setLoading(true); setError(null); setMessage(null);
    try {
      await finalizeUnlockEligibility(id);
      const data = await getUnlockEligibilityDetails(id);
      setRecord(data as unknown as ActivationTokenRedemptionUnlockEligibilityRecord);
      setMessage('Unlock eligibility finalized. Pre-redemption package is frozen and immutable.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Inter, sans-serif', maxWidth: 900 }}>
      {/* Safety boundary banner */}
      <div style={{ background: '#1a1a2e', border: '2px solid #e94560', borderRadius: 8, padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e94560', margin: 0 }}>⛔ SAFETY BOUNDARY — Phase 166</h2>
        <p style={{ color: '#a0a0b0', margin: '0.5rem 0 0' }}>
          This phase evaluates unlock eligibility only. The token is not unlocked.
          The token is not redeemable. No execution plan is enabled.
          No jobs or queue dispatches are created. Runtime mutation count remains zero.
        </p>
      </div>

      <h1 style={{ color: '#ffffff' }}>
        Phase 166 — Unlock Eligibility Gate
      </h1>

      {error && <div style={{ color: '#e94560', marginBottom: '1rem' }}>⚠ {error}</div>}
      {message && <div style={{ color: '#4ecca3', marginBottom: '1rem' }}>✔ {message}</div>}

      {!record ? (
        <p style={{ color: '#a0a0b0' }}>Loading unlock eligibility record…</p>
      ) : (
        <>
          <section style={{ background: '#16213e', borderRadius: 8, padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#4ecca3' }}>Unlock Eligibility Record</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#e0e0e0' }}>
              <tbody>
                {[
                  ['ID', record.activation_token_redemption_unlock_eligibility_id],
                  ['Status', record.unlock_eligibility_status],
                  ['Result', record.unlock_eligibility_result],
                  ['Token Status', record.token_redemption_lock_status],
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
                  ['Source Lock', record.source_activation_token_redemption_lock_id],
                ].map(([label, value]) => (
                  <tr key={label} style={{ borderBottom: '1px solid #2a2a4a' }}>
                    <td style={{ padding: '0.4rem 1rem 0.4rem 0', color: '#a0a0b0', whiteSpace: 'nowrap' }}>{label}</td>
                    <td style={{ padding: '0.4rem 0', fontFamily: 'monospace' }}>{String(value ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {record.unlock_eligibility_status === 'DRAFT' && (
            <section style={{ background: '#16213e', borderRadius: 8, padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#4ecca3' }}>Officer Confirmations</h3>
              {[
                ['Security Officer', securityOfficer, setSecurityOfficer],
                ['Compliance Officer', complianceOfficer, setComplianceOfficer],
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
              {rules.map((r, i) => (
                <div key={r.rule_id || i} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: '#0d1b2a', borderRadius: 4, borderLeft: `4px solid ${r.severity === 'CRITICAL' ? '#e94560' : r.severity === 'WARNING' ? '#f6ae2d' : '#4ecca3'}` }}>
                  <span style={{ color: '#a0a0b0', fontSize: 12 }}>[{r.severity}]</span>{' '}
                  <span style={{ color: '#e0e0e0' }}>{r.description}</span>
                </div>
              ))}
            </section>
          )}

          {['EVALUATED'].includes(record.unlock_eligibility_status) && (
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

          {record.unlock_eligibility_status === 'APPROVED' && (
            <section style={{ background: '#16213e', borderRadius: 8, padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#f6ae2d' }}>Finalize Unlock Eligibility</h3>
              <p style={{ color: '#a0a0b0' }}>
                Finalizing will freeze the unlock eligibility package as immutable.
                This action is irreversible. The token will remain non-redeemable and locked.
              </p>
              <button
                id="btn-finalize"
                onClick={handleFinalize}
                disabled={loading}
                style={{ background: '#f6ae2d', color: '#0a0a1a', border: 'none', borderRadius: 6, padding: '0.5rem 1.5rem', fontWeight: 700, cursor: 'pointer' }}
              >
                {loading ? 'Finalizing…' : 'Finalize Unlock Eligibility'}
              </button>
            </section>
          )}

          {record.unlock_eligibility_status === 'FINALIZED' && (
            <div style={{ background: '#0d2b1a', border: '2px solid #4ecca3', borderRadius: 8, padding: '1rem 1.5rem' }}>
              <h3 style={{ color: '#4ecca3', margin: 0 }}>✔ Unlock Eligibility Finalized</h3>
              <p style={{ color: '#a0a0b0', margin: '0.5rem 0 0' }}>
                The unlock eligibility package is frozen and immutable.
                Phase 166 complete. Token remains NON-REDEEMABLE.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
