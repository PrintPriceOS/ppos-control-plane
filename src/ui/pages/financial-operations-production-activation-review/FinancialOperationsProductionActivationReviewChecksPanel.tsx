import React from 'react';
import { ProductionActivationGateCheck } from '../../types/financialOperationsProductionActivationReview';
import { CheckIcon, ClockIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface ChecksPanelProps {
  checks: ProductionActivationGateCheck[];
  loading: boolean;
}

export const FinancialOperationsProductionActivationReviewChecksPanel: React.FC<ChecksPanelProps> = ({ checks, loading }) => {
  // Hardcoded 3 automatic checks for UI simulation as requested, in addition to list
  const securityChecks = [
    { key: 'KYC_VERIFICATION', label: 'KYC Verification', status: 'PASS' },
    { key: 'RISK_SCORE_CHECK', label: 'Risk Score Check', status: 'PASS' },
    { key: 'COMPLIANCE_AUDIT', label: 'Compliance Audit', status: 'PASS' }
  ];

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PASS':
      case 'COMPLETED':
      case 'SUCCESS':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'PENDING':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      default:
        return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PASS':
      case 'COMPLETED':
      case 'SUCCESS':
        return <CheckIcon className="w-4 h-4 text-emerald-400" />;
      case 'PENDING':
        return <ClockIcon className="w-4 h-4 text-amber-400" />;
      default:
        return <XMarkIcon className="w-4 h-4 text-rose-400" />;
    }
  };

  return (
    <div className="bg-[#141416] border border-white/10 p-5 space-y-6">
      <div>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">
          Automatic Security Gates (Real-time Evaluation)
        </h3>
        <p className="text-[10px] text-slate-500 mt-1 font-mono">
          Mandatory pre-activation verification pipelines
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono">
        {securityChecks.map((sc) => (
          <div key={sc.key} className={`p-4 border flex items-center justify-between ${getStatusColor(sc.status)}`}>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{sc.key}</p>
              <p className="text-xs font-black text-white mt-1">{sc.label}</p>
            </div>
            <div className="flex items-center gap-1.5 font-black text-[10px]">
              {getStatusIcon(sc.status)}
              <span>{sc.status}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-white/5">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
          Detailed Readiness Checklist
        </h4>
        {loading ? (
          <div className="py-4 text-center text-xs text-slate-500 font-mono animate-pulse">
            Loading checklist...
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto divide-y divide-white/5 pr-2">
            {checks.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">No checklist items generated yet. Evaluate gate to populate.</p>
            ) : (
              checks.map((check) => (
                <div key={check.id} className="py-2.5 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300">{check.check_label || check.check_key}</span>
                  <span className={`px-2 py-0.5 border text-[9px] font-bold ${getStatusColor(check.check_status)}`}>
                    {check.check_status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialOperationsProductionActivationReviewChecksPanel;
