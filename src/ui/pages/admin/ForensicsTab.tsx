// pages/admin/ForensicsTab.tsx
import React, { useState } from "react";
import { getForensicTimeline } from "../../lib/adminApi";
import { 
    MagnifyingGlassIcon, 
    FingerPrintIcon, 
    LinkIcon,
    ArrowPathIcon,
    DocumentMagnifyingGlassIcon,
    ShieldCheckIcon
} from "@heroicons/react/24/outline";

export const ForensicsTab: React.FC = () => {
    const [jobId, setJobId] = useState("");
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!jobId) return;
        
        setLoading(true);
        setError(null);
        try {
            const res = await getForensicTimeline(jobId);
            setData(res);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-slide-fade">
            {/* Search Interface */}
            <div className="glass rounded-2xl border border-white p-6 shadow-sm">
                <form onSubmit={handleSearch} className="flex gap-4">
                    <div className="flex-1 relative">
                        <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Enter Job ID for Forensic Reconstruction..." 
                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono text-sm"
                            value={jobId}
                            onChange={(e) => setJobId(e.target.value)}
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={loading || !jobId}
                        className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        {loading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <FingerPrintIcon className="w-5 h-5" />}
                        Stitch Trace
                    </button>
                </form>
            </div>

            {error && (
                <div className="p-6 rounded-2xl bg-red-50 border border-red-100 flex items-center gap-4 text-red-700">
                    <ShieldCheckIcon className="w-8 h-8 text-red-400" />
                    <div>
                        <div className="font-bold">Forensic Link Missing</div>
                        <div className="text-sm opacity-80">{error}</div>
                    </div>
                </div>
            )}

            {data && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Trace Metadata */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="glass rounded-2xl border border-white p-6 shadow-sm space-y-4">
                            <div className="flex items-center gap-2 text-slate-400 mb-2">
                                <DocumentMagnifyingGlassIcon className="w-5 h-5" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Trace Passport</span>
                            </div>
                            <DetailRow label="Trace ID" value={data.traceId || 'N/A'} mono />
                            <DetailRow label="Job ID" value={data.jobId} mono />
                            <DetailRow label="Security State" value={data.state} highlight />
                            <div className="pt-4 border-t border-slate-100">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Identity Proof</div>
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                                    <ShieldCheckIcon className="w-4 h-4 text-emerald-600" />
                                    <span className="text-[10px] font-bold text-emerald-700">Forensic-Grade Audit</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Timeline Reconstruction */}
                    <div className="lg:col-span-3">
                        <div className="glass rounded-2xl border border-white p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-2">
                                    <LinkIcon className="w-5 h-5 text-slate-400" />
                                    <div className="font-bold text-slate-800 text-sm tracking-tight">Causality Timeline Reconstruction</div>
                                </div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cross-Service Trace Stitching</div>
                            </div>

                            <div className="relative space-y-8 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                                {data.timeline.map((event: any, idx: number) => (
                                    <div key={idx} className="relative pl-12">
                                        <div className="absolute left-0 top-1 w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center z-10">
                                            <div className={`w-3 h-3 rounded-full ${event.event.includes('FAIL') || event.event.includes('ERROR') ? 'bg-red-500' : 'bg-blue-500'}`} />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <div className="text-sm font-black text-slate-800 tracking-tight">{event.event}</div>
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tabular-nums">{new Date(event.timestamp).toLocaleString()}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase bg-slate-100 px-2 py-0.5 rounded">{event.actor}</span>
                                                {event.metadata.requestId && (
                                                    <span className="text-[10px] font-mono text-slate-400 truncate">REQ: {event.metadata.requestId}</span>
                                                )}
                                            </div>
                                            {event.metadata && Object.keys(event.metadata).length > 0 && (
                                                <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] font-mono text-slate-600 overflow-x-auto whitespace-pre">
                                                    {JSON.stringify(event.metadata, null, 2)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const DetailRow = ({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) => (
    <div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
        <div className={`text-xs mt-0.5 ${mono ? 'font-mono' : 'font-black'} ${highlight ? 'text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full inline-block' : 'text-slate-800'}`}>
            {value}
        </div>
    </div>
);
