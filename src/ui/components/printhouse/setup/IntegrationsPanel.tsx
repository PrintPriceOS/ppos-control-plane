/**
 * src/ui/components/printhouse/setup/IntegrationsPanel.tsx
 * 
 * Phase 191G — Integrations & API Credentials Panel.
 * Configures API keys, Webhooks, JDF/JMF metadata, and MIS connectors.
 * Enforces one-time secret reveal, secret redaction, and SSRF security status.
 */
import React, { useState, useEffect } from 'react';
import { Cpu } from 'lucide-react';
import { getAuthToken } from '../../../lib/authStore';

interface IntegrationProfile {
    id: string;
    integrationType: string;
    name: string;
    status: string;
    endpointUrl: string | null;
}

interface IntegrationsPanelProps {
    siteId?: string;
    onSaveSuccess?: () => void;
}

export const IntegrationsPanel: React.FC<IntegrationsPanelProps> = ({ siteId, onSaveSuccess }) => {
    const [profiles, setProfiles] = useState<IntegrationProfile[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [showAddForm, setShowAddForm] = useState<boolean>(false);
    const [formData, setFormData] = useState({
        name: '',
        integrationType: 'API',
        endpointUrl: ''
    });
    const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadProfiles();
    }, [siteId]);

    const loadProfiles = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/printhouse/onboarding/integrations?siteId=${siteId || ''}`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            const data = await res.json();
            if (data.success) {
                setProfiles(data.profiles || []);
            }
        } catch (e) {
            setProfiles([
                {
                    id: 'inprof-api-default',
                    integrationType: 'API',
                    name: 'Default Inbound API Key',
                    status: 'READY',
                    endpointUrl: null
                }
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setRevealedSecret(null);
        try {
            const res = await fetch('/api/printhouse/onboarding/integrations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    name: formData.name,
                    integrationType: formData.integrationType,
                    endpointUrl: formData.endpointUrl || null
                })
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: 'Integration profile created.' });
                setShowAddForm(false);
                loadProfiles();
                if (onSaveSuccess) onSaveSuccess();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to create integration profile' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Error creating integration profile' });
        }
    };

    const handleGenerateCredential = async (profileId: string) => {
        setRevealedSecret(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/integrations/${profileId}/credentials`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({ scopes: ['read', 'write'] })
            });
            const data = await res.json();
            if (data.success && data.credential?.oneTimeSecret) {
                setRevealedSecret(data.credential.oneTimeSecret);
                setMessage({ type: 'success', text: 'New API credential generated. Copy the secret now!' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: 'Failed to generate credential' });
        }
    };

    const handleTestConnectivity = async (profileId: string) => {
        try {
            const res = await fetch(`/api/printhouse/onboarding/integrations/${profileId}/test`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                }
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: 'Connectivity test passed successfully (SSRF Check: CLEAN).' });
                loadProfiles();
            } else {
                setMessage({ type: 'error', text: data.error || 'Connectivity test failed' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: 'Connectivity test error' });
        }
    };

    const inputClass = "w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors";
    const labelClass = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5";

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-7 shadow-sm transition-colors">
            <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Cpu size={20} className="text-[#dc0000]" />
                        <h3 className="m-0 text-lg font-bold text-zinc-900 dark:text-white">
                            Shop-Floor & ERP Integrations
                        </h3>
                    </div>
                    <p className="m-0 text-xs text-zinc-500 dark:text-zinc-400">
                        Configure Webhook, API, JDF/JMF, or MIS integrations to connect PrintPrice OS with your production facility.
                    </p>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-xs transition-colors shadow-xs cursor-pointer"
                >
                    {showAddForm ? 'Cancel' : '+ Add Integration'}
                </button>
            </div>

            {message && (
                <div className={`p-3 rounded-lg text-xs mb-4 ${
                    message.type === 'success' 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200' 
                        : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
                }`}>
                    {message.text}
                </div>
            )}

            {revealedSecret && (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 rounded-xl mb-5">
                    <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200 tracking-wider">ONE-TIME SECRET DISPLAY (COPY NOW)</div>
                    <code className="block text-sm font-mono text-emerald-800 dark:text-emerald-300 bg-white dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 p-2.5 rounded-lg mt-2 break-all">
                        {revealedSecret}
                    </code>
                    <p className="m-0 mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                        ⚠️ This secret will never be shown again. On reload, it will appear redacted as <code>••••••••••••••••</code>.
                    </p>
                </div>
            )}

            {showAddForm && (
                <form onSubmit={handleCreateProfile} className="bg-zinc-50 dark:bg-zinc-900/60 p-5 rounded-xl mb-5 border border-zinc-200 dark:border-zinc-800 transition-colors">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                            <label className={labelClass}>Integration Name</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Production MIS Webhook"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Integration Type</label>
                            <select
                                value={formData.integrationType}
                                onChange={e => setFormData({ ...formData, integrationType: e.target.value })}
                                className={`${inputClass} cursor-pointer`}
                            >
                                <option value="API">API Key / Rest Endpoint</option>
                                <option value="WEBHOOK">Outbound Webhook</option>
                                <option value="JDF">JDF Job Definition</option>
                                <option value="JMF">JMF Device Messaging</option>
                                <option value="MIS">MIS / ERP Connector</option>
                            </select>
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className={labelClass}>Target Endpoint URL (Required for Webhook/MIS)</label>
                        <input
                            type="url"
                            value={formData.endpointUrl}
                            onChange={e => setFormData({ ...formData, endpointUrl: e.target.value })}
                            placeholder="https://api.yourprinthouse.com/webhooks"
                            className={inputClass}
                        />
                    </div>

                    <button
                        type="submit"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
                    >
                        Create Integration Profile
                    </button>
                </form>
            )}

            {/* Profile List */}
            {loading ? (
                <p className="text-xs text-zinc-500">Loading integration profiles...</p>
            ) : profiles.length === 0 ? (
                <div className="text-center py-8 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
                    <p className="m-0 text-xs text-zinc-500 font-semibold">No integration profiles created yet.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {profiles.map(p => (
                        <div key={p.id} className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 transition-colors">
                            <div className="flex justify-between items-center flex-wrap gap-3">
                                <div>
                                    <h4 className="m-0 text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                        {p.name}
                                        <span className="text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded font-mono">
                                            {p.integrationType}
                                        </span>
                                    </h4>
                                    <p className="m-0 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                        Endpoint: {p.endpointUrl || 'N/A (Server-Issued API Key)'} | Status: <strong className={p.status === 'READY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{p.status}</strong>
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleGenerateCredential(p.id)}
                                        className="bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
                                    >
                                        + Generate Key
                                    </button>
                                    <button
                                        onClick={() => handleTestConnectivity(p.id)}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors shadow-xs"
                                    >
                                        Test Connectivity
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
