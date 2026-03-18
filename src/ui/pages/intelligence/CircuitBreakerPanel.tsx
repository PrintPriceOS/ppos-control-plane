import React, { useState, useEffect } from 'react';
import { BoltIcon, BoltSlashIcon, ReceiptRefundIcon, ChartBarIcon } from '@heroicons/react/24/outline';

const CircuitBreakerPanel: React.FC = () => {
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const res = await fetch('/api/admin/intelligence/circuit-breaker', { headers: { 'Authorization': 'Bearer admin-secret' } });
            const json = await res.json();
            setStatus(json.data);
        } catch (err) {
            console.error('Error fetching CB status:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    const manualReset = async () => {
        try {
            await fetch('/api/admin/intelligence/circuit-breaker/reset', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            fetchData();
        } catch (err) {
            alert('Manual reset failed');
        }
    };

    if (loading) return <div className="p-8 text-slate-500 animate-pulse">Checking system fault lines...</div>;

    const stateColors: any = {
        'CLOSED': 'bg-emerald-50 text-emerald-600 border-emerald-200',
        'OPEN': 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse',
        'HALF_OPEN': 'bg-amber-50 text-amber-600 border-amber-200'
    };

    return (
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div>
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight">System Circuit Breaker</h1>
                <p className="text-slate-500 mt-1 italic-text-off">Fault-tolerance controller and cascading failure prevention.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Current State Card */}
                <div className={`p-8 rounded-3xl border-2 shadow-sm flex flex-col items-center justify-center space-y-4 ${stateColors[status?.state] || 'bg-slate-50'}`}>
                    {status?.state === 'CLOSED' ? (
                        <BoltIcon className="w-16 h-16 opacity-20" />
                    ) : (
                        <BoltSlashIcon className="w-16 h-16 opacity-20" />
                    )}
                    <span className="text-xs font-bold uppercase tracking-widest opacity-60">Control State</span>
                    <span className="text-4xl font-black tracking-tighter">{status?.state}</span>
                    <div className="pt-4 flex flex-col items-center">
                        <span className="text-[10px] font-medium opacity-60">Last fault: {status?.lastFaultAt ? new Date(status.lastFaultAt).toLocaleTimeString() : 'None'}</span>
                        <button 
                            onClick={manualReset}
                            className="mt-4 px-6 py-2 bg-white rounded-full shadow-sm text-xs font-bold hover:shadow-md transition-all active:scale-95 border border-slate-200"
                        >
                            Reset Manually
                        </button>
                    </div>
                </div>

                {/* Metrics Cards */}
                <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <ChartBarIcon className="w-8 h-8 text-slate-200" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stability Profile</span>
                    </div>
                    <div className="mt-4 space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-500 font-medium">Accumulated Faults</span>
                            <span className="text-lg font-bold text-slate-700">{status?.faultCount || 0}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-rose-400 h-full transition-all duration-1000" style={{ width: `${Math.min(100, (status?.faultCount || 0) * 10)}%` }}></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <ReceiptRefundIcon className="w-8 h-8 text-slate-200" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recovery Success</span>
                    </div>
                    <div className="mt-4 space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-500 font-medium">Successful Probes</span>
                            <span className="text-lg font-bold text-slate-700">{status?.recoveryCount || 0}/5</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-400 h-full transition-all duration-1000" style={{ width: `${(status?.recoveryCount || 0) * 20}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Explanation / Logic Box */}
            <div className="bg-slate-900 rounded-3xl p-8 text-slate-300 relative overflow-hidden">
                <div className="relative z-10">
                    <h3 className="font-bold text-white mb-2 underline decoration-indigo-500 underline-offset-4">Breaker Policy Engine</h3>
                    <p className="text-sm leading-relaxed max-w-2xl text-slate-400">
                        The system monitors global failure rates across all worker nodes. If the failure rate crosses the 
                        <span className="text-rose-400 font-bold mx-1">70% threshold</span>, the circuit breaker trips to <span className="text-white font-bold inline-flex items-center">OPEN<BoltSlashIcon className="w-3 h-3 ml-1 text-rose-500"/></span>.
                        In this state, all incoming request intake is blocked to prevent cascading memory exhaustion. 
                        Recovery starts automatically after 30 seconds of silence.
                    </p>
                </div>
                <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none"></div>
            </div>
        </div>
    );
};

export default CircuitBreakerPanel;
