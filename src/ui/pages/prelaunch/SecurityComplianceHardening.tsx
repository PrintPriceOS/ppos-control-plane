import React, { useState, useCallback } from 'react';
import {
  scanEnvExposure,
  scanAdminRouteProtection,
  scanSecretLeakagePatterns,
  scanRedactionCoverage,
  evaluateRoleBoundaries,
  evaluateComplianceGuardrails,
  recordSecurityFinding,
  resolveSecurityFinding,
  getSecurityComplianceEvidencePack,
} from '../../api/prelaunchSecurityComplianceHardeningClient';
import type {
  RecordFindingPayload,
  FindingCategory,
  FindingSeverity,
} from '../../types/prelaunchSecurityComplianceHardening';

const SAFETY_NOTICE =
  'This is a review-only security hardening phase. No production activation, no external submission, ' +
  'no secret exposure, no financial/provider execution, and no source commercial record mutation will occur.';

const SCAN_LABELS: Record<string, string> = {
  env_exposure: 'Environment Variable Exposure',
  admin_routes: 'Admin Route Protection',
  secret_leakage: 'Secret Leakage Patterns',
  redaction: 'Redaction Coverage',
  role_boundaries: 'Role Boundary Readiness',
  compliance_guardrails: 'Compliance Guardrails',
};

