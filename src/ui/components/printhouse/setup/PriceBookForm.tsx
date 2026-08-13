/**
 * src/ui/components/printhouse/setup/PriceBookForm.tsx
 * 
 * Dialog Form for creating, editing metadata, and cloning governed Printhouse Price Books.
 */
import React, { useState } from 'react';
import { X, Calendar, DollarSign, Tag, Info } from 'lucide-react';

interface PriceBookFormProps {
    onClose: () => void;
    onSave: (data: any) => void;
    initialData?: any;
    isClone?: boolean;
}

export const PriceBookForm: React.FC<PriceBookFormProps> = ({ onClose, onSave, initialData, isClone }) => {
    const [name, setName] = useState(isClone ? `${initialData?.name} (Copy)` : initialData?.name || '');
    const [currency, setCurrency] = useState(initialData?.currency || 'EUR');
    const [effectiveFrom, setEffectiveFrom] = useState(
        initialData?.effective_from ? new Date(initialData.effective_from).toISOString().substring(0, 10) : ''
    );
    const [effectiveTo, setEffectiveTo] = useState(
        initialData?.effective_to ? new Date(initialData.effective_to).toISOString().substring(0, 10) : ''
    );
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave({
                name,
                currency,
                effective_from: effectiveFrom ? `${effectiveFrom}T00:00:00.000Z` : null,
                effective_to: effectiveTo ? `${effectiveTo}T23:59:59.000Z` : null
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div style={{
                backgroundColor: '#18181b', width: '100%', maxWidth: '480px',
                borderRadius: '16px', border: '1px solid #27272a', overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '20px 24px', borderBottom: '1px solid #27272a'
                }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Tag size={18} style={{ color: '#dc0000' }} />
                        {isClone ? 'Clone Price Book' : initialData ? 'Edit Price Book' : 'Create Price Book'}
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Price Book Name
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Catalog Standard 2026"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            style={{
                                width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {!initialData && (
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Currency
                            </label>
                            <div style={{ position: 'relative' }}>
                                <DollarSign size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#71717a' }} />
                                <select
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value)}
                                    style={{
                                        width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                        borderRadius: '8px', padding: '10px 14px 10px 36px', color: '#ffffff', fontSize: '14px',
                                        outline: 'none', appearance: 'none'
                                    }}
                                >
                                    <option value="EUR">EUR (€)</option>
                                    <option value="USD">USD ($)</option>
                                    <option value="GBP">GBP (£)</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Effective From
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#71717a' }} />
                                <input
                                    type="date"
                                    value={effectiveFrom}
                                    onChange={(e) => setEffectiveFrom(e.target.value)}
                                    style={{
                                        width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                        borderRadius: '8px', padding: '10px 12px 10px 36px', color: '#ffffff', fontSize: '14px',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Effective To
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#71717a' }} />
                                <input
                                    type="date"
                                    value={effectiveTo}
                                    onChange={(e) => setEffectiveTo(e.target.value)}
                                    style={{
                                        width: '100%', backgroundColor: '#09090b', border: '1px solid #27272a',
                                        borderRadius: '8px', padding: '10px 12px 10px 36px', color: '#ffffff', fontSize: '14px',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {isClone && (
                        <div style={{
                            display: 'flex', gap: '8px', padding: '12px', backgroundColor: '#09090b',
                            borderRadius: '8px', border: '1px solid #27272a', marginBottom: '24px', fontSize: '12px',
                            color: '#a1a1aa', lineHeight: '1.5'
                        }}>
                            <Info size={16} style={{ color: '#dc0000', flexShrink: 0 }} />
                            <span>Cloning will copy the selected price book metadata, all pricing rules, and their quantity tiers into a new DRAFT price book.</span>
                        </div>
                    )}

                    {/* Actions */}
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
                                cursor: 'pointer', opacity: loading ? 0.6 : 1
                            }}
                        >
                            {loading ? 'Saving...' : isClone ? 'Clone Book' : 'Save Book'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
