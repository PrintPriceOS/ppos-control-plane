/**
 * src/ui/components/printhouse/setup/PricingPreview.tsx
 * 
 * Commercial pricing simulator that runs calculation preview runs against a selected Price Book.
 */
import React, { useState, useEffect } from 'react';
import { getAuthToken } from '../../../lib/authStore';
import { Calculator, Play, Info, AlertCircle, Sparkles, Receipt, CheckCircle } from 'lucide-react';

interface PricingPreviewProps {
    priceBookId: string;
    sites: { siteId: string; siteName: string }[];
    machines: { id: string; name: string; siteId: string }[];
    materials: { id: string; name: string; siteId: string }[];
    currency: string;
}

const COMMON_CAPABILITIES = [
    { value: 'spot_uv', label: 'Spot UV coating' },
    { value: 'white_ink', label: 'White Ink printing' },
    { value: 'lamination', label: 'Matte/Gloss Lamination' },
    { value: 'perfect_binding', label: 'Perfect Binding' },
    { value: 'saddle_stitch', label: 'Saddle Stitching' },
    { value: 'variable_data', label: 'Variable Data Printing (VDP)' },
    { value: 'hardcover', label: 'Hardcover Case Binding' },
    { value: 'softcover', label: 'Softcover/Paperback' }
];

