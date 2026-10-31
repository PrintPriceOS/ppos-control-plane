import React, { useEffect, useState } from 'react';
import { CpuChipIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { IntelligenceDetailDrawer } from '../../components/IntelligenceDetailDrawer';
import { adminFetch } from '../../lib/adminApi';

export const InsightList: React.FC = () => {
    const [insights, setInsights] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedInsight, setSelectedInsight] = useState<any>(null);

    useEffect(() => {
        adminFetch<any>('/api/admin/intelligence/insights')
        .then(data => {
            if (data.ok) setInsights(data.insights);
            setLoading(false);
        })
        .catch(() => setLoading(false));
    }, []);

    if (loading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-48 ppos-surface-muted rounded-none" />)}
    </div>;

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                    <CpuChipIcon className="w-8 h-8 text-blue-500" />
                    Explainable Insights
                </h2>
                <p className="text-slate-500 dark:text-zinc-400 font-medium mt-1">High-level interpretation of raw operational data and contract posture.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {insights.map((insight) => (
                    <div 
                        key={insight.id}
                        onClick={() => setSelectedInsight(insight)}
                        className="group relative p-8 ppos-surface border ppos-border rounded-none shadow-none hover:border-primary/40 transition-all duration-300 cursor-pointer overflow-hidden"
                    >
                        <div className="flex items-start justify-between mb-6">
                            <span className={`px-2.5 py-1 rounded-none text-[10px] font-black uppercase border ${
                                insight.severity === 'HIGH' ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-900/30' : 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30'
                            }`}>
                                {insight.category} • {insight.severity}
                            </span>
                            <span className="text-[10px] font-black text-slate-400 font-mono">
                                {insight.entityId}
                            </span>
                        </div>
                        
                        <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-3 leading-tight">
                            {insight.summary}
                        </h4>
                        <p className="text-slate-500 dark:text-zinc-400 text-sm font-medium line-clamp-2">
                            {insight.explanation}
                        </p>

                        <div className="mt-8 pt-6 border-t ppos-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-blue-500 rounded-none" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    {insight.relatedAnomalyIds.length} Evidence Signals
                                </span>
                            </div>
                            <MagnifyingGlassIcon className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
                        </div>
                    </div>
                ))}

                {insights.length === 0 && (
                    <div className="col-span-full py-20 text-center ppos-surface-muted rounded-none border-2 border-dashed ppos-border">
                        <p className="text-slate-400 font-bold uppercase tracking-widest italic-text-off">No insights generated from current baseline</p>
                    </div>
                )}
            </div>

            <IntelligenceDetailDrawer 
                isOpen={!!selectedInsight}
                onClose={() => setSelectedInsight(null)}
                data={selectedInsight}
                type="insight"
            />
        </div>
    );
};
