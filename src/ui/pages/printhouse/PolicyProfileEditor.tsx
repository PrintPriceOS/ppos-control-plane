import React, { useState, useEffect } from 'react';
import { PolicyProfile } from '../../types/printhouseCapabilities';
import { listPolicyProfiles, createPolicyProfile, updatePolicyProfile } from '../../api/printhouseCapabilitiesClient';
import { PlusIcon, PencilIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface PolicyProfileEditorProps {
    printhouseId: string;
    onMutationSuccess: () => void;
}

export const PolicyProfileEditor: React.FC<PolicyProfileEditorProps> = ({ 
    printhouseId, 
    onMutationSuccess 
}) => {
    const [profiles, setProfiles] = useState<PolicyProfile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingProfile, setEditingProfile] = useState<Partial<PolicyProfile> | null>(null);

    useEffect(() => {
        loadProfiles();
    }, [printhouseId]);

    const loadProfiles = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listPolicyProfiles(printhouseId);
            if (res.ok) {
                setProfiles(res.profiles);
            } else {
                setError('Failed to load policy profiles');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const validateForm = (m: Partial<PolicyProfile>): string | null => {
        if (!m.profile_name) return 'Profile Name is required';
        if (!m.profile_type) return 'Profile Type is required';

        const tac = Number(m.max_tac_percent || 0);
        const bleed = Number(m.min_bleed_mm || 0);

        if (m.max_tac_percent !== undefined && (tac < 100 || tac > 400)) {
            return 'Max TAC Percent must be between 100 and 400';
        }
        if (m.min_bleed_mm !== undefined && bleed < 0) {
            return 'Min Bleed (mm) must be greater than or equal to 0';
        }

        return null;
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProfile) return;

        const validationErr = validateForm(editingProfile);
        if (validationErr) {
            setError(validationErr);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            let res;
            if (editingProfile.id) {
                res = await updatePolicyProfile(printhouseId, editingProfile.id, editingProfile);
            } else {
                res = await createPolicyProfile(printhouseId, editingProfile);
            }

            if (res.ok) {
                setEditingProfile(null);
                await loadProfiles();
                onMutationSuccess();
            } else {
                setError((res as any).error || 'Failed to save policy profile');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred during save');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (p: PolicyProfile) => {
        setEditingProfile({ ...p });
    };

    const handleNew = () => {
        setEditingProfile({
            profile_name: '',
            profile_type: 'PREFLIGHT',
            required_pdf_standard: 'NONE',
            allow_degraded_analysis: true,
            require_artifact_trust_production_certified: true,
            require_visual_proof_approval: true,
            require_human_review_for_page_marks: true,
            require_human_review_for_ink_changes: true,
            require_human_review_for_font_changes: true,
            require_human_review_for_transparency: true,
            max_tac_percent: 300,
            min_bleed_mm: 3,
            allow_rgb: false,
            allow_spot_colors: true,
            allow_transparency: true,
            allow_overprint: true,
            allow_annotations: true,
            allow_forms: false,
            allow_javascript: false,
            allow_embedded_files: false
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b ppos-border pb-4">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Policy Governance Profiles</h3>
                {!editingProfile && (
                    <button 
                        onClick={handleNew}
                        className="px-3 py-1.5 bg-primary text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" /> Add Profile
                    </button>
                )}
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-bold border border-red-100 dark:border-red-900/40">
                    {error}
                </div>
            )}

            {editingProfile ? (
                <form onSubmit={handleSave} className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 p-6 space-y-6">
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest border-b ppos-border pb-2">
                        {editingProfile.id ? 'Edit Policy Profile' : 'Create Policy Profile'}
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Profile Name *</label>
                            <input 
                                type="text"
                                required
                                value={editingProfile.profile_name || ''}
                                onChange={e => setEditingProfile({ ...editingProfile, profile_name: e.target.value })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Profile Type *</label>
                            <input 
                                type="text"
                                required
                                placeholder="e.g. PREFLIGHT, DIRECT"
                                value={editingProfile.profile_type || ''}
                                onChange={e => setEditingProfile({ ...editingProfile, profile_type: e.target.value })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Required PDF Standard</label>
                            <select 
                                value={editingProfile.required_pdf_standard || 'NONE'}
                                onChange={e => setEditingProfile({ ...editingProfile, required_pdf_standard: e.target.value as any })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            >
                                <option value="NONE">NONE (No standard required)</option>
                                <option value="PDF/X-1a">PDF/X-1a</option>
                                <option value="PDF/X-3">PDF/X-3</option>
                                <option value="PDF/X-4">PDF/X-4</option>
                                <option value="PDF/A-1a">PDF/A-1a</option>
                                <option value="PDF/A-2b">PDF/A-2b</option>
                            </select>
                        </div>
                    </div>

                    {editingProfile.required_pdf_standard && editingProfile.required_pdf_standard !== 'NONE' && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-400 text-xs flex gap-2">
                            <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                            <div>
                                <p className="font-bold">Validation Evidence Required</p>
                                <p className="mt-0.5">Defining a target standard in this policy profile does not certify the files. The preflight engine must output matching validator evidence (e.g. from Callas pdfToolbox) before any standards compliance claim can be made.</p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Max TAC Percent (100-400)</label>
                            <input 
                                type="number"
                                value={editingProfile.max_tac_percent || ''}
                                onChange={e => setEditingProfile({ ...editingProfile, max_tac_percent: e.target.value ? Number(e.target.value) : undefined })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Min Bleed (mm)</label>
                            <input 
                                type="number"
                                value={editingProfile.min_bleed_mm !== undefined ? editingProfile.min_bleed_mm : ''}
                                onChange={e => setEditingProfile({ ...editingProfile, min_bleed_mm: e.target.value ? Number(e.target.value) : undefined })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Enforcement Gates</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-white dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-800">
                            {[
                                { key: 'allow_degraded_analysis', label: 'Allow Degraded Analysis' },
                                { key: 'require_artifact_trust_production_certified', label: 'Require Artifact Trust Certification' },
                                { key: 'require_visual_proof_approval', label: 'Require Customer Proof Approval' },
                                { key: 'require_human_review_for_page_marks', label: 'Review Page Marks Changes' },
                                { key: 'require_human_review_for_ink_changes', label: 'Review Ink/Color Changes' },
                                { key: 'require_human_review_for_font_changes', label: 'Review Font Substitutions' },
                                { key: 'require_human_review_for_transparency', label: 'Review Transparency Flattening' },
                            ].map(f => (
                                <label key={f.key} className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={!!(editingProfile as any)[f.key]}
                                        onChange={e => setEditingProfile({ ...editingProfile, [f.key]: e.target.checked })}
                                        className="rounded-none border-zinc-300 text-primary w-4 h-4"
                                    />
                                    <span>{f.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Accepted PDF Properties</span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 bg-white dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-800">
                            {[
                                { key: 'allow_rgb', label: 'Allow RGB Images' },
                                { key: 'allow_spot_colors', label: 'Allow Spot Colors' },
                                { key: 'allow_transparency', label: 'Allow Transparencies' },
                                { key: 'allow_overprint', label: 'Allow Overprint Settings' },
                                { key: 'allow_annotations', label: 'Allow PDF Annotations' },
                                { key: 'allow_forms', label: 'Allow Interactive Forms' },
                                { key: 'allow_javascript', label: 'Allow Embedded Javascript' },
                                { key: 'allow_embedded_files', label: 'Allow Embedded Files/Payloads' },
                            ].map(f => (
                                <label key={f.key} className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={!!(editingProfile as any)[f.key]}
                                        onChange={e => setEditingProfile({ ...editingProfile, [f.key]: e.target.checked })}
                                        className="rounded-none border-zinc-300 text-primary w-4 h-4"
                                    />
                                    <span>{f.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 border-t ppos-border pt-4">
                        <button 
                            type="button"
                            onClick={() => { setEditingProfile(null); setError(null); }}
                            className="px-4 py-2 border ppos-border text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-primary/95 disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save Profile'}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profiles.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-xs font-bold text-zinc-400 border border-dashed ppos-border">
                            No policy profiles defined yet.
                        </div>
                    ) : (
                        profiles.map(p => (
                            <div key={p.id} className="p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">{p.profile_name}</span>
                                        <span className="text-[9px] font-black px-1.5 py-0.5 uppercase tracking-wider bg-sky-50 dark:bg-sky-950/20 text-sky-600">
                                            {p.profile_type}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-zinc-500 space-y-1">
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Required Standard:</strong> {p.required_pdf_standard || 'NONE'}</p>
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Max TAC:</strong> {p.max_tac_percent || 'N/A'}% | <strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Min Bleed:</strong> {p.min_bleed_mm || 0}mm</p>
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Trust Cert:</strong> {p.require_artifact_trust_production_certified ? 'Required' : 'Optional'}</p>
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">RGB Allowed:</strong> {p.allow_rgb ? 'Yes' : 'No'} | <strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">JS Allowed:</strong> {p.allow_javascript ? 'Yes' : 'No'}</p>
                                    </div>
                                </div>
                                <div className="border-t ppos-border mt-4 pt-3 flex justify-end">
                                    <button 
                                        onClick={() => handleEdit(p)}
                                        className="px-2 py-1 border ppos-border text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
                                    >
                                        <PencilIcon className="w-3.5 h-3.5" /> Edit
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
