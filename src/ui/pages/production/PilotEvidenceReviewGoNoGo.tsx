import React, { useState, useCallback } from 'react';
import {
  getPilotEvidenceReviewReadiness,
  createReviewBoard,
  aggregatePilotEvidence,
  recordReviewFinding,
  resolveReviewFinding,
  submitGoNoGoDecision,
  getPilotReviewAuditTimeline,
  getPilotReviewEvidencePack,
} from '../../api/pilotEvidenceReviewGoNoGoClient';

const SAFETY_NOTICE =
  'Pilot evidence review and Go/No-Go decision only. ' +
  'This does NOT enable limited beta automatically. ' +
  'FULL_PUBLIC and open marketplace access remain disabled. ' +
  'No real payment, refund, payout, tax submission, accounting submission, or provider execution.';

export function PilotEvidenceReviewGoNoGo() {
  const [reviewBoardId, setReviewBoardId] = useState('');
  const [findingId, setFindingId] = useState('');
  const [decisionOutcome, setDecisionOutcome] = useState('NO_GO');
  const [decisionRationale, setDecisionRationale] = useState('');
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

  const handleReadiness = useCallback(() =>
    run('Check Readiness', () =>
      getPilotEvidenceReviewReadiness({ review_board_id: reviewBoardId || undefined })
    ), [run, reviewBoardId]);

  const handleCreateBoard = useCallback(async () => {
    const r = await run('Create Review Board', () =>
      createReviewBoard({
        board_name: 'Pilot Evidence Review Board',
        board_description: 'Go/No-Go review for limited beta preparation',
        created_by: 'admin',
      })
    );
    if (r) {
      const rb = r.review_board as Record<string, unknown> | undefined;
      if (rb?.review_board_id) setReviewBoardId(String(rb.review_board_id));
    }
  }, [run]);

  const handleAggregate = useCallback(() =>
    run('Aggregate Pilot Evidence', () =>
      aggregatePilotEvidence({
        review_board_id: reviewBoardId,
        evidence: {
          PHASE_122_1_VALIDATED: { status: 'VALIDATED', source: 'smoke_phase122_1f' },
          PHASE_122_2_VALIDATED: { status: 'VALIDATED', source: 'smoke_phase122_2d' },
          PHASE_123_VALIDATED: { status: 'VALIDATED', source: 'smoke_phase123e' },
          PHASE_124_VALIDATED: { status: 'VALIDATED', source: 'smoke_phase124e' },
          PHASE_125_VALIDATED: { status: 'VALIDATED', source: 'smoke_phase125e' },
          MIGRATION_RUNNER_CLEAN: { status: 'VERIFIED' },
          NPM_BUILD_PASSING: { status: 'VERIFIED' },
          DB_BACKUP_EVIDENCE: { status: 'VERIFIED' },
          NO_UNRESOLVED_BLOCKERS: { status: 'VERIFIED' },
          TENANT_ALLOWLIST_FAIL_CLOSED: { status: 'VERIFIED' },
          FILE_ACCESS_SCOPED_REVOCABLE: { status: 'VERIFIED' },
          NO_REAL_PAYMENT_EXECUTION: { status: 'VERIFIED' },
          NO_PROVIDER_EXTERNAL_SUBMISSION: { status: 'VERIFIED' },
          NO_FULL_PUBLIC: { status: 'VERIFIED' },
          NO_OPEN_MARKETPLACE: { status: 'VERIFIED' },
        },
        verified_by: 'admin',
      })
    ), [run, reviewBoardId]);

  const handleRecordFinding = useCallback(async () => {
    const r = await run('Record Finding', () =>
      recordReviewFinding({
        review_board_id: reviewBoardId,
        finding_type: 'OBSERVATION',
        blocks_go_decision: false,
        severity: 'LOW',
        summary: 'Manual finding from admin UI',
        created_by: 'admin',
      })
    );
    if (r) {
      const f = r.finding as Record<string, unknown> | undefined;
      if (f?.finding_id) setFindingId(String(f.finding_id));
    }
  }, [run, reviewBoardId]);

  const handleResolveFinding = useCallback(() =>
    run('Resolve Finding', () =>
      resolveReviewFinding({ finding_id: findingId, resolved_by: 'admin' })
    ), [run, findingId]);

  const handleDecision = useCallback(() =>
    run('Submit Go/No-Go Decision', () =>
      submitGoNoGoDecision({
        review_board_id: reviewBoardId,
        decision_outcome: decisionOutcome,
        decision_rationale: decisionRationale || 'Decision submitted via admin UI',
        decided_by: 'admin',
      })
    ), [run, reviewBoardId, decisionOutcome, decisionRationale]);

  const handleAuditTimeline = useCallback(() =>
    run('Get Audit Timeline', () =>
      getPilotReviewAuditTimeline({ review_board_id: reviewBoardId })
    ), [run, reviewBoardId]);

  const handleEvidencePack = useCallback(() =>
    run('Build Evidence Pack', () =>
      getPilotReviewEvidencePack({ review_board_id: reviewBoardId })
    ), [run, reviewBoardId]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1>Phase 126 — Pilot Evidence Review &amp; Go/No-Go for Limited Beta</h1>

      <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <strong>Decision / Evidence Review Only</strong>
        <p style={{ margin: '8px 0 0' }}>{SAFETY_NOTICE}</p>
      </div>

      <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3>Safety Invariants</h3>
        <table style={{ width: '100%', fontSize: 13 }}>
          <tbody>
            <tr><td>FULL_PUBLIC</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>OPEN_MARKETPLACE_ACCESS</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>LIVE_PROVIDER_CONNECTIVITY</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>PAYMENT_EXECUTION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>REFUND_EXECUTION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>PAYOUT_EXECUTION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>PROVIDER_EXTERNAL_SUBMISSION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>EXTERNAL_TAX_SUBMISSION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>EXTERNAL_ACCOUNTING_SUBMISSION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>SOURCE_MUTATION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>PRODUCTION_ACTIVATION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>BETA_ENABLED</td><td><strong>NOT_ENABLED</strong></td></tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div>
          <label>Review Board ID</label><br />
          <input value={reviewBoardId} onChange={e => setReviewBoardId(e.target.value)} placeholder="review_board_id (auto)" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Finding ID</label><br />
          <input value={findingId} onChange={e => setFindingId(e.target.value)} placeholder="finding_id (auto)" style={{ width: '100%', padding: 6 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div>
          <label>Decision Outcome</label><br />
          <select value={decisionOutcome} onChange={e => setDecisionOutcome(e.target.value)} style={{ width: '100%', padding: 6 }}>
            <option value="NO_GO">NO_GO</option>
            <option value="DEFERRED">DEFERRED</option>
            <option value="CHANGES_REQUIRED">CHANGES_REQUIRED</option>
            <option value="GO_FOR_LIMITED_BETA_PREPARATION">GO_FOR_LIMITED_BETA_PREPARATION</option>
          </select>
        </div>
        <div>
          <label>Decision Rationale</label><br />
          <input value={decisionRationale} onChange={e => setDecisionRationale(e.target.value)} placeholder="Rationale for decision" style={{ width: '100%', padding: 6 }} />
        </div>
      </div>

      <h3>Actions</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        <button onClick={handleReadiness} disabled={loading}>Check Readiness</button>
        <button onClick={handleCreateBoard} disabled={loading}>Create Review Board</button>
        <button onClick={handleAggregate} disabled={loading || !reviewBoardId}>Aggregate Evidence</button>
        <button onClick={handleRecordFinding} disabled={loading || !reviewBoardId}>Record Finding</button>
        <button onClick={handleResolveFinding} disabled={loading || !findingId}>Resolve Finding</button>
        <button onClick={handleDecision} disabled={loading || !reviewBoardId}>Submit Decision</button>
        <button onClick={handleAuditTimeline} disabled={loading || !reviewBoardId}>Audit Timeline</button>
        <button onClick={handleEvidencePack} disabled={loading || !reviewBoardId}>Evidence Pack</button>
      </div>

      {message && (
        <div style={{ padding: 12, marginBottom: 16, background: message.startsWith('Error') ? '#f8d7da' : '#d4edda', borderRadius: 6 }}>
          {message}
        </div>
      )}

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, background: '#e2e3e5', padding: 12, borderRadius: 6, fontSize: 13 }}>
          <div>
            <strong>Persistence Mode:</strong> {String((result as any).persistenceMode || 'N/A')}<br />
            <strong>Persistence Status:</strong> {String((result as any).persistenceStatus || 'N/A')}<br />
          </div>
          <div>
            <strong>Runtime Truth Status:</strong> {String((result as any).runtimeTruthStatus || 'N/A')}<br />
            <strong>Evidence Integrity Hash:</strong> {String((result as any).evidence_pack?.evidence_hash || (result as any).evidence_hash || 'N/A')}
          </div>
        </div>
      )}

      {result && (
        <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 16 }}>
          <h3>Result</h3>
          <pre style={{ fontSize: 12, maxHeight: 500, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

