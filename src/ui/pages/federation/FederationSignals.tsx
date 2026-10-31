import React, { useEffect, useState } from 'react';
import { adminFetch } from '../../lib/adminApi';

export const FederationSignals: React.FC = () => {
    const [signals, setSignals] = useState<any[]>([]);

    useEffect(() => {
        const fetchSignals = async () => {
            try {
                const d = await adminFetch<any>('/api/admin/federation/signals');
                if (d.ok) setSignals(d.signals || []);
            } catch (e) {}
        };
        fetchSignals();
        const intervalId = setInterval(fetchSignals, 2500);
        return () => clearInterval(intervalId);
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-black tracking-tight text-[#ECECF1] border-b ppos-border pb-4">Real-Time Federation Signals</h1>
            <p className="text-sm text-slate-400">Live feed of aggregated metadata (non-tenant data) propagating through the OS mesh.</p>

            <div className="glass border ppos-border bg-slate-950/40 text-[#ECECF1] font-mono p-4 text-xs select-all">
                {signals.length === 0 ? (
                    <div className="text-slate-500 text-center py-8">Waiting for multi-instance telemetry signals...</div>
                ) : signals.map((s, i) => (
                    <div key={i} className="border-l-4 border-indigo-500 pl-4 py-2 mb-3 last:mb-0">
                        <div className="flex gap-4 items-center mb-1 flex-wrap">
                            <span className="text-indigo-400 font-bold">[{s.timestamp}]</span>
                            <span className="text-white bg-indigo-900/50 px-2 rounded-none">{s.signalType || s.signal_type}</span>
                            <span className="text-slate-400 font-bold">ORIGIN: {s.origin || s.origin_instance}</span>
                        </div>
                        <div className="text-slate-300 bg-black/20 p-2 rounded-none mt-2 overflow-x-auto text-[10px] font-mono max-h-48 whitespace-pre">
                            {JSON.stringify(s.payload, null, 2)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
