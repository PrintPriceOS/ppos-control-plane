import React from 'react';
import { ChartBarSquareIcon, ClockIcon, UsersIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

export const UsageQuotasPage: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Usage & Quotas</h1>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Real-time tenant consumption and systemic rate-matching logic.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { label: 'Total Jobs Today', value: '45,201', icon: ChartBarSquareIcon, color: 'primary' },
                    { label: 'Storage Used', value: '1.2 TB', icon: CloudIcon, color: 'blue' },
                    { label: 'Concurrent Batches', value: '128', icon: QueueListIcon, color: 'indigo' },
                    { label: 'Effective Limit Score', value: '98%', icon: ShieldCheckIcon, color: 'emerald' }
                ].map((stat, i) => (
                    <div key={i} className="glass p-5 rounded-2xl border border-white flex items-center gap-4">
                        <div className={`p-3 rounded-xl bg-${stat.color || 'primary'}/10 text-${stat.color || 'primary'}`}>
                            <stat.icon className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                            <p className="text-xl font-black text-slate-900">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="glass h-64 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300">
                <p className="text-sm font-bold text-slate-400">Detailed Quota Explorer Coming Soon</p>
            </div>
        </div>
    );
};

// Fallback for missing icon in import
const CloudIcon = (props: any) => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" />
  </svg>
);
const QueueListIcon = (props: any) => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
  </svg>
);
