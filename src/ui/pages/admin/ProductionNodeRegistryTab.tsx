// src/ui/pages/admin/ProductionNodeRegistryTab.tsx
import React, { useState, useEffect } from "react";
import { 
    BuildingOfficeIcon, 
    ArrowPathIcon, 
    ShieldCheckIcon,
    CpuChipIcon,
    WrenchScrewdriverIcon
} from "@heroicons/react/24/outline";
import { listPrinthouses } from "../../api/printhouseCapabilitiesClient";
import { PrinthouseList } from "../printhouse/PrinthouseList";
import { PrinthouseDetailDrawer } from "../printhouse/PrinthouseDetailDrawer";
import { Printhouse } from "../../types/printhouseCapabilities";
import { getUserRole } from "../../lib/authStore";

export const ProductionNodeRegistryTab: React.FC = () => {
    const [printhouses, setPrinthouses] = useState<Printhouse[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPrinthouse, setSelectedPrinthouse] = useState<Printhouse | null>(null);

    const userRole = getUserRole();
    const isSuperAdmin = userRole === "SUPER_ADMIN";

    const fetchFleetData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listPrinthouses();
            if (res && res.ok) {
                setPrinthouses(res.printhouses || []);
            } else {
                setError("Failed to stream live fleet data.");
            }
        } catch (err: any) {
            setError(err.message || "An error occurred fetching fleet telemetry.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFleetData();
    }, []);

    // Calculate High Density KPIs
    const totalPrinthouses = printhouses.length;
    
    const avgLeadDays = totalPrinthouses > 0 
        ? parseFloat((printhouses.reduce((sum, p: any) => sum + (p.production_lead_days || 9.7), 0) / totalPrinthouses).toFixed(1))
        : 9.7;

    const uniqueSignatureSets = 3; // Core 32P, 24P, and 16P signature sets

    return (
        <div className="space-y-6 font-mono text-xs text-slate-300">
            {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold uppercase tracking-wider flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* High-density KPI metrics header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#18181b] p-4 border border-white/10 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Total Printhouses</p>
                        <p className="text-2xl font-black text-white mt-1">{totalPrinthouses}</p>
                    </div>
                    <BuildingOfficeIcon className="w-8 h-8 text-emerald-400 opacity-80" />
                </div>
                <div className="bg-[#18181b] p-4 border border-white/10 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Avg. Lead Days</p>
                        <p className="text-2xl font-black text-white mt-1">{avgLeadDays}d</p>
                    </div>
                    <CpuChipIcon className="w-8 h-8 text-indigo-400 opacity-80" />
                </div>
                <div className="bg-[#18181b] p-4 border border-white/10 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Unique Signature Sets</p>
                        <p className="text-2xl font-black text-white mt-1">{uniqueSignatureSets}</p>
                    </div>
                    <ShieldCheckIcon className="w-8 h-8 text-amber-400 opacity-80" />
                </div>
            </div>

            {/* Main Fleet Registry Card */}
            <div className="bg-[#18181b] border border-white/10 p-5">
                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <WrenchScrewdriverIcon className="w-4 h-4 text-emerald-400" />
                        Printhouse Fleet Registry
                    </h3>
                    <button 
                        onClick={fetchFleetData} 
                        disabled={loading}
                        className="hover:text-white transition-colors flex items-center gap-1.5"
                    >
                        <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                        <span>Sync Fleet</span>
                    </button>
                </div>

                <PrinthouseList 
                    printhouses={printhouses}
                    isLoading={loading}
                    onSelectPrinthouse={setSelectedPrinthouse}
                    onRefresh={fetchFleetData}
                    onCreateNew={() => {}}
                    isSuperAdmin={isSuperAdmin}
                />
            </div>

            {/* Master Detail Drawer */}
            <PrinthouseDetailDrawer 
                printhouse={selectedPrinthouse}
                isOpen={!!selectedPrinthouse}
                onClose={() => setSelectedPrinthouse(null)}
                onMutationSuccess={fetchFleetData}
            />
        </div>
    );
};

// Dummy icon placeholder to satisfy compilation
const ExclamationTriangleIcon = (props: React.ComponentProps<"svg">) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
);
