import React from 'react';
import { Link } from 'react-router-dom';

export const LearningDashboard: React.FC = () => {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4">Continuous Learning & Adaptation</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                <Link to="/intelligence/learning/strategies" className="block p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <h3 className="text-lg font-semibold text-slate-800">Strategy Performance</h3>
                    <p className="text-sm text-slate-500 mt-2">View ranked optimization strategies based on contextual success rates.</p>
                </Link>
                
                <Link to="/intelligence/learning/outcomes" className="block p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <h3 className="text-lg font-semibold text-slate-800">Outcome Memory</h3>
                    <p className="text-sm text-slate-500 mt-2">Inspect the append-only ledger of predictions versus actual evaluated impacts.</p>
                </Link>
                
                <Link to="/intelligence/learning/confidence" className="block p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <h3 className="text-lg font-semibold text-slate-800">Confidence Evolution</h3>
                    <p className="text-sm text-slate-500 mt-2">Monitor how system trust grows or decays per optimization model organically.</p>
                </Link>
            </div>
            
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 mt-8">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse"></div>
                    <h2 className="text-lg font-bold text-indigo-900">Adaptive Intelligence Active</h2>
                </div>
                <p className="text-indigo-800 mt-2 opacity-80 text-sm max-w-3xl">
                    Phase 12 transforms generating raw candidates into contextual learning. The system identifies which optimizations yield the highest net benefit, organically penalizes unsafe regressions, and filters low-confidence strategies from future generations.
                </p>
            </div>
        </div>
    );
};
