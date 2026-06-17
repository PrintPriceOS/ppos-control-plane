import React, { useState, useCallback } from 'react';
import {
  getBoardReadiness,
  createReadinessBoard,
  submitDepartmentReview,
  recordBoardFinding,
  resolveBoardFinding,
  getBoardAuditTimeline,
  getBoardEvidencePack,
} from '../../api/preProductionOperationalReadinessBoardClient';
import type {
  Department,
  DepartmentReviewPayload,
  RecordFindingPayload,
} from '../../types/preProductionOperationalReadinessBoard';

const DEPARTMENTS: Department[] = [
  'OPERATIONS',
  'FINANCE',
  'TECHNICAL',
  'COMPLIANCE',
  'SECURITY',
  'CUSTOMER_SUPPORT',
  'PRINT_PARTNER_SUCCESS',
];

const SAFETY_NOTICE =
  'This is a review-only board. No production activation, live provider connectivity, ' +
  'payment execution, refund execution, payout execution, external submission, ' +
  'or source record mutation will occur.';

export function OperationalReadinessBoard() {
  const [boardId, setBoardId] = useState('');
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<Record<string, unknown> | null>(null);
  const [board, setBoard] = useState<Record<string, unknown> | null>(null);
  const [auditTimeline, setAuditTimeline] = useState<unknown[]>([]);
  const [evidencePack, setEvidencePack] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [deptReview, setDeptReview] = useState<DepartmentReviewPayload>({
    board_id: '',
    department: 'OPERATIONS',
    reviewer: '',
    status: 'APPROVED',
    notes: '',
  });

  const [finding, setFinding] = useState<RecordFindingPayload>({
    board_id: '',
    department: 'TECHNICAL',
    severity: 'MAJOR',
    title: '',
    description: '',
    raised_by: '',
  });

  const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setLoading(true);
    setMessage('');
    try {
      const result = await fn();
      setMessage(`${label}: OK`);
      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(`${label}: ERROR — ${msg}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCheckReadiness = () =>
    run('Check readiness', async () => {
      const r = await getBoardReadiness(activeBoardId || undefined);
      setReadiness(r as Record<string, unknown>);
      return r;
    });

  const handleCreate = () =>
    run('Create board', async () => {
      const r = await createReadinessBoard({ requested_by: 'admin' });
      setBoard(r as Record<string, unknown>);
      const id = (r as { board_id?: string }).board_id || '';
      setActiveBoardId(id);
      setBoardId(id);
      return r;
    });

  const handleDeptReview = () =>
    run('Submit department review', async () => {
      const payload = { ...deptReview, board_id: activeBoardId || deptReview.board_id };
      return submitDepartmentReview(payload);
    });

  const handleRecordFinding = () =>
    run('Record finding', async () => {
      const payload = { ...finding, board_id: activeBoardId || finding.board_id };
      return recordBoardFinding(payload);
    });

  const handleResolveFinding = () =>
    run('Resolve finding', async () => {
      const findingId = prompt('Finding ID to resolve:') || '';
      if (!findingId) return null;
      return resolveBoardFinding({ board_id: activeBoardId || '', finding_id: findingId, resolved_by: 'admin' });
    });

  const handleAuditTimeline = () =>
    run('Load audit timeline', async () => {
      if (!activeBoardId) throw new Error('No board selected');
      const r = await getBoardAuditTimeline(activeBoardId);
      setAuditTimeline((r as { audit_timeline?: unknown[] }).audit_timeline || []);
      return r;
    });

  const handleEvidencePack = () =>
    run('Build evidence pack', async () => {
      if (!activeBoardId) throw new Error('No board selected');
      const r = await getBoardEvidencePack(activeBoardId);
      setEvidencePack(r as Record<string, unknown>);
      return r;
    });

  return (
    <div style={{ fontFamily: 'monospace', padding: '24px', maxWidth: '960px' }}>
      <h1>Phase 115 — Pre-Production Operational Readiness Board</h1>

      <div style={{ background: '#fff3cd', border: '1px solid #ffc107', padding: '12px', marginBottom: '20px', borderRadius: '4px' }}>
        <strong>SAFETY NOTICE:</strong> {SAFETY_NOTICE}
      </div>

      <div style={{ background: '#f8f9fa', border: '1px solid #dee2e6', padding: '12px', marginBottom: '20px', borderRadius: '4px' }}>
        <strong>Safety Invariants:</strong>
        <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
          <li>PRODUCTION_ACTIVATION: NOT_ENABLED</li>
          <li>FULL_PUBLIC: NOT_ENABLED</li>
          <li>LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED</li>
          <li>PAYMENT_EXECUTION: NOT_ENABLED</li>
          <li>REFUND_EXECUTION: NOT_ENABLED</li>
          <li>PAYOUT_EXECUTION: NOT_ENABLED</li>
          <li>EXTERNAL_SUBMISSION: NOT_ENABLED</li>
          <li>SOURCE_RECORD_MUTATION: NOT_ENABLED</li>
          <li>REVIEW_ONLY_MODE: ACTIVE</li>
        </ul>
      </div>

      {/* Board ID input */}
      <section style={{ marginBottom: '20px' }}>
        <h2>Active Board</h2>
        <input
          type="text"
          placeholder="Board ID"
          value={boardId}
          onChange={e => { setBoardId(e.target.value); setActiveBoardId(e.target.value || null); }}
          style={{ width: '400px', padding: '6px', marginRight: '8px' }}
        />
        <span style={{ color: '#6c757d', fontSize: '0.85em' }}>
          {activeBoardId ? `Active: ${activeBoardId}` : 'No board selected'}
        </span>
      </section>

      {/* Actions */}
      <section style={{ marginBottom: '20px' }}>
        <h2>Actions</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button onClick={handleCreate} disabled={loading}>Create Board</button>
          <button onClick={handleCheckReadiness} disabled={loading}>Check Readiness</button>
          <button onClick={handleAuditTimeline} disabled={loading}>Load Audit Timeline</button>
          <button onClick={handleEvidencePack} disabled={loading}>Build Evidence Pack</button>
          <button onClick={handleResolveFinding} disabled={loading}>Resolve Finding</button>
        </div>
        {message && (
          <div style={{ marginTop: '8px', padding: '8px', background: '#e9ecef', borderRadius: '4px' }}>
            {message}
          </div>
        )}
      </section>

      {/* Department Review */}
      <section style={{ marginBottom: '20px' }}>
        <h2>Submit Department Review</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <select value={deptReview.department} onChange={e => setDeptReview(d => ({ ...d, department: e.target.value as Department }))}>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={deptReview.status} onChange={e => setDeptReview(d => ({ ...d, status: e.target.value as DepartmentReviewPayload['status'] }))}>
            <option value="APPROVED">APPROVED</option>
            <option value="CHANGES_REQUIRED">CHANGES_REQUIRED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
          <input
            type="text"
            placeholder="Reviewer name"
            value={deptReview.reviewer}
            onChange={e => setDeptReview(d => ({ ...d, reviewer: e.target.value }))}
            style={{ padding: '4px' }}
          />
          <input
            type="text"
            placeholder="Notes"
            value={deptReview.notes}
            onChange={e => setDeptReview(d => ({ ...d, notes: e.target.value }))}
            style={{ padding: '4px', width: '200px' }}
          />
          <button onClick={handleDeptReview} disabled={loading}>Submit Review</button>
        </div>
      </section>

      {/* Record Finding */}
      <section style={{ marginBottom: '20px' }}>
        <h2>Record Finding</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <select value={finding.department} onChange={e => setFinding(f => ({ ...f, department: e.target.value as Department }))}>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={finding.severity} onChange={e => setFinding(f => ({ ...f, severity: e.target.value as RecordFindingPayload['severity'] }))}>
            <option value="BLOCKER">BLOCKER</option>
            <option value="MAJOR">MAJOR</option>
            <option value="MINOR">MINOR</option>
            <option value="INFO">INFO</option>
          </select>
          <input
            type="text"
            placeholder="Title"
            value={finding.title}
            onChange={e => setFinding(f => ({ ...f, title: e.target.value }))}
            style={{ padding: '4px', width: '200px' }}
          />
          <input
            type="text"
            placeholder="Raised by"
            value={finding.raised_by}
            onChange={e => setFinding(f => ({ ...f, raised_by: e.target.value }))}
            style={{ padding: '4px' }}
          />
          <button onClick={handleRecordFinding} disabled={loading}>Record Finding</button>
        </div>
      </section>

      {/* Readiness State */}
      {readiness && (
        <section style={{ marginBottom: '20px' }}>
          <h2>Readiness State</h2>
          <pre style={{ background: '#f8f9fa', padding: '12px', borderRadius: '4px', overflow: 'auto' }}>
            {JSON.stringify(readiness, null, 2)}
          </pre>
        </section>
      )}

      {/* Board State */}
      {board && (
        <section style={{ marginBottom: '20px' }}>
          <h2>Board State</h2>
          <pre style={{ background: '#f8f9fa', padding: '12px', borderRadius: '4px', overflow: 'auto' }}>
            {JSON.stringify(board, null, 2)}
          </pre>
        </section>
      )}

      {/* Audit Timeline */}
      {auditTimeline.length > 0 && (
        <section style={{ marginBottom: '20px' }}>
          <h2>Audit Timeline</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
            <thead>
              <tr style={{ background: '#dee2e6' }}>
                <th style={{ padding: '6px', textAlign: 'left' }}>Event</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>Actor</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>Department</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {(auditTimeline as Array<{ event_type: string; actor: string; department?: string; created_at: string }>).map((e, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '6px' }}>{e.event_type}</td>
                  <td style={{ padding: '6px' }}>{e.actor}</td>
                  <td style={{ padding: '6px' }}>{e.department || '—'}</td>
                  <td style={{ padding: '6px' }}>{e.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Evidence Pack */}
      {evidencePack && (
        <section style={{ marginBottom: '20px' }}>
          <h2>Evidence Pack</h2>
          <pre style={{ background: '#f8f9fa', padding: '12px', borderRadius: '4px', overflow: 'auto', maxHeight: '400px' }}>
            {JSON.stringify(evidencePack, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
