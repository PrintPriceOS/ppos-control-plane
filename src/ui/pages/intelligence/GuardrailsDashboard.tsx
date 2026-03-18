import React, { useState, useEffect } from 'react';
import { ShieldCheckIcon, ShieldExclamationIcon, PlayIcon, PauseIcon, TrashIcon } from '@heroicons/react/24/outline';
import { RiskBadge } from '../../components/RiskBadge';

const GuardrailsDashboard: React.FC = () => {
    const [data, setData] = useState<any>(null);
    const [safety, setSafety] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [intelRes, safetyRes] = await Promise.all([
                fetch('/api/admin/intelligence/overview', { headers: { 'Authorization': 'Bearer admin-secret' } }),
                fetch('/api/admin/intelligence/guardrails/safety', { headers: { 'Authorization': 'Bearer admin-secret' } })
            ]);
            const intel = await intelRes.json();
            const safe = await safetyRes.json();
            setData(intel.data);
            setSafety(safe.data);
        } catch (err) {
            console.error('Error fetching guardrail data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    const toggleSafety = async (flag: string, value: boolean) => {
        try {
            await fetch('/api/admin/intelligence/guardrails/toggle', {
                method: 'POST',
                headers: { 
                    'Authorization': 'Bearer admin-secret',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ flag, value, reason: 'Manual UI Toggle' })
            });
            fetchData();
        } catch (err) {
            alert('Failed to toggle safety flag');
        }
    };

    if (loading) return <div className="p-8 text-slate-500 animate-pulse">Initializing Guardrail Layer...</div>;

    const decisions = data?.guardrailDecisions || [];

    return (
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header + Safety Controls */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Autonomous Guardrails</h1>
                    <p className="text-slate-500 mt-1 italic-text-off">Policy-bound interventions and safety controllers.</p>
                </div>
                
                <div className="flex space-x-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center space-x-3 pr-4 border-r border-slate-100">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Global Engine</span>
                        <button 
                            onClick={() => toggleSafety('guardrails_enabled', !safety?.guardrails_enabled)}
                            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                                safety?.guardrails_enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                            }`}
                        >
                            {safety?.guardrails_enabled ? 'ENABLED' : 'DISABLED'}
                        </button>
                    </div>
                    <div className="flex items-center space-x-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Auto Mode</span>
                        <button 
                            onClick={() => toggleSafety('auto_actions_enabled', !safety?.auto_actions_enabled)}
                            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                                safety?.auto_actions_enabled ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200' : 'bg-slate-50 text-slate-400'
                            }`}
                        >
                            {safety?.auto_actions_enabled ? 'ACTIVE' : 'ADVISORY'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Active Guardrails Table */}
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                    <h2 className="font-bold text-slate-700 flex items-center">
                        <ShieldCheckIcon className="w-5 h-5 mr-2 text-indigo-500" />
                        Active Decision Matrix
                    </h2>
                    <span className="text-xs font-medium text-slate-400">{decisions.length} active interventions</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-[0.2em] font-bold">
                                <th className="px-6 py-4">Decision Type</th>
                                <th className="px-6 py-4">Target</th>
                                <th className="px-6 py-4">Severity</th>
                                <th className="px-6 py-4">Rationale</th>
                                <th className="px-6 py-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {decisions.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                        No active guardrail interventions detected.
                                    </td>
                                </tr>
                            ) : decisions.map((d: any) => (
                                <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-700 text-sm">{d.type}</span>
                                            <span className="text-[10px] text-slate-400 font-mono">{d.id}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium text-slate-600 capitalize">{d.targetType}</span>
                                            <span className="text-xs text-indigo-500 font-bold">{d.targetId}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <RiskBadge score={d.severity === 'CRITICAL' ? 95 : d.severity === 'HIGH' ? 75 : 40} level={d.severity} />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-[11px] text-slate-500 leading-relaxed max-w-xs">
                                            {JSON.stringify(d.rationale)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                                            safety?.auto_actions_enabled && (d.severity !== 'HIGH' && d.severity !== 'CRITICAL') 
                                                ? 'bg-emerald-100 text-emerald-700' 
                                                : 'bg-amber-100 text-amber-700'
                                        }`}>
                                            {safety?.auto_actions_enabled && (d.severity !== 'HIGH' && d.severity !== 'CRITICAL') 
                                                ? 'Auto-Applied' 
                                                : 'Pending Approval'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default GuardrailsDashboard;
