import React, { useState } from 'react';
import { ProductionActivationGateApproval } from '../../types/financialOperationsProductionActivationReview';
import { ShieldCheckIcon, XCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface GoNoGoPanelProps {
  approvals: ProductionActivationGateApproval[];
  onAction: (action: 'approve' | 'reject' | 'revoke') => Promise<void>;
  loading: boolean;
  gateStatus: string;
}

export const FinancialOperationsProductionActivationReviewGoNoGoPanel: React.FC<GoNoGoPanelProps> = ({
  approvals,
  onAction,
  loading,
  gateStatus
}) => {
  const [submitting, setSubmitting] = useState<string | null>(null);

  const rolesDisplay = [
    { key: 'EXECUTIVE_APPROVER', label: 'Executive Approver' },
    { key: 'FINANCE_APPROVER', label: 'Finance Auditor' },
    { key: 'SECURITY_APPROVER', label: 'Security Officer (Risk)' },
    { key: 'OPERATIONS_APPROVER', label: 'CTO (Ops)' },
    { key: 'COMPLIANCE_APPROVER', label: 'Compliance Auditor' },
    { key: 'PRIVACY_APPROVER', label: 'Privacy Officer' },
    { key: 'PROVIDER_OPERATIONS_APPROVER', label: 'Provider Ops Lead' }
  ];

  const handleTrigger = async (action: 'approve' | 'reject' | 'revoke') => {
    setSubmitting(action);
    try {
      await onAction(action);
    } finally {
      setSubmitting(null);
    }
  };

  const getRoleApproval = (roleKey: string) => {
    return approvals.find(a => a.approval_role === roleKey);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'APPROVED_FOR_GATE_READINESS':
        return 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5';
      case 'REJECTED':
        return 'border-rose-500/20 text-rose-400 bg-rose-500/5';
      default:
        return 'border-white/10 text-slate-400 bg-white/5';
    }
  };

  return (
    <div className="bg-[#141416] border border-white/10 p-5 space-y-6">
      <div>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">
          Signature Verification Chain
        </h3>
        <p className="text-[10px] text-slate-500 mt-1 font-mono">
          Mandatory cryptographic approval block of the 7 administrative roles
        </p>
      </div>

      {/* Signature Chain Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
        {rolesDisplay.map((role) => {
          const ap = getRoleApproval(role.key);
          const status = ap ? ap.approval_status : 'PENDING';
          const hash = ap ? ap.approver_reference_hash : null;

          return (
            <div key={role.key} className={`p-4 border flex flex-col justify-between ${getStatusColor(status)}`}>
              <div>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">{role.key}</p>
                <p className="text-xs font-black text-white mt-1">{role.label}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-bold">{status}</span>
                </div>
                {hash && (
                  <div className="flex flex-col text-[8px] mt-1 text-slate-400">
                    <span className="text-slate-500 font-black uppercase tracking-widest">Signer Hash:</span>
                    <span className="select-all break-all bg-black/30 p-1 mt-1 font-bold">{hash}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Operator Decision Panel */}
      <div className="pt-6 border-t border-white/5 bg-[#18181b] p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <p className="text-[10px] text-slate-500 font-mono">CURRENT GATE STATUS</p>
          <p className="text-sm font-black text-white font-mono uppercase mt-0.5">{gateStatus}</p>
        </div>

        <div className="flex flex-wrap gap-2.5 font-mono text-[10px]">
          <button
            onClick={() => handleTrigger('approve')}
            disabled={loading || submitting !== null || gateStatus !== 'APPROVED_FOR_FUTURE_ACTIVATION_REVIEW'}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800/20 disabled:text-slate-600 text-white font-bold uppercase transition-all flex items-center gap-1.5"
          >
            {submitting === 'approve' && <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />}
            Approve Review
          </button>

          <button
            onClick={() => handleTrigger('reject')}
            disabled={loading || submitting !== null || (gateStatus !== 'APPROVED_FOR_FUTURE_ACTIVATION_REVIEW' && gateStatus !== 'CREATED')}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-800/20 disabled:text-slate-600 text-white font-bold uppercase transition-all flex items-center gap-1.5"
          >
            {submitting === 'reject' && <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />}
            Reject
          </button>

          <button
            onClick={() => handleTrigger('revoke')}
            disabled={loading || submitting !== null || gateStatus === 'REVOKED'}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800/20 disabled:text-slate-600 text-white font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
          >
            {submitting === 'revoke' && <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />}
            Revoke Gate
          </button>
        </div>
      </div>
    </div>
  );
};

export default FinancialOperationsProductionActivationReviewGoNoGoPanel;
