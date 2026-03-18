import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export const AgentsDashboard: React.FC = () => {
    const [agents, setAgents] = useState<any[]>([]);

    useEffect(() => {
        const fetchStatus = async () => {
            const rs = await fetch('/api/admin/agents/status', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setAgents(d.agents);
        };
        fetchStatus();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Multi-Agent Orchestration</h1>
                <div className="space-x-3">
                    <Link to="/intelligence/agents/decisions" className="px-4 py-2 bg-slate-100 text-slate-700 rounded font-medium text-sm hover:bg-slate-200">Decisions</Link>
                    <Link to="/intelligence/agents/conflicts" className="px-4 py-2 bg-red-100 text-red-700 rounded font-medium text-sm hover:bg-red-200">Conflicts</Link>
                </div>
            </div>

            <p className="text-sm text-slate-500">
                Phase 14 abstracts the OS intelligence into specialized autonomous agents communicating through a unified Orchestrator bus.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                {agents.map((a, idx) => (
                    <div key={idx} className="bg-white border rounded-xl p-5 shadow-sm border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-800">{a.agentType}</h3>
                            <span className="px-2 py-1 text-xs font-bold bg-slate-100 text-slate-600 rounded">
                                {a.policy?.autonomyLevel || 'SHADOW'}
                            </span>
                        </div>
                        
                        <div className="space-y-3 text-sm">
                            <div>
                                <strong className="text-slate-400 uppercase text-xs">Allowed Actions</strong>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {(a.policy?.allowedActions || []).length > 0 ? a.policy.allowedActions.map((act: string) => (
                                        <span key={act} className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs">{act}</span>
                                    )) : <span className="text-slate-400 italic">None</span>}
                                </div>
                            </div>
                            <div>
                                <strong className="text-slate-400 uppercase text-xs">Blocked Domains</strong>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {(a.policy?.blockedActions || []).length > 0 ? a.policy.blockedActions.map((act: string) => (
                                        <span key={act} className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full text-xs">{act}</span>
                                    )) : <span className="text-slate-400 italic">None</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
