import React, { useState, useCallback } from 'react';
import {
  createReleaseCandidate,
  aggregateReadinessEvidence,
  evaluateReleaseCandidate,
  recordFinding,
  resolveFinding,
  getFinalEvidencePack,
} from '../../api/finalPreproductionReleaseCandidateClient';
import type {
  CreateReleaseCandidatePayload,
  RecordFindingPayload,
  FindingSeverity,
} from '../../types/finalPreproductionReleaseCandidate';

const SAFETY_NOTICE =
  'This is the final pre-production release candidate aggregator. ' +
  'No production deployment, no production activation, no live provider connectivity, ' +
  'no payment/refund/payout execution, no external tax/accounting/provider submission, ' +
  'and no source commercial record mutation will occur.';

const PHASE_LABELS: Record<string, string> = {
  '113': 'Phase 113 — Production Activation Gate',
  '114': 'Phase 114 — Controlled Production Activation Dry Run',
  '115': 'Phase 115 — Pre-Production Operational Readiness Board',
  '116': 'Phase 116 — Production Deployment Readiness Checklist',
  '117': 'Phase 117 — Production Deployment Dry Run / Rollback Drill',
  '118': 'Phase 118 — Production Observability & Incident Readiness',
  '119': 'Phase 119 — Security / Secrets / Compliance Pre-Launch Hardening',
};

