import React, { useState, useCallback } from 'react';
import {
  getHandoffPackageReadiness,
  createHandoffPackage,
  addPackageFileMetadata,
  createScopedFileAccessGrant,
  revokeFileAccessGrant,
  submitPrinthouseHandoffReview,
  acceptHandoffPackage,
  rejectHandoffPackage,
  recordHandoffFinding,
  resolveHandoffFinding,
  getHandoffAuditTimeline,
  getHandoffEvidencePack,
} from '../../api/controlledPrinthouseHandoffPackageClient';

const SAFETY_NOTICE =
  'Controlled printhouse handoff / file package pilot only. FULL_PUBLIC and open marketplace access remain disabled. ' +
  'No automatic production dispatch. No unrestricted file access. No permanent public URLs. ' +
  'No real payment/refund/payout/provider/tax/accounting execution is enabled. ' +
  'No source record mutation outside pilot scope.';

export function ControlledPrinthouseHandoffPackage() {
  const [programId, setProgramId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [printhouseTenantId, setPrinthouseTenantId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [pilotOrderId, setPilotOrderId] = useState('');
  const [orderLinkId, setOrderLinkId] = useState('');
  const [grantId, setGrantId] = useState('');
  const [findingId, setFindingId] = useState('');
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
      getHandoffPackageReadiness({ handoff_package_id: packageId || undefined })
    ), [run, packageId]);

  const handleCreate = useCallback(async () => {
    const r = await run('Create Handoff Package', () =>
      createHandoffPackage({
        pilot_program_id: programId, participant_id: participantId, printhouse_tenant_id: printhouseTenantId,
        pilot_order_id: pilotOrderId || undefined, order_link_id: orderLinkId || undefined,
        file_access_scope: 'REDACTED_PREVIEW', created_by: 'admin',
      })
    );
    if (r) {
      const hp = r.handoff_package as Record<string, unknown> | undefined;
      if (hp?.handoff_package_id) setPackageId(String(hp.handoff_package_id));
    }
  }, [run, programId, participantId, printhouseTenantId, pilotOrderId, orderLinkId]);

  const handleAddFile = useCallback(() =>
    run('Add File Metadata', () =>
      addPackageFileMetadata({
        handoff_package_id: packageId, file_name: 'sample-file.pdf', file_type: 'application/pdf',
        file_size_bytes: 1024, file_scope: 'REDACTED_PREVIEW', preflight_status: 'PASSED', created_by: 'admin',
      })
    ), [run, packageId]);

  const handleCreateGrant = useCallback(async () => {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const r = await run('Create Access Grant', () =>
      createScopedFileAccessGrant({
        handoff_package_id: packageId, participant_id: participantId, printhouse_tenant_id: printhouseTenantId,
        pilot_order_id: pilotOrderId || undefined, access_scope: 'REDACTED_PREVIEW', expires_at: expires, created_by: 'admin',
      })
    );
    if (r) {
      const ag = r.access_grant as Record<string, unknown> | undefined;
      if (ag?.access_grant_id) setGrantId(String(ag.access_grant_id));
    }
  }, [run, packageId, participantId, printhouseTenantId, pilotOrderId]);

  const handleRevokeGrant = useCallback(() =>
    run('Revoke Access Grant', () =>
      revokeFileAccessGrant({ access_grant_id: grantId, revoked_by: 'admin' })
    ), [run, grantId]);

  const handleReview = useCallback(() =>
    run('Submit Review', () =>
      submitPrinthouseHandoffReview({
        handoff_package_id: packageId, pilot_program_id: programId, participant_id: participantId,
        reviewer: 'admin', review_status: 'APPROVED', review_notes: 'Reviewed via admin UI',
      })
    ), [run, packageId, programId, participantId]);

  const handleAccept = useCallback(() =>
    run('Accept Package', () =>
      acceptHandoffPackage({ handoff_package_id: packageId, accepted_by: 'admin' })
    ), [run, packageId]);

  const handleReject = useCallback(() =>
    run('Reject Package', () =>
      rejectHandoffPackage({ handoff_package_id: packageId, rejected_by: 'admin', reason: 'Manual rejection' })
    ), [run, packageId]);

  const handleRecordFinding = useCallback(async () => {
    const r = await run('Record Finding', () =>
      recordHandoffFinding({
        handoff_package_id: packageId, pilot_program_id: programId, participant_id: participantId || undefined,
        finding_type: 'OBSERVATION', blocks_handoff: false, severity: 'LOW', summary: 'Manual finding from admin UI', created_by: 'admin',
      })
    );
    if (r) {
      const f = r.finding as Record<string, unknown> | undefined;
      if (f?.finding_id) setFindingId(String(f.finding_id));
    }
  }, [run, packageId, programId, participantId]);

  const handleResolveFinding = useCallback(() =>
    run('Resolve Finding', () =>
      resolveHandoffFinding({ finding_id: findingId, resolved_by: 'admin' })
    ), [run, findingId]);

  const handleAuditTimeline = useCallback(() =>
    run('Get Audit Timeline', () =>
      getHandoffAuditTimeline({ handoff_package_id: packageId, pilot_program_id: programId || undefined })
    ), [run, packageId, programId]);

  const handleEvidencePack = useCallback(() =>
    run('Build Evidence Pack', () =>
      getHandoffEvidencePack({ handoff_package_id: packageId, pilot_program_id: programId || undefined, participant_id: participantId || undefined })
    ), [run, packageId, programId, participantId]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1>Phase 124 — Controlled Printhouse Handoff / File Package Pilot</h1>

      <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <strong>Controlled Handoff Pilot Only</strong>
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
            <tr><td>PRODUCTION_DISPATCH</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>UNRESTRICTED_FILE_ACCESS</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>PERMANENT_PUBLIC_URL</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>EXTERNAL_TAX_SUBMISSION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>EXTERNAL_ACCOUNTING_SUBMISSION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>PROVIDER_EXTERNAL_SUBMISSION</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>SOURCE_MUTATION_OUTSIDE_PILOT_SCOPE</td><td><strong>NOT_ENABLED</strong></td></tr>
            <tr><td>AUTOMATIC_PRODUCTION_DISPATCH</td><td><strong>NOT_ENABLED</strong></td></tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div>
          <label>Program ID</label><br />
          <input value={programId} onChange={e => setProgramId(e.target.value)} placeholder="pilot_program_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Participant ID</label><br />
          <input value={participantId} onChange={e => setParticipantId(e.target.value)} placeholder="participant_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Printhouse Tenant ID</label><br />
          <input value={printhouseTenantId} onChange={e => setPrinthouseTenantId(e.target.value)} placeholder="printhouse_tenant_id" style={{ width: '100%', padding: 6 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div>
          <label>Package ID</label><br />
          <input value={packageId} onChange={e => setPackageId(e.target.value)} placeholder="handoff_package_id (auto)" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Pilot Order ID</label><br />
          <input value={pilotOrderId} onChange={e => setPilotOrderId(e.target.value)} placeholder="pilot_order_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Order Link ID</label><br />
          <input value={orderLinkId} onChange={e => setOrderLinkId(e.target.value)} placeholder="order_link_id" style={{ width: '100%', padding: 6 }} />
        </div>
        <div>
          <label>Finding ID</label><br />
          <input value={findingId} onChange={e => setFindingId(e.target.value)} placeholder="finding_id (auto)" style={{ width: '100%', padding: 6 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 24 }}>
        <div>
          <label>Access Grant ID</label><br />
          <input value={grantId} onChange={e => setGrantId(e.target.value)} placeholder="access_grant_id (auto)" style={{ width: '50%', padding: 6 }} />
        </div>
      </div>

      <h3>Actions</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        <button onClick={handleReadiness} disabled={loading}>Check Readiness</button>
        <button onClick={handleCreate} disabled={loading || !programId || !participantId || !printhouseTenantId}>Create Package</button>
        <button onClick={handleAddFile} disabled={loading || !packageId}>Add File Metadata</button>
        <button onClick={handleCreateGrant} disabled={loading || !packageId || !participantId || !printhouseTenantId}>Create Access Grant</button>
        <button onClick={handleRevokeGrant} disabled={loading || !grantId}>Revoke Grant</button>
        <button onClick={handleReview} disabled={loading || !packageId || !programId || !participantId}>Submit Review</button>
        <button onClick={handleAccept} disabled={loading || !packageId}>Accept Package</button>
        <button onClick={handleReject} disabled={loading || !packageId}>Reject Package</button>
        <button onClick={handleRecordFinding} disabled={loading || !packageId || !programId}>Record Finding</button>
        <button onClick={handleResolveFinding} disabled={loading || !findingId}>Resolve Finding</button>
        <button onClick={handleAuditTimeline} disabled={loading || !packageId}>Audit Timeline</button>
        <button onClick={handleEvidencePack} disabled={loading || !packageId}>Evidence Pack</button>
      </div>

      {message && (
        <div style={{ padding: 12, marginBottom: 16, background: message.startsWith('Error') ? '#f8d7da' : '#d4edda', borderRadius: 6 }}>
          {message}
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
