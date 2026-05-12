import React, { useEffect, useState } from 'react';
import { WrenchScrewdriverIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { IntelligenceDetailDrawer } from '../../components/IntelligenceDetailDrawer';
import { adminFetch } from '../../lib/adminApi';

export const RecommendationList: React.FC = () => {
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRec, setSelectedRec] = useState<any>(null);

    useEffect(() => {
        adminFetch<any>('/api/admin/intelligence/recommendations')
        .then(data => {
            if (data.ok) setRecommendations(data.recommendations);
            setLoading(false);
        })
        .catch(() => setLoading(false));
    }, []);

    if (loading) return <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-32 ppos-surface-muted rounded-none" />)}
    </div>;

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <WrenchScrewdriverIcon className="w-8 h-8 text-emerald-500" />
                        Platform Recommendations
                    </h2>
                    <p className="text-slate-500 dark:text-zinc-400 font-medium mt-1">Manual advisories based on operational insights. No autonomous actions taken.</p>
                </div>
            </div>

            <div className="space-y-4">
                {recommendations.map((rec) => (
                    <div 
                        key={rec.id}
                        onClick={() => setSelectedRec(rec)}
                        className="group flex flex-col md:flex-row items-start md:items-center gap-6 p-8 ppos-surface border ppos-border rounded-none shadow-none hover:border-primary/40 transition-all duration-300 cursor-pointer"
                    >
                        <div className={`p-4 rounded-none ${
                            rec.severity === 'HIGH' ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                        }`}>
                            <WrenchScrewdriverIcon className="w-8 h-8" />
                        </div>

                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-4">
                                <h4 className="text-xl font-black text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                                    {rec.summary}
                                </h4>
                                <span className="ppos-surface-muted text-slate-500 dark:text-zinc-400 text-[10px] font-black px-2 py-0.5 rounded-none uppercase border ppos-border">
                                    {rec.actionMode}
                                </span>
                            </div>
                            <p className="text-slate-500 dark:text-zinc-400 font-medium line-clamp-1">{rec.rationale}</p>
                        </div>

                        <div className="flex items-center gap-3 text-slate-400 dark:text-zinc-500 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                            <span className="text-sm font-bold">Review Evidence</span>
                            <ChevronRightIcon className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                        </div>
                    </div>
                ))}

                {recommendations.length === 0 && (
                    <div className="py-20 text-center ppos-surface-muted rounded-none border-2 border-dashed ppos-border">
                        <p className="text-slate-400 font-bold uppercase tracking-widest italic-text-off">No active recommendations for current platform state</p>
                    </div>
                )}
            </div>

            <IntelligenceDetailDrawer 
                isOpen={!!selectedRec}
                onClose={() => setSelectedRec(null)}
                data={selectedRec}
                type="recommendation"
            />
        </div>
    );
};
