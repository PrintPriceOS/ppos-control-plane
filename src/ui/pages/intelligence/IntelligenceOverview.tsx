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
    const [counts, setCounts] = useState<any>(null);
    const [sourceStatus, setSourceStatus] = useState<string>("LIVE_COMPUTED");
    const [anomalies, setAnomalies] = useState<any[]>([]);
    const [insights, setInsights] = useState<any[]>([]);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        adminFetch<any>('/api/admin/intelligence/overview')
        .then(data => {
            if (data.ok) {
                setSummary(data.summary);
                setCounts(data.counts);
                setSourceStatus(data.source_status || "LIVE_COMPUTED");
                setAnomalies(data.anomalies || []);
                setInsights(data.insights || []);
                setRecommendations(data.recommendations || []);
            }
            setLoading(false);
        })
        .catch(() => setLoading(false));
    }, []);

    const isUnavailable = sourceStatus.includes("UNAVAILABLE");

    const cards = [
        { 
            title: 'Anomalies', 
            count: isUnavailable ? 'N/A' : (counts?.anomalies ?? summary?.anomalyCount ?? 0), 
            icon: ExclamationTriangleIcon, 
            color: 'text-amber-600 dark:text-amber-400', 
            bg: 'bg-amber-50 dark:bg-amber-950/30',
            link: '/intelligence/anomalies',
            desc: 'Unusual patterns in jobs or logs'
        },
        { 
            title: 'Insights', 
            count: isUnavailable ? 'N/A' : (counts?.insights ?? summary?.insightCount ?? 0), 
            icon: CpuChipIcon, 
            color: 'text-blue-600 dark:text-blue-400', 
            bg: 'bg-blue-50 dark:bg-blue-950/30',
            link: '/intelligence/insights',
            desc: 'Explained operational signals'
        },
        { 
            title: 'Recommendations', 
            count: isUnavailable ? 'N/A' : (counts?.recommendations ?? summary?.recommendationCount ?? 0), 
            icon: WrenchScrewdriverIcon, 
            color: 'text-emerald-600 dark:text-emerald-400', 
            bg: 'bg-emerald-50 dark:bg-emerald-950/30',
            link: '/intelligence/recommendations',
            desc: 'Advisory manual actions'
        }
    ];

    if (loading) return <div className="animate-pulse space-y-8">
        <div className="h-32 ppos-surface-muted rounded-none" />
        <div className="grid grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="h-48 ppos-surface-muted rounded-none" />)}
        </div>
    </div>;

    return (
        <div className="space-y-6 font-manrope">
            {/* Header section - Compact & Industrial */}
            <div className="relative overflow-hidden rounded-none bg-slate-900 px-8 py-8 text-white shadow-none border border-slate-800">
                <div className="relative z-10 max-w-2xl">
                    <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                            <BoltIcon className="w-8 h-8 text-primary" />
                            Intelligence Layer
                        </h2>
                        <span className={`text-[10px] font-mono px-2 py-0.5 font-bold uppercase border ${
                            isUnavailable 
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}>
                            {sourceStatus}
                        </span>
                    </div>
                    <p className="text-slate-400 text-sm font-medium leading-tight">
                        Continuous telemetry analysis across EU-WEST-1 federation clusters. 
                        Live anomaly detection, structural job parsing, and explainable operational signals.
                    </p>
                </div>
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-none blur-[80px]" />
                <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-blue-500/5 rounded-none blur-[60px]" />
            </div>

            {/* Source Unavailable Warning Banner */}
            {isUnavailable && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-none flex items-center gap-4 text-xs text-amber-800 dark:text-amber-300 transition-all">
                    <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    <div>
                        <span className="font-bold uppercase tracking-wider block">Primary Intelligence Feed Unavailable</span>
                        <span>Source databases are currently unpopulated with real runtime preflight jobs. Displaying fallback platform layout markers until continuous integration payloads land.</span>
                    </div>
                </div>
            )}

            {/* Stats Grid - High Density */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {cards.map((card) => (
                    <Link 
                        key={card.title} 
                        to={card.link}
                        className="group relative p-6 ppos-surface border ppos-border rounded-none shadow-none hover:border-primary/40 transition-all duration-300 overflow-hidden block"
                    >
                        <div className={`w-12 h-12 ${card.bg} ${card.color} rounded-none flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}>
                            <card.icon className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-4xl font-black text-slate-900 dark:text-white tabular-nums tracking-tighter">
                                {card.count}
                            </h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {card.title}
                            </p>
                        </div>
                        <p className="mt-4 text-slate-500 dark:text-zinc-400 text-xs font-medium leading-snug">
                            {card.desc}
                        </p>
                        <div className="absolute right-6 bottom-6 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowRightIcon className="w-5 h-5 text-primary" />
                        </div>
                    </Link>
                ))}
            </div>

            {/* Top 5 Lists Grid Below Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
                {/* Top 5 Anomalies */}
                <div className="ppos-surface border ppos-border p-6 rounded-none space-y-4 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between border-b ppos-border pb-3 mb-4">
                            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                                Top Anomalies
                            </h4>
                            <Link to="/intelligence/anomalies" className="text-[10px] text-primary font-bold hover:underline">View All</Link>
                        </div>
                        <div className="space-y-3">
                            {anomalies.slice(0, 5).map((a, idx) => (
                                <div key={a.id || idx} className="text-xs border-l-2 border-amber-500 pl-3 py-1 space-y-0.5">
                                    <div className="flex items-center justify-between font-bold text-slate-900 dark:text-zinc-200">
                                        <span className="truncate max-w-[180px]">{a.type}</span>
                                        <span className={`text-[9px] px-1.5 py-0.2 uppercase font-black border ${
                                            a.severity === 'CRITICAL' ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-950/30 dark:border-rose-900/30' : 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/30'
                                        }`}>{a.severity}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1">{a.summary}</p>
                                </div>
                            ))}
                            {anomalies.length === 0 && (
                                <p className="text-slate-400 text-[11px] italic text-center py-6 border border-dashed ppos-border">No active operational anomalies detected</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Top 5 Insights */}
                <div className="ppos-surface border ppos-border p-6 rounded-none space-y-4 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between border-b ppos-border pb-3 mb-4">
                            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                <CpuChipIcon className="w-4 h-4 text-blue-500" />
                                Top Insights
                            </h4>
                            <Link to="/intelligence/insights" className="text-[10px] text-primary font-bold hover:underline">View All</Link>
                        </div>
                        <div className="space-y-3">
                            {insights.slice(0, 5).map((ins, idx) => (
                                <div key={ins.id || idx} className="text-xs border-l-2 border-blue-500 pl-3 py-1 space-y-0.5">
                                    <div className="font-bold text-slate-900 dark:text-zinc-200 truncate">
                                        {ins.summary}
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">{ins.explanation}</p>
                                </div>
                            ))}
                            {insights.length === 0 && (
                                <p className="text-slate-400 text-[11px] italic text-center py-6 border border-dashed ppos-border">No actionable insights computed</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Top 5 Recommendations */}
                <div className="ppos-surface border ppos-border p-6 rounded-none space-y-4 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between border-b ppos-border pb-3 mb-4">
                            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                <WrenchScrewdriverIcon className="w-4 h-4 text-emerald-500" />
                                Top Recommendations
                            </h4>
                            <Link to="/intelligence/recommendations" className="text-[10px] text-primary font-bold hover:underline">View All</Link>
                        </div>
                        <div className="space-y-3">
                            {recommendations.slice(0, 5).map((rec, idx) => (
                                <div key={rec.id || idx} className="text-xs border-l-2 border-emerald-500 pl-3 py-1 space-y-0.5">
                                    <div className="flex items-center justify-between font-bold text-slate-900 dark:text-zinc-200 mb-1">
                                        <span className="truncate max-w-[150px]">{rec.summary}</span>
                                        <span className="text-[8px] font-mono font-bold text-slate-500 dark:text-zinc-400 uppercase bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 border ppos-border">{rec.actionMode}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">{rec.rationale}</p>
                                </div>
                            ))}
                            {recommendations.length === 0 && (
                                <p className="text-slate-400 text-[11px] italic text-center py-6 border border-dashed ppos-border">No advisory recommendations triggered</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Critical Anomalies Block */}
            {summary?.criticalCount > 0 && (
                <div className="p-8 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-none flex items-center gap-6">
                    <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-none flex items-center justify-center flex-shrink-0 animate-pulse">
                        <ExclamationTriangleIcon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-lg font-black text-rose-900 dark:text-rose-300">Critical Anomalies Detected</h4>
                        <p className="text-rose-700 dark:text-rose-400 font-medium">{summary.criticalCount} operational cluster(s) require immediate SCADA operator attention.</p>
                    </div>
                    <Link 
                        to="/intelligence/anomalies" 
                        className="px-6 py-3 bg-rose-600 text-white font-bold rounded-none hover:bg-rose-700 transition-colors shadow-none uppercase tracking-wider text-xs"
                    >
                        Review Now
                    </Link>
                </div>
            )}
        </div>
    );
};
