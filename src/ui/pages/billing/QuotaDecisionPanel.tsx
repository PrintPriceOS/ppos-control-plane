import React, { useState } from 'react';
import { TenantEntitlement } from '../../types/billingUsage';
import { COLORS } from '../../design-system/tokens';
import * as client from '../../api/billingUsageClient';
import {
    CheckCircleIcon,
    XCircleIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';

interface Props {
    tenantId: string;
}

export const QuotaDecisionPanel: React.FC<Props> = ({ tenantId }) => {
    const [action, setAction] = useState('UPLOAD_FILE');
    const [bytes, setBytes] = useState('10485760'); // 10MB default
    const [quantity, setQuantity] = useState('1');
    const [loading, setLoading] = useState(false);
    const [decision, setDecision] = useState<any | null>(null);

    const handleCheck = async () => {
        setLoading(true);
        try {
            // Call evaluate-action or check limits API via custom fetch to evaluateQuota
            // We can fetch from tenant-billing route directly using adminFetch or add custom client call
            const rawDecision = await require('../../lib/adminApi').adminFetch(`/api/admin/tenant-billing/usage/${tenantId}`);
            // Let's call evaluate quota decision simulation endpoint
            // Wait, does evaluate-action exist on tenant-governance? Yes, POST /:tenantId/evaluate-action
            const authApi = require('../../lib/adminApi');
            const res = await authApi.adminFetch(`/api/admin/tenant-governance/${tenantId}/evaluate-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actionCode: action === 'UPLOAD_FILE' ? 'UPLOAD_PRODUCTION_FILE' : 'RUN_PREFLIGHT',
                    context: { bytes: Number(bytes), quantity: Number(quantity) }
                })
            });
            setDecision(res);
        } catch (err) {
            console.error('Failed to run mock quota evaluation:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`p-6 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
            <h3 className={`text-xs font-black uppercase tracking-widest mb-4 ${COLORS.adaptive.textSecondary}`}>
                Real-time Quota Policy Inspector
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div>
                    <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Action Type</label>
                    <select
                        value={action}
                        onChange={(e) => setAction(e.target.value)}
                        className={`w-full text-xs font-bold p-2 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} focus:outline-none`}
                    >
                        <option value="UPLOAD_FILE">UPLOAD_FILE</option>
                        <option value="CREATE_PREFLIGHT_JOB">CREATE_PREFLIGHT_JOB</option>
                        <option value="EXPORT_AUDIT_BUNDLE">EXPORT_AUDIT_BUNDLE</option>
                        <option value="GENERATE_HANDOFF_PACKAGE">GENERATE_HANDOFF_PACKAGE</option>
                    </select>
                </div>

                {action === 'UPLOAD_FILE' && (
                    <div>
                        <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">File Size (Bytes)</label>
                        <input
                            type="number"
                            value={bytes}
                            onChange={(e) => setBytes(e.target.value)}
                            className={`w-full text-xs font-bold p-2 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} focus:outline-none`}
                        />
                    </div>
                )}

                {action !== 'UPLOAD_FILE' && (
                    <div>
                        <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Quantity</label>
                        <input
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className={`w-full text-xs font-bold p-2 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} focus:outline-none`}
                        />
                    </div>
                )}

                <div className="flex items-end">
                    <button
                        onClick={handleCheck}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#dc0000] hover:bg-[#b90000] text-white text-xs font-black uppercase tracking-wider transition-colors"
                    >
                        {loading ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : 'Inspect Policy'}
                    </button>
                </div>
            </div>

            {decision && (
                <div className={`p-4 border ${decision.allowed ? 'bg-emerald-50/20 border-emerald-100/50' : 'bg-red-50/20 border-red-100/50'} flex items-start gap-3`}>
                    {decision.allowed ? (
                        <CheckCircleIcon className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                        <XCircleIcon className="w-5 h-5 text-red-600 shrink-0" />
                    )}
                    <div>
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-black uppercase tracking-wider ${decision.allowed ? 'text-emerald-700' : 'text-red-700'}`}>
                                {decision.allowed ? 'ALLOW AUTHORIZED' : 'HARD LIMIT BLOCK'}
                            </span>
                        </div>
                        <p className={`text-[11px] font-medium mt-1 ${COLORS.adaptive.textSecondary}`}>
                            {decision.allowed 
                                ? `The current plan accommodates this action. No limits are violated.` 
                                : `Action blocked: Limit of ${decision.limits?.maxFileSizeMb || decision.limits?.maxJobsPerMonth} exceeded.`}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
