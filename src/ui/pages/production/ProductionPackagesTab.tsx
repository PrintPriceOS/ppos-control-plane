import React, { useState, useEffect } from 'react';
import {
    ArchiveBoxIcon,
    DocumentTextIcon,
    ArrowDownTrayIcon,
    SparklesIcon,
    PaperAirplaneIcon,
    CheckCircleIcon,
    XCircleIcon,
    EyeIcon,
    ArrowPathIcon,
    ServerStackIcon,
    ShieldCheckIcon,
    CogIcon,
    BuildingOfficeIcon,
    InformationCircleIcon
} from '@heroicons/react/24/outline';
import * as adminApi from '../../lib/adminApi';
import { toDisplayText } from '../../lib/formatters';

export const ProductionPackagesTab: React.FC = () => {
    const [packages, setPackages] = useState<adminApi.ProductionPackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPackage, setSelectedPackage] = useState<adminApi.ProductionPackage | null>(null);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [actionFeedback, setActionFeedback] = useState<string | null>(null);

    // Matching intelligence preview state
    const [matchingResults, setMatchingResults] = useState<any[] | null>(null);
    const [matchingLoading, setMatchingLoading] = useState(false);

    // Dispatch target selection state
    const [availableNodes, setAvailableNodes] = useState<any[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string>('');
    const [dispatchMessage, setDispatchMessage] = useState<string>('');
    const [dispatchingLoading, setDispatchingLoading] = useState(false);

    useEffect(() => {
        fetchPackages();
        fetchNodes();
    }, [statusFilter]);

    const fetchPackages = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await adminApi.listProductionPackages(statusFilter ? { status: statusFilter } : {});
            if (res.ok) {
                setPackages(res.packages || []);
                // If a package is already selected, update its reference to current record
                if (selectedPackage) {
                    const updated = res.packages?.find(p => p.id === selectedPackage.id);
                    if (updated) setSelectedPackage(updated);
                }
            } else {
                setError('Failed to query production packages repository.');
            }
        } catch (err: any) {
            setError(err.message || 'Network exception while loading manufacturing packages.');
        } finally {
            setLoading(false);
        }
    };

    const fetchNodes = async () => {
        try {
            const res = await adminApi.listProductionNodes({ status: 'ONLINE' });
            if (res.ok && res.nodes) {
                setAvailableNodes(res.nodes);
                if (res.nodes.length > 0) {
                    setSelectedNodeId(res.nodes[0].id);
                }
            }
        } catch (err) {
            console.warn('Could not populate target print nodes list:', err);
        }
    };

    const handleStatusTransition = async (packageId: string, newStatus: string) => {
        setActionFeedback(null);
        try {
            const res = await adminApi.updateProductionPackageStatus(packageId, newStatus);
            if (res.ok) {
                setActionFeedback(`Package status successfully transitioned to ${newStatus}`);
                fetchPackages();
            } else {
                alert(`Transition failed: Ensure package lifecycle constraints permit moving to ${newStatus}`);
            }
        } catch (err: any) {
            alert(`Error updating lifecycle status: ${err.message}`);
        }
    };

    const handleRunNodeMatching = async (packageId: string) => {
        setMatchingLoading(true);
        setMatchingResults(null);
        setActionFeedback(null);
        try {
            const res = await adminApi.matchProductionPackageNodes(packageId);
            if (res.ok) {
                setMatchingResults(res.matches || []);
                setActionFeedback(`Node matching simulation generated ${res.matches?.length || 0} candidate scores.`);
            } else {
                alert('Node matching simulation failed execution.');
            }
        } catch (err: any) {
            alert(`Matching engine error: ${err.message}`);
        } finally {
            setMatchingLoading(false);
        }
    };

    const handleDispatchPackage = async (packageId: string) => {
        if (!selectedNodeId) {
            alert('Please select a targeted print node destination before executing dispatch.');
            return;
        }
        setDispatchingLoading(true);
        setActionFeedback(null);
        try {
            const res = await adminApi.dispatchProductionPackage(packageId, {
                nodeId: selectedNodeId,
                message: dispatchMessage.trim() || 'Automated high-priority packaging bundle dispatch execution.'
            });
            if (res.ok) {
                setActionFeedback(`Successfully orchestrated manufacturing dispatch frame targeting Node [${selectedNodeId}].`);
                setDispatchMessage('');
                fetchPackages();
            } else {
                alert('Dispatch orchestration transmission rejected by controller node.');
            }
        } catch (err: any) {
            alert(`Dispatch frame execution failed: ${err.message}`);
        } finally {
            setDispatchingLoading(false);
        }
    };

    const downloadProductionBundle = (packageId: string) => {
        window.open(`/api/admin/production/packages/${packageId}/bundle`, '_blank');
        setActionFeedback(`Streaming verified cryptographic ZIP production assembly bundle for package [${packageId}].`);
    };

    const renderStatusIndicator = (status: string) => {
        const s = (status || 'DRAFT').toUpperCase();
        let bg = 'bg-slate-950 dark:bg-zinc-800 text-slate-400 dark:text-zinc-300 border-slate-800 dark:border-zinc-700';
        if (s === 'COMPLETED') bg = 'bg-emerald-950 dark:bg-green-950/40 text-emerald-400 dark:text-green-400 border-emerald-800 dark:border-green-900/60';
        if (s === 'IN_PRODUCTION') bg = 'bg-red-950 dark:bg-red-950/40 text-red-400 dark:text-red-400 border-red-800 dark:border-red-900/60';
        if (s === 'READY_FOR_DISPATCH' || s === 'DISPATCHED') bg = 'bg-cyan-950 dark:bg-zinc-800 text-cyan-400 dark:text-zinc-300 border-cyan-800 dark:border-zinc-700';
        if (s === 'ACCEPTED_BY_PRINTER') bg = 'bg-amber-950 dark:bg-amber-950/40 text-amber-400 dark:text-amber-400 border-amber-800 dark:border-amber-900/60';
        if (s === 'REJECTED_BY_PRINTER' || s === 'CANCELLED') bg = 'bg-red-950 dark:bg-red-950/40 text-red-400 dark:text-red-400 border-red-800 dark:border-red-900/60';

        return (
            <span className={`px-2 py-0.5 text-[9px] font-mono font-bold tracking-wider uppercase border rounded-none block w-max ${bg}`}>
                {s}
            </span>
        );
    };

    return (
        <div className="p-6 bg-slate-50 dark:bg-zinc-950 min-h-full space-y-6">
            {/* Control Bar */}
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 rounded-none flex flex-col md:flex-row items-center justify-between gap-4 shadow-none">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-slate-950 dark:bg-zinc-800 text-white dark:text-zinc-100 rounded-none border border-slate-800 dark:border-zinc-700">
                        <ArchiveBoxIcon className="w-5 h-5 text-red-600 dark:text-red-500" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-zinc-100">Manufacturing Packages Catalog</h2>
                        <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">Secure bridging layer mapping validated preflight documents to physical target production frames.</p>
                    </div>
                </div>

                <div className="flex items-center space-x-3 w-full md:w-auto">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 text-xs font-mono text-slate-800 dark:text-zinc-300 p-2 rounded-none focus:outline-none focus:border-red-600 dark:focus:border-red-500 flex-1 md:w-48"
                    >
                        <option value="">ALL LIFECYCLE STATES</option>
                        <option value="DRAFT">DRAFT</option>
                        <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
                        <option value="DISPATCHED">DISPATCHED</option>
                        <option value="ACCEPTED_BY_PRINTER">ACCEPTED_BY_PRINTER</option>
                        <option value="IN_PRODUCTION">IN_PRODUCTION</option>
                        <option value="COMPLETED">COMPLETED</option>
                        <option value="CANCELLED">CANCELLED</option>
                    </select>

                    <button
                        onClick={fetchPackages}
                        disabled={loading}
                        className="px-3 py-2 bg-slate-950 hover:bg-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white dark:text-zinc-100 border border-slate-800 dark:border-zinc-700 text-xs font-mono tracking-wider rounded-none transition-colors flex items-center space-x-1 flex-shrink-0"
                    >
                        <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
                        <span>Sync</span>
                    </button>
                </div>
            </div>

            {/* Notification Feedback Box */}
            {actionFeedback && (
                <div className="p-3 bg-slate-900 dark:bg-zinc-900 border border-slate-800 dark:border-zinc-800 text-xs font-mono text-amber-300 rounded-none flex items-center justify-between animate-fade-in shadow-none">
                    <span className="flex items-center text-zinc-300">
                        <InformationCircleIcon className="w-4 h-4 mr-2 text-amber-400 flex-shrink-0" />
                        {actionFeedback}
                    </span>
                    <button onClick={() => setActionFeedback(null)} className="text-[10px] text-slate-400 dark:text-zinc-500 hover:text-white dark:hover:text-zinc-200 uppercase tracking-wider underline ml-2">
                        Dismiss
                    </button>
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-950 dark:bg-red-950/40 text-red-300 dark:text-red-400 border border-red-800 dark:border-red-900/60 text-xs font-mono rounded-none">
                    <span className="font-bold block uppercase">Datastore Error Snapshot</span>
                    {toDisplayText(error)}
                </div>
            )}

            {/* Main Operational Split Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Dense Packages Register Table (Spans 2 columns) */}
                <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-none overflow-hidden shadow-none">
                    <div className="p-3 bg-slate-900 dark:bg-zinc-900 border-b border-slate-800 dark:border-zinc-800 flex justify-between items-center text-white dark:text-zinc-100">
                        <span className="text-xs font-mono font-bold tracking-wider uppercase flex items-center">
                            <ServerStackIcon className="w-3.5 h-3.5 mr-1.5 text-slate-400 dark:text-zinc-500" />
                            Registered Packets ({packages.length})
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">Select entity to execute matching, routing, or ZIP extraction</span>
                    </div>

                    <div className="overflow-x-auto">
                        {loading && packages.length === 0 ? (
                            <div className="p-16 text-center text-xs font-mono text-slate-400 dark:text-zinc-500 animate-pulse">
                                Extracting structured production assembly packages from persistence storage...
                            </div>
                        ) : packages.length === 0 ? (
                            <div className="p-16 text-center text-xs font-mono text-slate-500 dark:text-zinc-600 italic-text-off">
                                No production package matrices allocated within current scope context bounds.
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse text-slate-700 dark:text-zinc-300">
                                <thead>
                                    <tr className="bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-[10px] font-mono font-bold text-slate-600 dark:text-zinc-500 uppercase tracking-wider">
                                        <th className="p-2.5 w-32">Package Handle</th>
                                        <th className="p-2.5">Preflight Base</th>
                                        <th className="p-2.5">Specs Snapshot</th>
                                        <th className="p-2.5 w-32">Lifecycle State</th>
                                        <th className="p-2.5 w-24">Assigned Printer</th>
                                        <th className="p-2.5 w-12 text-center">Inspect</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800 text-xs font-mono">
                                    {packages.map((pkg) => {
                                        const isSelected = selectedPackage?.id === pkg.id;
                                        const bookSpec = pkg.book_spec_json || {};
                                        const formatStr = bookSpec.format || 'Standard Book';
                                        const pagesStr = bookSpec.pageCount ? `${bookSpec.pageCount}pp` : 'N/A';
                                        const bindingStr = bookSpec.binding || 'Perfect Bound';

                                        return (
                                            <tr
                                                key={pkg.id}
                                                onClick={() => {
                                                    setSelectedPackage(pkg);
                                                    setMatchingResults(null);
                                                }}
                                                className={`hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer ${
                                                    isSelected ? 'bg-red-50/60 dark:bg-zinc-800 border-l-2 border-red-600 dark:border-red-500' : ''
                                                }`}
                                            >
                                                <td className="p-2.5 font-bold text-[11px] text-slate-900 dark:text-zinc-100 truncate max-w-[120px]" title={pkg.id}>
                                                    {pkg.id}
                                                    <span className="text-[9px] text-slate-400 dark:text-zinc-500 block font-normal">
                                                        {pkg.created_at ? String(pkg.created_at).substring(0, 10) : ''}
                                                    </span>
                                                </td>

                                                <td className="p-2.5 text-[11px] text-slate-700 dark:text-zinc-300">
                                                    <span className="block truncate max-w-[140px]" title={pkg.source_job_id}>
                                                        Job: {String(pkg.source_job_id || '').substring(0, 12)}...
                                                    </span>
                                                    <span className="text-[9px] text-slate-400 dark:text-zinc-500 block truncate max-w-[140px]" title={pkg.source_artifact_id}>
                                                        Base: {String(pkg.source_artifact_id || '').substring(0, 12)}...
                                                    </span>
                                                </td>

                                                <td className="p-2.5 text-[11px] text-slate-800 dark:text-zinc-300">
                                                    <span className="font-bold text-slate-900 dark:text-zinc-100 block">{formatStr}</span>
                                                    <span className="text-[10px] text-slate-500 dark:text-zinc-500 block">{pagesStr} • {bindingStr}</span>
                                                </td>

                                                <td className="p-2.5">
                                                    {renderStatusIndicator(pkg.status)}
                                                </td>

                                                <td className="p-2.5 text-[10px] text-slate-600 dark:text-zinc-400 truncate max-w-[100px]">
                                                    {pkg.assigned_printer_tenant_id ? (
                                                        <span className="text-red-600 dark:text-red-500 font-bold" title={pkg.assigned_printer_tenant_id}>
                                                            {String(pkg.assigned_printer_tenant_id || '').substring(0, 10)}...
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 dark:text-zinc-500 italic-text-off">Unassigned</span>
                                                    )}
                                                </td>

                                                <td className="p-2.5 text-center">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedPackage(pkg);
                                                            setMatchingResults(null);
                                                        }}
                                                        className={`p-1 rounded-none border transition-colors ${
                                                            isSelected
                                                                ? 'bg-slate-900 dark:bg-zinc-800 text-white dark:text-zinc-100 border-slate-800 dark:border-zinc-700'
                                                                : 'bg-white dark:bg-zinc-950 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-300 dark:border-zinc-800'
                                                        }`}
                                                    >
                                                        <EyeIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Right-Side Package Operational Detail Drawer Panel */}
                <div className="space-y-4">
                    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-none overflow-hidden shadow-none">
                        <div className="p-3 bg-slate-900 dark:bg-zinc-900 border-b border-slate-800 dark:border-zinc-800 text-white dark:text-zinc-100">
                            <span className="text-xs font-mono font-bold uppercase tracking-wider block">
                                Inspection &amp; Routing Engine
                            </span>
                        </div>

                        {selectedPackage ? (
                            <div className="p-4 space-y-4 text-xs font-mono text-slate-700 dark:text-zinc-300">
                                {/* Core Properties */}
                                <div className="space-y-1 border-b border-slate-200 dark:border-zinc-800 pb-3">
                                    <span className="text-[9px] text-slate-400 dark:text-zinc-500 block uppercase">Package Reference Token</span>
                                    <span className="font-bold text-sm text-slate-900 dark:text-zinc-100 block break-all select-all bg-slate-50 dark:bg-zinc-950 p-1.5 border border-slate-200 dark:border-zinc-800">
                                        {selectedPackage.id}
                                    </span>
                                    <div className="flex justify-between items-center pt-1">
                                        <span className="text-[10px] text-slate-500 dark:text-zinc-500">Created: {selectedPackage.created_at || 'N/A'}</span>
                                        {renderStatusIndicator(selectedPackage.status)}
                                    </div>
                                </div>

                                {/* Artifact Traceability Maps */}
                                <div className="space-y-2 border-b border-slate-200 dark:border-zinc-800 pb-3">
                                    <span className="text-[9px] text-slate-400 dark:text-zinc-500 block uppercase font-bold">Artifact Resolution Hashmap</span>
                                    
                                    <div className="grid grid-cols-1 gap-1 text-[11px]">
                                        <div className="p-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex justify-between">
                                            <span className="text-slate-500 dark:text-zinc-500">Source Job:</span>
                                            <span className="font-bold text-slate-900 dark:text-zinc-100 truncate max-w-[140px]" title={selectedPackage.source_job_id}>
                                                {selectedPackage.source_job_id}
                                            </span>
                                        </div>
                                        <div className="p-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex justify-between">
                                            <span className="text-slate-500 dark:text-zinc-500">Source Artifact:</span>
                                            <span className="font-bold text-slate-900 dark:text-zinc-100 truncate max-w-[140px]" title={selectedPackage.source_artifact_id}>
                                                {selectedPackage.source_artifact_id}
                                            </span>
                                        </div>
                                        <div className="p-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex justify-between items-center">
                                            <span className="text-slate-500 dark:text-zinc-500">Fixed PDF Base:</span>
                                            {selectedPackage.fixed_pdf_artifact_id ? (
                                                <span className="font-bold text-emerald-800 dark:text-green-400 truncate max-w-[140px]" title={selectedPackage.fixed_pdf_artifact_id}>
                                                    ✓ {String(selectedPackage.fixed_pdf_artifact_id || '').substring(0, 10)}...
                                                </span>
                                            ) : (
                                                <span className="text-red-600 dark:text-red-400 font-bold text-[10px]">Missing Autofix</span>
                                            )}
                                        </div>
                                        <div className="p-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex justify-between items-center">
                                            <span className="text-slate-500 dark:text-zinc-500">Certified Profile:</span>
                                            {selectedPackage.certified_pdf_artifact_id ? (
                                                <span className="font-bold text-red-600 dark:text-red-500 truncate max-w-[140px]" title={selectedPackage.certified_pdf_artifact_id}>
                                                    ✓ Certified
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 dark:text-zinc-500 italic-text-off text-[10px]">Standard Base</span>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-[9px] text-slate-400 dark:text-zinc-500 block">Policy Assignment: {selectedPackage.policy_id || 'System Dynamic Policy'}</span>
                                </div>

                                {/* Target Assignment Mapping */}
                                <div className="space-y-1 border-b border-slate-200 dark:border-zinc-800 pb-3">
                                    <span className="text-[9px] text-slate-400 dark:text-zinc-500 block uppercase font-bold">Assigned Topology Node Destination</span>
                                    <div className="p-2 bg-slate-900 dark:bg-zinc-950 text-slate-100 dark:text-zinc-100 border border-slate-800 dark:border-zinc-800 rounded-none">
                                        <div className="flex items-center space-x-1.5">
                                            <BuildingOfficeIcon className="w-4 h-4 text-red-600 dark:text-red-500 flex-shrink-0" />
                                            <span className="text-xs font-bold truncate">
                                                {selectedPackage.assigned_printer_tenant_id ? `Tenant: ${selectedPackage.assigned_printer_tenant_id}` : 'UNASSIGNED PLATFORM POOL'}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1">
                                            Assigned Machine Target: <span className="text-slate-300 dark:text-zinc-300 font-bold">Automatic Load Balancer Pool</span>
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-slate-500 dark:text-zinc-500 pt-0.5">
                                        Dispatch Readiness: <span className="font-bold text-emerald-700 dark:text-green-400">Fully Assembly Validated</span> • Bundle Available: <span className="font-bold text-red-600 dark:text-red-500">Yes</span>
                                    </div>
                                </div>

                                {/* Action Matrix: Bundle Download */}
                                <div className="pt-1">
                                    <button
                                        onClick={() => downloadProductionBundle(selectedPackage.id)}
                                        className="w-full py-2 bg-slate-950 hover:bg-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white dark:text-zinc-100 font-mono font-bold text-xs uppercase tracking-wider rounded-none transition-all flex items-center justify-center space-x-2 border border-slate-900 dark:border-zinc-700"
                                    >
                                        <ArrowDownTrayIcon className="w-4 h-4 text-red-600 dark:text-red-500" />
                                        <span>Download Assembly Bundle</span>
                                    </button>
                                </div>

                                {/* Action Matrix: Node Matching Simulation */}
                                <div className="bg-slate-50 dark:bg-zinc-950 p-2.5 border border-slate-200 dark:border-zinc-800 space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 uppercase">Intelligent Node Matcher</span>
                                        <button
                                            onClick={() => handleRunNodeMatching(selectedPackage.id)}
                                            disabled={matchingLoading}
                                            className="px-2 py-1 bg-white hover:bg-slate-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-900 dark:text-zinc-100 border border-slate-300 dark:border-zinc-700 text-[10px] font-bold uppercase transition-all flex items-center space-x-1"
                                        >
                                            <SparklesIcon className={`w-3 h-3 text-amber-500 ${matchingLoading ? 'animate-spin' : ''}`} />
                                            <span>Run Simulation</span>
                                        </button>
                                    </div>

                                    {matchingResults && (
                                        <div className="space-y-1 pt-1 border-t border-slate-200 dark:border-zinc-800 max-h-32 overflow-y-auto">
                                            <span className="text-[9px] text-slate-500 dark:text-zinc-500 block uppercase">Calculated Node Fit Matrix:</span>
                                            {matchingResults.length === 0 ? (
                                                <span className="text-[10px] text-slate-500 dark:text-zinc-500 block italic-text-off">No strictly optimized node targets mapped fit criteria.</span>
                                            ) : (
                                                matchingResults.map((m: any, idx: number) => (
                                                    <div key={idx} className="p-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[10px] flex justify-between items-center">
                                                        <span className="truncate font-bold text-slate-800 dark:text-zinc-200" title={m.nodeId || m.id}>
                                                            Node: {String(m.nodeId || m.id || '').substring(0, 8)}
                                                        </span>
                                                        <span className="text-emerald-700 dark:text-green-400 font-bold">Fit Score: {m.score ? `${Number(m.score * 100).toFixed(0)}%` : '98%'}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Action Matrix: Orchestration target dispatch */}
                                {selectedPackage.status !== 'COMPLETED' && selectedPackage.status !== 'CANCELLED' && (
                                    <div className="bg-slate-50 dark:bg-zinc-950 p-2.5 border border-slate-200 dark:border-zinc-800 space-y-2">
                                        <span className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 uppercase block">Execute Active Manufacturing Dispatch</span>
                                        
                                        <div className="space-y-1.5">
                                            <div>
                                                <label className="block text-[9px] text-slate-500 dark:text-zinc-500 uppercase">Target Printer Destination Node</label>
                                                <select
                                                    value={selectedNodeId}
                                                    onChange={(e) => setSelectedNodeId(e.target.value)}
                                                    className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs p-1 rounded-none font-mono text-slate-800 dark:text-zinc-300"
                                                >
                                                    {availableNodes.length === 0 ? (
                                                        <option value="">-- No Online Nodes Mapped --</option>
                                                    ) : (
                                                        availableNodes.map(n => (
                                                            <option key={n.id} value={n.id}>
                                                                {toDisplayText(n.companyName || n.company_name)} [{String(n.id || '').substring(0, 8)}]
                                                            </option>
                                                        ))
                                                    )}
                                                </select>
                                            </div>

                                            <div>
                                                <input
                                                    type="text"
                                                    placeholder="Optional priority tag or routing note..."
                                                    value={dispatchMessage}
                                                    onChange={(e) => setDispatchMessage(e.target.value)}
                                                    className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs p-1 rounded-none font-mono text-slate-800 dark:text-zinc-300 placeholder-slate-400 dark:placeholder-zinc-600"
                                                />
                                            </div>

                                            <button
                                                onClick={() => handleDispatchPackage(selectedPackage.id)}
                                                disabled={dispatchingLoading || !selectedNodeId}
                                                className="w-full py-1.5 bg-red-950 hover:bg-red-900 dark:bg-red-950/40 dark:hover:bg-red-900/60 disabled:bg-slate-200 dark:disabled:bg-zinc-800 text-red-300 dark:text-red-400 disabled:text-slate-400 dark:disabled:text-zinc-600 font-bold text-[11px] uppercase tracking-wider transition-all flex items-center justify-center space-x-1 border border-red-900 dark:border-red-900/60 rounded-none"
                                            >
                                                <PaperAirplaneIcon className="w-3 h-3" />
                                                <span>{dispatchingLoading ? 'Transmitting...' : 'Orchestrate Dispatch Frame'}</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Lifecycle Progression Status Control Matrix */}
                                <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-zinc-800">
                                    <span className="text-[9px] text-slate-500 dark:text-zinc-500 block uppercase font-bold">Lifecycle State Override Engine</span>
                                    
                                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                                        {selectedPackage.status === 'DRAFT' && (
                                            <button
                                                onClick={() => handleStatusTransition(selectedPackage.id, 'READY_FOR_DISPATCH')}
                                                className="p-1 bg-white dark:bg-zinc-950 hover:bg-slate-900 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-300 hover:text-white dark:hover:text-zinc-100 border border-slate-300 dark:border-zinc-800 font-bold uppercase transition-colors"
                                            >
                                                Mark Ready
                                            </button>
                                        )}
                                        {(selectedPackage.status === 'READY_FOR_DISPATCH' || selectedPackage.status === 'REJECTED_BY_PRINTER') && (
                                            <button
                                                onClick={() => handleStatusTransition(selectedPackage.id, 'DISPATCHED')}
                                                className="p-1 bg-white dark:bg-zinc-950 hover:bg-slate-900 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-300 hover:text-white dark:hover:text-zinc-100 border border-slate-300 dark:border-zinc-800 font-bold uppercase transition-colors"
                                            >
                                                Set Dispatched
                                            </button>
                                        )}
                                        {selectedPackage.status === 'DISPATCHED' && (
                                            <>
                                                <button
                                                    onClick={() => handleStatusTransition(selectedPackage.id, 'ACCEPTED_BY_PRINTER')}
                                                    className="p-1 bg-emerald-950 dark:bg-green-950/40 text-emerald-300 dark:text-green-400 border border-emerald-800 dark:border-green-900/60 font-bold uppercase"
                                                >
                                                    Simulate Accept
                                                </button>
                                                <button
                                                    onClick={() => handleStatusTransition(selectedPackage.id, 'REJECTED_BY_PRINTER')}
                                                    className="p-1 bg-red-950 dark:bg-red-950/40 text-red-300 dark:text-red-400 border border-red-800 dark:border-red-900/60 font-bold uppercase"
                                                >
                                                    Simulate Reject
                                                </button>
                                            </>
                                        )}
                                        {selectedPackage.status === 'ACCEPTED_BY_PRINTER' && (
                                            <button
                                                onClick={() => handleStatusTransition(selectedPackage.id, 'IN_PRODUCTION')}
                                                className="p-1 bg-white dark:bg-zinc-950 hover:bg-slate-900 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-300 hover:text-white dark:hover:text-zinc-100 border border-slate-300 dark:border-zinc-800 font-bold uppercase transition-colors"
                                            >
                                                Start Production
                                            </button>
                                        )}
                                        {selectedPackage.status === 'IN_PRODUCTION' && (
                                            <button
                                                onClick={() => handleStatusTransition(selectedPackage.id, 'COMPLETED')}
                                                className="p-1 bg-emerald-950 dark:bg-green-950/40 text-emerald-300 dark:text-green-400 border border-emerald-800 dark:border-green-900/60 font-bold uppercase col-span-2"
                                            >
                                                Finalize Settlement (COMPLETED)
                                            </button>
                                        )}
                                        {selectedPackage.status !== 'COMPLETED' && selectedPackage.status !== 'CANCELLED' && (
                                            <button
                                                onClick={() => {
                                                    if (confirm('Are you certain you wish to terminate this manufacturing frame?')) {
                                                        handleStatusTransition(selectedPackage.id, 'CANCELLED');
                                                    }
                                                }}
                                                className="p-1 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 hover:bg-red-950 dark:hover:bg-red-900 border border-red-200 dark:border-red-900/60 font-bold uppercase col-span-2 transition-colors mt-1"
                                            >
                                                Cancel Package Matrix
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-12 text-center text-xs text-slate-500 dark:text-zinc-500 font-mono italic-text-off">
                                Choose any persistent manufacturing row item to inspect assembly metadata blocks, run topological matchers, or broadcast live dispatches.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
