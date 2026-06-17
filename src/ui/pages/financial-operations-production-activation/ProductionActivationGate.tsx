import React, { useEffect, useState } from 'react';
import {
  getActivationGate,
  submitApproval,
  submitReviewAction,
  getAuditTimeline,
  getRedactedExportPreview,
  GateResponse
} from '../../api/financialOperationsProductionActivationClient';
import {
  ProductionActivationGate as GateType,
  GateCheck,
  GateApproval,
  AuditTimelineEvent,
  RedactedExportPreview
} from '../../types/financialOperationsProductionActivation';

export const ProductionActivationGate: React.FC = () => {
  const [gateData, setGateData] = useState<GateResponse | null>(null);
  const [timeline, setTimeline] = useState<AuditTimelineEvent[]>([]);
  const [preview, setPreview] = useState<RedactedExportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [selectedRole, setSelectedRole] = useState('FINANCE_APPROVER');
  const [notes, setNotes] = useState('');
  const [approverRef, setApproverRef] = useState('');
  const [generalNote, setGeneralNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [gateRes, timelineRes, previewRes] = await Promise.all([
        getActivationGate(),
        getAuditTimeline(),
        getRedactedExportPreview()
      ]);
      if (gateRes.ok) setGateData(gateRes);
      if (timelineRes.ok) setTimeline(timelineRes.timeline);
      if (previewRes.ok) setPreview(previewRes.preview);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch activation gate data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGrantApproval = async (reject = false) => {
    setActionLoading(true);
    try {
      const res = await submitApproval({
        role: selectedRole,
        approverRef,
        notes,
        reject
      });
      if (res.ok) {
        setNotes('');
        setApproverRef('');
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Error processing approval request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviewAction = async (action: 'APPROVE_GATE' | 'REJECT_GATE' | 'REVOKE_GATE') => {
    setActionLoading(true);
    try {
      const res = await submitReviewAction({ action });
      if (res.ok) {
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Error executing review action');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddGeneralNote = async () => {
    if (!generalNote.trim()) return;
    setActionLoading(true);
    try {
      const res = await submitReviewAction({
        action: 'ADD_NOTE',
        note: generalNote,
        noteType: 'GENERAL'
      });
      if (res.ok) {
        setGeneralNote('');
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Error adding note');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mb-4"></div>
        <p className="text-slate-400 font-medium">Loading Pre-Production Activation Gate...</p>
      </div>
    );
  }

  if (error || !gateData) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8">
        <div className="max-w-4xl mx-auto bg-red-950/40 border border-red-900/60 p-6 rounded-none">
          <h2 className="text-xl font-bold text-red-400 mb-2">Failed to Load Gate</h2>
          <p className="text-red-200">{error || 'Unable to resolve server response.'}</p>
        </div>
      </div>
    );
  }

  const { gate, checks, approvals, safety } = gateData;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Safety Header Banner */}
        <div className="bg-amber-950/80 border-2 border-amber-500/60 p-4 relative overflow-hidden">
          <div className="absolute right-0 top-0 h-full w-24 bg-amber-500/10 skew-x-12 transform origin-top-right"></div>
          <div className="flex items-start gap-4">
            <span className="text-3xl">⚠️</span>
            <div>
              <h2 className="text-lg font-extrabold text-amber-400 tracking-wider uppercase">Pre-Production Governance Console</h2>
              <p className="text-sm text-amber-200 mt-1 font-semibold leading-relaxed">
                {safety.safety_message}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-amber-300/80 font-mono">
                <span>• FULL_PUBLIC: DISABLED</span>
                <span>• PROVIDER CONNECTIVITY: SANDBOX ONLY</span>
                <span>• MUTATIONS: READ-ONLY</span>
                <span>• PAYMENTS/PAYOUTS: SIMULATED</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Info Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Status Card */}
          <div className="bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Gate Status</span>
                <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded-none border border-slate-700">Phase 113E</span>
              </div>
              <h3 className="text-2xl font-black tracking-tight text-white mb-2">{gate.activation_gate_name}</h3>
              <p className="text-sm text-slate-400 font-mono mb-4">{gate.production_activation_gate_id}</p>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 font-bold text-sm tracking-wide uppercase">
                <span className="h-2.5 w-2.5 bg-emerald-500 rounded-full animate-ping"></span>
                {gate.activation_gate_status}
              </div>
            </div>
          </div>

          {/* Scope Card */}
          <div className="bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Scope & Configuration</span>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Scope:</span>
                  <span className="font-mono text-white font-semibold">{gate.activation_gate_scope}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Mode:</span>
                  <span className="font-mono text-white font-semibold">{gate.activation_gate_mode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">RC Mapping:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{gate.final_release_candidate_id || 'N/A'}</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 font-mono mt-4">
              Last Evaluated: {new Date(gate.updated_at).toLocaleString()}
            </div>
          </div>

          {/* Verification Checks Card */}
          <div className="bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Readiness Run</span>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-bold text-emerald-400">VALIDATED (PRE-PROD)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Checks Run:</span>
                  <span className="font-mono text-white font-semibold">{checks.length} Completed</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Blockers:</span>
                  <span className="font-mono text-red-400 font-semibold">{gate.blockers_json.length} Active</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 font-mono mt-4">
              Initiated By: {gate.created_by}
            </div>
          </div>

        </div>

        {/* Checklist & Approval Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Readiness Checklist */}
          <div className="bg-slate-900 border border-slate-800 p-5">
            <h3 className="text-lg font-black text-white mb-4 border-b border-slate-850 pb-2">Readiness Checklist</h3>
            <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
              {checks.map((chk) => (
                <div key={chk.id} className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-850">
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-500 text-lg">✔</span>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-200">{chk.check_label}</h4>
                      <p className="text-xs text-slate-500 font-mono">{chk.check_key}</p>
                    </div>
                  </div>
                  <span className="text-xs bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 font-bold uppercase tracking-wider">
                    {chk.check_status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Role Approvals Status */}
          <div className="bg-slate-900 border border-slate-800 p-5">
            <h3 className="text-lg font-black text-white mb-4 border-b border-slate-850 pb-2">Approval Sign-off Chain</h3>
            <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
              {approvals.map((ap) => (
                <div key={ap.id} className="flex items-start justify-between p-3 bg-slate-950/60 border border-slate-850">
                  <div>
                    <h4 className="text-sm font-black text-slate-200 tracking-wide">{ap.approval_role.replace(/_/g, ' ')}</h4>
                    {ap.approver_reference_hash && (
                      <p className="text-xs text-slate-500 font-mono mt-1">Hash: {ap.approver_reference_hash}</p>
                    )}
                    {ap.approval_notes_json?.notes && (
                      <p className="text-xs text-slate-400 italic mt-1">Notes: {ap.approval_notes_json.notes}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 font-bold uppercase tracking-wider border ${
                    ap.approval_status === 'APPROVED_FOR_GATE_READINESS' 
                      ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400' 
                      : 'bg-amber-950/60 border-amber-500/30 text-amber-400'
                  }`}>
                    {ap.approval_status === 'APPROVED_FOR_GATE_READINESS' ? 'APPROVED' : 'PENDING'}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* UI Control Form & Action Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Action Submission Form */}
          <div className="bg-slate-900 border border-slate-800 p-5 lg:col-span-2 space-y-4">
            <h3 className="text-lg font-black text-white border-b border-slate-850 pb-2">Sign-off Actions</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">Role Authority</label>
                <select 
                  value={selectedRole} 
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm text-white rounded-none focus:outline-none focus:border-emerald-500"
                >
                  <option value="FINANCE_APPROVER">Finance Approver</option>
                  <option value="EXECUTIVE_APPROVER">Executive Approver</option>
                  <option value="SECURITY_APPROVER">Security Approver</option>
                  <option value="OPERATIONS_APPROVER">Operations Approver</option>
                  <option value="COMPLIANCE_APPROVER">Compliance Approver</option>
                  <option value="PRIVACY_APPROVER">Privacy Approver</option>
                  <option value="PROVIDER_OPERATIONS_APPROVER">Provider Operations Approver</option>
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">Approver Reference (Required)</label>
                <input 
                  type="text" 
                  value={approverRef} 
                  onChange={(e) => setApproverRef(e.target.value)}
                  placeholder="e.g. EMP-90124"
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm text-white rounded-none focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">Approval Notes</label>
              <textarea 
                rows={3} 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Include details of readiness checklist items verified..."
                className="w-full bg-slate-950 border border-slate-800 p-2 text-sm text-white rounded-none focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => handleGrantApproval(false)} 
                disabled={actionLoading || !approverRef.trim()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 font-bold tracking-wide transition-colors uppercase disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Sign-off Role
              </button>
              <button 
                onClick={() => handleGrantApproval(true)} 
                disabled={actionLoading}
                className="bg-amber-700 hover:bg-amber-600 text-white px-6 py-2.5 font-bold tracking-wide transition-colors uppercase disabled:opacity-50 text-sm"
              >
                Reject Role
              </button>
            </div>

            <div className="pt-4 border-t border-slate-850 flex flex-wrap gap-4">
              <button 
                onClick={() => handleReviewAction('APPROVE_GATE')} 
                disabled={actionLoading}
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 font-bold uppercase tracking-wider text-xs transition-colors border border-slate-700"
              >
                Approve Gate (Future)
              </button>
              <button 
                onClick={() => handleReviewAction('REJECT_GATE')} 
                disabled={actionLoading}
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 font-bold uppercase tracking-wider text-xs transition-colors border border-slate-700"
              >
                Reject Gate
              </button>
              <button 
                onClick={() => handleReviewAction('REVOKE_GATE')} 
                disabled={actionLoading}
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 font-bold uppercase tracking-wider text-xs transition-colors border border-slate-700"
              >
                Revoke Gate
              </button>
            </div>

          </div>

          {/* Add Review Notes */}
          <div className="bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-lg font-black text-white border-b border-slate-850 pb-2">Add Review Note</h3>
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">Note Content</label>
                <textarea 
                  rows={4} 
                  value={generalNote} 
                  onChange={(e) => setGeneralNote(e.target.value)}
                  placeholder="Record comments, concerns, or requested evidence logs..."
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm text-white rounded-none focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <button 
              onClick={handleAddGeneralNote} 
              disabled={actionLoading || !generalNote.trim()}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 font-bold tracking-wide uppercase border border-slate-700 mt-4 disabled:opacity-50 text-xs"
            >
              Add General Note
            </button>
          </div>

        </div>

        {/* Redacted Financial Export Preview */}
        {preview && (
          <div className="bg-slate-900 border border-slate-800 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 border-b border-slate-850 pb-2">
              <div>
                <h3 className="text-lg font-black text-white">Simulated Financial Export Preview</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Hash: {preview.integrity_hash}</p>
              </div>
              <span className="text-xs bg-amber-950/60 border border-amber-500/30 text-amber-400 px-3 py-1 font-bold uppercase tracking-wider mt-2 sm:mt-0">
                REDACTED PRE-PRODUCTION MOCK
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400 font-bold bg-slate-950/40">
                    <th className="p-3">Tx ID</th>
                    <th className="p-3">Tenant ID</th>
                    <th className="p-3 text-right">Amount Gross</th>
                    <th className="p-3 text-right">Amount Net</th>
                    <th className="p-3 text-right">Tax/VAT</th>
                    <th className="p-3">Provider ID</th>
                    <th className="p-3">Payout Reference</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-mono divide-y divide-slate-850">
                  {preview.records.map((rec, i) => (
                    <tr key={i} className="hover:bg-slate-850/30">
                      <td className="p-3 text-slate-300">{rec.tx_id}</td>
                      <td className="p-3 text-slate-400">{rec.tenant_id}</td>
                      <td className="p-3 text-right text-slate-400">{rec.amount_gross}</td>
                      <td className="p-3 text-right text-slate-400">{rec.amount_net}</td>
                      <td className="p-3 text-right text-slate-400">{rec.tax_vat_amount}</td>
                      <td className="p-3 text-slate-300">{rec.routing_provider_id}</td>
                      <td className="p-3 text-slate-400">{rec.payout_reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Audit Trail Timeline */}
        <div className="bg-slate-900 border border-slate-800 p-5">
          <h3 className="text-lg font-black text-white mb-4 border-b border-slate-850 pb-2">Gate Audit Timeline</h3>
          <div className="max-h-64 overflow-y-auto space-y-4 pr-2">
            {timeline.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No events recorded in gate audit timeline.</p>
            ) : (
              timeline.map((ev) => (
                <div key={ev.id} className="flex gap-4 p-3 bg-slate-950/40 border border-slate-850 font-mono text-xs">
                  <div className="text-slate-500 select-none">
                    {new Date(ev.created_at).toLocaleTimeString()}
                  </div>
                  <div>
                    <span className="text-emerald-400 font-bold uppercase mr-2">{ev.event_type}</span>
                    <span className="text-slate-300">{ev.payload_json?.message || ''}</span>
                    <span className="text-slate-500 ml-2">({ev.actor_id} / {ev.actor_type})</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
