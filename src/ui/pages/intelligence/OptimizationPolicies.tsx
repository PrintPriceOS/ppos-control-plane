import React, { useState } from 'react';

export const OptimizationPolicies: React.FC = () => {
    const [mode, setMode] = useState('SHADOW');

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight border-b pb-4">Optimization Policies & Guardrails</h1>

            <div className="bg-white border rounded-xl p-6 shadow-sm">
                <h2 className="font-bold text-lg text-slate-800 mb-4">Execution Mode</h2>
                <div className="space-y-4">
                    <label className={`flex items-start p-4 border rounded-lg cursor-pointer transition ${mode === 'SHADOW' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'hover:bg-slate-50'}`}>
                        <input type="radio" className="mt-1" checked={mode === 'SHADOW'} onChange={() => setMode('SHADOW')} />
                        <div className="ml-3">
                            <span className="block font-medium text-slate-800">SHADOW (Default)</span>
                            <span className="block text-sm text-slate-500 mt-1">Simulate only. Compare decision vs outcome. No real changes applied.</span>
                        </div>
                    </label>

                    <label className={`flex items-start p-4 border rounded-lg cursor-pointer transition ${mode === 'ADVISORY' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'hover:bg-slate-50'}`}>
                        <input type="radio" className="mt-1" checked={mode === 'ADVISORY'} onChange={() => setMode('ADVISORY')} />
                        <div className="ml-3">
                            <span className="block font-medium text-slate-800">ADVISORY</span>
                            <span className="block text-sm text-slate-500 mt-1">Show recommendations in UI. Operator may manually click apply.</span>
                        </div>
                    </label>

                    <label className={`flex items-start p-4 border rounded-lg cursor-pointer transition opacity-50 ${mode === 'BOUNDED_AUTO' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : ''}`}>
                        <input type="radio" className="mt-1" disabled checked={mode === 'BOUNDED_AUTO'} onChange={() => setMode('BOUNDED_AUTO')} />
                        <div className="ml-3">
                            <span className="block font-medium text-slate-800">BOUNDED AUTO <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded ml-2">Phase 11 Locked</span></span>
                            <span className="block text-sm text-slate-500 mt-1">Only low-risk optimization types within safety envelope. Explicitly locked until evaluation phase passes.</span>
                        </div>
                    </label>
                </div>
                
                <div className="mt-6 flex justify-end">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition">
                        Save Policy
                    </button>
                </div>
            </div>
            
            <div className="bg-red-50 border border-red-100 rounded-xl p-6 mt-8">
                 <h2 className="text-lg font-bold text-red-900 mb-2">Kill Switch</h2>
                 <p className="text-red-800 text-sm mb-4">Immediately halt all optimization features and fall back to static governance.</p>
                 <button className="px-5 py-2.5 bg-red-600 text-white font-bold rounded shadow hover:bg-red-700 transition uppercase tracking-wide text-sm">
                     Suspend All Optimization
                 </button>
            </div>
        </div>
    );
};
