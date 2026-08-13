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

    return (
        <div style={{ background: '#18181b', padding: '24px', borderRadius: '12px', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={20} style={{ color: '#dc0000' }} />
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>Materials & Substrate Catalog</h2>
                </div>

                {sites.length > 1 && (
                    <select
                        value={selectedSiteId}
                        onChange={(e) => setSelectedSiteId(e.target.value)}
                        style={{
                            background: '#09090b',
                            color: '#ffffff',
                            border: '1px solid #3f3f46',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            outline: 'none',
                            fontSize: '13px'
                        }}
                    >
                        {sites.map(site => (
                            <option key={site.siteId} value={site.siteId}>{site.siteName}</option>
                        ))}
                    </select>
                )}
            </div>

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#450a0a', border: '1px solid #991b1b', color: '#fca5a5', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {successMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#064e3b', border: '1px solid #065f46', color: '#a7f3d0', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                    <CheckCircle size={16} />
                    <span>{successMsg}</span>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px', flexWrap: 'wrap' }} className="responsive-grid-split">
                {/* Catalog Addition Form */}
                <form onSubmit={handleCreateMaterial} style={{ background: '#09090b', padding: '20px', borderRadius: '8px', border: '1px solid #27272a', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px 0', color: '#ffffff' }}>Add New Material</h3>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>MATERIAL NAME</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Silk Matt Coated Paper"
                            value={materialName}
                            onChange={(e) => setMaterialName(e.target.value)}
                            style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>TYPE</label>
                            <select
                                value={materialType}
                                onChange={(e) => setMaterialType(e.target.value)}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px' }}
                            >
                                <option value="PAPER">Paper Substrate</option>
                                <option value="BOARD">Rigid Board</option>
                                <option value="VINYL">Vinyl/Adhesive</option>
                                <option value="INK">Specialty Ink</option>
                                <option value="CONSUMABLE">Consumable</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>SUBSTRATE CLASS</label>
                            <input
                                type="text"
                                placeholder="e.g. COATED, UNCOATED"
                                value={substrateClass}
                                onChange={(e) => setSubstrateClass(e.target.value)}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>GSM (WEIGHT)</label>
                            <input
                                type="number"
                                value={gsm}
                                onChange={(e) => setGsm(Number(e.target.value))}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>FORMAT SIZE</label>
                            <input
                                type="text"
                                placeholder="e.g. SRA3, B2, 700x1000"
                                value={sheetFormat}
                                onChange={(e) => setSheetFormat(e.target.value)}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>FINISH TYPE</label>
                            <input
                                type="text"
                                placeholder="e.g. MATT, GLOSS, SILK"
                                value={finishType}
                                onChange={(e) => setFinishType(e.target.value)}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>SUPPLIER COUNTRY</label>
                            <input
                                type="text"
                                placeholder="e.g. ES, DE, FR"
                                value={supplierCountry}
                                onChange={(e) => setSupplierCountry(e.target.value)}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>SUPPLIER NAME</label>
                        <input
                            type="text"
                            placeholder="e.g. Antalis Co."
                            value={supplierName}
                            onChange={(e) => setSupplierName(e.target.value)}
                            style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                    </div>

                    <button
                        type="submit"
                        style={{
                            background: '#dc0000',
                            color: '#ffffff',
                            border: 'none',
                            padding: '10px',
                            borderRadius: '6px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginTop: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            fontSize: '13px'
                        }}
                    >
                        <Plus size={16} /> Add to Site Catalog
                    </button>
                </form>

                {/* Substrate Catalog Listing */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {materials.length === 0 ? (
                        <div style={{ background: '#09090b', padding: '32px', borderRadius: '8px', border: '1px solid #27272a', textAlign: 'center', color: '#71717a' }}>
                            <Layers size={32} style={{ margin: '0 auto 12px auto', display: 'block', opacity: 0.5 }} />
                            <p style={{ fontSize: '14px', margin: 0 }}>No materials configured for this site yet.</p>
                            <p style={{ fontSize: '12px', margin: '4px 0 0 0', opacity: 0.8 }}>Use the form to configure your first paper stock or media item.</p>
                        </div>
                    ) : (
                        materials.map(mat => {
                            const pairedMachineDetails = activeCompatibilities[mat.id] || [];
                            const isPairingMode = pairingMaterialId === mat.id;

                            return (
                                <div key={mat.id} style={{ background: '#09090b', padding: '16px', borderRadius: '8px', border: '1px solid #27272a', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <span style={{ fontSize: '11px', background: '#27272a', color: '#d4d4d8', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                                {mat.material_type}
                                            </span>
                                            <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', margin: '6px 0 2px 0' }}>{mat.material_name}</h4>
                                            <p style={{ fontSize: '12px', color: '#a1a1aa', margin: 0 }}>
                                                {mat.gsm} GSM • {mat.sheet_format} • {mat.finish_type}
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => handleArchiveMaterial(mat.id)}
                                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                            title="Archive Material"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    {/* Machine Pairings */}
                                    <div style={{ background: '#18181b', padding: '12px', borderRadius: '6px', border: '1px solid #27272a' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#d4d4d8' }}>Machine Compatibilities</span>
                                            <button
                                                onClick={() => setPairingMaterialId(isPairingMode ? null : mat.id)}
                                                style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                <Link2 size={12} /> {isPairingMode ? 'Close Pairing' : 'Manage Pairings'}
                                            </button>
                                        </div>

                                        {pairedMachineDetails.length === 0 && !isPairingMode && (
                                            <p style={{ fontSize: '11px', color: '#71717a', margin: 0 }}>Not associated with any machines yet.</p>
                                        )}

                                        {/* Paired list */}
                                        {!isPairingMode && pairedMachineDetails.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                {pairedMachineDetails.map(pairedStr => {
                                                    const [mId, provenance] = pairedStr.split(':');
                                                    const machineObj = machines.find(m => m.id === mId);
                                                    if (!machineObj) return null;
                                                    return (
                                                        <div key={mId} style={{ background: '#27272a', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                                                            <span style={{ color: '#ffffff', fontWeight: 600 }}>{machineObj.machine_name}</span>
                                                            <span style={{ fontSize: '9px', background: '#3f3f46', color: '#cbd5e1', padding: '1px 4px', borderRadius: '2px' }} title="Compatibility Provenance">
                                                                {provenance}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Interactive pairing mode */}
                                        {isPairingMode && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                                {machines.length === 0 ? (
                                                    <p style={{ fontSize: '11px', color: '#a1a1aa', margin: 0 }}>No machines configured. Configure a machine first.</p>
                                                ) : (
                                                    machines.map(m => {
                                                        const isPaired = pairedMachineDetails.some(p => p.startsWith(m.id + ':'));
                                                        const currentProvenance = pairedMachineDetails.find(p => p.startsWith(m.id + ':'))?.split(':')[1] || '';

                                                        return (
                                                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#09090b', padding: '8px 10px', borderRadius: '4px', border: '1px solid #27272a' }}>
                                                                <div>
                                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>{m.machine_name}</span>
                                                                    {isPaired && (
                                                                        <span style={{ display: 'block', fontSize: '9px', color: '#a1a1aa' }}>
                                                                            Provenance: {currentProvenance}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    {!isPaired && (
                                                                        <>
                                                                            <input
                                                                                type="text"
                                                                                placeholder="provenance code"
                                                                                value={provenanceMap[m.id] || ''}
                                                                                onChange={(e) => setProvenanceMap({ ...provenanceMap, [m.id]: e.target.value })}
                                                                                style={{ background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', width: '100px' }}
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handlePairMachine(mat.id, m.id)}
                                                                                style={{ background: '#dc0000', border: 'none', color: '#ffffff', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                                                                            >
                                                                                Link
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                    {isPaired && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleUnpairMachine(mat.id, m.id)}
                                                                            style={{ background: '#3f3f46', border: 'none', color: '#fca5a5', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                                                                        >
                                                                            <Unlink size={10} /> Unlink
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
