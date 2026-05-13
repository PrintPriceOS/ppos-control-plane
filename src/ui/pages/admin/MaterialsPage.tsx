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
    EyeIcon,
    PlusIcon,
    WrenchScrewdriverIcon,
    TruckIcon,
    ClockIcon,
    ArchiveBoxIcon,
    XMarkIcon
} from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";
import { toDisplayText } from "../../lib/formatters";
import { useTheme } from "../../hooks/useTheme";

export const MaterialsPage: React.FC = () => {
    const theme = useTheme();
    const isLight = theme === 'light';

    const [materials, setMaterials] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMaterial, setSelectedMaterial] = useState<any | null>(null);
    const [targetNodeId, setTargetNodeId] = useState<string>("");
    const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    // Operator Workflows Extended Modals & Drawer State
    const [activeModal, setActiveModal] = useState<null | 'ADD_MATERIAL' | 'INTAKE' | 'ADJUST' | 'RESERVE' | 'CONSUME' | 'PROCUREMENT'>(null);
    const [modalMaterial, setModalMaterial] = useState<any | null>(null);
    const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
    const [procurementsList, setProcurementsList] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'DETAILS' | 'TIMELINE' | 'PROCUREMENTS'>('DETAILS');

    // Form states
    const [addMatForm, setAddMatForm] = useState({
        material_name: '',
        material_type: 'PAPER',
        gsm: 100,
        sheet_format: 'SRA3',
        finish_type: 'UNCOATED',
        supplier_name: '',
        cost_per_unit: 0.05,
        initial_stock: 5000,
        reorder_point: 1000,
        replenishment_lead_days: 7,
        node_id: 'node-alpha-1'
    });

    const [intakeForm, setIntakeForm] = useState({
        quantity: 2500,
        reason: 'Regular Warehouse Restock Bay Intake',
        supplier_batch: 'BATCH-SUP-01',
        expected_use: 'Standard Core Manufacturing'
    });

    const [adjustForm, setAdjustForm] = useState({
        quantity_delta: 0,
        reason: 'Physical Handcount Inventory Override',
        operator_note: ''
    });

    const [reserveForm, setReserveForm] = useState({
        quantity: 500,
        job_id: 'JOB-MAN-001',
        dispatch_id: 'DISP-ORCH-001',
        expiration: ''
    });

    const [consumeForm, setConsumeForm] = useState({
        quantity_consumed: 500,
        waste_units: 15,
        reason: 'Post-Production Run Material Clearance',
        job_id: 'JOB-MAN-001'
    });

    const [procurementForm, setProcurementForm] = useState({
        supplier_name: '',
        ordered_units: 10000,
        expected_delivery_date: '',
        risk: 'LOW',
        notes: 'Standard Restock Replenishment Order'
    });

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
            const loaded = Array.isArray(res?.materials) ? res.materials : (Array.isArray(res?.data) ? res.data : []);
            console.info('[MATERIALS][PAGE][LOADED]', {
                rawCount: res?.materials?.length || res?.data?.length,
                materialsCount: loaded?.length,
                filteredCount: loaded?.length,
                nodeFilter: targetNodeId,
                first: loaded?.[0]
            });
            setMaterials(loaded);
            setLoading(false);
        } catch (err: any) {
            console.error("Failed to fetch materials catalog:", err);
            setActionFeedback({ type: 'error', message: err.message || "Failed to sync inventory state" });
            setLoading(false);
        }
    };

    const handleSelectMaterial = async (m: any) => {
        setSelectedMaterial(m);
        setActiveTab('DETAILS');
        try {
            const evts = await adminApi.getMaterialTimelineEvents(m.id);
            setTimelineEvents(Array.isArray(evts?.events) ? evts.events : []);
            const procs = await adminApi.getMaterialProcurementList(m.id);
            setProcurementsList(Array.isArray(procs?.procurements) ? procs.procurements : []);
        } catch (err) {
            console.error("Failed to fetch drilldown artifacts", err);
        }
    };

    const triggerModal = (type: 'INTAKE' | 'ADJUST' | 'RESERVE' | 'CONSUME' | 'PROCUREMENT', mat: any) => {
        setModalMaterial(mat);
        setActiveModal(type);
        setActionFeedback(null);
        // Preset related defaults
        if (type === 'PROCUREMENT') {
            setProcurementForm(prev => ({ ...prev, supplier_name: mat.supplier_name || 'Global Core Supplier' }));
        }
    };

    // Form handlers
    const handleAddMaterialSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setActionFeedback(null);
        try {
            await adminApi.createCatalogMaterial(addMatForm);
            setActionFeedback({ type: 'success', message: `Successfully registered new material [${addMatForm.material_name}]` });
            setActiveModal(null);
            await fetchCatalog();
            // Reset form
            setAddMatForm({
                material_name: '',
                material_type: 'PAPER',
                gsm: 100,
                sheet_format: 'SRA3',
                finish_type: 'UNCOATED',
                supplier_name: '',
                cost_per_unit: 0.05,
                initial_stock: 5000,
                reorder_point: 1000,
                replenishment_lead_days: 7,
                node_id: 'node-alpha-1'
            });
        } catch (err: any) {
            setActionFeedback({ type: 'error', message: err.message || "Failed to create material specification" });
        }
    };

    const handleIntakeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modalMaterial) return;
        setActionFeedback(null);
        try {
            await adminApi.intakeMaterialStock(modalMaterial.id, intakeForm);
            setActionFeedback({ type: 'success', message: `Intake completed: added ${intakeForm.quantity} units to [${modalMaterial.material_name}]` });
            setActiveModal(null);
            await fetchCatalog();
            if (selectedMaterial?.id === modalMaterial.id) {
                const refreshed = await adminApi.getMaterialDetail(modalMaterial.id);
                if (refreshed?.data) handleSelectMaterial(refreshed.data);
            }
        } catch (err: any) {
            setActionFeedback({ type: 'error', message: err.message || "Intake registration transaction rejected" });
        }
    };

    const handleAdjustSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modalMaterial) return;
        setActionFeedback(null);
        try {
            await adminApi.adjustMaterialStock(modalMaterial.id, adjustForm);
            setActionFeedback({ type: 'success', message: `Audited adjustment recorded for [${modalMaterial.material_name}]` });
            setActiveModal(null);
            await fetchCatalog();
            if (selectedMaterial?.id === modalMaterial.id) {
                const refreshed = await adminApi.getMaterialDetail(modalMaterial.id);
                if (refreshed?.data) handleSelectMaterial(refreshed.data);
            }
        } catch (err: any) {
            setActionFeedback({ type: 'error', message: err.message || "Manual stock adjustment rejected" });
        }
    };

    const handleReserveSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modalMaterial) return;
        setActionFeedback(null);
        try {
            await adminApi.reserveMaterialStockWorkflow(modalMaterial.id, reserveForm);
            setActionFeedback({ type: 'success', message: `Capacity allocation lock placed for ${reserveForm.quantity} units` });
            setActiveModal(null);
            await fetchCatalog();
            if (selectedMaterial?.id === modalMaterial.id) {
                const refreshed = await adminApi.getMaterialDetail(modalMaterial.id);
                if (refreshed?.data) handleSelectMaterial(refreshed.data);
            }
        } catch (err: any) {
            setActionFeedback({ type: 'error', message: err.message || "Reservation capacity lock failed" });
        }
    };

    const handleConsumeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modalMaterial) return;
        setActionFeedback(null);
        try {
            await adminApi.consumeMaterialStock(modalMaterial.id, consumeForm);
            setActionFeedback({ type: 'success', message: `Material successfully recorded as consumed post-production` });
            setActiveModal(null);
            await fetchCatalog();
            if (selectedMaterial?.id === modalMaterial.id) {
                const refreshed = await adminApi.getMaterialDetail(modalMaterial.id);
                if (refreshed?.data) handleSelectMaterial(refreshed.data);
            }
        } catch (err: any) {
            setActionFeedback({ type: 'error', message: err.message || "Depletion consumption recording failed" });
        }
    };

    const handleProcurementSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modalMaterial) return;
        setActionFeedback(null);
        try {
            await adminApi.createMaterialProcurementOrder(modalMaterial.id, procurementForm);
            setActionFeedback({ type: 'success', message: `Restock procurement purchase order issued successfully` });
            setActiveModal(null);
            await fetchCatalog();
            if (selectedMaterial?.id === modalMaterial.id) {
                const refreshed = await adminApi.getMaterialDetail(modalMaterial.id);
                if (refreshed?.data) handleSelectMaterial(refreshed.data);
            }
        } catch (err: any) {
            setActionFeedback({ type: 'error', message: err.message || "Procurement order creation failed" });
        }
    };

    const handleReceiveProcurement = async (procId: string) => {
        setActionFeedback(null);
        try {
            await adminApi.receiveMaterialProcurementOrder(procId);
            setActionFeedback({ type: 'success', message: `Supplier shipment verified and automatically credited to stock pool` });
            await fetchCatalog();
            if (selectedMaterial) {
                const refreshed = await adminApi.getMaterialDetail(selectedMaterial.id);
                if (refreshed?.data) handleSelectMaterial(refreshed.data);
            }
        } catch (err: any) {
            setActionFeedback({ type: 'error', message: err.message || "Shipment acceptance intake failed" });
        }
    };

    const normalizeMaterialStatus = (mat: any, overrideString?: string): { label: string; className: string } => {
        const candidates = [
            overrideString,
            mat?.status,
            mat?.operational_status,
            mat?.shortage_risk,
            mat?.procurement_risk
        ].filter(Boolean).map(s => String(s).toUpperCase());

        let label = 'Stable Supply';
        let className = isLight 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
            : 'bg-emerald-950/40 text-emerald-400 border-emerald-900/60';

        const setStyle = (lbl: string, lightCls: string, darkCls: string) => {
            label = lbl;
            className = isLight ? lightCls : darkCls;
        };

        if (candidates.some(c => ['DISABLED', 'OFFLINE'].includes(c))) {
            setStyle('Offline', 'bg-zinc-100 text-zinc-600 border-zinc-300', 'bg-zinc-800 text-zinc-400 border-zinc-700');
        } else if (candidates.some(c => ['DEPLETED', 'CRITICAL', 'SHORTAGE_RISK'].includes(c))) {
            setStyle('Critical', 'bg-red-50 text-red-700 border-red-200', 'bg-red-950/40 text-red-400 border-red-900/60');
        } else if (candidates.some(c => ['RESERVED', 'LOCKED'].includes(c))) {
            setStyle('Locked', 'bg-amber-50 text-amber-700 border-amber-200', 'bg-amber-950/40 text-amber-400 border-amber-900/60');
        } else if (candidates.some(c => ['LOW_STOCK', 'AT_RISK', 'HIGH', 'MEDIUM'].includes(c))) {
            setStyle('At Risk', 'bg-amber-50 text-amber-700 border-amber-200', 'bg-amber-950/40 text-amber-400 border-amber-900/60');
        } else if (candidates.some(c => ['ACTIVE', 'STABLE', 'STABLE_SUPPLY', 'AVAILABLE', 'LOW', 'NONE'].includes(c))) {
            setStyle('Stable Supply', 'bg-emerald-50 text-emerald-700 border-emerald-200', 'bg-emerald-950/40 text-emerald-400 border-emerald-900/60');
        } else {
            const current = Number(mat?.current_stock_units || 0);
            const reserved = Number(mat?.reserved_stock_units || 0);
            const avail = current - reserved;
            const reorder = Number(mat?.reorder_point || 100);

            if (current <= 0) {
                setStyle('Offline', 'bg-zinc-100 text-zinc-600 border-zinc-300', 'bg-zinc-800 text-zinc-400 border-zinc-700');
            } else if (avail <= 0) {
                setStyle('Critical', 'bg-red-50 text-red-700 border-red-200', 'bg-red-950/40 text-red-400 border-red-900/60');
            } else if (avail <= reorder || (reserved > 0 && reserved >= current * 0.8)) {
                setStyle('At Risk', 'bg-amber-50 text-amber-700 border-amber-200', 'bg-amber-950/40 text-amber-400 border-amber-900/60');
            }
        }

        return { label, className };
    };

    const renderRiskBadge = (mat: any) => {
        const norm = normalizeMaterialStatus(mat, mat?.shortage_risk);
        return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-none text-[10px] font-bold tracking-wider font-manrope uppercase border ${norm.className}`}>
                {norm.label === 'Critical' ? (
                    <ExclamationTriangleIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                ) : norm.label === 'At Risk' || norm.label === 'Locked' ? (
                    <ShieldExclamationIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                ) : (
                    <CheckBadgeIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                )}
                <span>{norm.label}</span>
            </span>
        );
    };

    const renderStatusBadge = (mat: any) => {
        const norm = normalizeMaterialStatus(mat, mat?.status || mat?.operational_status);
        return (
            <span className={`px-2 py-0.5 text-[10px] font-manrope font-bold tracking-wider rounded-none uppercase border ${norm.className}`}>
                {norm.label}
            </span>
        );
    };

    const totalStock = materials.reduce((acc, m) => acc + (Number(m.current_stock_units) || 0), 0);
    const totalReserved = materials.reduce((acc, m) => acc + (Number(m.reserved_stock_units) || 0), 0);
    const criticalCount = materials.filter(m => m.status === 'CRITICAL' || m.shortage_risk === 'SHORTAGE_RISK').length;

    return (
        <div className={`space-y-6 ${isLight ? 'text-zinc-900' : 'text-zinc-100'} ppos-layout-transition font-manrope`}>
            {/* Header Section */}
            <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border rounded-none transition-all ${
                isLight ? 'bg-white border-zinc-200' : 'bg-zinc-950 border-zinc-800'
            }`}>
                <div>
                    <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 text-[10px] font-manrope font-bold bg-red-500/10 text-red-500 border border-red-500/20 rounded-none uppercase tracking-widest">
                            MES INVENTORY ORCHESTRATION LAYER
                        </span>
                        <span className="text-xs font-manrope text-zinc-500 font-bold">PRINTHOUSE WORKFLOW CORE</span>
                    </div>
                    <h1 className={`text-xl font-bold font-manrope tracking-tight mt-1 flex items-center ${
                        isLight ? 'text-zinc-900' : 'text-white'
                    }`}>
                        <DocumentTextIcon className="w-5 h-5 mr-2 text-red-500" />
                        Materials &amp; Substrate Hub
                    </h1>
                    <p className={`text-xs mt-0.5 font-manrope ${
                        isLight ? 'text-zinc-500' : 'text-zinc-400'
                    }`}>
                        Industrial operator catalog management, dynamic intake bays, capacity reservations, and audited supply chains.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className={`flex items-center space-x-2 px-3 py-1.5 border rounded-none transition-all ${
                        isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900 border-zinc-800'
                    }`}>
                        <CpuChipIcon className={`w-4 h-4 ${isLight ? 'text-zinc-400' : 'text-zinc-400'}`} />
                        <input
                            type="text"
                            placeholder="Filter Node ID..."
                            value={targetNodeId}
                            onChange={(e) => {
                                setTargetNodeId(e.target.value);
                                setLoading(true);
                            }}
                            className={`bg-transparent text-xs focus:outline-none w-28 font-manrope ${
                                isLight ? 'text-zinc-900 placeholder-zinc-400' : 'text-white placeholder-zinc-600'
                            }`}
                        />
                        {targetNodeId && (
                            <button onClick={() => setTargetNodeId("")} className="text-[10px] text-red-500 hover:underline font-manrope font-bold">
                                [clear]
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setActiveModal('ADD_MATERIAL')}
                        className={`px-3 py-1.5 border text-xs font-manrope flex items-center space-x-1.5 transition-all rounded-none font-bold ${
                            isLight 
                                ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' 
                                : 'bg-red-950 hover:bg-red-900 text-red-300 hover:text-white border-red-800'
                        }`}
                    >
                        <PlusIcon className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <span>Add Material</span>
                    </button>

                    <button
                        onClick={() => { setLoading(true); fetchCatalog(); }}
                        disabled={loading}
                        className={`px-3 py-1.5 border text-xs font-manrope flex items-center space-x-1 transition-all rounded-none font-bold ${
                            isLight 
                                ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200 disabled:opacity-50' 
                                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-700 disabled:opacity-50'
                        }`}
                    >
                        <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-500' : ''}`} />
                        <span>Sync Telemetry</span>
                    </button>
                </div>
            </div>

            {/* Metrics Overview Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className={`p-4 border rounded-none relative overflow-hidden group transition-all ${
                    isLight ? 'bg-white border-zinc-200 hover:border-zinc-300' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                }`}>
                    <div className="absolute top-0 left-0 h-full w-1 bg-zinc-700 group-hover:bg-red-500 transition-colors" />
                    <span className="text-[10px] font-manrope text-zinc-500 block uppercase tracking-wider font-bold">Registered Stock Units</span>
                    <span className={`text-2xl font-bold font-manrope block mt-1 ${
                        isLight ? 'text-zinc-900' : 'text-white'
                    }`}>
                        {totalStock.toLocaleString()}
                    </span>
                    <span className={`text-[10px] block mt-1 font-manrope ${
                        isLight ? 'text-zinc-400' : 'text-zinc-400'
                    }`}>Total tracked warehouse pools</span>
                </div>

                <div className={`p-4 border rounded-none relative overflow-hidden group transition-all ${
                    isLight ? 'bg-white border-zinc-200 hover:border-zinc-300' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                }`}>
                    <div className="absolute top-0 left-0 h-full w-1 bg-zinc-700 group-hover:bg-amber-500 transition-colors" />
                    <span className="text-[10px] font-manrope text-zinc-500 block uppercase tracking-wider font-bold">Reserved Capacity Locks</span>
                    <span className={`text-2xl font-bold font-manrope block mt-1 ${
                        isLight ? 'text-amber-600' : 'text-amber-400'
                    }`}>
                        {totalReserved.toLocaleString()}
                    </span>
                    <span className={`text-[10px] block mt-1 font-manrope ${
                        isLight ? 'text-zinc-400' : 'text-zinc-400'
                    }`}>Held for active dispatch tasks</span>
                </div>

                <div className={`p-4 border rounded-none relative overflow-hidden group transition-all ${
                    isLight ? 'bg-white border-zinc-200 hover:border-zinc-300' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                }`}>
                    <div className="absolute top-0 left-0 h-full w-1 bg-zinc-700 group-hover:bg-emerald-500 transition-colors" />
                    <span className="text-[10px] font-manrope text-zinc-500 block uppercase tracking-wider font-bold">Net Available Pool</span>
                    <span className={`text-2xl font-bold font-manrope block mt-1 ${
                        isLight ? 'text-emerald-600' : 'text-emerald-400'
                    }`}>
                        {(totalStock - totalReserved).toLocaleString()}
                    </span>
                    <span className={`text-[10px] block mt-1 font-manrope ${
                        isLight ? 'text-zinc-400' : 'text-zinc-400'
                    }`}>Unallocated threshold surplus</span>
                </div>

                <div className={`p-4 border rounded-none relative overflow-hidden group transition-all ${
                    isLight ? 'bg-white border-zinc-200 hover:border-zinc-300' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                }`}>
                    <div className="absolute top-0 left-0 h-full w-1 bg-zinc-700 group-hover:bg-red-500 transition-colors" />
                    <span className="text-[10px] font-manrope text-zinc-500 block uppercase tracking-wider font-bold">Shortage Impact Indicators</span>
                    <span className={`text-2xl font-bold font-manrope block mt-1 ${
                        criticalCount > 0 ? 'text-red-500 animate-pulse' : (isLight ? 'text-zinc-700' : 'text-zinc-300')
                    }`}>
                        {criticalCount}
                    </span>
                    <span className={`text-[10px] block mt-1 font-manrope ${
                        isLight ? 'text-zinc-400' : 'text-zinc-400'
                    }`}>Critical restocks pending</span>
                </div>
            </div>

            {/* Action Feedback Alerts */}
            {actionFeedback && (
                <div className={`p-3 border text-xs font-manrope flex items-center justify-between rounded-none animate-fade-in ${
                    actionFeedback.type === 'success' ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300' : 'bg-red-950/80 border-red-800 text-red-300'
                }`}>
                    <div className="flex items-center space-x-2 font-bold">
                        {actionFeedback.type === 'success' ? (
                            <CheckBadgeIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        ) : (
                            <ExclamationTriangleIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                        <span>{toDisplayText(actionFeedback.message)}</span>
                    </div>
                    <button onClick={() => setActionFeedback(null)} className="text-[10px] underline uppercase tracking-wider hover:text-white ml-2 font-bold">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Main Interactive Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Catalog Table Area (Spans 2 Cols) */}
                <div className="lg:col-span-2 space-y-4">
                    <div className={`p-4 border rounded-none flex items-center justify-between transition-all ${
                        isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-950 border-zinc-800'
                    }`}>
                        <span className={`text-xs font-manrope font-bold uppercase tracking-wider flex items-center ${
                            isLight ? 'text-zinc-900' : 'text-zinc-300'
                        }`}>
                            <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-ping" />
                            Inventory Substrate Pool Datastore
                        </span>
                        <span className="text-[10px] font-manrope font-bold text-zinc-500">
                            Operator SCADA Controls
                        </span>
                    </div>

                    <div className={`border rounded-none overflow-x-auto transition-all ${
                        isLight ? 'bg-white border-zinc-200' : 'bg-zinc-950 border-zinc-800'
                    }`}>
                        {loading && materials.length === 0 ? (
                            <div className="p-12 text-center text-xs font-manrope text-zinc-500 font-bold">
                                <ArrowPathIcon className="w-6 h-6 mx-auto animate-spin text-red-500 mb-2" />
                                Synchronizing real-time inventory SCADA registers...
                            </div>
                        ) : materials.length === 0 ? (
                            <div className="p-12 text-center text-xs font-manrope text-zinc-500 font-bold">
                                No inventory records present matching defined multi-tenant filtering.
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className={`border-b text-[10px] font-manrope font-bold uppercase tracking-wider ${
                                        isLight ? 'bg-zinc-50 text-zinc-500 border-zinc-200' : 'bg-zinc-900/50 text-zinc-400 border-zinc-800'
                                    }`}>
                                        <th className="p-3">Material Profile</th>
                                        <th className="p-3">Node Assign</th>
                                        <th className="p-3 text-right">Physical / Net Avail</th>
                                        <th className="p-3">Telemetry Indicators</th>
                                        <th className="p-3">State</th>
                                        <th className="p-3 text-center">SCADA Operations</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y text-xs font-manrope ${
                                    isLight ? 'divide-zinc-100' : 'divide-zinc-800/60'
                                }`}>
                                    {materials.map((m) => {
                                        const avail = m.current_stock_units - m.reserved_stock_units;
                                        const isSelected = selectedMaterial?.id === m.id;
                                        const percentageUsed = Math.min(100, Math.max(0, (m.reserved_stock_units / (m.current_stock_units || 1)) * 100));
                                        const procRisk = m.procurement_risk || 'LOW';

                                        return (
                                            <tr 
                                                key={m.id} 
                                                className={`transition-colors ${
                                                    isSelected 
                                                        ? (isLight ? 'bg-red-50/50 border-l-2 border-red-500' : 'bg-zinc-900/80 border-l-2 border-red-500') 
                                                        : (isLight ? 'hover:bg-zinc-50' : 'hover:bg-zinc-900/40')
                                                }`}
                                            >
                                                <td className="p-3">
                                                    <div className={`font-bold flex items-center ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                                                        <span>{m.material_name}</span>
                                                        <span className={`ml-2 px-1.5 py-0.2 text-[9px] rounded-none border font-bold ${
                                                            isLight ? 'bg-zinc-100 text-zinc-700 border-zinc-200' : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                                        }`}>
                                                            {m.material_type}
                                                        </span>
                                                    </div>
                                                    <div className={`text-[10px] mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                        {m.paper_gsm ? `${m.paper_gsm} GSM` : 'N/A'} • <span className={`${isLight ? 'text-zinc-700' : 'text-zinc-300'} font-semibold`}>{m.finish || 'UNCOATED'}</span>
                                                    </div>
                                                </td>
                                                <td className={`p-3 text-[10px] ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                    <span className={`font-bold block ${isLight ? 'text-zinc-900' : 'text-zinc-200'}`}>{m.node_id}</span>
                                                    <span className={isLight ? 'text-zinc-400' : 'text-zinc-500'}>Printhouse Target</span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className={`font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                                                        {Number(m.current_stock_units).toLocaleString()} <span className={`text-[9px] font-normal ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>units</span>
                                                    </div>
                                                    <div className={`text-[10px] font-bold ${avail <= 0 ? 'text-red-500' : (isLight ? 'text-emerald-600' : 'text-emerald-400')}`}>
                                                        Net: {avail.toLocaleString()}
                                                    </div>
                                                    <div className={`w-full h-1 mt-1 border overflow-hidden flex ${
                                                        isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-zinc-950 border-zinc-800'
                                                    }`}>
                                                        <div className="bg-amber-500 h-full transition-all" style={{ width: `${percentageUsed}%` }} title={`Reserved: ${percentageUsed.toFixed(0)}%`} />
                                                        <div className={`h-full flex-1 ${avail <= 0 ? 'bg-red-500/20' : 'bg-emerald-500/20'}`} />
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="mb-1 flex flex-wrap gap-1">
                                                        {renderRiskBadge(m)}
                                                        {procRisk !== 'LOW' && (
                                                            <span className={`px-1.5 py-0.2 text-[8px] font-bold border rounded-none uppercase ${
                                                                procRisk === 'CRITICAL' 
                                                                    ? (isLight ? 'bg-red-50 text-red-700 border-red-200' : 'bg-red-950 text-red-400 border-red-800') 
                                                                    : (isLight ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-950 text-amber-400 border-amber-800')
                                                            }`}>
                                                                Proc: {procRisk}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className={`text-[9px] block font-semibold ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                        Depletion threshold: <strong className={isLight ? 'text-zinc-900' : 'text-zinc-200'}>{m.depletion_forecast_days || 30}d</strong>
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    {renderStatusBadge(m)}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <div className="flex flex-wrap items-center justify-center gap-1">
                                                        <button
                                                            onClick={() => handleSelectMaterial(m)}
                                                            title="Inspect Evidence Ledger"
                                                            className={`p-1 px-1.5 border text-[9px] font-bold uppercase rounded-none transition-colors ${
                                                                isLight 
                                                                    ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' 
                                                                    : 'bg-zinc-900 hover:bg-zinc-700 text-zinc-300 hover:text-white border-zinc-800'
                                                            }`}
                                                        >
                                                            Inspect
                                                        </button>
                                                        <button
                                                            onClick={() => triggerModal('INTAKE', m)}
                                                            title="Intake stock units"
                                                            className={`p-1 px-1.5 border text-[9px] font-bold uppercase rounded-none transition-colors ${
                                                                isLight 
                                                                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' 
                                                                    : 'bg-zinc-900 hover:bg-emerald-950 text-zinc-400 hover:text-emerald-300 border-zinc-800 hover:border-emerald-800'
                                                            }`}
                                                        >
                                                            + Intake
                                                        </button>
                                                        <button
                                                            onClick={() => triggerModal('ADJUST', m)}
                                                            title="Audited handcount adjustment"
                                                            className={`p-1 px-1.5 border text-[9px] font-bold uppercase rounded-none transition-colors ${
                                                                isLight 
                                                                    ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' 
                                                                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                                                            }`}
                                                        >
                                                            Adjust
                                                        </button>
                                                        <button
                                                            onClick={() => triggerModal('RESERVE', m)}
                                                            title="Reserve allocation lock"
                                                            className={`p-1 px-1.5 border text-[9px] font-bold uppercase rounded-none transition-colors ${
                                                                isLight 
                                                                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200' 
                                                                    : 'bg-zinc-900 hover:bg-amber-950 text-zinc-400 hover:text-amber-300 border-zinc-800 hover:border-amber-800'
                                                            }`}
                                                        >
                                                            Reserve
                                                        </button>
                                                        <button
                                                            onClick={() => triggerModal('CONSUME', m)}
                                                            title="Permanently consume units"
                                                            className={`p-1 px-1.5 border text-[9px] font-bold uppercase rounded-none transition-colors ${
                                                                isLight 
                                                                    ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' 
                                                                    : 'bg-zinc-900 hover:bg-red-950 text-zinc-400 hover:text-red-300 border-zinc-800 hover:border-red-800'
                                                            }`}
                                                        >
                                                            Consume
                                                        </button>
                                                        <button
                                                            onClick={() => triggerModal('PROCUREMENT', m)}
                                                            title="Issue restock purchase order"
                                                            className={`p-1 px-1.5 border text-[9px] font-bold uppercase rounded-none transition-colors ${
                                                                isLight 
                                                                    ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-200' 
                                                                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-white border-zinc-800'
                                                            }`}
                                                        >
                                                            Restock
                                                        </button>
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

                {/* Extended Side Panel View (Details / Timeline / Procurements) */}
                <div className="space-y-4">
                    <div className={`p-4 border rounded-none transition-all ${
                        isLight ? 'bg-white border-zinc-200' : 'bg-zinc-950 border-zinc-800'
                    }`}>
                        <div className={`flex items-center justify-between border-b pb-2.5 ${
                            isLight ? 'border-zinc-200' : 'border-zinc-800'
                        }`}>
                            <span className={`text-xs font-manrope font-bold uppercase tracking-wider block ${
                                isLight ? 'text-zinc-900' : 'text-zinc-300'
                            }`}>
                                Context Evidence Explorer
                            </span>
                            {selectedMaterial && (
                                <button onClick={() => setSelectedMaterial(null)} className="text-[10px] text-zinc-500 hover:text-red-500 uppercase font-bold">
                                    [clear]
                                </button>
                            )}
                        </div>

                        {selectedMaterial ? (
                            <div className="mt-4 space-y-4 font-manrope text-xs">
                                {/* Explorer Tabs Navigation */}
                                <div className={`flex border-b p-1 gap-1 ${
                                    isLight ? 'bg-zinc-50 border-zinc-200' : 'border-zinc-800 bg-zinc-900/60'
                                }`}>
                                    <button
                                        onClick={() => setActiveTab('DETAILS')}
                                        className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                                            activeTab === 'DETAILS' 
                                                ? (isLight ? 'bg-white text-zinc-900 border border-zinc-200 shadow-2xs' : 'bg-zinc-800 text-white border border-zinc-700') 
                                                : (isLight ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-500 hover:text-zinc-300')
                                        }`}
                                    >
                                        Attributes
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('TIMELINE')}
                                        className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                                            activeTab === 'TIMELINE' 
                                                ? (isLight ? 'bg-white text-zinc-900 border border-zinc-200 shadow-2xs' : 'bg-zinc-800 text-white border border-zinc-700') 
                                                : (isLight ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-500 hover:text-zinc-300')
                                        }`}
                                    >
                                        Events ({timelineEvents.length})
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('PROCUREMENTS')}
                                        className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                                            activeTab === 'PROCUREMENTS' 
                                                ? (isLight ? 'bg-white text-zinc-900 border border-zinc-200 shadow-2xs' : 'bg-zinc-800 text-white border border-zinc-700') 
                                                : (isLight ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-500 hover:text-zinc-300')
                                        }`}
                                    >
                                        Orders ({procurementsList.length})
                                    </button>
                                </div>

                                {/* TAB 1: ATTRIBUTES DETAILS */}
                                {activeTab === 'DETAILS' && (
                                    <div className="space-y-3 animate-fade-in">
                                        <div>
                                            <span className="text-[10px] text-zinc-500 block uppercase font-bold">Material Item Code</span>
                                            <span className={`font-bold font-mono text-[11px] block break-all select-all p-1.5 border mt-0.5 ${
                                                isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                            }`}>
                                                {selectedMaterial.id}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className={`p-2 border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                                                <span className="text-[9px] text-zinc-500 block uppercase font-bold">Substrate Type</span>
                                                <span className="font-bold text-red-500 block mt-0.5">{selectedMaterial.material_type}</span>
                                            </div>
                                            <div className={`p-2 border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                                                <span className="text-[9px] text-zinc-500 block uppercase font-bold">Weight Specs</span>
                                                <span className={`font-bold block mt-0.5 ${isLight ? 'text-zinc-900' : 'text-zinc-200'}`}>{selectedMaterial.paper_gsm ? `${selectedMaterial.paper_gsm} GSM` : 'UNSPECIFIED'}</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className={`p-2 border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                                                <span className="text-[9px] text-zinc-500 block uppercase font-bold">Daily Burn Rate</span>
                                                <span className={`font-bold block mt-0.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>{Number(selectedMaterial.daily_burn_rate || 0).toLocaleString()} <span className="text-[9px] text-zinc-500 font-normal">u/d</span></span>
                                            </div>
                                            <div className={`p-2 border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                                                <span className="text-[9px] text-zinc-500 block uppercase font-bold">Unit Pricing</span>
                                                <span className={`font-bold block mt-0.5 ${isLight ? 'text-zinc-900' : 'text-zinc-200'}`}>${Number(selectedMaterial.cost_per_unit || 0).toFixed(4)}</span>
                                            </div>
                                        </div>

                                        <div className={`p-2 border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                                            <span className="text-[9px] text-zinc-500 block uppercase font-bold">Supplier Pipeline</span>
                                            <div className="flex justify-between items-center mt-0.5">
                                                <span className={`font-bold text-[11px] truncate ${isLight ? 'text-zinc-900' : 'text-zinc-300'}`}>{selectedMaterial.supplier_name || 'Consolidated Substrate Provider'}</span>
                                                <span className={`text-[8px] px-1 py-0.2 font-bold uppercase ml-2 border ${
                                                    selectedMaterial.procurement_risk === 'CRITICAL' 
                                                        ? (isLight ? 'text-red-700 bg-red-50 border-red-200' : 'text-red-400 bg-red-950 border-red-800') 
                                                        : (isLight ? 'text-zinc-600 bg-zinc-100 border-zinc-200' : 'text-zinc-400 bg-zinc-800 border-zinc-700')
                                                }`}>Risk: {selectedMaterial.procurement_risk || 'LOW'}</span>
                                            </div>
                                        </div>

                                        <div className={`p-2 border space-y-1 ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                                            <span className={`text-[9px] text-zinc-500 block uppercase border-b pb-1 font-bold ${isLight ? 'border-zinc-200' : 'border-zinc-800'}`}>Substrate Pools Balance</span>
                                            <div className="flex justify-between text-[11px] pt-1">
                                                <span className="text-zinc-500">Tracked Physical Pool:</span>
                                                <span className={`font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>{Number(selectedMaterial.current_stock_units).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px]">
                                                <span className="text-zinc-500">Allocated Res Locks:</span>
                                                <span className={`font-bold ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>{Number(selectedMaterial.reserved_stock_units).toLocaleString()}</span>
                                            </div>
                                            <div className={`flex justify-between text-[11px] border-t pt-1 ${isLight ? 'border-zinc-200' : 'border-zinc-800/80'}`}>
                                                <span className="text-zinc-500">Net Operational Balance:</span>
                                                <span className={`font-bold ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>{(selectedMaterial.current_stock_units - selectedMaterial.reserved_stock_units).toLocaleString()}</span>
                                            </div>
                                        </div>

                                        <div>
                                            <span className="text-[10px] text-zinc-500 block uppercase font-bold mb-1">State Evaluation</span>
                                            <div className="flex gap-2">
                                                {renderStatusBadge(selectedMaterial)}
                                                {renderRiskBadge(selectedMaterial)}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 2: TIMELINE AUDIT HISTORY */}
                                {activeTab === 'TIMELINE' && (
                                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1 animate-fade-in">
                                        {timelineEvents.length === 0 ? (
                                            <div className="p-6 text-center text-[11px] text-zinc-500 font-medium italic">
                                                No lifecycle ledger tracking entries generated for this substrate yet.
                                            </div>
                                        ) : (
                                            timelineEvents.map((evt) => {
                                                let badgeClass = isLight ? 'bg-zinc-100 text-zinc-600 border-zinc-200' : 'bg-zinc-800 text-zinc-400 border-zinc-700';
                                                if (evt.event_type === 'INTAKE' || evt.event_type === 'RESTOCK_RECEIVED') {
                                                    badgeClass = isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-950 text-emerald-400 border-emerald-800';
                                                } else if (evt.event_type === 'CONSUMPTION') {
                                                    badgeClass = isLight ? 'bg-red-50 text-red-700 border-red-200' : 'bg-red-950 text-red-400 border-red-800';
                                                } else if (evt.event_type === 'RESERVATION') {
                                                    badgeClass = isLight ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-950 text-amber-400 border-amber-800';
                                                } else if (evt.event_type === 'ADJUSTMENT') {
                                                    badgeClass = isLight ? 'bg-zinc-100 text-zinc-800 border-zinc-300' : 'bg-zinc-900 text-zinc-200 border-zinc-700';
                                                }

                                                return (
                                                    <div key={evt.id} className={`p-2 border space-y-1 ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                                                        <div className="flex items-center justify-between">
                                                            <span className={`px-1.5 py-0.2 text-[8px] font-bold border rounded-none uppercase ${badgeClass}`}>
                                                                {evt.event_type}
                                                            </span>
                                                            <span className="text-[9px] text-zinc-500 font-mono">
                                                                {new Date(evt.created_at).toISOString().slice(11, 19)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-baseline text-[11px]">
                                                            <span className={`font-bold ${isLight ? 'text-zinc-900' : 'text-zinc-300'}`}>{evt.reason || 'Operational Action'}</span>
                                                            <span className={`font-mono font-bold ${evt.event_type === 'CONSUMPTION' ? 'text-red-500' : (isLight ? 'text-emerald-600' : 'text-emerald-400')}`}>
                                                                {evt.event_type === 'CONSUMPTION' ? '-' : '+'}{Number(evt.quantity_units).toLocaleString()}
                                                            </span>
                                                        </div>
                                                        <div className={`flex justify-between text-[9px] text-zinc-500 border-t pt-1 font-mono ${isLight ? 'border-zinc-200' : 'border-zinc-800/40'}`}>
                                                            <span>Prev: {evt.before_stock}</span>
                                                            <span>Balance: {evt.after_stock}</span>
                                                        </div>
                                                        {evt.job_id && (
                                                            <span className={`text-[9px] block font-mono ${isLight ? 'text-amber-700' : 'text-amber-500/80'}`}>Job Reference: {evt.job_id}</span>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}

                                {/* TAB 3: PROCUREMENT RESTOCK ORDERS */}
                                {activeTab === 'PROCUREMENTS' && (
                                    <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1 animate-fade-in">
                                        {procurementsList.length === 0 ? (
                                            <div className="p-6 text-center text-[11px] text-zinc-500 font-medium italic">
                                                No external supplier restock procurements registered.
                                            </div>
                                        ) : (
                                            procurementsList.map((proc) => {
                                                const isReceived = proc.procurement_status === 'RECEIVED';
                                                return (
                                                    <div key={proc.id} className={`p-2.5 border space-y-1.5 ${
                                                        isReceived 
                                                            ? (isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-zinc-950 border-zinc-900') 
                                                            : (isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800')
                                                    }`}>
                                                        <div className="flex items-center justify-between">
                                                            <span className={`text-[10px] font-bold truncate max-w-[140px] ${
                                                                isReceived ? 'text-zinc-500' : (isLight ? 'text-zinc-900' : 'text-white')
                                                            }`}>{proc.supplier_name || 'External Provider'}</span>
                                                            <span className={`px-1.5 py-0.2 text-[8px] font-bold border rounded-none uppercase ${
                                                                isReceived 
                                                                    ? (isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-950 text-emerald-400 border-emerald-900') 
                                                                    : (isLight ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-950 text-amber-400 border-amber-800')
                                                            }`}>
                                                                {proc.procurement_status}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between text-xs font-mono">
                                                            <span className="text-zinc-500">Ordered Volume:</span>
                                                            <span className={`font-bold ${isReceived ? 'text-zinc-500' : (isLight ? 'text-zinc-900' : 'text-zinc-200')}`}>{Number(proc.ordered_units).toLocaleString()} units</span>
                                                        </div>
                                                        {proc.expected_delivery_date && (
                                                            <div className="text-[9px] text-zinc-500 flex justify-between font-mono">
                                                                <span>Est. Arrival:</span>
                                                                <span>{proc.expected_delivery_date.slice(0, 10)}</span>
                                                            </div>
                                                        )}
                                                        {!isReceived && (
                                                            <div className={`pt-1.5 border-t ${isLight ? 'border-zinc-200' : 'border-zinc-800'}`}>
                                                                <button
                                                                    onClick={() => handleReceiveProcurement(proc.id)}
                                                                    className={`w-full py-1 border text-[9px] font-bold uppercase tracking-wider transition-colors rounded-none ${
                                                                        isLight 
                                                                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' 
                                                                            : 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 hover:text-white border-emerald-800'
                                                                    }`}
                                                                >
                                                                    Mark Received (Credit Stock)
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="p-12 text-center text-xs text-zinc-500 font-manrope font-semibold italic">
                                Select an inventory pool row to unlock historical movement records, incoming shipments, and specific material metrics.
                            </div>
                        )}
                    </div>

                    <div className={`p-4 border rounded-none space-y-2 transition-all ${
                        isLight ? 'bg-white border-zinc-200' : 'bg-zinc-950 border-zinc-800'
                    }`}>
                        <span className={`text-xs font-manrope font-bold uppercase tracking-wider block ${
                            isLight ? 'text-zinc-900' : 'text-zinc-400'
                        }`}>
                            SCADA Orchestration Controls
                        </span>
                        <p className="text-[11px] font-manrope text-zinc-500 leading-relaxed font-medium">
                            Operational capacity modifications write immediately to the event stream architecture. Real physical substrate levels trigger predictive intelligence flags to Control Plane dispatching mechanics automatically.
                        </p>
                    </div>
                </div>
            </div>

            {/* MODAL 1: ADD MATERIAL */}
            {activeModal === 'ADD_MATERIAL' && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-manrope">
                    <div className={`border max-w-lg w-full p-6 space-y-4 rounded-none transition-all ${
                        isLight ? 'bg-white border-zinc-200 shadow-xl' : 'bg-zinc-950 border-zinc-800'
                    }`}>
                        <div className={`flex items-center justify-between border-b pb-3 ${
                            isLight ? 'border-zinc-200' : 'border-zinc-800'
                        }`}>
                            <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center ${
                                isLight ? 'text-zinc-900' : 'text-white'
                            }`}>
                                <PlusCircleIcon className="w-4 h-4 mr-2 text-red-500" />
                                Provision Material Profile
                            </h3>
                            <button onClick={() => setActiveModal(null)} className="text-zinc-500 hover:text-red-500 transition-colors">
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleAddMaterialSubmit} className="space-y-3 text-xs">
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Substrate Formal Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Silk Premium Digital SRA3"
                                    value={addMatForm.material_name}
                                    onChange={e => setAddMatForm({...addMatForm, material_name: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Material Type</label>
                                    <select
                                        value={addMatForm.material_type}
                                        onChange={e => setAddMatForm({...addMatForm, material_type: e.target.value})}
                                        className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    >
                                        <option value="PAPER">PAPER</option>
                                        <option value="INK">INK</option>
                                        <option value="CONSUMABLE">CONSUMABLE</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Weight (GSM)</label>
                                    <input
                                        type="number"
                                        value={addMatForm.gsm}
                                        onChange={e => setAddMatForm({...addMatForm, gsm: Number(e.target.value)})}
                                        className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Sheet Format</label>
                                    <input
                                        type="text"
                                        value={addMatForm.sheet_format}
                                        onChange={e => setAddMatForm({...addMatForm, sheet_format: e.target.value})}
                                        className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Finish Surface</label>
                                    <select
                                        value={addMatForm.finish_type}
                                        onChange={e => setAddMatForm({...addMatForm, finish_type: e.target.value})}
                                        className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    >
                                        <option value="UNCOATED">UNCOATED</option>
                                        <option value="SILK">SILK</option>
                                        <option value="GLOSSY">GLOSSY</option>
                                        <option value="MATTE">MATTE</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Primary Certified Supplier</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Sappi Fine Paper Group"
                                    value={addMatForm.supplier_name}
                                    onChange={e => setAddMatForm({...addMatForm, supplier_name: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Unit Cost ($ USD)</label>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        value={addMatForm.cost_per_unit}
                                        onChange={e => setAddMatForm({...addMatForm, cost_per_unit: Number(e.target.value)})}
                                        className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Target Printer Scope</label>
                                    <input
                                        type="text"
                                        value={addMatForm.node_id}
                                        onChange={e => setAddMatForm({...addMatForm, node_id: e.target.value})}
                                        className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                            </div>

                            <div className={`grid grid-cols-3 gap-2 pt-2 border-t ${
                                isLight ? 'border-zinc-200' : 'border-zinc-800/80'
                            }`}>
                                <div>
                                    <label className="block text-[9px] text-zinc-500 uppercase font-bold mb-1">Initial Pool</label>
                                    <input
                                        type="number"
                                        value={addMatForm.initial_stock}
                                        onChange={e => setAddMatForm({...addMatForm, initial_stock: Number(e.target.value)})}
                                        className={`w-full border p-1.5 focus:outline-none focus:border-red-500 rounded-none text-xs font-mono transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] text-zinc-500 uppercase font-bold mb-1">Reorder Point</label>
                                    <input
                                        type="number"
                                        value={addMatForm.reorder_point}
                                        onChange={e => setAddMatForm({...addMatForm, reorder_point: Number(e.target.value)})}
                                        className={`w-full border p-1.5 focus:outline-none focus:border-red-500 rounded-none text-xs font-mono transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] text-zinc-500 uppercase font-bold mb-1">Lead Time (d)</label>
                                    <input
                                        type="number"
                                        value={addMatForm.replenishment_lead_days}
                                        onChange={e => setAddMatForm({...addMatForm, replenishment_lead_days: Number(e.target.value)})}
                                        className={`w-full border p-1.5 focus:outline-none focus:border-red-500 rounded-none text-xs font-mono transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end space-x-2 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setActiveModal(null)}
                                    className={`px-4 py-2 border font-bold uppercase rounded-none transition-colors ${
                                        isLight 
                                            ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' 
                                            : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                                    }`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`px-4 py-2 border font-bold uppercase rounded-none transition-colors ${
                                        isLight 
                                            ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' 
                                            : 'bg-red-950 hover:bg-red-900 text-red-300 border-red-800'
                                    }`}
                                >
                                    Provision Core
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: INTAKE BAY */}
            {activeModal === 'INTAKE' && modalMaterial && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-manrope">
                    <div className={`border max-w-md w-full p-6 space-y-4 rounded-none transition-all ${
                        isLight ? 'bg-white border-zinc-200 shadow-xl' : 'bg-zinc-950 border-zinc-800'
                    }`}>
                        <div className={`flex items-center justify-between border-b pb-3 ${
                            isLight ? 'border-zinc-200' : 'border-zinc-800'
                        }`}>
                            <div>
                                <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center ${
                                    isLight ? 'text-zinc-900' : 'text-white'
                                }`}>
                                    Substrate Warehouse Intake
                                </h3>
                                <span className="text-[10px] text-emerald-500 font-mono block mt-0.5">{modalMaterial.material_name}</span>
                            </div>
                            <button onClick={() => setActiveModal(null)} className="text-zinc-500 hover:text-red-500 transition-colors">
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleIntakeSubmit} className="space-y-3 text-xs">
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Intake Quantity Units *</label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    value={intakeForm.quantity}
                                    onChange={e => setIntakeForm({...intakeForm, quantity: Number(e.target.value)})}
                                    className={`w-full border p-2 font-mono font-bold text-sm focus:outline-none focus:border-emerald-500 rounded-none transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Supplier Batch / Reference</label>
                                <input
                                    type="text"
                                    value={intakeForm.supplier_batch}
                                    onChange={e => setIntakeForm({...intakeForm, supplier_batch: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-emerald-500 rounded-none font-mono transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Audit Log Reason</label>
                                <input
                                    type="text"
                                    required
                                    value={intakeForm.reason}
                                    onChange={e => setIntakeForm({...intakeForm, reason: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-emerald-500 rounded-none transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Expected Operation Target</label>
                                <input
                                    type="text"
                                    value={intakeForm.expected_use}
                                    onChange={e => setIntakeForm({...intakeForm, expected_use: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-emerald-500 rounded-none text-[11px] transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                />
                            </div>

                            <div className={`flex justify-end space-x-2 pt-3 border-t ${
                                isLight ? 'border-zinc-200' : 'border-zinc-800'
                            }`}>
                                <button
                                    type="button"
                                    onClick={() => setActiveModal(null)}
                                    className={`px-4 py-2 border font-bold uppercase rounded-none transition-colors ${
                                        isLight 
                                            ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' 
                                            : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                    }`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`px-4 py-2 border font-bold uppercase rounded-none transition-colors ${
                                        isLight 
                                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' 
                                            : 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-800'
                                    }`}
                                >
                                    Commit Intake Bay Credit
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 3: AUDITED ADJUSTMENT */}
            {activeModal === 'ADJUST' && modalMaterial && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-manrope">
                    <div className={`border max-w-md w-full p-6 space-y-4 rounded-none transition-all ${
                        isLight ? 'bg-white border-zinc-200 shadow-xl' : 'bg-zinc-950 border-zinc-800'
                    }`}>
                        <div className={`flex items-center justify-between border-b pb-3 ${
                            isLight ? 'border-zinc-200' : 'border-zinc-800'
                        }`}>
                            <div>
                                <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center ${
                                    isLight ? 'text-zinc-900' : 'text-white'
                                }`}>
                                    Audited Substrate Override
                                </h3>
                                <span className="text-[10px] text-zinc-400 font-mono block mt-0.5">{modalMaterial.material_name}</span>
                            </div>
                            <button onClick={() => setActiveModal(null)} className="text-zinc-500 hover:text-red-500 transition-colors">
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleAdjustSubmit} className="space-y-3 text-xs">
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Quantity Delta (+/-) *</label>
                                <input
                                    type="number"
                                    required
                                    placeholder="-500 or +200"
                                    value={adjustForm.quantity_delta}
                                    onChange={e => setAdjustForm({...adjustForm, quantity_delta: Number(e.target.value)})}
                                    className={`w-full border p-2 font-mono font-bold text-sm focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                />
                                <span className="text-[9px] text-zinc-500 block mt-1">Use negative values to signify manual handcount depletion corrections.</span>
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Mandatory Governance Reason *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Audit Handcount discrepancy verified"
                                    value={adjustForm.reason}
                                    onChange={e => setAdjustForm({...adjustForm, reason: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Operator Forensic Notes</label>
                                <textarea
                                    rows={2}
                                    value={adjustForm.operator_note}
                                    onChange={e => setAdjustForm({...adjustForm, operator_note: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none text-xs transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                    placeholder="Document specific location or authorized management overriding signature..."
                                />
                            </div>

                            <div className={`flex justify-end space-x-2 pt-3 border-t ${
                                isLight ? 'border-zinc-200' : 'border-zinc-800'
                            }`}>
                                <button
                                    type="button"
                                    onClick={() => setActiveModal(null)}
                                    className={`px-4 py-2 border font-bold uppercase rounded-none transition-colors ${
                                        isLight 
                                            ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' 
                                            : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                    }`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`px-4 py-2 border font-bold uppercase rounded-none transition-colors ${
                                        isLight 
                                            ? 'bg-zinc-900 hover:bg-zinc-800 text-white border-zinc-900' 
                                            : 'bg-zinc-900 hover:bg-zinc-800 text-white border-zinc-700'
                                    }`}
                                >
                                    Execute Adjustment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 4: RESERVE ALLOCATION LOCK */}
            {activeModal === 'RESERVE' && modalMaterial && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-manrope">
                    <div className={`border max-w-md w-full p-6 space-y-4 rounded-none transition-all ${
                        isLight ? 'bg-white border-zinc-200 shadow-xl' : 'bg-zinc-950 border-zinc-800'
                    }`}>
                        <div className={`flex items-center justify-between border-b pb-3 ${
                            isLight ? 'border-zinc-200' : 'border-zinc-800'
                        }`}>
                            <div>
                                <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center ${
                                    isLight ? 'text-zinc-900' : 'text-white'
                                }`}>
                                    Enforce Capacity Allocation Lock
                                </h3>
                                <span className="text-[10px] text-amber-500 font-mono block mt-0.5">{modalMaterial.material_name}</span>
                            </div>
                            <button onClick={() => setActiveModal(null)} className="text-zinc-500 hover:text-red-500 transition-colors">
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleReserveSubmit} className="space-y-3 text-xs">
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Units Allocation Volume *</label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    value={reserveForm.quantity}
                                    onChange={e => setReserveForm({...reserveForm, quantity: Number(e.target.value)})}
                                    className={`w-full border p-2 font-mono font-bold text-sm focus:outline-none focus:border-amber-500 rounded-none transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                />
                                <span className="text-[9px] text-zinc-500 block mt-1">Available pool constraint: {(modalMaterial.current_stock_units - modalMaterial.reserved_stock_units).toLocaleString()} units.</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Target Job Reference</label>
                                    <input
                                        type="text"
                                        value={reserveForm.job_id}
                                        onChange={e => setReserveForm({...reserveForm, job_id: e.target.value})}
                                        className={`w-full border p-2 focus:outline-none focus:border-amber-500 rounded-none font-mono transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Dispatch Core ID</label>
                                    <input
                                        type="text"
                                        value={reserveForm.dispatch_id}
                                        onChange={e => setReserveForm({...reserveForm, dispatch_id: e.target.value})}
                                        className={`w-full border p-2 focus:outline-none focus:border-amber-500 rounded-none font-mono transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Allocation Lock Expiration (Optional)</label>
                                <input
                                    type="datetime-local"
                                    value={reserveForm.expiration}
                                    onChange={e => setReserveForm({...reserveForm, expiration: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-amber-500 rounded-none font-mono text-[11px] transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                                    }`}
                                />
                            </div>

                            <div className={`flex justify-end space-x-2 pt-3 border-t ${
                                isLight ? 'border-zinc-200' : 'border-zinc-800'
                            }`}>
                                <button
                                    type="button"
                                    onClick={() => setActiveModal(null)}
                                    className={`px-4 py-2 border font-bold uppercase rounded-none transition-colors ${
                                        isLight 
                                            ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' 
                                            : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                    }`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`px-4 py-2 border font-bold uppercase rounded-none transition-colors ${
                                        isLight 
                                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200' 
                                            : 'bg-amber-950 hover:bg-amber-900 text-amber-300 border-amber-800'
                                    }`}
                                >
                                    Engage Allocation Lock
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 5: CONSUME MATERIAL */}
            {activeModal === 'CONSUME' && modalMaterial && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-manrope">
                    <div className={`border max-w-md w-full p-6 space-y-4 rounded-none transition-all ${
                        isLight ? 'bg-white border-zinc-200 shadow-xl' : 'bg-zinc-950 border-zinc-800'
                    }`}>
                        <div className={`flex items-center justify-between border-b pb-3 ${
                            isLight ? 'border-zinc-200' : 'border-zinc-800'
                        }`}>
                            <div>
                                <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center ${
                                    isLight ? 'text-zinc-900' : 'text-white'
                                }`}>
                                    Deplete Substrate Run Permanent
                                </h3>
                                <span className="text-[10px] text-red-500 font-mono block mt-0.5">{modalMaterial.material_name}</span>
                            </div>
                            <button onClick={() => setActiveModal(null)} className="text-zinc-500 hover:text-red-500 transition-colors">
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleConsumeSubmit} className="space-y-3 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Consumed Volume *</label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={consumeForm.quantity_consumed}
                                        onChange={e => setConsumeForm({...consumeForm, quantity_consumed: Number(e.target.value)})}
                                        className={`w-full border p-2 font-mono font-bold focus:outline-none focus:border-red-500 rounded-none text-sm transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Spoilage / Waste Units</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={consumeForm.waste_units}
                                        onChange={e => setConsumeForm({...consumeForm, waste_units: Number(e.target.value)})}
                                        className={`w-full border p-2 font-mono focus:outline-none focus:border-red-500 rounded-none text-sm transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Job Reference Tracker</label>
                                <input
                                    type="text"
                                    required
                                    value={consumeForm.job_id}
                                    onChange={e => setConsumeForm({...consumeForm, job_id: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none font-mono transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Clearance Reason</label>
                                <input
                                    type="text"
                                    required
                                    value={consumeForm.reason}
                                    onChange={e => setConsumeForm({...consumeForm, reason: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                />
                            </div>

                            <div className={`flex justify-end space-x-2 pt-3 border-t ${
                                isLight ? 'border-zinc-200' : 'border-zinc-800'
                            }`}>
                                <button
                                    type="button"
                                    onClick={() => setActiveModal(null)}
                                    className={`px-4 py-2 border font-bold uppercase rounded-none transition-colors ${
                                        isLight 
                                            ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' 
                                            : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                    }`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`px-4 py-2 border font-bold uppercase rounded-none transition-colors ${
                                        isLight 
                                            ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' 
                                            : 'bg-red-950 hover:bg-red-900 text-red-300 border-red-800'
                                    }`}
                                >
                                    Permanently Strike Balance
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 6: PROCUREMENT RESTOCK ORDER */}
            {activeModal === 'PROCUREMENT' && modalMaterial && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-manrope">
                    <div className={`border max-w-md w-full p-6 space-y-4 rounded-none transition-all ${
                        isLight ? 'bg-white border-zinc-200 shadow-xl' : 'bg-zinc-950 border-zinc-800'
                    }`}>
                        <div className={`flex items-center justify-between border-b pb-3 ${
                            isLight ? 'border-zinc-200' : 'border-zinc-800'
                        }`}>
                            <div>
                                <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center ${
                                    isLight ? 'text-zinc-900' : 'text-white'
                                }`}>
                                    Issue Supply Restock Order
                                </h3>
                                <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">{modalMaterial.material_name}</span>
                            </div>
                            <button onClick={() => setActiveModal(null)} className="text-zinc-500 hover:text-red-500 transition-colors">
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleProcurementSubmit} className="space-y-3 text-xs">
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Target Supplier Organization</label>
                                <input
                                    type="text"
                                    required
                                    value={procurementForm.supplier_name}
                                    onChange={e => setProcurementForm({...procurementForm, supplier_name: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Ordered Units *</label>
                                    <input
                                        type="number"
                                        required
                                        min="100"
                                        step="100"
                                        value={procurementForm.ordered_units}
                                        onChange={e => setProcurementForm({...procurementForm, ordered_units: Number(e.target.value)})}
                                        className={`w-full border p-2 font-mono font-bold focus:outline-none focus:border-red-500 rounded-none transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Procurement Risk</label>
                                    <select
                                        value={procurementForm.risk}
                                        onChange={e => setProcurementForm({...procurementForm, risk: e.target.value})}
                                        className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none font-bold transition-colors ${
                                            isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                        }`}
                                    >
                                        <option value="LOW">LOW RISK</option>
                                        <option value="MEDIUM">MEDIUM RISK</option>
                                        <option value="HIGH">HIGH RISK</option>
                                        <option value="CRITICAL">CRITICAL SURCHARGE</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Expected Delivery Schedule</label>
                                <input
                                    type="datetime-local"
                                    value={procurementForm.expected_delivery_date}
                                    onChange={e => setProcurementForm({...procurementForm, expected_delivery_date: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none font-mono text-[11px] transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                                    }`}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Purchasing Directives &amp; Notes</label>
                                <textarea
                                    rows={2}
                                    value={procurementForm.notes}
                                    onChange={e => setProcurementForm({...procurementForm, notes: e.target.value})}
                                    className={`w-full border p-2 focus:outline-none focus:border-red-500 rounded-none text-xs transition-colors ${
                                        isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                                    }`}
                                    placeholder="Enter authorization reference or shipping delivery dock route specifications..."
                                />
                            </div>

                            <div className={`flex justify-end space-x-2 pt-3 border-t ${
                                isLight ? 'border-zinc-200' : 'border-zinc-800'
                            }`}>
                                <button
                                    type="button"
                                    onClick={() => setActiveModal(null)}
                                    className={`px-4 py-2 border font-bold uppercase rounded-none transition-colors ${
                                        isLight 
                                            ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' 
                                            : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                    }`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`px-4 py-2 border font-bold uppercase rounded-none transition-colors ${
                                        isLight 
                                            ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' 
                                            : 'bg-red-950 hover:bg-red-900 text-red-300 border-red-800'
                                    }`}
                                >
                                    Authorize Restock Purchase
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
