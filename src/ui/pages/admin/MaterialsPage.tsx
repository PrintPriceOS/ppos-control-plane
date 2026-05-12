import React, { useState, useEffect } from "react";
import {
    DocumentTextIcon,
    ExclamationTriangleIcon,
    ArrowPathIcon,
    CheckBadgeIcon,
    ShieldExclamationIcon,
    CpuChipIcon,
    PlusCircleIcon,
    MinusCircleIcon,
    EyeIcon
} from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";
import { toDisplayText } from "../../lib/formatters";

export const MaterialsPage: React.FC = () => {
    const [materials, setMaterials] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMaterial, setSelectedMaterial] = useState<any | null>(null);
    const [reservingId, setReservingId] = useState<string | null>(null);
    const [reserveUnits, setReserveUnits] = useState<number>(500);
    const [targetNodeId, setTargetNodeId] = useState<string>("");
    const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    useEffect(() => {
        fetchCatalog();
        const interval = setInterval(fetchCatalog, 10000);
        return () => clearInterval(interval);
    }, [targetNodeId]);

    const fetchCatalog = async () => {
        try {
            let res;
            if (targetNodeId && targetNodeId.trim() !== "") {
                res = await adminApi.getNodeMaterialsInventory(targetNodeId.trim());
            } else {
                res = await adminApi.getMaterialsCatalog();
            }
            setMaterials(Array.isArray(res?.data) ? res.data : []);
            setLoading(false);
        } catch (err: any) {
            console.error("Failed to fetch materials catalog:", err);
            setActionFeedback({ type: 'error', message: err.message || "Failed to sync inventory state" });
            setLoading(false);
        }
    };

    const handleReserve = async (mat: any) => {
        setReservingId(mat.id);
        setActionFeedback(null);
        try {
            await adminApi.reserveMaterialCapacity(
                `test-alloc-${Date.now()}`,
                mat.node_id,
                { material_id: mat.id, units: reserveUnits }
            );
            setActionFeedback({ type: 'success', message: `Successfully locked ${reserveUnits} units for [${mat.material_name}]` });
            await fetchCatalog();
            if (selectedMaterial?.id === mat.id) {
                const refreshed = await adminApi.getMaterialDetail(mat.id);
                if (refreshed?.data) setSelectedMaterial(refreshed.data);
            }
        } catch (err: any) {
            setActionFeedback({ type: 'error', message: err.message || "Reservation lock rejected due to inventory constraint" });
        } finally {
            setReservingId(null);
        }
    };

    const handleRelease = async (mat: any) => {
        setReservingId(mat.id);
        setActionFeedback(null);
        try {
            await adminApi.releaseMaterialCapacity(
                `test-alloc-${Date.now()}`,
                mat.node_id,
                { material_id: mat.id, units: reserveUnits }
            );
            setActionFeedback({ type: 'success', message: `Released ${reserveUnits} units back to active inventory pool` });
            await fetchCatalog();
            if (selectedMaterial?.id === mat.id) {
                const refreshed = await adminApi.getMaterialDetail(mat.id);
                if (refreshed?.data) setSelectedMaterial(refreshed.data);
            }
        } catch (err: any) {
            setActionFeedback({ type: 'error', message: err.message || "Failed to release held material allocation" });
        } finally {
            setReservingId(null);
        }
    };

    const renderRiskBadge = (risk: string) => {
        switch (risk) {
            case 'SHORTAGE_RISK':
                return (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-none text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                        <ExclamationTriangleIcon className="w-3 h-3 mr-1 text-red-500" /> Critical Shortage
                    </span>
                );
            case 'LOW_STOCK':
                return (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-none text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        <ShieldExclamationIcon className="w-3 h-3 mr-1 text-amber-500" /> Depleting Stock
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-none text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckBadgeIcon className="w-3 h-3 mr-1 text-emerald-500" /> Stable Supply
                    </span>
                );
        }
    };

    const renderStatusBadge = (status: string) => {
        const isAvail = status === 'AVAILABLE';
        return (
            <span className={`px-2 py-0.5 text-[10px] font-mono tracking-wider rounded-none uppercase ${
                isAvail ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'
            }`}>
                {status || 'UNKNOWN'}
            </span>
        );
    };

    const totalStock = materials.reduce((acc, m) => acc + (Number(m.current_stock_units) || 0), 0);
    const totalReserved = materials.reduce((acc, m) => acc + (Number(m.reserved_stock_units) || 0), 0);
    const criticalCount = materials.filter(m => m.shortage_risk === 'SHORTAGE_RISK').length;

    return (
        <div className="space-y-6 text-slate-100 ppos-layout-transition">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-none">
                <div>
                    <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20 rounded-none uppercase tracking-widest">
                            MES INFRASTRUCTURE LAYER
                        </span>
                        <span className="text-xs font-mono text-slate-500">v1.9.0-LIVE</span>
                    </div>
                    <h1 className="text-xl font-bold font-mono tracking-tight text-white mt-1 flex items-center">
                        <DocumentTextIcon className="w-5 h-5 mr-2 text-red-500" />
                        Materials &amp; Paper Catalog
                    </h1>
                    <p className="text-xs text-slate-400 mt-0.5">
                        Live real-time printing substrate tracking, machine allocation locks, and depletion forecasting.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 border border-slate-800 rounded-none">
                        <CpuChipIcon className="w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Filter Node ID..."
                            value={targetNodeId}
                            onChange={(e) => {
                                setTargetNodeId(e.target.value);
                                setLoading(true);
                            }}
                            className="bg-transparent text-xs text-white focus:outline-none w-28 font-mono placeholder-slate-600"
                        />
                        {targetNodeId && (
                            <button onClick={() => setTargetNodeId("")} className="text-[10px] text-red-400 hover:text-white font-mono">
                                [clear]
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => { setLoading(true); fetchCatalog(); }}
                        disabled={loading}
                        className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-mono flex items-center space-x-1 transition-all rounded-none"
                    >
                        <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-500' : ''}`} />
                        <span>Sync Telemetry</span>
                    </button>
                </div>
            </div>

            {/* Metrics Overview Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-none relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 left-0 h-full w-1 bg-slate-700 group-hover:bg-red-500 transition-colors" />
                    <span className="text-[10px] font-mono text-slate-500 block uppercase tracking-wider">Registered Stock Units</span>
                    <span className="text-2xl font-bold font-mono text-white block mt-1">
                        {totalStock.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-1 font-mono">Total tracked capacity</span>
                </div>

                <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-none relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 left-0 h-full w-1 bg-slate-700 group-hover:bg-amber-500 transition-colors" />
                    <span className="text-[10px] font-mono text-slate-500 block uppercase tracking-wider">Reserved Capacity Locks</span>
                    <span className="text-2xl font-bold font-mono text-amber-400 block mt-1">
                        {totalReserved.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-1 font-mono">Pending multi-node dispatches</span>
                </div>

                <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-none relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 left-0 h-full w-1 bg-slate-700 group-hover:bg-emerald-500 transition-colors" />
                    <span className="text-[10px] font-mono text-slate-500 block uppercase tracking-wider">Net Available Units</span>
                    <span className="text-2xl font-bold font-mono text-emerald-400 block mt-1">
                        {(totalStock - totalReserved).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-1 font-mono">Unallocated supply threshold</span>
                </div>

                <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-none relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 left-0 h-full w-1 bg-slate-700 group-hover:bg-red-500 transition-colors" />
                    <span className="text-[10px] font-mono text-slate-500 block uppercase tracking-wider">Shortage Impact Nodes</span>
                    <span className={`text-2xl font-bold font-mono block mt-1 ${criticalCount > 0 ? 'text-red-500 animate-pulse' : 'text-slate-300'}`}>
                        {criticalCount}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-1 font-mono">Requiring inventory restock</span>
                </div>
            </div>

            {/* Action Feedback Alerts */}
            {actionFeedback && (
                <div className={`p-3 border text-xs font-mono flex items-center justify-between rounded-none animate-fade-in ${
                    actionFeedback.type === 'success' ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300' : 'bg-red-950/80 border-red-800 text-red-300'
                }`}>
                    <div className="flex items-center space-x-2">
                        {actionFeedback.type === 'success' ? (
                            <CheckBadgeIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        ) : (
                            <ExclamationTriangleIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                        <span>{toDisplayText(actionFeedback.message)}</span>
                    </div>
                    <button onClick={() => setActionFeedback(null)} className="text-[10px] underline uppercase tracking-wider hover:text-white ml-2">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Main Interactive Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Catalog Table Area (Spans 2 Cols) */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-none flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center">
                            <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-ping" />
                            Substrate Registry Datastore
                        </span>
                        <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-mono text-slate-500">Test Reservation Units:</span>
                            <select
                                value={reserveUnits}
                                onChange={(e) => setReserveUnits(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-700 text-[10px] font-mono text-slate-200 px-2 py-0.5 rounded-none focus:outline-none"
                            >
                                <option value={100}>100 Units</option>
                                <option value={500}>500 Units</option>
                                <option value={1000}>1,000 Units</option>
                                <option value={5000}>5,000 Units</option>
                            </select>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-none overflow-x-auto">
                        {loading && materials.length === 0 ? (
                            <div className="p-12 text-center text-xs font-mono text-slate-500">
                                <ArrowPathIcon className="w-6 h-6 mx-auto animate-spin text-red-500 mb-2" />
                                Synchronizing live materials catalog telemetry...
                            </div>
                        ) : materials.length === 0 ? (
                            <div className="p-12 text-center text-xs font-mono text-slate-500">
                                No physical materials catalog items found matching scope criteria.
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-800 bg-slate-950/50 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                                        <th className="p-3">Material Specs</th>
                                        <th className="p-3">Physical Node</th>
                                        <th className="p-3 text-right">Stock (Net Avail)</th>
                                        <th className="p-3">Shortage Forecast</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                                    {materials.map((m) => {
                                        const avail = m.current_stock_units - m.reserved_stock_units;
                                        const isSelected = selectedMaterial?.id === m.id;
                                        return (
                                            <tr 
                                                key={m.id} 
                                                className={`hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-slate-800/80 border-l-2 border-red-500' : ''}`}
                                            >
                                                <td className="p-3">
                                                    <div className="font-bold text-white flex items-center">
                                                        <span>{m.material_name}</span>
                                                        <span className="ml-2 px-1.5 py-0.2 bg-slate-800 text-[9px] text-slate-400 rounded-none border border-slate-700">
                                                            {m.material_type}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                                        {m.paper_gsm ? `${m.paper_gsm} GSM` : 'N/A'} • Finish: <span className="text-slate-300">{m.finish || 'UNSPECIFIED'}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-slate-400 text-[10px]">
                                                    <span className="font-bold text-slate-300 block">{m.node_id}</span>
                                                    <span className="text-slate-500">Target Printer Scope</span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="font-bold text-white">
                                                        {Number(m.current_stock_units).toLocaleString()}
                                                    </div>
                                                    <div className={`text-[10px] ${avail <= 0 ? 'text-red-400 font-bold' : 'text-emerald-400'}`}>
                                                        Net: {avail.toLocaleString()}
                                                    </div>
                                                    {m.reserved_stock_units > 0 && (
                                                        <div className="text-[9px] text-amber-500/90">
                                                            Locked: {Number(m.reserved_stock_units).toLocaleString()}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    <div className="mb-1">{renderRiskBadge(m.shortage_risk)}</div>
                                                    <span className="text-[9px] text-slate-500 block">
                                                        Depletion: ~{m.depletion_forecast_days || 30}d threshold
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    {renderStatusBadge(m.operational_status)}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <div className="flex items-center justify-center space-x-1.5">
                                                        <button
                                                            onClick={() => setSelectedMaterial(m)}
                                                            title="View live payload evidence"
                                                            className="p-1 bg-slate-950 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-800 rounded-none transition-colors"
                                                        >
                                                            <EyeIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleReserve(m)}
                                                            disabled={reservingId === m.id || avail < reserveUnits}
                                                            title={`Lock ${reserveUnits} units`}
                                                            className={`p-1 border rounded-none transition-all flex items-center space-x-0.5 text-[10px] px-1.5 ${
                                                                avail < reserveUnits 
                                                                    ? 'bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed' 
                                                                    : 'bg-slate-950 hover:bg-red-950 text-slate-300 hover:text-red-300 border-slate-700 hover:border-red-800'
                                                            }`}
                                                        >
                                                            <PlusCircleIcon className="w-3 h-3 text-red-500" />
                                                            <span>Lock</span>
                                                        </button>
                                                        {m.reserved_stock_units > 0 && (
                                                            <button
                                                                onClick={() => handleRelease(m)}
                                                                disabled={reservingId === m.id}
                                                                title={`Release ${reserveUnits} units`}
                                                                className="p-1 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-amber-400 border border-slate-800 rounded-none transition-colors text-[10px] px-1.5 flex items-center space-x-0.5"
                                                            >
                                                                <MinusCircleIcon className="w-3 h-3 text-amber-500" />
                                                                <span>Free</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Substrate Detail View Drawer Sidebar */}
                <div className="space-y-4">
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-none">
                        <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider block border-b border-slate-800 pb-2.5">
                            Telemetry Spec Verification
                        </span>

                        {selectedMaterial ? (
                            <div className="mt-4 space-y-4 font-mono text-xs">
                                <div>
                                    <span className="text-[10px] text-slate-500 block uppercase">Canonical Material Identifier</span>
                                    <span className="font-bold text-white text-[11px] block break-all select-all bg-slate-950 p-1.5 border border-slate-800 mt-1">
                                        {selectedMaterial.id}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-slate-950 p-2 border border-slate-800">
                                        <span className="text-[9px] text-slate-500 block uppercase">Substrate Class</span>
                                        <span className="font-bold text-red-400 block mt-0.5">{selectedMaterial.material_type}</span>
                                    </div>
                                    <div className="bg-slate-950 p-2 border border-slate-800">
                                        <span className="text-[9px] text-slate-500 block uppercase">Weight Specs</span>
                                        <span className="font-bold text-slate-200 block mt-0.5">{selectedMaterial.paper_gsm ? `${selectedMaterial.paper_gsm} GSM` : 'UNSPECIFIED'}</span>
                                    </div>
                                </div>

                                <div className="bg-slate-950 p-2.5 border border-slate-800 space-y-1.5">
                                    <span className="text-[9px] text-slate-500 block uppercase border-b border-slate-800 pb-1">Inventory Depletion Matrix</span>
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-slate-400">Tracked Base Stock:</span>
                                        <span className="font-bold text-white">{Number(selectedMaterial.current_stock_units).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-slate-400">Held Reserved:</span>
                                        <span className="font-bold text-amber-400">{Number(selectedMaterial.reserved_stock_units).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-[11px] border-t border-slate-800/80 pt-1">
                                        <span className="text-slate-400">Net Operable Pool:</span>
                                        <span className="font-bold text-emerald-400">{(selectedMaterial.current_stock_units - selectedMaterial.reserved_stock_units).toLocaleString()}</span>
                                    </div>
                                </div>

                                <div>
                                    <span className="text-[10px] text-slate-500 block uppercase">Lifecycle Status</span>
                                    <div className="mt-1 flex gap-2">
                                        {renderStatusBadge(selectedMaterial.operational_status)}
                                        {renderRiskBadge(selectedMaterial.shortage_risk)}
                                    </div>
                                </div>

                                <div>
                                    <span className="text-[10px] text-slate-500 block uppercase mb-1">Raw Telemetry Payload Snapshot</span>
                                    <pre className="bg-slate-950 text-[10px] text-slate-400 p-2.5 border border-slate-800 overflow-x-auto max-h-48 rounded-none">
                                        {JSON.stringify(selectedMaterial, null, 2)}
                                    </pre>
                                </div>

                                <div className="pt-2">
                                    <button
                                        onClick={() => setSelectedMaterial(null)}
                                        className="w-full py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-[10px] uppercase tracking-wider transition-colors rounded-none"
                                    >
                                        Close Panel Context
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-12 text-center text-xs text-slate-600 font-mono italic-text-off">
                                Click the view evidence icon on any row to drill down into precise real-time inventory synchronization attributes.
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-none space-y-2">
                        <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
                            Orchestration Verification
                        </span>
                        <p className="text-[11px] font-mono text-slate-500 leading-relaxed">
                            Capacity locks operate on zero-latency validation bounds. Invoking lock allocations reserves physical inventory from global scheduling availability prior to print job dispatch routing completion.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
