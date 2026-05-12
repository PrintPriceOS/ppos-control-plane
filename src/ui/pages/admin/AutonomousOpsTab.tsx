import React, { useState, useEffect } from "react";
import {
    CpuChipIcon,
    PlayIcon,
    PauseIcon,
    ArrowPathIcon,
    CheckBadgeIcon,
    ExclamationTriangleIcon,
    ViewfinderCircleIcon,
    ClockIcon,
    ChartPieIcon,
    BoltIcon
} from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";

export const AutonomousOpsTab: React.FC = () => {
    const [pipelines, setPipelines] = useState<any[]>([]);
    const [selectedPipeline, setSelectedPipeline] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState<any>(null);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const [pData, mData] = await Promise.all([
                adminApi.getAutonomyPipelines(),
                adminApi.getAutonomyMetrics()
            ]);
            setPipelines(Array.isArray(pData) ? pData : []);
            setMetrics(mData || null);
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch autonomy data:', err);
            setPipelines([]);
        }
    };

    const fetchDetail = async (id: string) => {
        try {
            const data = await adminApi.getAutonomyPipelineDetail(id);
            setSelectedPipeline(data);
        } catch (err) {
            console.error('Failed to fetch pipeline detail:', err);
        }
    };

    const handleAction = async (id: string, action: string) => {
        try {
            if (action === 'pause') {
                await adminApi.pauseAutonomyPipeline(id, 'Manual intervention');
            } else if (action === 'resume') {
                await adminApi.resumeAutonomyPipeline(id);
            } else if (action === 'retry-step') {
                await adminApi.retryAutonomyPipelineStep(id);
            }
            fetchDetail(id);
            fetchData();
        } catch (err) {
            console.error(`Failed to ${action} pipeline:`, err);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                        <CpuChipIcon className="w-6 h-6 text-indigo-600" />
                        Autonomous Operations
                    </h2>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Real-time production orchestration & state monitoring.</p>
                </div>
                <div className="flex gap-2">
                    <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-none border border-emerald-100 dark:border-emerald-900/30 text-[10px] font-black uppercase tracking-widest">
                        <BoltIcon className="w-3 h-3" /> System Live
                    </div>
                </div>
            </div>

            {/* Global Metrics */}
            {metrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="ppos-surface p-4 rounded-none border ppos-border shadow-none">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Jobs</div>
                        <div className="text-2xl font-black text-slate-900 dark:text-white">{metrics.total_jobs}</div>
                    </div>
                    <div className="ppos-surface p-4 rounded-none border ppos-border shadow-none">
                        <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Autonomous Rate</div>
                        <div className="text-2xl font-black text-slate-900 dark:text-white">{((metrics.completed_autonomously / metrics.total_jobs) * 100 || 0).toFixed(1)}%</div>
                    </div>
                    <div className="ppos-surface p-4 rounded-none border ppos-border shadow-none">
                        <div className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Interventions</div>
                        <div className="text-2xl font-black text-slate-900 dark:text-white">{metrics.requiring_intervention}</div>
                    </div>
                    <div className="ppos-surface p-4 rounded-none border ppos-border shadow-none">
                        <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Failures</div>
                        <div className="text-2xl font-black text-slate-900 dark:text-white">{metrics.failed_pipelines}</div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Pipelines List */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="ppos-surface rounded-none border ppos-border overflow-hidden shadow-none">
                        <div className="p-4 ppos-surface-muted border-b ppos-border flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Pipelines</span>
                        </div>
                        <div className="divide-y ppos-divide max-h-[600px] overflow-y-auto">
                            {pipelines.map((p, i) => (
                                <button
                                    key={i}
                                    onClick={() => fetchDetail(p.id)}
                                    className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${selectedPipeline?.id === p.id ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="font-bold text-slate-900 dark:text-white truncate pr-4 text-xs">{p.job_name || 'Autonomous Job'}</div>
                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-none border uppercase tracking-wider ${
                                            p.pipeline_status === 'COMPLETED' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30' :
                                            p.pipeline_status === 'FAILED' ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30' :
                                            p.pipeline_status === 'PAUSED' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30' : 
                                            'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30'
                                        }`}>
                                            {p.pipeline_status}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                                        <ClockIcon className="w-3 h-3" /> {p.pipeline_state.replace(/_/g, ' ')}
                                    </div>
                                    <div className="mt-2 h-1 bg-slate-100 dark:bg-slate-800 rounded-none overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-500 ${p.pipeline_status === 'FAILED' ? 'bg-red-400' : 'bg-indigo-500'}`}
                                            style={{ width: `${((pipelines.indexOf(p) + 1) / pipelines.length) * 100}%` }}
                                        />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Pipeline Inspector */}
                <div className="lg:col-span-2">
                    {selectedPipeline ? (
                        <div className="space-y-6">
                            <div className="ppos-surface rounded-none border ppos-border p-6 shadow-none">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                                            <ViewfinderCircleIcon className="w-5 h-5 text-indigo-500" />
                                            Pipeline Timeline
                                        </h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ID: {selectedPipeline.id}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {selectedPipeline.pipeline_status === 'RUNNING' ? (
                                            <button onClick={() => handleAction(selectedPipeline.id, 'pause')} className="p-2 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-none border border-amber-100 dark:border-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors">
                                                <PauseIcon className="w-5 h-5" />
                                            </button>
                                        ) : (
                                            <button onClick={() => handleAction(selectedPipeline.id, 'resume')} className="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-none border border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors">
                                                <PlayIcon className="w-5 h-5" />
                                            </button>
                                        )}
                                        {selectedPipeline.pipeline_status === 'FAILED' && (
                                            <button onClick={() => handleAction(selectedPipeline.id, 'retry-step')} className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-none border border-indigo-100 dark:border-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-colors">
                                                <ArrowPathIcon className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-6 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
                                    {selectedPipeline.events.map((e: any, i: number) => (
                                        <div key={i} className="relative pl-12">
                                            <div className={`absolute left-0 top-0 w-10 h-10 rounded-none flex items-center justify-center border-2 ${
                                                e.event_type === 'STEP_FAILED' ? 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/30' :
                                                e.event_type === 'STEP_COMPLETED' ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/30' : 
                                                'ppos-surface ppos-border'
                                            }`}>
                                                {e.event_type === 'STEP_FAILED' ? <ExclamationTriangleIcon className="w-5 h-5 text-red-500" /> :
                                                    e.event_type === 'STEP_COMPLETED' ? <CheckBadgeIcon className="w-5 h-5 text-emerald-500" /> :
                                                        <ClockIcon className="w-5 h-5 text-slate-400" />}
                                            </div>
                                            <div className="p-4 rounded-none border ppos-border ppos-surface-muted">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">{e.event_type}</span>
                                                    <span className="text-[9px] text-slate-400 font-medium">{new Date(e.created_at).toLocaleTimeString()}</span>
                                                </div>
                                                <div className="text-xs font-bold text-slate-600 dark:text-zinc-300">{e.step_name.replace(/_/g, ' ')}</div>
                                                {e.metadata_json && Object.keys(e.metadata_json).length > 0 && (
                                                    <pre className="mt-2 p-2 bg-slate-900 text-slate-300 text-[9px] rounded-none overflow-x-auto">
                                                        {JSON.stringify(e.metadata_json, null, 2)}
                                                    </pre>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[400px] ppos-surface-muted rounded-none border-2 border-dashed ppos-border flex flex-col items-center justify-center text-slate-400 space-y-3">
                            <ChartPieIcon className="w-12 h-12 opacity-20" />
                            <p className="font-black uppercase text-xs tracking-widest opacity-40">Select a pipeline to inspect state</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
