/**
 * src/ui/components/printhouse/setup/MaterialsPanel.tsx
 * 
 * Materials and substrate catalog management.
 * Connects materials to printer node sites and associates them with compatible machines.
 */
import React, { useState, useEffect } from 'react';
import { getAuthToken } from '../../../lib/authStore';
import { Layers, Plus, Trash2, Link2, Unlink, AlertCircle, CheckCircle } from 'lucide-react';

interface MaterialsPanelProps {
    sites: { siteId: string; siteName: string }[];
    onSaved?: () => void;
}

export const MaterialsPanel: React.FC<MaterialsPanelProps> = ({ sites, onSaved }) => {
    const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.siteId || '');
    const [materials, setMaterials] = useState<any[]>([]);
    const [machines, setMachines] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Form state
    const [materialName, setMaterialName] = useState('');
    const [materialType, setMaterialType] = useState('PAPER');
    const [substrateClass, setSubstrateClass] = useState('STANDARD');
    const [gsm, setGsm] = useState(150);
    const [sheetFormat, setSheetFormat] = useState('SRA3');
    const [finishType, setFinishType] = useState('UNCOATED');
    const [supplierName, setSupplierName] = useState('Generic Supplier');
    const [supplierCountry, setSupplierCountry] = useState('ES');

    // Compatibility pairing states
    const [pairingMaterialId, setPairingMaterialId] = useState<string | null>(null);
    const [provenanceMap, setProvenanceMap] = useState<Record<string, string>>({}); // machineId -> provenance
    const [activeCompatibilities, setActiveCompatibilities] = useState<Record<string, string[]>>({}); // materialId -> machineIds

    const token = getAuthToken();

    const fetchMaterialsAndMachines = async () => {
        if (!selectedSiteId) return;
        setLoading(true);
        setError(null);
        try {
            // Fetch materials
            const matRes = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/materials`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const matData = await matRes.json();
            if (matRes.ok && matData.ok) {
                setMaterials(matData.materials);
            }

            // Fetch machines
            const machRes = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/machines`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const machData = await machRes.json();
            if (machRes.ok && machData.ok) {
                const activeMachines = (machData.machines || []).filter((m: any) => m.status !== 'ARCHIVED');
                setMachines(activeMachines);

                // Fetch compatibilities for each machine
                const compMap: Record<string, string[]> = {};
                for (const m of activeMachines) {
                    const compRes = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/machines/${m.id}/materials`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const compData = await compRes.json();
                    if (compRes.ok && compData.ok) {
                        for (const comp of compData.compatibilities) {
                            if (!compMap[comp.material_catalog_id]) {
                                compMap[comp.material_catalog_id] = [];
                            }
                            compMap[comp.material_catalog_id].push(`${m.id}:${comp.compatibility_provenance}`);
                        }
                    }
                }
                setActiveCompatibilities(compMap);
            }
        } catch (err: any) {
            setError(err.message || 'Error fetching data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMaterialsAndMachines();
    }, [selectedSiteId]);

    const handleCreateMaterial = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/materials`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    material_name: materialName,
                    material_type: materialType,
                    substrate_class: substrateClass,
                    gsm: Number(gsm),
                    sheet_format: sheetFormat,
                    finish_type: finishType,
                    supplier_name: supplierName,
                    supplier_country: supplierCountry
                })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setSuccessMsg('Material catalog entry created successfully.');
                setMaterialName('');
                fetchMaterialsAndMachines();
                if (onSaved) onSaved();
            } else {
                setError(data.error || 'Failed to create material');
            }
        } catch (err: any) {
            setError(err.message || 'Network error');
        }
    };

    const handleArchiveMaterial = async (id: string) => {
        if (!confirm('Are you sure you want to archive this substrate?')) return;
        setError(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/materials/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setSuccessMsg('Material entry archived.');
                fetchMaterialsAndMachines();
                if (onSaved) onSaved();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to archive');
            }
        } catch (err: any) {
            setError(err.message || 'Error deleting material');
        }
    };

    const handlePairMachine = async (materialId: string, machineId: string) => {
        const provenance = provenanceMap[machineId] || 'manual_pairing';
        setError(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/machines/${machineId}/materials/${materialId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ compatibility_provenance: provenance })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setSuccessMsg('Compatibility established with provenance record.');
                fetchMaterialsAndMachines();
            } else {
                setError(data.error || 'Failed to link');
            }
        } catch (err: any) {
            setError(err.message || 'Error linking compatibility');
        }
    };

    const handleUnpairMachine = async (materialId: string, machineId: string) => {
        setError(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/machines/${machineId}/materials/${materialId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setSuccessMsg('Compatibility removed.');
                fetchMaterialsAndMachines();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to remove link');
            }
        } catch (err: any) {
            setError(err.message || 'Error removing link');
        }
    };

    const inputClass = "w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors";
    const labelClass = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5";

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-7 shadow-sm transition-colors">
            <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <Layers size={20} className="text-[#dc0000]" />
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white m-0">Materials & Substrate Catalog</h2>
                </div>

                {sites.length > 1 && (
                    <select
                        value={selectedSiteId}
                        onChange={(e) => setSelectedSiteId(e.target.value)}
                        className={`${inputClass} cursor-pointer max-w-xs`}
                    >
                        {sites.map(site => (
                            <option key={site.siteId} value={site.siteId}>{site.siteName}</option>
                        ))}
                    </select>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 p-3 rounded-lg text-xs mb-4">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {successMsg && (
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 p-3 rounded-lg text-xs mb-4">
                    <CheckCircle size={16} />
                    <span>{successMsg}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Catalog Addition Form */}
                <form onSubmit={handleCreateMaterial} className="lg:col-span-5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl flex flex-col gap-3 transition-colors">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white m-0 mb-1">Add New Material</h3>

                    <div>
                        <label className={labelClass}>MATERIAL NAME</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Silk Matt Coated Paper"
                            value={materialName}
                            onChange={(e) => setMaterialName(e.target.value)}
                            className={inputClass}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                            <label className={labelClass}>TYPE</label>
                            <select
                                value={materialType}
                                onChange={(e) => setMaterialType(e.target.value)}
                                className={`${inputClass} cursor-pointer`}
                            >
                                <option value="PAPER">Paper Substrate</option>
                                <option value="BOARD">Rigid Board</option>
                                <option value="VINYL">Vinyl/Adhesive</option>
                                <option value="INK">Specialty Ink</option>
                                <option value="CONSUMABLE">Consumable</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>SUBSTRATE CLASS</label>
                            <input
                                type="text"
                                placeholder="e.g. COATED, UNCOATED"
                                value={substrateClass}
                                onChange={(e) => setSubstrateClass(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                            <label className={labelClass}>GSM (WEIGHT)</label>
                            <input
                                type="number"
                                value={gsm}
                                onChange={(e) => setGsm(Number(e.target.value))}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>FORMAT SIZE</label>
                            <input
                                type="text"
                                placeholder="e.g. SRA3, B2, 700x1000"
                                value={sheetFormat}
                                onChange={(e) => setSheetFormat(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                            <label className={labelClass}>FINISH TYPE</label>
                            <input
                                type="text"
                                placeholder="e.g. MATT, GLOSS, SILK"
                                value={finishType}
                                onChange={(e) => setFinishType(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>SUPPLIER COUNTRY</label>
                            <input
                                type="text"
                                placeholder="e.g. ES, DE, FR"
                                value={supplierCountry}
                                onChange={(e) => setSupplierCountry(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>SUPPLIER NAME</label>
                        <input
                            type="text"
                            placeholder="e.g. Antalis Co."
                            value={supplierName}
                            onChange={(e) => setSupplierName(e.target.value)}
                            className={inputClass}
                        />
                    </div>

                    <button
                        type="submit"
                        className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 mt-2 shadow-xs cursor-pointer"
                    >
                        <Plus size={16} /> Add to Site Catalog
                    </button>
                </form>

                {/* Substrate Catalog Listing */}
                <div className="lg:col-span-7 flex flex-col gap-3">
                    {materials.length === 0 ? (
                        <div className="bg-zinc-50 dark:bg-zinc-900/60 p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 text-center text-zinc-500">
                            <Layers size={32} className="mx-auto mb-3 opacity-40" />
                            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 m-0">No materials configured for this site yet.</p>
                            <p className="text-xs text-zinc-500 mt-1 mb-0">Use the form to configure your first paper stock or media item.</p>
                        </div>
                    ) : (
                        materials.map(mat => {
                            const pairedMachineDetails = activeCompatibilities[mat.id] || [];
                            const isPairingMode = pairingMaterialId === mat.id;

                            return (
                                <div key={mat.id} className="bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col gap-3 transition-colors">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className="text-[11px] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded font-semibold">
                                                {mat.material_type}
                                            </span>
                                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white mt-1.5 mb-0.5">{mat.material_name}</h4>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 m-0">
                                                {mat.gsm} GSM • {mat.sheet_format} • {mat.finish_type}
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => handleArchiveMaterial(mat.id)}
                                            className="text-red-500 hover:text-red-700 p-1 cursor-pointer transition-colors"
                                            title="Archive Material"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    {/* Machine Pairings */}
                                    <div className="bg-white dark:bg-zinc-900/90 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">Machine Compatibilities</span>
                                            <button
                                                onClick={() => setPairingMaterialId(isPairingMode ? null : mat.id)}
                                                className="text-sky-600 dark:text-sky-400 text-xs font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                                            >
                                                <Link2 size={12} /> {isPairingMode ? 'Close Pairing' : 'Manage Pairings'}
                                            </button>
                                        </div>

                                        {pairedMachineDetails.length === 0 && !isPairingMode && (
                                            <p className="text-xs text-zinc-500 m-0">Not associated with any machines yet.</p>
                                        )}

                                        {/* Paired list */}
                                        {!isPairingMode && pairedMachineDetails.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {pairedMachineDetails.map(pairedStr => {
                                                    const [mId, provenance] = pairedStr.split(':');
                                                    const machineObj = machines.find(m => m.id === mId);
                                                    if (!machineObj) return null;
                                                    return (
                                                        <div key={mId} className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-1 rounded flex items-center gap-1.5 text-xs">
                                                            <span className="text-zinc-900 dark:text-white font-semibold">{machineObj.machine_name}</span>
                                                            <span className="text-[10px] bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded" title="Compatibility Provenance">
                                                                {provenance}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Interactive pairing mode */}
                                        {isPairingMode && (
                                            <div className="flex flex-col gap-2 mt-2">
                                                {machines.length === 0 ? (
                                                    <p className="text-xs text-zinc-500 m-0">No machines configured. Configure a machine first.</p>
                                                ) : (
                                                    machines.map(m => {
                                                        const isPaired = pairedMachineDetails.some(p => p.startsWith(m.id + ':'));
                                                        const currentProvenance = pairedMachineDetails.find(p => p.startsWith(m.id + ':'))?.split(':')[1] || '';

                                                        return (
                                                            <div key={m.id} className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/60 p-2 rounded border border-zinc-200 dark:border-zinc-700">
                                                                <div>
                                                                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">{m.machine_name}</span>
                                                                    {isPaired && (
                                                                        <span className="block text-[10px] text-zinc-500">
                                                                            Provenance: {currentProvenance}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    {!isPaired && (
                                                                        <>
                                                                            <input
                                                                                type="text"
                                                                                placeholder="provenance code"
                                                                                value={provenanceMap[m.id] || ''}
                                                                                onChange={(e) => setProvenanceMap({ ...provenanceMap, [m.id]: e.target.value })}
                                                                                className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-2 py-1 rounded text-xs w-28"
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handlePairMachine(mat.id, m.id)}
                                                                                className="bg-[#dc0000] hover:bg-red-700 text-white px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors"
                                                                            >
                                                                                Link
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                    {isPaired && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleUnpairMachine(mat.id, m.id)}
                                                                            className="bg-zinc-200 dark:bg-zinc-700 hover:bg-red-100 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1"
                                                                        >
                                                                            <Unlink size={12} /> Unlink
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