export function SecurityComplianceHardening() {
  const [scanResults, setScanResults] = useState<Record<string, Record<string, unknown>>>({});
  const [evidencePack, setEvidencePack] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [findingPayload, setFindingPayload] = useState<RecordFindingPayload>({
    category: 'SECRET_EXPOSURE',
    severity: 'MEDIUM',
    description: '',
    remediation: '',
  });
  const [resolveFindingId, setResolveFindingId] = useState('');

  const runScan = useCallback(async (scanKey: string, scanFn: () => Promise<Record<string, unknown>>) => {
    setLoading(true);
    setMessage('');
    try {
      const result = await scanFn();
      setScanResults(prev => ({ ...prev, [scanKey]: result }));
      setMessage(`Scan "${SCAN_LABELS[scanKey]}" completed: ${(result as any).status || 'OK'}`);
    } catch (e: any) {
      setMessage(`Error in ${scanKey}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const runAllScans = useCallback(async () => {
    setLoading(true);
    setMessage('Running all security scans...');
    try {
      const [env, routes, secrets, redaction, roles, guardrails] = await Promise.all([
        scanEnvExposure(),
        scanAdminRouteProtection(),
        scanSecretLeakagePatterns(),
        scanRedactionCoverage(),
        evaluateRoleBoundaries(),
        evaluateComplianceGuardrails(),
      ]);
      setScanResults({
        env_exposure: env as Record<string, unknown>,
        admin_routes: routes as Record<string, unknown>,
        secret_leakage: secrets as Record<string, unknown>,
        redaction: redaction as Record<string, unknown>,
        role_boundaries: roles as Record<string, unknown>,
        compliance_guardrails: guardrails as Record<string, unknown>,
      });
      setMessage('All security scans completed.');
    } catch (e: any) {
      setMessage(`Error running scans: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLoadEvidencePack = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const pack = await getSecurityComplianceEvidencePack();
      setEvidencePack(pack as Record<string, unknown>);
      setMessage('Evidence pack loaded.');
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRecordFinding = useCallback(async () => {
    if (!findingPayload.description) {
      setMessage('Description is required.');
      return;
    }
    setLoading(true);
    try {
      const result = await recordSecurityFinding(findingPayload);
      setMessage(`Finding recorded: ${(result as any).finding_id}`);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [findingPayload]);

  const handleResolveFinding = useCallback(async () => {
    if (!resolveFindingId) {
      setMessage('Finding ID required.');
      return;
    }
    setLoading(true);
    try {
      const result = await resolveSecurityFinding({ finding_id: resolveFindingId, resolved_by: 'admin' });
      setMessage(`Finding resolved: ${(result as any).finding_id}`);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [resolveFindingId]);

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PASS: '#22c55e',
      FAIL: '#ef4444',
      WARNING: '#f59e0b',
      PENDING: '#6b7280',
      ENFORCED: '#22c55e',
      VIOLATED: '#ef4444',
    };
    return (
      <span style={{
        background: colors[status] || '#6b7280',
        color: '#fff',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 700,
      }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ padding: 32, fontFamily: 'monospace', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
        Phase 119 — Security / Secrets / Compliance Pre-Launch Hardening
      </h1>

      <div style={{
        background: '#1e3a5f',
        color: '#93c5fd',
        padding: '12px 16px',
        borderRadius: 6,
        marginBottom: 24,
        fontSize: 13,
        lineHeight: 1.6,
      }}>
        <strong>SAFETY NOTICE:</strong> {SAFETY_NOTICE}
      </div>

      <div style={{ marginBottom: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={runAllScans}
          disabled={loading}
          style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Run All Scans
        </button>
        <button
          onClick={() => runScan('env_exposure', scanEnvExposure as any)}
          disabled={loading}
          style={{ padding: '8px 16px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Env Exposure Scan
        </button>
        <button
          onClick={() => runScan('admin_routes', scanAdminRouteProtection as any)}
          disabled={loading}
          style={{ padding: '8px 16px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Admin Route Scan
        </button>
        <button
          onClick={() => runScan('secret_leakage', scanSecretLeakagePatterns as any)}
          disabled={loading}
          style={{ padding: '8px 16px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Secret Leakage Scan
        </button>
        <button
          onClick={() => runScan('compliance_guardrails', evaluateComplianceGuardrails as any)}
          disabled={loading}
          style={{ padding: '8px 16px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Compliance Guardrails
        </button>
        <button
          onClick={handleLoadEvidencePack}
          disabled={loading}
          style={{ padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Load Evidence Pack
        </button>
      </div>

      {message && (
        <div style={{ background: '#1f2937', color: '#d1fae5', padding: '8px 12px', borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
          {message}
        </div>
      )}

      {/* Scan Results */}
      {Object.keys(scanResults).length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Scan Results</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {Object.entries(scanResults).map(([key, result]) => (
              <div key={key} style={{ background: '#111827', border: '1px solid #374151', borderRadius: 6, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ color: '#e5e7eb', fontSize: 13 }}>{SCAN_LABELS[key] || key}</strong>
                  {statusBadge(String((result as any).status || 'PENDING'))}
                </div>
                <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>{(result as any).summary || ''}</p>
                {(result as any).findings?.length > 0 && (
                  <ul style={{ color: '#fca5a5', fontSize: 11, marginTop: 6, paddingLeft: 16 }}>
                    {(result as any).findings.map((f: any, i: number) => (
                      <li key={i}>{f.pattern}: {f.severity}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Evidence Pack */}
      {evidencePack && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Security Compliance Evidence Pack</h2>
          <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 6, padding: 16 }}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#9ca3af', fontSize: 13 }}>
                Phase: <strong style={{ color: '#e5e7eb' }}>{(evidencePack as any).phase}</strong>
              </span>
              <span>Overall: {statusBadge(String((evidencePack as any).overall_status))}</span>
            </div>
            {(evidencePack as any).summary && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12 }}>
                <span style={{ color: '#22c55e' }}>PASS: {(evidencePack as any).summary.passed}</span>
                <span style={{ color: '#ef4444' }}>FAIL: {(evidencePack as any).summary.failed}</span>
                <span style={{ color: '#f59e0b' }}>WARN: {(evidencePack as any).summary.warnings}</span>
              </div>
            )}
            {(evidencePack as any).safety_invariants && (
              <div>
                <strong style={{ color: '#e5e7eb', fontSize: 12 }}>Safety Invariants:</strong>
                <ul style={{ color: '#6ee7b7', fontSize: 11, marginTop: 4, paddingLeft: 16 }}>
                  {Object.entries((evidencePack as any).safety_invariants).map(([k, v]) => (
                    <li key={k}>{k}: {String(v)}</li>
                  ))}
                </ul>
              </div>
            )}
            <p style={{ color: '#6b7280', fontSize: 11, marginTop: 8, margin: 0 }}>
              Built at: {(evidencePack as any).built_at}
            </p>
          </div>
        </section>
      )}

      {/* Record Finding */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Record Security Finding</h2>
        <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select
            value={findingPayload.category}
            onChange={e => setFindingPayload(prev => ({ ...prev, category: e.target.value as FindingCategory }))}
            style={{ padding: '6px 8px', background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, fontSize: 13 }}
          >
            {['SECRET_EXPOSURE', 'ROUTE_UNPROTECTED', 'REDACTION_MISSING', 'ROLE_VIOLATION', 'COMPLIANCE_BREACH'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={findingPayload.severity}
            onChange={e => setFindingPayload(prev => ({ ...prev, severity: e.target.value as FindingSeverity }))}
            style={{ padding: '6px 8px', background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, fontSize: 13 }}
          >
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Description"
            value={findingPayload.description}
            onChange={e => setFindingPayload(prev => ({ ...prev, description: e.target.value }))}
            style={{ padding: '6px 8px', background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, fontSize: 13 }}
          />
          <input
            type="text"
            placeholder="Remediation (optional)"
            value={findingPayload.remediation || ''}
            onChange={e => setFindingPayload(prev => ({ ...prev, remediation: e.target.value }))}
            style={{ padding: '6px 8px', background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, fontSize: 13 }}
          />
          <button
            onClick={handleRecordFinding}
            disabled={loading}
            style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-start' }}
          >
            Record Finding
          </button>
        </div>
      </section>

      {/* Resolve Finding */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Resolve Finding</h2>
        <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 6, padding: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Finding ID"
            value={resolveFindingId}
            onChange={e => setResolveFindingId(e.target.value)}
            style={{ padding: '6px 8px', background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, fontSize: 13, flex: 1 }}
          />
          <button
            onClick={handleResolveFinding}
            disabled={loading}
            style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Resolve
          </button>
        </div>
      </section>

      {/* Safety invariants footer */}
      <div style={{ borderTop: '1px solid #374151', paddingTop: 16, fontSize: 11, color: '#6b7280' }}>
        <strong>Safety constraints enforced:</strong> PRODUCTION_ACTIVATION: NOT_ENABLED |
        FULL_PUBLIC: NOT_ENABLED | LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED |
        PAYMENT_EXECUTION: NOT_ENABLED | REFUND_EXECUTION: NOT_ENABLED |
        PAYOUT_EXECUTION: NOT_ENABLED | EXTERNAL_SUBMISSIONS: NOT_ENABLED |
        SOURCE_RECORD_MUTATION: NOT_ENABLED
      </div>
    </div>
  );
}
