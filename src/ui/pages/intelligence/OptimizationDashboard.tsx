import React from 'react';
import { Link } from 'react-router-dom';

export const OptimizationDashboard: React.FC = () => {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4">Autonomous Optimization</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                <Link to="/intelligence/optimization/candidates" className="block p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <h3 className="text-lg font-semibold text-slate-800">Active Candidates</h3>
                    <p className="text-sm text-slate-500 mt-2">Review, simulate, and selectively apply generated optimization candidates.</p>
                </Link>
                
                <Link to="/intelligence/optimization/outcomes" className="block p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <h3 className="text-lg font-semibold text-slate-800">Decision Outcomes</h3>
                    <p className="text-sm text-slate-500 mt-2">Analyze applied actions and verify if desired outcomes were achieved.</p>
                </Link>
                
                <Link to="/intelligence/optimization/policies" className="block p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <h3 className="text-lg font-semibold text-slate-800">Optimization Policies</h3>
                    <p className="text-sm text-slate-500 mt-2">Configure autonomy modes: Shadow, Advisory, or Bounded Auto.</p>
                </Link>
            </div>
            
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mt-8">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                    <h2 className="text-lg font-bold text-blue-900">System Mode: SHADOW (Default)</h2>
                </div>
                <p className="text-blue-800 mt-2 opacity-80 text-sm max-w-3xl">
                    Phase 11 introduces safe optimization. The platform generates intelligence but does not mutate critical state automatically by default. 
                    Actions are simulated and measured before promotion to advisory or auto modes.
                </p>
            </div>
        </div>
    );
};
