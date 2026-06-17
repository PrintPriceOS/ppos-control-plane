import React, { useState, useCallback } from 'react';
import {
  getDeploymentReadinessChecks,
  evaluateDeploymentReadiness,
  recordDeploymentFinding,
  resolveDeploymentFinding,
  getDeploymentReadinessEvidencePack,
  getDeploymentReadinessAuditTimeline,
} from '../../api/productionDeploymentReadinessChecklistClient';
import type {
  EvaluatePayload,
  RecordFindingPayload,
  FindingSeverity,
} from '../../types/productionDeploymentReadinessChecklist';

const SAFETY_NOTICE =
  'This is a checklist-only phase. No deployment, production activation, live provider connectivity, ' +
  'payment execution, refund execution, payout execution, external submission, or source record mutation will occur.';

export function ProductionDeploymentReadiness() {
  const [checkId, setCheckId] = useState('');
  const [activeCheckId, setActiveCheckId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, unknown> | null>(null);
  const [evidencePack, setEvidencePack] = useState<Record<string, unknown> | null>(null);
  const [auditTimeline, setAuditTimeline] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [evalPayload, setEvalPayload] = useState<EvaluatePayload>({
    actor: 'admin',
    board_reference_id: '',
    backup_timestamp: '',
    rollback_script_documented: false,
    escalation_contacts_documented: false,
  });

  const [finding, setFinding] = useState<RecordFindingPayload>({
    check_id: '',
    severity: 'MAJOR',
    category: 'GENERAL',
    title: '',
    description: '',
    raised_by: '',
  });

  const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setLoading(true);
    setMessage(`Running: ${label}...`);
    try {
      const result = await fn();
      setMessage(`Done: ${label}`);
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`Error: ${label} — ${msg}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleGetChecks = async () => {
    const result = await run('Get Environment Checks', () => getDeploymentReadinessChecks(checkId || undefined));
    if (result) setChecks(result as Record<string, unknown>);
  };

  const handleEvaluate = async () => {
    const payload: EvaluatePayload = {
      ...evalPayload,
      check_id: checkId || undefined,
      board_reference_id: evalPayload.board_reference_id || undefined,
      backup_timestamp: evalPayload.backup_timestamp || undefined,
    };
    const result = await run('Evaluate Full Readiness', () => evaluateDeploymentReadiness(payload));
    if (result) {
      setEvidencePack(result as Record<string, unknown>);
      const r = result as Record<string, unknown>;
      if (r.check_id) setActiveCheckId(String(r.check_id));
    }
  };

  const handleRecordFinding = async () => {
    const payload = { ...finding, check_id: activeCheckId || finding.check_id };
    const result = await run('Record Finding', () => recordDeploymentFinding(payload));
    if (result) setMessage(`Finding recorded: ${(result as Record<string, unknown>).finding_id}`);
  };

  const handleResolveFinding = async (findingId: string) => {
    const result = await run('Resolve Finding', () =>
      resolveDeploymentFinding({ finding_id: findingId, check_id: activeCheckId || '', resolved_by: 'admin' }));
    if (result) setMessage(`Finding resolved: ${findingId}`);
  };

  const handleEvidencePack = async () => {
    const result = await run('Get Evidence Pack', () =>
      getDeploymentReadinessEvidencePack(activeCheckId || undefined));
    if (result) setEvidencePack(result as Record<string, unknown>);
  };

  const handleAuditTimeline = async () => {
    const result = await run('Get Audit Timeline', () =>
      getDeploymentReadinessAuditTimeline(activeCheckId || undefined));
    if (result) setAuditTimeline((result as Record<string, unknown[]>).audit_timeline || []);
  };

  const summaryOf = (pack: Record<string, unknown>) =>
    (pack.summary as Record<string, number>) || { total: 0, pass: 0, warn: 0, fail: 0 };

  return (
    <div style={{ padding: '24px', fontFamily: 'monospace', maxWidth: '960px' }}>
      <h1 style={{ fontSize: '20px', marginBottom: '8px' }}>
        Phase 116 — Production Deployment Readiness Checklist
      </h1>

      <div style={{
        background: '#1a1a2e', color: '#ff9800', padding: '12px', borderRadius: '4px',
        marginBottom: '20px', fontSize: '13px', border: '1px solid #ff9800',
      }}>
        <strong>CHECKLIST-ONLY MODE</strong><br />{SAFETY_NOTICE}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div>
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Check ID (optional)</label>
          <input value={checkId} onChange={e => setCheckId(e.target.value)}
            style={{ width: '100%', padding: '6px', background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '3px' }}
            placeholder="auto-generated if blank" />
        </div>
        <div>
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Actor</label>
          <input value={evalPayload.actor} onChange={e => setEvalPayload(p => ({ ...p, actor: e.target.value }))}
            style={{ width: '100%', padding: '6px', background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '3px' }} />
        </div>
        <div>
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Board Reference ID</label>
          <input value={evalPayload.board_reference_id} onChange={e => setEvalPayload(p => ({ ...p, board_reference_id: e.target.value }))}
            style={{ width: '100%', padding: '6px', background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '3px' }}
            placeholder="Phase 115 board reference" />
        </div>
        <div>
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>DB Backup Timestamp</label>
          <input value={evalPayload.backup_timestamp} onChange={e => setEvalPayload(p => ({ ...p, backup_timestamp: e.target.value }))}
            style={{ width: '100%', padding: '6px', background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '3px' }}
            placeholder="e.g. 2026-06-17T00:00:00Z" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input type="checkbox" checked={evalPayload.rollback_script_documented}
            onChange={e => setEvalPayload(p => ({ ...p, rollback_script_documented: e.target.checked }))} />
          Rollback Script Documented
        </label>
        <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input type="checkbox" checked={evalPayload.escalation_contacts_documented}
            onChange={e => setEvalPayload(p => ({ ...p, escalation_contacts_documented: e.target.checked }))} />
          Escalation Contacts Documented
        </label>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { label: 'Get Checks', fn: handleGetChecks },
          { label: 'Evaluate Full Readiness', fn: handleEvaluate },
          { label: 'Evidence Pack', fn: handleEvidencePack },
          { label: 'Audit Timeline', fn: handleAuditTimeline },
        ].map(({ label, fn }) => (
          <button key={label} onClick={fn} disabled={loading}
            style={{ padding: '7px 14px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '3px', cursor: 'pointer', fontSize: '12px' }}>
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div style={{ background: '#181825', padding: '8px 12px', borderRadius: '3px', marginBottom: '16px', fontSize: '12px', color: '#a6e3a1' }}>
          {message}
        </div>
      )}

      {activeCheckId && (
        <div style={{ background: '#181825', padding: '8px 12px', borderRadius: '3px', marginBottom: '16px', fontSize: '12px', color: '#89b4fa' }}>
          Active Check ID: <strong>{activeCheckId}</strong>
        </div>
      )}

      {checks && (
        <section style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '14px', color: '#89dceb', marginBottom: '8px' }}>Environment Checks</h2>
          <pre style={{ background: '#181825', padding: '12px', borderRadius: '4px', fontSize: '11px', overflow: 'auto', maxHeight: '200px' }}>
            {JSON.stringify(checks, null, 2)}
          </pre>
        </section>
      )}

      {evidencePack && (
        <section style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '14px', color: '#a6e3a1', marginBottom: '8px' }}>Evidence Pack</h2>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
            {(['pass', 'warn', 'fail'] as const).map(k => {
              const s = summaryOf(evidencePack);
              const colors = { pass: '#a6e3a1', warn: '#f9e2af', fail: '#f38ba8' };
              return (
                <div key={k} style={{ background: '#181825', padding: '8px 14px', borderRadius: '4px', fontSize: '12px' }}>
                  <span style={{ color: colors[k], fontWeight: 'bold', textTransform: 'uppercase' }}>{k}</span>
                  <span style={{ color: '#cdd6f4', marginLeft: '8px' }}>{s[k]}</span>
                </div>
              );
            })}
            <div style={{ background: '#181825', padding: '8px 14px', borderRadius: '4px', fontSize: '12px' }}>
              <span style={{ color: '#cba6f7' }}>STATUS</span>
              <span style={{ color: '#cdd6f4', marginLeft: '8px' }}>{String(evidencePack.status || '')}</span>
            </div>
          </div>
          <div style={{ background: '#181825', padding: '8px 12px', borderRadius: '3px', fontSize: '11px', color: '#a6e3a1', marginBottom: '8px' }}>
            checklistOnly: true | deploymentExecuted: false | productionActivationEnabled: false
          </div>
          <pre style={{ background: '#181825', padding: '12px', borderRadius: '4px', fontSize: '11px', overflow: 'auto', maxHeight: '300px' }}>
            {JSON.stringify(evidencePack, null, 2)}
          </pre>
        </section>
      )}

      <section style={{ marginBottom: '20px', background: '#181825', padding: '16px', borderRadius: '4px' }}>
        <h2 style={{ fontSize: '14px', color: '#f38ba8', marginBottom: '10px' }}>Record Finding</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <div>
            <label style={{ fontSize: '11px', display: 'block', marginBottom: '3px' }}>Severity</label>
            <select value={finding.severity} onChange={e => setFinding(f => ({ ...f, severity: e.target.value as FindingSeverity }))}
              style={{ width: '100%', padding: '5px', background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '3px', fontSize: '12px' }}>
              {['BLOCKER', 'MAJOR', 'MINOR', 'INFO'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', display: 'block', marginBottom: '3px' }}>Category</label>
            <input value={finding.category} onChange={e => setFinding(f => ({ ...f, category: e.target.value }))}
              style={{ width: '100%', padding: '5px', background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '3px', fontSize: '12px' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', display: 'block', marginBottom: '3px' }}>Title</label>
            <input value={finding.title} onChange={e => setFinding(f => ({ ...f, title: e.target.value }))}
              style={{ width: '100%', padding: '5px', background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '3px', fontSize: '12px' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', display: 'block', marginBottom: '3px' }}>Raised By</label>
            <input value={finding.raised_by} onChange={e => setFinding(f => ({ ...f, raised_by: e.target.value }))}
              style={{ width: '100%', padding: '5px', background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '3px', fontSize: '12px' }} />
          </div>
        </div>
        <button onClick={handleRecordFinding} disabled={loading}
          style={{ padding: '6px 12px', background: '#f38ba8', color: '#1e1e2e', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
          Record Finding
        </button>
      </section>

      {auditTimeline.length > 0 && (
        <section style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '14px', color: '#cba6f7', marginBottom: '8px' }}>Audit Timeline ({auditTimeline.length} events)</h2>
          <div style={{ maxHeight: '250px', overflow: 'auto' }}>
            {auditTimeline.map((e, i) => {
              const ev = e as Record<string, unknown>;
              return (
                <div key={i} style={{ padding: '6px 10px', background: '#181825', marginBottom: '4px', borderRadius: '3px', fontSize: '11px', borderLeft: '3px solid #cba6f7' }}>
                  <strong style={{ color: '#cba6f7' }}>{String(ev.event_type || '')}</strong>
                  <span style={{ color: '#585b70', marginLeft: '8px' }}>{String(ev.created_at || '')}</span>
                  <span style={{ color: '#a6adc8', marginLeft: '8px' }}>by {String(ev.actor || '')}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div style={{ marginTop: '24px', padding: '12px', background: '#181825', borderRadius: '4px', fontSize: '11px', color: '#585b70' }}>
        <div>checklistOnly: true | deploymentExecuted: false | productionActivationEnabled: false</div>
        <div>fullPublicEnabled: false | liveProviderConnectivityEnabled: false | paymentExecutionEnabled: false</div>
        <div>refundExecutionEnabled: false | payoutExecutionEnabled: false | externalSubmission: false | sourceMutation: false</div>
      </div>
    </div>
  );
}

export default ProductionDeploymentReadiness;
