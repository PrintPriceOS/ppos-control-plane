import React, { useEffect, useState } from 'react';
import { WrenchScrewdriverIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { IntelligenceDetailDrawer } from '../../components/IntelligenceDetailDrawer';

export const RecommendationList: React.FC = () => {
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRec, setSelectedRec] = useState<any>(null);

    useEffect(() => {
        fetch('/api/admin/intelligence/recommendations', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('ppos_token') || 'admin-secret'}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.ok) setRecommendations(data.recommendations);
            setLoading(false);
        })
        .catch(() => setLoading(false));
    }, []);

    if (loading) return <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-[2rem]" />)}
    </div>;

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <WrenchScrewdriverIcon className="w-8 h-8 text-emerald-500" />
                        Platform Recommendations
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">Manual advisories based on operational insights. No autonomous actions taken.</p>
                </div>
            </div>

            <div className="space-y-4">
                {recommendations.map((rec) => (
                    <div 
                        key={rec.id}
                        onClick={() => setSelectedRec(rec)}
                        className="group flex flex-col md:flex-row items-start md:items-center gap-6 p-8 bg-white border border-slate-200 rounded-[2.5rem] hover:shadow-xl hover:shadow-slate-100 transition-all duration-300 cursor-pointer"
                    >
                        <div className={`p-4 rounded-2xl ${
                            rec.severity === 'HIGH' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'
                        }`}>
                            <WrenchScrewdriverIcon className="w-8 h-8" />
                        </div>

                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-4">
                                <h4 className="text-xl font-black text-slate-900 group-hover:text-primary transition-colors">
                                    {rec.summary}
                                </h4>
                                <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                    {rec.actionMode}
                                </span>
                            </div>
                            <p className="text-slate-500 font-medium line-clamp-1">{rec.rationale}</p>
                        </div>

                        <div className="flex items-center gap-3 text-slate-400 group-hover:text-slate-900 transition-colors">
                            <span className="text-sm font-bold">Review Evidence</span>
                            <ChevronRightIcon className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                        </div>
                    </div>
                ))}

                {recommendations.length === 0 && (
                    <div className="py-20 text-center bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
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
