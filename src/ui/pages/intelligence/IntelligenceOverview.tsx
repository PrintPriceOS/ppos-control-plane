import React, { useEffect, useState } from 'react';
import { 
  BoltIcon, 
  ExclamationTriangleIcon, 
  CpuChipIcon, 
  WrenchScrewdriverIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

import { adminFetch } from '../../lib/adminApi';

export const IntelligenceOverview: React.FC = () => {
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        adminFetch<any>('/api/admin/intelligence/overview')
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
        <div className="h-32 bg-slate-100 rounded-none" />
        <div className="grid grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="h-48 bg-slate-100 rounded-none" />)}
        </div>
    </div>;

    return (
        <div className="space-y-6">
            {/* Header section - Compact & Industrial */}
            <div className="relative overflow-hidden rounded-none bg-slate-900 px-8 py-8 text-white shadow-xl">
                <div className="relative z-10 max-w-2xl">
                    <h2 className="text-2xl font-black tracking-tight mb-2 flex items-center gap-3">
                        <BoltIcon className="w-8 h-8 text-primary" />
                        Intelligence Layer
                    </h2>
                    <p className="text-slate-400 text-sm font-medium leading-tight">
                        Continuous telemetry analysis across EU-WEST-1 federation clusters. 
                        Live anomaly detection and explainable operational signals.
                    </p>
                </div>
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-none blur-[80px]" />
                <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-blue-500/5 rounded-none blur-[60px]" />
            </div>

            {/* Stats Grid - High Density */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {cards.map((card) => (
                    <Link 
                        key={card.title} 
                        to={card.link}
                        className="group relative p-6 bg-white border border-slate-200 rounded-none hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-300 overflow-hidden"
                    >
                        <div className={`w-12 h-12 ${card.bg} ${card.color} rounded-none flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}>
                            <card.icon className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-4xl font-black text-slate-900 tabular-nums tracking-tighter">
                                {card.count}
                            </h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {card.title}
                            </p>
                        </div>
                        <p className="mt-4 text-slate-500 text-xs font-medium leading-snug">
                            {card.desc}
                        </p>
                        <div className="absolute right-6 bottom-6 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowRightIcon className="w-5 h-5 text-primary" />
                        </div>
                    </Link>
                ))}
            </div>

            {/* Critical Anomalies Block */}
            {summary?.criticalCount > 0 && (
                <div className="p-8 bg-rose-50 border border-rose-100 rounded-none-[2rem] flex items-center gap-6">
                    <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-none flex items-center justify-center flex-shrink-0 animate-pulse">
                        <ExclamationTriangleIcon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-lg font-black text-rose-900">Critical Anomalies Detected</h4>
                        <p className="text-rose-700 font-medium">{summary.criticalCount} cluster(s) require immediate operator attention.</p>
                    </div>
                    <Link 
                        to="/intelligence/anomalies" 
                        className="px-6 py-3 bg-rose-600 text-white font-bold rounded-none hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20"
                    >
                        Review Now
                    </Link>
                </div>
            )}
        </div>
    );
};
