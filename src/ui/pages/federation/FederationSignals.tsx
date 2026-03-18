import React, { useEffect, useState } from 'react';

export const FederationSignals: React.FC = () => {
    const [signals, setSignals] = useState<any[]>([]);

    useEffect(() => {
        const fetchSignals = async () => {
            const rs = await fetch('/api/admin/federation/signals', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setSignals(d.signals);
        };
        fetchSignals();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4">Real-Time Federation Signals</h1>
            <p className="text-sm text-slate-500">Live feed of aggregated metadata (non-tenant data) propagating through the OS mesh.</p>

            <div className="bg-slate-900 rounded-xl overflow-hidden shadow-sm mt-4 p-4 font-mono text-sm">
                {signals.length === 0 ? (
                    <div className="text-slate-500 text-center py-8">Waiting for multi-instance telemetry signals...</div>
                ) : signals.map((s, i) => (
                    <div key={i} className="border-l-4 border-indigo-500 pl-4 py-2 mb-3 last:mb-0">
                        <div className="flex gap-4 items-center mb-1">
                            <span className="text-indigo-400 font-bold">[{s.timestamp}]</span>
                            <span className="text-white bg-indigo-900 px-2 rounded">{s.signalType}</span>
                            <span className="text-slate-400">ORIGIN: {s.origin}</span>
                        </div>
                        <div className="text-slate-300 bg-slate-800 p-2 rounded mt-2 overflow-x-auto text-xs">
                            {JSON.stringify(s.payload, null, 2)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
