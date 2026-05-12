import React, { useState, useEffect } from 'react';
import {
    SparklesIcon,
    CheckIcon,
    XMarkIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ServerStackIcon,
    BuildingOfficeIcon,
    CpuChipIcon,
    PaperAirplaneIcon,
    ExclamationTriangleIcon,
    ArrowPathIcon,
    InformationCircleIcon
} from '@heroicons/react/24/outline';
import * as adminApi from '../../lib/adminApi';
import { toDisplayText } from '../../lib/formatters';

export const NodeMatchingTab: React.FC = () => {
    const [packages, setPackages] = useState<adminApi.ProductionPackage[]>([]);
    const [selectedPackageId, setSelectedPackageId] = useState<string>('');
    const [loadingPackages, setLoadingPackages] = useState(true);

    // Matching state
    const [matchingResults, setMatchingResults] = useState<any[]>([]);
    const [matchingLoading, setMatchingLoading] = useState(false);
    const [matchingRan, setMatchingRan] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionFeedback, setActionFeedback] = useState<string | null>(null);

    // Expanded machine rows map
    const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
    
    // Dispatch orchestration execution state
    const [dispatchingNodeId, setDispatchingNodeId] = useState<string | null>(null);
    const [dispatchMessage, setDispatchMessage] = useState<string>('');

    useEffect(() => {
        fetchPackages();
    }, []);

    const fetchPackages = async () => {
        setLoadingPackages(true);
        try {
            // Retrieve all packages available for matching analysis
            const res = await adminApi.listProductionPackages();
            if (res.ok) {
                setPackages(res.packages || []);
                if (res.packages && res.packages.length > 0) {
                    setSelectedPackageId(res.packages[0].id);
                }
            }
        } catch (err: any) {
            setError('Could not sync available packages stream: ' + err.message);
        } finally {
            setLoadingPackages(false);
        }
    };

    const handleRunMatching = async () => {
        if (!selectedPackageId) return;
        setMatchingLoading(true);
        setMatchingRan(false);
        setError(null);
        setActionFeedback(null);
        setMatchingResults([]);

        try {
            const res = await adminApi.matchProductionPackageNodes(selectedPackageId);
            if (res.ok) {
                // Populate matches or compatibleNodes array bindings
                const items = res.compatibleNodes || res.matches || [];
                setMatchingResults(items);
                setMatchingRan(true);
                setActionFeedback(`Simulation finalized: Detected ${items.length} print house topologies passing hard baseline constraints.`);
            } else {
                setError('Matching core engine execution rejected request payload parameters.');
            }
        } catch (err: any) {
            setError(`Matching engine failed execution: ${err.message || 'Unknown network stream exception'}`);
        } finally {
            setMatchingLoading(false);
        }
    };

    const toggleNodeExpanded = (nodeId: string) => {
        setExpandedNodes(prev => ({
            ...prev,
            [nodeId]: !prev[nodeId]
        }));
    };

    const handleExecuteDispatch = async (targetNodeId: string) => {
        if (!selectedPackageId) return;
        setDispatchingNodeId(targetNodeId);
        setActionFeedback(null);

        try {
            const res = await adminApi.dispatchProductionPackage(selectedPackageId, {
                nodeId: targetNodeId,
                message: dispatchMessage.trim() || 'Automated topological node intelligence matching orchestration deployment.'
            });

            if (res.ok) {
                setActionFeedback(`Successfully handoff dispatched package [${selectedPackageId}] targeting Federation Node ID [${targetNodeId}].`);
                setDispatchMessage('');
            } else {
                alert('Dispatch command transmission failed setup verification layer.');
            }
        } catch (err: any) {
            alert(`Dispatch action failed execution: ${err.message}`);
        } finally {
            setDispatchingNodeId(null);
        }
    };

    const selectedPkgObj = packages.find(p => p.id === selectedPackageId);

    return (
        <div className="p-6 bg-slate-50 min-h-full space-y-6">
            {/* Top Workspace Header Bar */}
            <div className="bg-white border border-slate-200 p-4 rounded-none flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-slate-950 text-white rounded-none">
                        <SparklesIcon className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Deterministic Node Matching Engine</h2>
                        <p className="text-xs font-mono text-slate-500">Multidimensional industrial compatibility evaluator and physical hardware dispatch gateway.</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                    <div className="flex-1">
                        <label className="block text-[9px] font-mono text-slate-400 uppercase">Target Preflight Package Matrix</label>
                        <select
                            value={selectedPackageId}
                            onChange={(e) => {
                                setSelectedPackageId(e.target.value);
                                setMatchingRan(false);
                                setMatchingResults([]);
                            }}
                            disabled={loadingPackages}
                            className="w-full sm:w-64 bg-white border border-slate-300 text-xs font-mono text-slate-800 p-1.5 rounded-none focus:outline-none focus:border-slate-600 truncate"
                        >
                            {loadingPackages ? (
                                <option value="">Loading Packages Stream...</option>
                            ) : packages.length === 0 ? (
                                <option value="">-- No Active Packages Allocated --</option>
                            ) : (
                                packages.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.id} [{p.status}]
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    <div className="flex items-end self-end sm:self-auto">
                        <button
                            onClick={handleRunMatching}
                            disabled={matchingLoading || !selectedPackageId}
                            className="px-4 py-2 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-300 text-white disabled:text-slate-500 text-xs font-mono tracking-wider font-bold rounded-none transition-colors flex items-center justify-center space-x-1 w-full sm:w-auto h-[34px]"
                        >
                            <ArrowPathIcon className={`w-3.5 h-3.5 ${matchingLoading ? 'animate-spin text-amber-400' : ''}`} />
                            <span>{matchingLoading ? 'Simulating...' : 'Run Matching Engine'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Selected Package Snapshot Specs Info */}
            {selectedPkgObj && (
                <div className="p-3 bg-white border border-slate-200 text-xs font-mono flex flex-wrap gap-x-6 gap-y-2 items-center text-slate-600">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Inspected Specs:</span>
                    <span>Format: <strong className="text-slate-900">{selectedPkgObj.book_spec_json?.format || 'Standard'}</strong></span>
                    <span>Pages: <strong className="text-slate-900">{selectedPkgObj.book_spec_json?.pageCount || 'N/A'}pp</strong></span>
                    <span>Binding: <strong className="text-slate-900">{selectedPkgObj.book_spec_json?.binding || 'Perfect Bound'}</strong></span>
                    <span>Paper GSM: <strong className="text-slate-900">{selectedPkgObj.book_spec_json?.paperGsm || 80}g</strong></span>
                    <span>Target Geo: <strong className="text-slate-900">{selectedPkgObj.book_spec_json?.destinationCountry || 'Unspecified'}</strong></span>
                    <span>Status Flag: <strong className="text-indigo-900">{selectedPkgObj.status}</strong></span>
                </div>
            )}

            {/* Notification/Feedback Box */}
            {actionFeedback && (
                <div className="p-3 bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-300 rounded-none flex items-center justify-between">
                    <span className="flex items-center">
                        <InformationCircleIcon className="w-4 h-4 mr-2 text-emerald-400 flex-shrink-0" />
                        {actionFeedback}
                    </span>
                    <button onClick={() => setActionFeedback(null)} className="text-[10px] text-slate-400 hover:text-white underline uppercase">
                        Dismiss
                    </button>
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-950 text-red-300 border border-red-800 text-xs font-mono rounded-none">
                    <span className="font-bold block uppercase tracking-wider">Engine Evaluation Interruption</span>
                    {toDisplayText(error)}
                </div>
            )}

            {/* Core Results Framework Table */}
            <div className="bg-white border border-slate-200 rounded-none overflow-hidden">
                <div className="p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-white">
                    <span className="text-xs font-mono font-bold tracking-wider uppercase flex items-center">
                        <ServerStackIcon className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                        Deterministic Capability Matches Matrix
                    </span>
                    <span className="text-[10px] font-mono text-amber-400">
                        {matchingRan ? `Ranked Topologies: ${matchingResults.length}` : 'Awaiting Engine Dispatch Initialization'}
                    </span>
                </div>

                <div className="overflow-x-auto">
                    {!matchingRan && matchingResults.length === 0 ? (
                        <div className="p-16 text-center text-xs font-mono text-slate-400">
                            Select a target package profile above and execute <span className="text-slate-700 font-bold">Run Matching Engine</span> to synthesize multi-criteria compatibility metrics.
                        </div>
                    ) : matchingResults.length === 0 ? (
                        <div className="p-16 text-center text-xs font-mono text-red-600 font-bold">
                            ⚠️ Zero compatible print node topologies map current baseline specifications constraints. Review package document configuration limits.
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-mono font-bold text-slate-600 uppercase tracking-wider">
                                    <th className="p-2.5 w-44">PrintHouse Entity</th>
                                    <th className="p-2.5 text-center w-20">Score</th>
                                    <th className="p-2.5 text-center">Paper</th>
                                    <th className="p-2.5 text-center">Binding</th>
                                    <th className="p-2.5 text-center">Trim</th>
                                    <th className="p-2.5 text-center">Sizing</th>
                                    <th className="p-2.5 text-center">Policy</th>
                                    <th className="p-2.5 text-center">Geo Bonus</th>
                                    <th className="p-2.5 text-center">Consumable State</th>
                                    <th className="p-2.5 text-right w-36">Orchestration</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 text-xs font-mono">
                                {matchingResults.map((matchObj, idx) => {
                                    const nodeId = matchObj.federationNodeId || matchObj.printNodeId || `node-${idx}`;
                                    const isExpanded = !!expandedNodes[nodeId];
                                    const d = matchObj.details || {};
                                    const scoreScalar = matchObj.matchScore ?? 100;

                                    // Color format score badge
                                    let scoreColor = 'bg-emerald-950 text-emerald-400 border-emerald-800';
                                    if (scoreScalar < 90) scoreColor = 'bg-indigo-950 text-indigo-400 border-indigo-800';
                                    if (scoreScalar < 75) scoreColor = 'bg-amber-950 text-amber-400 border-amber-800';

                                    const machines = matchObj.compatibleMachines || [];
                                    const machineCount = machines.length || (matchObj.matchedMachines?.length || 0);

                                    return (
                                        <React.Fragment key={nodeId}>
                                            {/* Primary Node Rank Row */}
                                            <tr className="hover:bg-slate-50 transition-colors">
                                                <td className="p-2.5">
                                                    <div className="flex items-start space-x-1.5">
                                                        <button 
                                                            onClick={() => toggleNodeExpanded(nodeId)}
                                                            className="mt-0.5 text-slate-400 hover:text-slate-900 focus:outline-none"
                                                            title="Expand Individual Hardware Assets"
                                                        >
                                                            {isExpanded ? (
                                                                <ChevronUpIcon className="w-3.5 h-3.5 text-indigo-600 font-bold" />
                                                            ) : (
                                                                <ChevronDownIcon className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                        <div>
                                                            <span className="font-bold text-[11px] text-slate-900 block truncate max-w-[160px]" title={matchObj.printHouseId || matchObj.companyName}>
                                                                {toDisplayText(matchObj.printHouseId || matchObj.companyName || 'Industrial Node')}
                                                            </span>
                                                            <span className="text-[9px] text-slate-400 block font-mono">
                                                                ID: {String(nodeId || '').substring(0, 8)} • <span className="underline cursor-pointer text-indigo-800" onClick={() => toggleNodeExpanded(nodeId)}>{machineCount} Hardware Profiles</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Calculated Score scalar pill */}
                                                <td className="p-2.5 text-center font-bold">
                                                    <span className={`px-1.5 py-0.5 text-[10px] border rounded-none ${scoreColor}`}>
                                                        {scoreScalar}%
                                                    </span>
                                                </td>

                                                {/* Criteria Matrix Booleans */}
                                                <td className="p-2.5 text-center">
                                                    {d.paper !== false ? (
                                                        <CheckIcon className="w-4 h-4 text-emerald-600 mx-auto" title="Paper GSM compatible" />
                                                    ) : (
                                                        <XMarkIcon className="w-4 h-4 text-red-600 mx-auto" title="Substrate optimization warnings" />
                                                    )}
                                                </td>

                                                <td className="p-2.5 text-center">
                                                    {d.binding !== false ? (
                                                        <CheckIcon className="w-4 h-4 text-emerald-600 mx-auto" title="Binding supported" />
                                                    ) : (
                                                        <XMarkIcon className="w-4 h-4 text-red-600 mx-auto" title="Binding unavailable" />
                                                    )}
                                                </td>

                                                <td className="p-2.5 text-center">
                                                    {d.trim !== false ? (
                                                        <CheckIcon className="w-4 h-4 text-emerald-600 mx-auto" title="Trim size fits" />
                                                    ) : (
                                                        <XMarkIcon className="w-4 h-4 text-red-600 mx-auto" title="Out of physical trim envelope" />
                                                    )}
                                                </td>

                                                <td className="p-2.5 text-center">
                                                    {d.fileSize !== false ? (
                                                        <CheckIcon className="w-4 h-4 text-emerald-600 mx-auto" title="File sizing safe" />
                                                    ) : (
                                                        <XMarkIcon className="w-4 h-4 text-red-600 mx-auto" title="Payload size excessive" />
                                                    )}
                                                </td>

                                                <td className="p-2.5 text-center">
                                                    {d.policy !== false ? (
                                                        <CheckIcon className="w-4 h-4 text-emerald-600 mx-auto" title="Certified Policy Active" />
                                                    ) : (
                                                        <span className="text-[10px] text-amber-600 font-bold block" title="Policy Uncertified">SOFT</span>
                                                    )}
                                                </td>

                                                <td className="p-2.5 text-center">
                                                    {d.geographyBonus ? (
                                                        <span className="px-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold">
                                                            +10 GEO
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-300 text-[10px] italic-text-off">-</span>
                                                    )}
                                                </td>

                                                <td className="p-2.5 text-center">
                                                    {d.materialWarning || (matchObj.warnings && matchObj.warnings.length > 0) ? (
                                                        <span className="inline-flex items-center text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 text-[9px] font-bold" title={matchObj.warnings?.join(' | ')}>
                                                            <ExclamationTriangleIcon className="w-3 h-3 mr-0.5 text-amber-600 flex-shrink-0" />
                                                            RISK
                                                        </span>
                                                    ) : (
                                                        <span className="text-emerald-700 text-[9px] font-bold">STABLE</span>
                                                    )}
                                                </td>

                                                {/* Dispatch Hand-off Invocation */}
                                                <td className="p-2.5 text-right">
                                                    <button
                                                        onClick={() => handleExecuteDispatch(nodeId)}
                                                        disabled={dispatchingNodeId === nodeId}
                                                        className="px-2 py-1 bg-indigo-950 hover:bg-indigo-900 disabled:bg-slate-200 text-indigo-300 disabled:text-slate-400 font-bold text-[10px] uppercase tracking-wider rounded-none transition-colors border border-indigo-900 block w-full text-center"
                                                    >
                                                        {dispatchingNodeId === nodeId ? 'Sending...' : 'Handoff Dispatch'}
                                                    </button>
                                                </td>
                                            </tr>

                                            {/* Expandable Hardware Row */}
                                            {isExpanded && (
                                                <tr className="bg-slate-50/80 border-b border-slate-200">
                                                    <td colSpan={10} className="p-3 pl-8">
                                                        <div className="space-y-2 border-l-2 border-indigo-500 pl-3">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] font-bold uppercase text-slate-700 tracking-wider">
                                                                    Hardware Fleet Matrix Profiles ({machines.length || matchObj.matchedMachines?.length || 0})
                                                                </span>
                                                                <span className="text-[9px] text-slate-400 italic-text-off">
                                                                    Strict capability subsets passing sublayer parameter criteria bounds
                                                                </span>
                                                            </div>

                                                            {machines.length > 0 ? (
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                    {machines.map((m: any, midx: number) => (
                                                                        <div key={midx} className="p-2 bg-white border border-slate-200 rounded-none text-[11px] space-y-1">
                                                                            <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                                                                                <span className="font-bold text-slate-900 flex items-center">
                                                                                    <CpuChipIcon className="w-3.5 h-3.5 mr-1 text-slate-500" />
                                                                                    {m.profileName || m.profile_name || `Machine-${midx}`}
                                                                                </span>
                                                                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1 font-mono">
                                                                                    {m.profileType || m.profile_type || 'OFFSET'}
                                                                                </span>
                                                                            </div>

                                                                            <div className="text-[10px] text-slate-600 flex justify-between">
                                                                                <span>Mfg: <strong>{m.manufacturer || 'OEM'}</strong></span>
                                                                                <span>Model: <strong>{m.model || 'Base Frame'}</strong></span>
                                                                            </div>

                                                                            <div className="text-[9px] text-slate-500 truncate pt-0.5">
                                                                                Caps: {JSON.stringify(m.capabilities || {})}
                                                                            </div>

                                                                            {m.reasons && m.reasons.length > 0 && (
                                                                                <div className="text-[9px] text-amber-800 bg-amber-50 p-1 border border-amber-200">
                                                                                    Sub-reasons: {m.reasons.map((r: any) => toDisplayText(r)).join('; ')}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : matchObj.matchedMachines && matchObj.matchedMachines.length > 0 ? (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {matchObj.matchedMachines.map((mName: any, midx: number) => (
                                                                        <span key={midx} className="px-2 py-0.5 bg-white border border-slate-200 text-[10px] font-bold text-slate-800">
                                                                            {toDisplayText(mName)}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <p className="text-[10px] text-slate-400 italic-text-off">
                                                                    No specific fine-grained machine profile instances synchronized; matches default abstract node telemetry capabilities.
                                                                </p>
                                                            )}

                                                            {/* Custom Handoff notes input */}
                                                            <div className="pt-1.5 flex items-center space-x-2 max-w-xl">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Optional custom handoff notes for target orchestrator layer..."
                                                                    value={dispatchMessage}
                                                                    onChange={(e) => setDispatchMessage(e.target.value)}
                                                                    className="bg-white border border-slate-300 text-[10px] p-1 flex-1 font-mono focus:outline-none focus:border-slate-500"
                                                                />
                                                                <span className="text-[9px] text-slate-400">Attached to Handoff Dispatch</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Explanatory Footnote Ledger */}
            <div className="p-4 bg-white border border-slate-200 rounded-none text-xs font-mono text-slate-500 space-y-1">
                <span className="font-bold text-slate-700 uppercase block text-[10px]">Technical Drift Harmonization Ledger</span>
                <p>
                    • <strong>Naming Standardizations:</strong> Backend output correctly normalizes entity references mapping legacy terms (<span className="italic-text-off">federation nodes vs machines vs print houses</span>) cleanly to explicit keys: <code className="bg-slate-100 text-slate-800 px-1 font-bold">federationNodeId</code>, <code className="bg-slate-100 text-slate-800 px-1 font-bold">printHouseId</code>, and <code className="bg-slate-100 text-slate-800 px-1 font-bold">compatibleMachines</code> profiles.
                </p>
                <p>
                    • <strong>Predictive Warning Handoff:</strong> Consumable inventory status metrics pull live forecasts from the <code className="bg-slate-100 text-slate-800 px-1 font-bold">materialAvailabilityService</code> directly as diagnostic warnings rather than synthetically manipulating hardware operational match scores.
                </p>
            </div>
        </div>
    );
};
