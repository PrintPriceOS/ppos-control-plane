import React, { useEffect, useState } from 'react';
import { CpuChipIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { IntelligenceDetailDrawer } from '../../components/IntelligenceDetailDrawer';

export const InsightList: React.FC = () => {
    const [insights, setInsights] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedInsight, setSelectedInsight] = useState<any>(null);

    useEffect(() => {
        fetch('/api/admin/intelligence/insights', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('ppos_token') || 'admin-secret'}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.ok) setInsights(data.insights);
            setLoading(false);
        })
        .catch(() => setLoading(false));
    }, []);

    if (loading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-48 bg-slate-100 rounded-[2rem]" />)}
    </div>;

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                    <CpuChipIcon className="w-8 h-8 text-blue-500" />
                    Explainable Insights
                </h2>
                <p className="text-slate-500 font-medium mt-1">High-level interpretation of raw operational data and contract posture.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {insights.map((insight) => (
                    <div 
                        key={insight.id}
                        onClick={() => setSelectedInsight(insight)}
                        className="group relative p-8 bg-white border border-slate-200 rounded-[2rem] hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 cursor-pointer overflow-hidden"
                    >
                        <div className="flex items-start justify-between mb-6">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
                                insight.severity === 'HIGH' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                            }`}>
                                {insight.category} • {insight.severity}
                            </span>
                            <span className="text-[10px] font-black text-slate-400 font-mono">
                                {insight.entityId}
                            </span>
                        </div>
                        
                        <h4 className="text-xl font-bold text-slate-900 mb-3 leading-tight">
                            {insight.summary}
                        </h4>
                        <p className="text-slate-500 text-sm font-medium line-clamp-2">
                            {insight.explanation}
                        </p>

                        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-blue-500 rounded-full" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    {insight.relatedAnomalyIds.length} Evidence Signals
                                </span>
                            </div>
                            <MagnifyingGlassIcon className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
                        </div>
                    </div>
                ))}

                {insights.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
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