export function FinalPreproductionReleaseCandidate() {
  const [candidateId, setCandidateId] = useState('');
  const [candidateRef, setCandidateRef] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [evidencePack, setEvidencePack] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [findingPayload, setFindingPayload] = useState<RecordFindingPayload>({
    severity: 'MINOR',
    category: 'GENERAL',
    description: '',
  });
  const [resolveFindingId, setResolveFindingId] = useState('');

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
    const payload: CreateReleaseCandidatePayload = {
      candidate_ref: candidateRef || undefined,
      created_by: 'admin',
    };
    const r = await run('Create Release Candidate', () => createReleaseCandidate(payload));
    if (r) {
      const c = r.candidate as Record<string, unknown> | undefined;
      if (c?.id) setCandidateId(String(c.id));
      if (c?.candidate_ref) setCandidateRef(String(c.candidate_ref));
    }
  }, [candidateRef, run]);

  const handleAggregate = useCallback(() =>
    run('Aggregate Readiness Evidence', () => aggregateReadinessEvidence({ candidate_id: candidateId || undefined })),
    [candidateId, run]);

  const handleEvaluate = useCallback(() =>
    run('Evaluate Release Candidate', () => evaluateReleaseCandidate({ candidate_id: candidateId || undefined })),
    [candidateId, run]);

  const handleRecordFinding = useCallback(() =>
    run('Record Finding', () => recordFinding({ ...findingPayload, candidate_id: candidateId || undefined })),
    [findingPayload, candidateId, run]);

  const handleResolveFinding = useCallback(() =>
    run('Resolve Finding', () => resolveFinding({
      finding_id: resolveFindingId,
      candidate_id: candidateId || undefined,
      resolved_by: 'admin',
    })),
    [resolveFindingId, candidateId, run]);

  const handleEvidencePack = useCallback(async () => {
    const r = await run('Build Final Evidence Pack', () => getFinalEvidencePack(candidateId || undefined));
    if (r?.evidence_pack) setEvidencePack(r.evidence_pack as Record<string, unknown>);
  }, [candidateId, run]);

  const btnClass = 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm';
  const sectionClass = 'bg-gray-800 rounded p-4 mb-4';

  return (
    <div className="p-6 text-white max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Final Pre-Production Release Candidate</h1>
      <div className="bg-yellow-900 border border-yellow-500 rounded p-3 mb-6 text-yellow-200 text-sm">
        <strong>SAFETY NOTICE:</strong> {SAFETY_NOTICE}
      </div>

      {/* Phase Validation Summary */}
      <div className={sectionClass}>
        <h2 className="text-lg font-semibold mb-3">Phase Validation Summary</h2>
        <div className="grid grid-cols-1 gap-1">
          {Object.entries(PHASE_LABELS).map(([phase, label]) => (
            <div key={phase} className="flex items-center gap-2 text-sm">
              <span className="text-green-400">✓</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Safety Invariants */}
      <div className={sectionClass}>
        <h2 className="text-lg font-semibold mb-3">Safety Invariants</h2>
        <div className="grid grid-cols-2 gap-1 text-sm font-mono">
          {[
            ['PRODUCTION_DEPLOYMENT', 'NOT_EXECUTED'],
            ['PRODUCTION_ACTIVATION', 'NOT_ENABLED'],
            ['FULL_PUBLIC', 'NOT_ENABLED'],
            ['LIVE_PROVIDER_CONNECTIVITY', 'NOT_ENABLED'],
            ['PAYMENT_EXECUTION', 'NOT_ENABLED'],
            ['REFUND_EXECUTION', 'NOT_ENABLED'],
            ['PAYOUT_EXECUTION', 'NOT_ENABLED'],
            ['EXTERNAL_SUBMISSIONS', 'NOT_ENABLED'],
            ['SOURCE_RECORD_MUTATION', 'NOT_ENABLED'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <span className="text-gray-400">{k}:</span>
              <span className="text-red-400">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Candidate ID */}
      <div className={sectionClass}>
        <h2 className="text-lg font-semibold mb-3">Release Candidate</h2>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm"
            placeholder="Candidate ID (auto-filled after create)"
            value={candidateId}
            onChange={e => setCandidateId(e.target.value)}
          />
          <input
            className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm"
            placeholder="Candidate ref (optional)"
            value={candidateRef}
            onChange={e => setCandidateRef(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnClass} onClick={handleCreate} disabled={loading}>Create Candidate</button>
          <button className={btnClass} onClick={handleAggregate} disabled={loading}>Aggregate Evidence</button>
          <button className={btnClass} onClick={handleEvaluate} disabled={loading}>Evaluate Candidate</button>
          <button className={btnClass} onClick={handleEvidencePack} disabled={loading}>Build Evidence Pack</button>
        </div>
      </div>

      {/* Record Finding */}
      <div className={sectionClass}>
        <h2 className="text-lg font-semibold mb-3">Record Finding</h2>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select
            className="bg-gray-700 rounded px-3 py-2 text-sm"
            value={findingPayload.severity}
            onChange={e => setFindingPayload(p => ({ ...p, severity: e.target.value as FindingSeverity }))}
          >
            <option value="BLOCKER">BLOCKER</option>
            <option value="MAJOR">MAJOR</option>
            <option value="MINOR">MINOR</option>
            <option value="INFO">INFO</option>
          </select>
          <input
            className="bg-gray-700 rounded px-3 py-2 text-sm"
            placeholder="Category"
            value={findingPayload.category}
            onChange={e => setFindingPayload(p => ({ ...p, category: e.target.value }))}
          />
          <input
            className="col-span-2 bg-gray-700 rounded px-3 py-2 text-sm"
            placeholder="Description"
            value={findingPayload.description}
            onChange={e => setFindingPayload(p => ({ ...p, description: e.target.value }))}
          />
        </div>
        <button className={btnClass} onClick={handleRecordFinding} disabled={loading}>Record Finding</button>
      </div>

      {/* Resolve Finding */}
      <div className={sectionClass}>
        <h2 className="text-lg font-semibold mb-3">Resolve Finding</h2>
        <div className="flex gap-2 mb-2">
          <input
            className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm"
            placeholder="Finding ID"
            value={resolveFindingId}
            onChange={e => setResolveFindingId(e.target.value)}
          />
          <button className={btnClass} onClick={handleResolveFinding} disabled={loading}>Resolve</button>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div className="bg-gray-700 rounded p-3 mb-4 text-sm text-gray-200">{message}</div>
      )}

      {/* Evidence Pack */}
      {evidencePack && (
        <div className={sectionClass}>
          <h2 className="text-lg font-semibold mb-3">Final Evidence Pack</h2>
          <div className="text-sm mb-2">
            <span className="text-gray-400">Candidate: </span>
            <span>{String(evidencePack.candidate_ref || '')}</span>
            <span className="ml-4 text-gray-400">Status: </span>
            <span className="text-green-400">{String(evidencePack.candidate_status || '')}</span>
          </div>
          <pre className="bg-gray-900 rounded p-3 text-xs overflow-auto max-h-64">
            {JSON.stringify(evidencePack.safety_invariants, null, 2)}
          </pre>
        </div>
      )}

      {/* Raw result */}
      {result && !evidencePack && (
        <div className={sectionClass}>
          <h2 className="text-lg font-semibold mb-2">Result</h2>
          <pre className="bg-gray-900 rounded p-3 text-xs overflow-auto max-h-64">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
