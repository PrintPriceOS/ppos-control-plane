/**
 * src/ui/components/printhouse/setup/CompanyProfileForm.tsx
 * 
 * Form for viewing and editing Company Profile canonical domain data in tenants table.
 */
import React, { useState } from 'react';
import { FieldGuidance } from './FieldGuidance';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';
import { getAuthToken } from '../../../lib/authStore';

interface CompanyData {
    companyName: string;
    legalName: string;
    tradingName: string;
    country: string;
    city: string;
    address: string;
    postalCode: string;
    phone: string;
    website: string;
    contactName: string;
    taxId: string;
    companyRegistrationId: string;
}

export const CompanyProfileForm: React.FC<{ companyData?: CompanyData; onSaved?: () => void }> = ({ companyData, onSaved }) => {
    const [form, setForm] = useState<CompanyData>({
        companyName: companyData?.companyName || '',
        legalName: companyData?.legalName || '',
        tradingName: companyData?.tradingName || '',
        country: companyData?.country || 'ES',
        city: companyData?.city || '',
        address: companyData?.address || '',
        postalCode: companyData?.postalCode || '',
        phone: companyData?.phone || '',
        website: companyData?.website || '',
        contactName: companyData?.contactName || '',
        taxId: companyData?.taxId || '',
        companyRegistrationId: companyData?.companyRegistrationId || ''
    });

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccessMsg(null);
        setErrorMsg(null);

        try {
            const token = getAuthToken();
            const res = await fetch('/api/printhouse/onboarding/company-profile', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(form)
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                setSuccessMsg('Company Profile updated successfully.');
                if (onSaved) onSaved();
            } else {
                setErrorMsg(data.error || 'Failed to update company profile.');
            }
        } catch (err) {
            setErrorMsg('Network error while saving company profile.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', padding: '28px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', marginBottom: '20px' }}>Company Profile</h2>

            {successMsg && (
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#6ee7b7', padding: '12px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <CheckCircle size={16} /> {successMsg}
                </div>
            )}

            {errorMsg && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#fca5a5', padding: '12px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <AlertCircle size={16} /> {errorMsg}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                        Legal Company Name
                        <FieldGuidance title="Legal Company Name" description="Used for contracts, invoicing, and compliance records. It may differ from the public trading name." />
                    </label>
                    <input
                        type="text"
                        required
                        value={form.legalName}
                        onChange={(e) => setForm({ ...form, legalName: e.target.value, companyName: e.target.value })}
                        style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', color: '#ffffff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                        Trading / Display Name
                        <FieldGuidance title="Trading Name" description="The public brand name displayed to customers in the marketplace." />
                    </label>
                    <input
                        type="text"
                        value={form.tradingName}
                        onChange={(e) => setForm({ ...form, tradingName: e.target.value })}
                        style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', color: '#ffffff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                        Country of Operation
                        <FieldGuidance title="Country" description="Primary jurisdiction of your printing facility." />
                    </label>
                    <input
                        type="text"
                        required
                        value={form.country}
                        onChange={(e) => setForm({ ...form, country: e.target.value })}
                        style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', color: '#ffffff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                        City
                    </label>
                    <input
                        type="text"
                        required
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', color: '#ffffff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                        Primary Contact Name
                        <FieldGuidance title="Primary Contact" description="Main account manager responsible for order communications." />
                    </label>
                    <input
                        type="text"
                        value={form.contactName}
                        onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                        style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', color: '#ffffff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                        Phone Number
                    </label>
                    <input
                        type="text"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', color: '#ffffff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={loading}
                style={{
                    background: '#dc0000',
                    color: '#ffffff',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}
            >
                <Save size={16} /> {loading ? 'Saving Changes...' : 'Save Company Profile'}
            </button>
        </form>
    );
};