export const PricingPreview: React.FC<PricingPreviewProps> = ({
    priceBookId,
    sites,
    machines,
    materials,
    currency
}) => {
    const [quantity, setQuantity] = useState(100);
    const [selectedSiteId, setSelectedSiteId] = useState('');
    const [selectedMachineId, setSelectedMachineId] = useState('');
    const [selectedMaterialId, setSelectedMaterialId] = useState('');
    const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
    const [expedited, setExpedited] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewResult, setPreviewResult] = useState<any | null>(null);

    const token = getAuthToken();

    // Reset machine and material when site changes
    useEffect(() => {
        setSelectedMachineId('');
        setSelectedMaterialId('');
    }, [selectedSiteId]);

    const filteredMachines = selectedSiteId
        ? machines.filter(m => m.siteId === selectedSiteId)
        : machines;

    const filteredMaterials = selectedSiteId
        ? materials.filter(m => m.siteId === selectedSiteId)
        : materials;

    const handleToggleCap = (capName: string) => {
        if (selectedCaps.includes(capName)) {
            setSelectedCaps(selectedCaps.filter(c => c !== capName));
        } else {
            setSelectedCaps([...selectedCaps, capName]);
        }
    };

    const handleRunSimulation = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setPreviewResult(null);

        try {
            const res = await fetch('/api/printhouse/onboarding/pricing/preview', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    priceBookId,
                    quantity: Number(quantity),
                    siteId: selectedSiteId || null,
                    machineId: selectedMachineId || null,
                    materialCatalogId: selectedMaterialId || null,
                    capabilities: selectedCaps,
                    expedited
                })
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                setPreviewResult(data.data);
            } else {
                setError(data.error || 'Failed to simulate pricing');
            }
        } catch (err: any) {
            setError(err.message || 'Error running simulation');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
            {/* Input Simulator Panel */}
            <div style={{ backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #27272a', padding: '24px' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calculator size={18} style={{ color: '#dc0000' }} />
                    Simulation Parameters
                </h4>

                <form onSubmit={handleRunSimulation}>
                    {/* Quantity */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Order Quantity (Units)
                        </label>
                        <input
                            type="number"
                            min="1"
                            required
                            value={quantity}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                            style={{
                                width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        {/* Site */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Target Site (Optional)
                            </label>
                            <select
                                value={selectedSiteId}
                                onChange={(e) => setSelectedSiteId(e.target.value)}
                                style={{
                                    width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                    borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                    outline: 'none'
                                }}
                            >
                                <option value="">Global/Default Site</option>
                                {sites.map(s => (
                                    <option key={s.siteId} value={s.siteId}>{s.siteName}</option>
                                ))}
                            </select>
                        </div>

                        {/* Machine */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Target Machine (Optional)
                            </label>
                            <select
                                value={selectedMachineId}
                                onChange={(e) => setSelectedMachineId(e.target.value)}
                                style={{
                                    width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                    borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                    outline: 'none'
                                }}
                            >
                                <option value="">No Machine Override</option>
                                {filteredMachines.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Material */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Substrate Material Surcharge (Optional)
                        </label>
                        <select
                            value={selectedMaterialId}
                            onChange={(e) => setSelectedMaterialId(e.target.value)}
                            style={{
                                width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                outline: 'none'
                            }}
                        >
                            <option value="">No Material Surcharge</option>
                            {filteredMaterials.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Capabilities checklist */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Finishing Operations / Capabilities
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', backgroundColor: '#09090b', padding: '12px', borderRadius: '8px', border: '1px solid #27272a' }}>
                            {COMMON_CAPABILITIES.map(c => (
                                <label key={c.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#e4e4e7', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedCaps.includes(c.value)}
                                        onChange={() => handleToggleCap(c.value)}
                                        style={{ accentColor: '#dc0000' }}
                                    />
                                    {c.label}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Expedited Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', backgroundColor: 'rgba(220,0,0,0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(220,0,0,0.1)' }}>
                        <input
                            type="checkbox"
                            id="expedited"
                            checked={expedited}
                            onChange={(e) => setExpedited(e.target.checked)}
                            style={{ width: '16px', height: '16px', accentColor: '#dc0000', cursor: 'pointer' }}
                        />
                        <label htmlFor="expedited" style={{ fontSize: '13px', color: '#ffffff', cursor: 'pointer', fontWeight: 600 }}>
                            Expedited Production Schedule (+20% or surcharge rule)
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%', backgroundColor: '#dc0000', color: '#ffffff', border: 'none',
                            borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 700,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            transition: 'opacity 0.2s', opacity: loading ? 0.6 : 1
                        }}
                    >
                        <Play size={16} fill="#ffffff" />
                        {loading ? 'Running Simulation...' : 'Calculate Non-Binding Quote'}
                    </button>
                </form>
            </div>

            {/* Simulation Results Display */}
            <div style={{ backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #27272a', padding: '24px', minHeight: '430px', display: 'flex', flexDirection: 'column' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Receipt size={18} style={{ color: '#10b981' }} />
                    Calculation Breakdown
                </h4>

                {error && (
                    <div style={{
                        display: 'flex', gap: '8px', padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#f87171', fontSize: '13px', alignItems: 'center'
                    }}>
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                {!previewResult && !error && !loading && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#71717a', textAlign: 'center', padding: '40px 20px' }}>
                        <Sparkles size={36} style={{ color: '#27272a', marginBottom: '12px' }} />
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#a1a1aa' }}>Ready to Simulate</span>
                        <span style={{ fontSize: '12px', color: '#71717a', marginTop: '4px', maxWidth: '280px' }}>
                            Adjust parameters and run the calculation to view the granular cost breakdown and rule provenance.
                        </span>
                    </div>
                )}

                {loading && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>
                        <div style={{
                            width: '24px', height: '24px', border: '2px solid #27272a', borderTopColor: '#dc0000',
                            borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '12px'
                        }} />
                        <span style={{ fontSize: '13px' }}>Simulating database precedence resolution...</span>
                    </div>
                )}

                {previewResult && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        {/* Provenance breakdown items */}
                        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px', backgroundColor: '#09090b', borderRadius: '8px', border: '1px solid #27272a', padding: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {previewResult.components.map((comp: any, idx: number) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '10px', borderBottom: idx < previewResult.components.length - 1 ? '1px solid #18181b' : 'none' }}>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                                                {comp.name}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#71717a', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                <span>Rule: {comp.ruleId.substring(0, 10)}...</span>
                                                <span style={{
                                                    backgroundColor: comp.provenance === 'SYSTEM_DEFAULT' ? '#27272a' : '#dc0000',
                                                    color: '#ffffff', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 700
                                                }}>
                                                    {comp.provenance}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>
                                            {Number(comp.amount).toFixed(2)} {previewResult.currency}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Invoice-like summary block */}
                        <div style={{ backgroundColor: '#09090b', borderRadius: '8px', border: '1px solid #27272a', padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#a1a1aa', marginBottom: '8px' }}>
                                <span>{previewResult.taxLabels.netLabel}</span>
                                <span>{previewResult.netTotal} {previewResult.currency}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#a1a1aa', marginBottom: '12px', pb: '12px', borderBottom: '1px dashed #27272a', paddingBottom: '8px' }}>
                                <span>{previewResult.taxLabels.taxLabel}</span>
                                <span>{previewResult.taxTotal} {previewResult.currency}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                                <span style={{ color: '#10b981' }}>{previewResult.taxLabels.grossLabel}</span>
                                <span style={{ color: '#10b981', fontSize: '17px' }}>{previewResult.grossTotal} {previewResult.currency}</span>
                            </div>
                        </div>

                        {/* Disclaimer note */}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '12px', color: '#71717a', fontSize: '11px', lineHeight: '1.4' }}>
                            <Info size={14} style={{ flexShrink: 0, color: '#a1a1aa' }} />
                            <span>
                                Simulation computed using live DB precedence. Non-binding pricing snapshot. Historical order histories will not be backfilled or impacted.
                            </span>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Inject dynamic CSS animation in case page doesn't have it */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}} />
        </div>
    );
};
