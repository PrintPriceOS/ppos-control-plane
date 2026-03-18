import React from 'react';
import { CommandLineIcon, CpuChipIcon, ServerStackIcon, TagIcon } from "@heroicons/react/24/outline";

export const RuntimeContextPage: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Runtime Context</h1>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">System tiers, isolation modes, and OS telemetry.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Deployment ID', value: 'ppos-eu-w1-prod', icon: TagIcon },
                    { label: 'Service Tier', value: 'Enterprise Zero-E', icon: ServerStackIcon },
                    { label: 'Isolation Mode', value: 'Strict Tenant-Bound', icon: ShieldCheckIcon },
                    { label: 'OS Version', value: 'v2.1.0-alpha', icon: CpuChipIcon }
                ].map((item, i) => (
                    <div key={i} className="glass p-5 rounded-2xl border border-white flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-slate-400">
                            <item.icon className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
                        </div>
                        <p className="text-sm font-black text-slate-900 break-all">{item.value}</p>
                    </div>
                ))}
            </div>

            <div className="glass p-8 rounded-2xl border border-white italic-text-off">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Active Node Stats</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                    <div>
                        <p className="text-xs font-bold text-slate-500 mb-2">CPU Utilization</p>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="w-[12%] h-full bg-emerald-500" />
                        </div>
                        <p className="text-right text-[10px] font-black text-slate-400 mt-1">12.4%</p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 mb-2">Memory (RSS)</p>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="w-[45%] h-full bg-blue-500" />
                        </div>
                        <p className="text-right text-[10px] font-black text-slate-400 mt-1">45.1% (3.2GB / 8GB)</p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 mb-2">Internal Latency</p>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="w-[8%] h-full bg-emerald-500" />
                        </div>
                        <p className="text-right text-[10px] font-black text-slate-400 mt-1">4ms (avg)</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Fallback for missing icon in import
const ShieldCheckIcon = (props: any) => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
  </svg>
);
