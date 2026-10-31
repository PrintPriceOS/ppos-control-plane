import React, { useState, useEffect } from 'react';
import { ReadinessEvaluation } from '../../types/printhouseCapabilities';
import { getReadiness } from '../../api/printhouseCapabilitiesClient';
import { 
    CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, 
    ArrowPathIcon, CpuChipIcon, RectangleStackIcon, 
    ShieldCheckIcon, ClockIcon 
} from '@heroicons/react/24/outline';

interface PrinthouseReadinessPanelProps {
    printhouseId: string;
    refreshTrigger: number;
}

export const PrinthouseReadinessPanel: React.FC<PrinthouseReadinessPanelProps> = ({ 
    printhouseId,
    refreshTrigger
}) => {
    const [readiness, setReadiness] = useState<ReadinessEvaluation | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadReadiness();
    }, [printhouseId, refreshTrigger]);

    const loadReadiness = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getReadiness(printhouseId);
            if (res.ok) {
                setReadiness(res.readiness);
            } else {
                setError('Failed to fetch onboarding readiness');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    if (loading && !readiness) {
        return (
            <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="w-6 h-6 text-primary animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-bold border border-red-100 dark:border-red-900/40">
                {error}
            </div>
        );
    }

    if (!readiness) return null;

    const getNextRecommendations = () => {
        const list: string[] = [];
        if (readiness.missing_sections.includes('machines') || readiness.capability_summary.machines === 0) {
            list.push('Add at least one active machine.');
        }
        if (readiness.missing_sections.includes('media') || readiness.capability_summary.media === 0) {
            list.push('Add compatible media.');
        }
        if (readiness.missing_sections.includes('policy_profiles') || readiness.capability_summary.policy_profiles === 0) {
            list.push('Add policy profile.');
        }
        if (readiness.missing_sections.includes('sla_profiles') || readiness.capability_summary.sla_profiles === 0) {
            list.push('Add SLA profile.');
        }
        if (readiness.warnings.length > 0) {
            list.push('Resolve validation warnings.');
        }
        if (list.length === 0 && readiness.ready_for_pilot) {
            list.push('Ready for pilot.');
        }
        return list;
    };

    const nextActions = getNextRecommendations();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b ppos-border pb-4">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Pilot Onboarding Readiness</h3>
                <button 
                    onClick={loadReadiness}
                    className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    title="Refresh readiness state"
                >
                    <ArrowPathIcon className="w-4 h-4" />
                </button>
            </div>

            {/* Status overview banner */}
            <div className={`p-4 border flex items-start gap-4 ${
                readiness.ready_for_pilot 
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-400' 
                    : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-400'
            }`}>
                {readiness.ready_for_pilot ? (
                    <CheckCircleIcon className="w-8 h-8 shrink-0 text-emerald-600" />
                ) : (
                    <XCircleIcon className="w-8 h-8 shrink-0 text-amber-600" />
                )}
                <div>
                    <h4 className="text-sm font-black uppercase tracking-wider">
                        {readiness.ready_for_pilot ? 'Onboarding Complete' : 'Profile Incomplete'}
                    </h4>
                    <p className="text-xs mt-1">
                        Onboarding Status: <strong className="uppercase">{readiness.onboarding_status}</strong>
                    </p>
                    <p className="text-xs mt-0.5">
                        {readiness.ready_for_pilot 
                            ? 'Madrid Premium Print satisfies all validation criteria and is certified to receive pilot production jobs.' 
                            : 'This printer is currently blocked from receiving production queue dispatches due to missing configurations.'}
                    </p>
                </div>
            </div>

            {/* Counts matrix */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Active Machines', count: readiness.capability_summary.machines, icon: CpuChipIcon },
                    { label: 'Media Catalog', count: readiness.capability_summary.media, icon: RectangleStackIcon },
                    { label: 'Policy Profiles', count: readiness.capability_summary.policy_profiles, icon: ShieldCheckIcon },
                    { label: 'SLA Profiles', count: readiness.capability_summary.sla_profiles, icon: ClockIcon },
                ].map((item, idx) => (
                    <div key={idx} className="p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                        <div>
                            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">{item.label}</span>
                            <span className="text-xl font-black text-zinc-900 dark:text-zinc-100">{item.count}</span>
                        </div>
                        <item.icon className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
                    </div>
                ))}
            </div>

            {/* Blockers & Warnings */}
            {!readiness.ready_for_pilot && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {readiness.blocking_reasons.length > 0 && (
                        <div className="space-y-2">
                            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Blocking Issues</span>
                            <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 divide-y divide-zinc-200 dark:divide-zinc-800">
                                {readiness.blocking_reasons.map((r, i) => (
                                    <div key={i} className="p-3 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                                        <XCircleIcon className="w-4 h-4 shrink-0" />
                                        <span>{r.replace(/_/g, ' ')}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {readiness.warnings.length > 0 && (
                        <div className="space-y-2">
                            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Onboarding Warnings</span>
                            <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 divide-y divide-zinc-200 dark:divide-zinc-800">
                                {readiness.warnings.map((w, i) => (
                                    <div key={i} className="p-3 text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                                        <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                                        <span>{w.replace(/_/g, ' ')}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Next Recommended Actions */}
            <div className="space-y-2">
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Recommended Next Actions</span>
                <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-2">
                    {nextActions.map((action, i) => (
                        <div key={i} className="flex items-center gap-2.5 text-xs text-zinc-700 dark:text-zinc-300 font-bold p-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                            <div className="w-1.5 h-1.5 bg-primary rounded-none" />
                            <span>{action}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
