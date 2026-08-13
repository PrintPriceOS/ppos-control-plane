/**
 * src/ui/components/printhouse/setup/PricingRuleBuilder.tsx
 * 
 * Form Builder Modal for adding and editing Governed Pricing Rules.
 * Integrates the QuantityTierEditor.
 */
import React, { useState, useEffect } from 'react';
import { X, Save, Layers, AlertCircle } from 'lucide-react';
import { QuantityTierEditor } from './QuantityTierEditor';

interface PricingRuleBuilderProps {
    onClose: () => void;
    onSave: (data: any) => void;
    initialData?: any;
    sites: { siteId: string; siteName: string }[];
    machines: { id: string; name: string; siteId: string }[];
    materials: { id: string; name: string; siteId: string }[];
    currency: string;
}

export const PricingRuleBuilder: React.FC<PricingRuleBuilderProps> = ({
    onClose,
    onSave,
    initialData,
    sites,
    machines,
    materials,
    currency
}) => {
    const [scope, setScope] = useState(initialData?.scope || 'TENANT_DEFAULT');
    const [siteId, setSiteId] = useState(initialData?.site_id || '');
    const [machineId, setMachineId] = useState(initialData?.machine_id || '');
    const [materialCatalogId, setMaterialCatalogId] = useState(initialData?.material_catalog_id || '');
    const [capabilityName, setCapabilityName] = useState(initialData?.capability_name || '');
    const [pricingUnit, setPricingUnit] = useState(initialData?.pricing_unit || 'PER_UNIT');
    
    const [basePrice, setBasePrice] = useState(initialData?.base_price !== undefined ? Number(initialData.base_price) : 0);
    const [setupCharge, setSetupCharge] = useState(initialData?.setup_charge !== undefined ? Number(initialData.setup_charge) : 0);
    const [minimumOrderValue, setMinimumOrderValue] = useState(initialData?.minimum_order_value !== undefined ? Number(initialData.minimum_order_value) : 0);
    
    const [tiers, setTiers] = useState<any[]>(initialData?.tiers || []);
    const [loading, setLoading] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    // Filter machines by selected site if applicable
    const filteredMachines = siteId 
        ? machines.filter(m => m.siteId === siteId)
        : machines;

    // Filter materials by selected site if applicable
    const filteredMaterials = siteId
        ? materials.filter(m => m.siteId === siteId)
        : materials;

    useEffect(() => {
        // Adjust dependent dropdowns when scope changes
        if (scope === 'TENANT_DEFAULT' || scope === 'SURCHARGE' || scope === 'FINISHING_RULE') {
            setSiteId('');
            setMachineId('');
            setMaterialCatalogId('');
        } else if (scope === 'SITE_OVERRIDE') {
            setMachineId('');
            setMaterialCatalogId('');
            if (sites.length > 0 && !siteId) {
                setSiteId(sites[0].siteId);
            }
        } else if (scope === 'MACHINE_OVERRIDE') {
            setMaterialCatalogId('');
            if (sites.length > 0 && !siteId) {
                setSiteId(sites[0].siteId);
            }
        } else if (scope === 'MATERIAL_RULE') {
            setMachineId('');
            if (sites.length > 0 && !siteId) {
                setSiteId(sites[0].siteId);
            }
        }
    }, [scope]);

    useEffect(() => {
        // Auto-select first machine/material when site changes in that scope
        if (scope === 'MACHINE_OVERRIDE') {
            const siteMachines = machines.filter(m => m.siteId === siteId);
            if (siteMachines.length > 0) {
                setMachineId(siteMachines[0].id);
            } else {
                setMachineId('');
            }
        } else if (scope === 'MATERIAL_RULE') {
            const siteMaterials = materials.filter(m => m.siteId === siteId);
            if (siteMaterials.length > 0) {
                setMaterialCatalogId(siteMaterials[0].id);
            } else {
                setMaterialCatalogId('');
            }
        }
    }, [siteId, scope]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setValidationError(null);

        // Simple validation check
        if (scope === 'SITE_OVERRIDE' && !siteId) {
            setValidationError('Please select a Production Site.');
            return;
        }
        if (scope === 'MACHINE_OVERRIDE' && (!siteId || !machineId)) {
            setValidationError('Please select both a Production Site and a Machine.');
            return;
        }
        if (scope === 'MATERIAL_RULE' && (!siteId || !materialCatalogId)) {
            setValidationError('Please select both a Production Site and a Material.');
            return;
        }
        if (scope === 'FINISHING_RULE' && !capabilityName.trim()) {
            setValidationError('Please enter a finishing Capability name.');
            return;
        }

        setLoading(true);
        try {
            await onSave({
                scope,
                site_id: siteId || null,
                machine_id: machineId || null,
                material_catalog_id: materialCatalogId || null,
                capability_name: scope === 'FINISHING_RULE' ? capabilityName.trim() : null,
                pricing_unit: pricingUnit,
                base_price: Number(basePrice),
                setup_charge: Number(setupCharge),
                minimum_order_value: Number(minimumOrderValue),
                tiers: tiers.map(t => ({
                    min_quantity: Number(t.min_quantity),
                    max_quantity: t.max_quantity === null || t.max_quantity === '' ? null : Number(t.max_quantity),
                    unit_rate: Number(t.unit_rate),
                    flat_charge: Number(t.flat_charge),
                    method: t.method
                }))
            });
        } catch (err: any) {
            setValidationError(err.message || 'Failed to save pricing rule');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050
        }}>
            <div style={{
                backgroundColor: '#18181b', width: '100%', maxWidth: '680px', maxHeight: '90vh',
                borderRadius: '16px', border: '1px solid #27272a', overflowY: 'auto',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '20px 24px', borderBottom: '1px solid #27272a', position: 'sticky', top: 0,
                    backgroundColor: '#18181b', zIndex: 10
                }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Layers size={18} style={{ color: '#dc0000' }} />
                        {initialData ? 'Edit Pricing Rule' : 'Add Pricing Rule'}
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} style={{ padding: '24px', flex: 1 }}>
                    {validationError && (
                        <div style={{
                            display: 'flex', gap: '8px', padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', marginBottom: '20px',
                            color: '#f87171', fontSize: '13px', alignItems: 'center'
                        }}>
                            <AlertCircle size={16} style={{ flexShrink: 0 }} />
                            <span>{validationError}</span>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                        {/* Scope */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Rule Scope
                            </label>
                            <select
                                value={scope}
                                onChange={(e) => setScope(e.target.value)}
                                style={{
                                    width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                    borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                    outline: 'none'
                                }}
                            >
                                <option value="TENANT_DEFAULT">Tenant Default (Baseline)</option>
                                <option value="SITE_OVERRIDE">Site Override</option>
                                <option value="MACHINE_OVERRIDE">Machine Override</option>
                                <option value="MATERIAL_RULE">Material Surcharge</option>
                                <option value="FINISHING_RULE">Finishing / Capability Surcharge</option>
                                <option value="SURCHARGE">General/Expedite Surcharge</option>
                            </select>
                        </div>

                        {/* Pricing Unit */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Pricing Unit
                            </label>
                            <select
                                value={pricingUnit}
                                onChange={(e) => setPricingUnit(e.target.value)}
                                style={{
                                    width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                    borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                    outline: 'none'
                                }}
                            >
                                <option value="PER_UNIT">Per Unit (Product)</option>
                                <option value="PER_SHEET">Per Sheet</option>
                                <option value="PER_IMPRESSION">Per Impression (Click)</option>
                                <option value="PER_JOB">Per Job (Flat)</option>
                                <option value="PER_HOUR">Per Hour</option>
                                <option value="PER_SETUP">Per Setup</option>
                            </select>
                        </div>
                    </div>

                    {/* Scope Specific Inputs */}
                    {scope !== 'TENANT_DEFAULT' && scope !== 'SURCHARGE' && scope !== 'FINISHING_RULE' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                    Production Site
                                </label>
                                <select
                                    value={siteId}
                                    onChange={(e) => setSiteId(e.target.value)}
                                    style={{
                                        width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                        borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                        outline: 'none'
                                    }}
                                >
                                    <option value="" disabled>Select Site...</option>
                                    {sites.map(s => (
                                        <option key={s.siteId} value={s.siteId}>{s.siteName}</option>
                                    ))}
                                </select>
                            </div>

                            {scope === 'MACHINE_OVERRIDE' && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                        Machine
                                    </label>
                                    <select
                                        value={machineId}
                                        onChange={(e) => setMachineId(e.target.value)}
                                        style={{
                                            width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                            borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                            outline: 'none'
                                        }}
                                    >
                                        <option value="" disabled>Select Machine...</option>
                                        {filteredMachines.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                    {filteredMachines.length === 0 && siteId && (
                                        <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                                            No active machines configured at this site.
                                        </span>
                                    )}
                                </div>
                            )}

                            {scope === 'MATERIAL_RULE' && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                        Substrate Material
                                    </label>
                                    <select
                                        value={materialCatalogId}
                                        onChange={(e) => setMaterialCatalogId(e.target.value)}
                                        style={{
                                            width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                            borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                            outline: 'none'
                                        }}
                                    >
                                        <option value="" disabled>Select Material...</option>
                                        {filteredMaterials.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                    {filteredMaterials.length === 0 && siteId && (
                                        <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                                            No materials registered at this site.
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {scope === 'FINISHING_RULE' && (
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Capability / Finishing Name
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. spot_uv, lamination, perfect_binding"
                                value={capabilityName}
                                onChange={(e) => setCapabilityName(e.target.value)}
                                style={{
                                    width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                    borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    )}

                    {/* Numeric Rates */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Base Price ({currency})
                            </label>
                            <input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={basePrice}
                                onChange={(e) => setBasePrice(Number(e.target.value))}
                                style={{
                                    width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                    borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Setup Charge ({currency})
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={setupCharge}
                                onChange={(e) => setSetupCharge(Number(e.target.value))}
                                style={{
                                    width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                    borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Min Job Value ({currency})
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={minimumOrderValue}
                                onChange={(e) => setMinimumOrderValue(Number(e.target.value))}
                                style={{
                                    width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                    borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    {/* Quantity Tiers Editor */}
                    <div style={{ marginBottom: '24px' }}>
                        <QuantityTierEditor
                            tiers={tiers}
                            onChange={setTiers}
                        />
                    </div>

                    {/* Submit Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #27272a', paddingTop: '20px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                backgroundColor: 'transparent', color: '#ffffff', border: '1px solid #27272a',
                                borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                backgroundColor: '#dc0000', color: '#ffffff', border: 'none',
                                borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                opacity: loading ? 0.6 : 1
                            }}
                        >
                            <Save size={16} />
                            {loading ? 'Saving...' : 'Save Rule'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
