import React, { useEffect, useState } from 'react';
import { 
  BoltIcon, 
  ExclamationTriangleIcon, 
  CpuChipIcon, 
  WrenchScrewdriverIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

export const IntelligenceOverview: React.FC = () => {
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/intelligence/overview', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('ppos_token') || 'admin-secret'}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.ok) setSummary(data.summary);
            setLoading(false);
        })
        .catch(() => setLoading(false));
    }, []);

    const cards = [
        { 
            title: 'Anomalies', 
            count: summary?.anomalyCount || 0, 
            icon: ExclamationTriangleIcon, 
            color: 'text-amber-600', 
            bg: 'bg-amber-50',
            link: '/intelligence/anomalies',
            desc: 'Unusual patterns in jobs or logs'
        },
        { 
            title: 'Insights', 
            count: summary?.insightCount || 0, 
            icon: CpuChipIcon, 
            color: 'text-blue-600', 
            bg: 'bg-blue-50',
            link: '/intelligence/insights',
            desc: 'Explained operational signals'
        },
        { 
            title: 'Recommendations', 
            count: summary?.recommendationCount || 0, 
            icon: WrenchScrewdriverIcon, 
            color: 'text-emerald-600', 
            bg: 'bg-emerald-50',
            link: '/intelligence/recommendations',
            desc: 'Advisory manual actions'
        }
    ];

    if (loading) return <div className="animate-pulse space-y-8">
        <div className="h-32 bg-slate-100 rounded-3xl" />
        <div className="grid grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="h-48 bg-slate-100 rounded-3xl" />)}
        </div>
    </div>;

    return (
        <div className="space-y-10">
            {/* Header section with glassmorphism */}
            <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 px-10 py-12 text-white shadow-2xl">
                <div className="relative z-10 max-w-2xl">
                    <h2 className="text-4xl font-black tracking-tight mb-4 flex items-center gap-4">
                        <BoltIcon className="w-10 h-10 text-primary" />
                        Intelligence Layer
                    </h2>
                    <p className="text-slate-400 text-lg font-medium leading-relaxed">
                        Continuous analysis of jobs, governance, and tenant posture. 
                        Batch A: Anomaly detection and explainable insights.
                    </p>
                </div>
                <div className="absolute -right-20 -top-20 w-96 h-96 bg-primary/20 rounded-full blur-[100px]" />
                <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-blue-500/10 rounded-full blur-[80px]" />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {cards.map((card) => (
                    <Link 
                        key={card.title} 
                        to={card.link}
                        className="group relative p-8 bg-white border border-slate-200 rounded-[2rem] hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 overflow-hidden"
                    >
                        <div className={`w-14 h-14 ${card.bg} ${card.color} rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110`}>
                            <card.icon className="w-8 h-8" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-5xl font-black text-slate-900 tabular-nums">
                                {card.count}
                            </h3>
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                                {card.title}
                            </p>
                        </div>
                        <p className="mt-6 text-slate-500 text-sm font-medium">
                            {card.desc}
                        </p>
                        <div className="absolute right-8 bottom-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowRightIcon className="w-6 h-6 text-primary" />
                        </div>
                    </Link>
                ))}
            </div>

            {/* Critical Anomalies Block */}
            {summary?.criticalCount > 0 && (
                <div className="p-8 bg-rose-50 border border-rose-100 rounded-[2rem] flex items-center gap-6">
                    <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse">
                        <ExclamationTriangleIcon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-lg font-black text-rose-900">Critical Anomalies Detected</h4>
                        <p className="text-rose-700 font-medium">{summary.criticalCount} cluster(s) require immediate operator attention.</p>
                    </div>
                    <Link 
                        to="/intelligence/anomalies" 
                        className="px-6 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20"
                    >
                        Review Now
                    </Link>
                </div>
            )}
        </div>
    );
};
