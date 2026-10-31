/**
 * src/ui/components/printhouse/setup/QuantityTierEditor.tsx
 * 
 * Progressive, aesthetic editor for pricing rule quantity tiers.
 * Supports adding, removing, and validating tiers dynamically.
 */
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface QuantityTier {
    min_quantity: number;
    max_quantity: number | null;
    unit_rate: number;
    flat_charge: number;
    method: 'UNIT_PRICE' | 'FLAT_PRICE' | 'BASE_PLUS_UNIT';
}

interface QuantityTierEditorProps {
    tiers: QuantityTier[];
    onChange: (tiers: QuantityTier[]) => void;
    disabled?: boolean;
}

export const QuantityTierEditor: React.FC<QuantityTierEditorProps> = ({ tiers, onChange, disabled }) => {
    const handleAddTier = () => {
        const nextMin = tiers.length > 0 ? (tiers[tiers.length - 1].max_quantity || 0) + 1 : 1;
        const newTier: QuantityTier = {
            min_quantity: nextMin,
            max_quantity: null,
            unit_rate: 0,
            flat_charge: 0,
            method: 'UNIT_PRICE'
        };
        onChange([...tiers, newTier]);
    };

    const handleRemoveTier = (index: number) => {
        const updated = [...tiers];
        updated.splice(index, 1);
        onChange(updated);
    };

    const handleUpdateField = (index: number, field: keyof QuantityTier, value: any) => {
        const updated = [...tiers];
        if (field === 'max_quantity') {
            updated[index][field] = value === '' ? null : Number(value);
        } else if (field === 'method') {
            updated[index][field] = value;
        } else {
            updated[index][field] = Number(value) as any;
        }
        onChange(updated);
    };

    return (
        <div style={{ backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#ffffff' }}>Quantity Pricing Tiers</h4>
                {!disabled && (
                    <button
                        type="button"
                        onClick={handleAddTier}
                        style={{
                            backgroundColor: '#27272a',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'background-color 0.2s'
                        }}
                    >
                        <Plus size={14} /> Add Tier
                    </button>
                )}
            </div>

            {tiers.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#71717a', fontSize: '13px', backgroundColor: '#09090b', borderRadius: '8px', border: '1px dashed #27272a' }}>
                    No quantity tiers configured. The base pricing rule parameters will apply.
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #27272a', textAlign: 'left', color: '#a1a1aa' }}>
                                <th style={{ padding: '10px 8px' }}>Min Qty</th>
                                <th style={{ padding: '10px 8px' }}>Max Qty (Inclusive)</th>
                                <th style={{ padding: '10px 8px' }}>Unit Rate</th>
                                <th style={{ padding: '10px 8px' }}>Flat Fee</th>
                                <th style={{ padding: '10px 8px' }}>Pricing Method</th>
                                {!disabled && <th style={{ padding: '10px 8px', width: '50px' }}></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {tiers.map((tier, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #27272a' }}>
                                    <td style={{ padding: '8px' }}>
                                        <input
                                            type="number"
                                            value={tier.min_quantity}
                                            onChange={(e) => handleUpdateField(idx, 'min_quantity', e.target.value)}
                                            disabled={disabled}
                                            style={{
                                                width: '90px',
                                                backgroundColor: '#09090b',
                                                border: '1px solid #27272a',
                                                borderRadius: '6px',
                                                padding: '6px 8px',
                                                color: '#ffffff',
                                                fontSize: '13px'
                                            }}
                                        />
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                        <input
                                            type="number"
                                            placeholder="∞"
                                            value={tier.max_quantity === null ? '' : tier.max_quantity}
                                            onChange={(e) => handleUpdateField(idx, 'max_quantity', e.target.value)}
                                            disabled={disabled}
                                            style={{
                                                width: '100px',
                                                backgroundColor: '#09090b',
                                                border: '1px solid #27272a',
                                                borderRadius: '6px',
                                                padding: '6px 8px',
                                                color: '#ffffff',
                                                fontSize: '13px'
                                            }}
                                        />
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                        <input
                                            type="number"
                                            step="0.0001"
                                            value={tier.unit_rate}
                                            onChange={(e) => handleUpdateField(idx, 'unit_rate', e.target.value)}
                                            disabled={disabled}
                                            style={{
                                                width: '90px',
                                                backgroundColor: '#09090b',
                                                border: '1px solid #27272a',
                                                borderRadius: '6px',
                                                padding: '6px 8px',
                                                color: '#ffffff',
                                                fontSize: '13px'
                                            }}
                                        />
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={tier.flat_charge}
                                            onChange={(e) => handleUpdateField(idx, 'flat_charge', e.target.value)}
                                            disabled={disabled}
                                            style={{
                                                width: '90px',
                                                backgroundColor: '#09090b',
                                                border: '1px solid #27272a',
                                                borderRadius: '6px',
                                                padding: '6px 8px',
                                                color: '#ffffff',
                                                fontSize: '13px'
                                            }}
                                        />
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                        <select
                                            value={tier.method}
                                            onChange={(e) => handleUpdateField(idx, 'method', e.target.value)}
                                            disabled={disabled}
                                            style={{
                                                backgroundColor: '#09090b',
                                                border: '1px solid #27272a',
                                                borderRadius: '6px',
                                                padding: '6px 8px',
                                                color: '#ffffff',
                                                fontSize: '13px'
                                            }}
                                        >
                                            <option value="UNIT_PRICE">Unit Price Only</option>
                                            <option value="FLAT_PRICE">Flat Price Only</option>
                                            <option value="BASE_PLUS_UNIT">Base + Unit Price</option>
                                        </select>
                                    </td>
                                    {!disabled && (
                                        <td style={{ padding: '8px', textAlign: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveTier(idx)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#ef4444',
                                                    cursor: 'pointer',
                                                    padding: '4px'
                                                }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
