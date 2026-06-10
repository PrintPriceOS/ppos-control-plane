import React, { useState, useEffect } from 'react';
import { SlaProfile } from '../../types/printhouseCapabilities';
import { listSlaProfiles, createSlaProfile, updateSlaProfile } from '../../api/printhouseCapabilitiesClient';
import { PlusIcon, PencilIcon } from '@heroicons/react/24/outline';

interface SlaProfileEditorProps {
    printhouseId: string;
    onMutationSuccess: () => void;
}

export const SlaProfileEditor: React.FC<SlaProfileEditorProps> = ({ 
    printhouseId, 
    onMutationSuccess 
}) => {
    const [profiles, setProfiles] = useState<SlaProfile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingProfile, setEditingProfile] = useState<Partial<SlaProfile> | null>(null);

    useEffect(() => {
        loadProfiles();
    }, [printhouseId]);

    const loadProfiles = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listSlaProfiles(printhouseId);
            if (res.ok) {
                setProfiles(res.profiles);
            } else {
                setError('Failed to load SLA profiles');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const validateForm = (m: Partial<SlaProfile>): string | null => {
        if (!m.profile_name) return 'Profile Name is required';

        const minDays = Number(m.production_days_min || 0);
        const maxDays = Number(m.production_days_max || 0);
        const surcharge = Number(m.rush_surcharge_percent || 0);
        const dailyJobs = Number(m.max_daily_jobs || 0);
        const dailyPages = Number(m.max_daily_pages || 0);

        if (m.production_days_min !== undefined && m.production_days_max !== undefined && minDays > maxDays) {
            return 'Min production days cannot exceed max production days';
        }
        if (m.rush_surcharge_percent !== undefined && surcharge < 0) {
            return 'Rush surcharge percent must be greater than or equal to 0';
        }
        if (m.max_daily_jobs !== undefined && dailyJobs < 0) {
            return 'Max daily jobs limit must be greater than or equal to 0';
        }
        if (m.max_daily_pages !== undefined && dailyPages < 0) {
            return 'Max daily pages limit must be greater than or equal to 0';
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
                res = await updateSlaProfile(printhouseId, editingProfile.id, editingProfile);
            } else {
                res = await createSlaProfile(printhouseId, editingProfile);
            }

            if (res.ok) {
                setEditingProfile(null);
                await loadProfiles();
                onMutationSuccess();
            } else {
                setError((res as any).error || 'Failed to save SLA profile');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred during save');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (p: SlaProfile) => {
        setEditingProfile({ ...p });
    };

    const handleNew = () => {
        setEditingProfile({
            profile_name: '',
            production_days_min: 1,
            production_days_max: 3,
            cutoff_time_local: '17:00',
            weekend_production: false,
            holiday_calendar_region: 'ES-MAD',
            rush_available: false,
            rush_surcharge_percent: 0,
            max_daily_jobs: 10,
            max_daily_pages: 5000
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b ppos-border pb-4">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">SLA & Capacity Rules</h3>
                {!editingProfile && (
                    <button 
                        onClick={handleNew}
                        className="px-3 py-1.5 bg-primary text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" /> Add SLA Rule
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
                        {editingProfile.id ? 'Edit SLA Rule' : 'Create SLA Rule'}
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
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Min Prod Days *</label>
                            <input 
                                type="number"
                                required
                                value={editingProfile.production_days_min !== undefined ? editingProfile.production_days_min : ''}
                                onChange={e => setEditingProfile({ ...editingProfile, production_days_min: Number(e.target.value) })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Max Prod Days *</label>
                            <input 
                                type="number"
                                required
                                value={editingProfile.production_days_max !== undefined ? editingProfile.production_days_max : ''}
                                onChange={e => setEditingProfile({ ...editingProfile, production_days_max: Number(e.target.value) })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Cutoff Time (Local)</label>
                            <input 
                                type="text"
                                placeholder="HH:MM (e.g. 18:00)"
                                value={editingProfile.cutoff_time_local || ''}
                                onChange={e => setEditingProfile({ ...editingProfile, cutoff_time_local: e.target.value })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Holiday Calendar Region</label>
                            <input 
                                type="text"
                                placeholder="e.g. ES-MAD"
                                value={editingProfile.holiday_calendar_region || ''}
                                onChange={e => setEditingProfile({ ...editingProfile, holiday_calendar_region: e.target.value })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Weekend Production</span>
                            <div className="bg-white dark:bg-zinc-950 p-3 border border-zinc-200 dark:border-zinc-800">
                                <label className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={!!editingProfile.weekend_production}
                                        onChange={e => setEditingProfile({ ...editingProfile, weekend_production: e.target.checked })}
                                        className="rounded-none border-zinc-300 text-primary w-4 h-4"
                                    />
                                    <span>Produce on Saturdays & Sundays</span>
                                </label>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Rush Orders</span>
                            <div className="flex gap-4 bg-white dark:bg-zinc-950 p-3 border border-zinc-200 dark:border-zinc-800 items-center justify-between">
                                <label className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={!!editingProfile.rush_available}
                                        onChange={e => setEditingProfile({ ...editingProfile, rush_available: e.target.checked })}
                                        className="rounded-none border-zinc-300 text-primary w-4 h-4"
                                    />
                                    <span>Rush Turnaround Available</span>
                                </label>
                                {editingProfile.rush_available && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Surcharge</span>
                                        <input 
                                            type="number"
                                            value={editingProfile.rush_surcharge_percent || 0}
                                            onChange={e => setEditingProfile({ ...editingProfile, rush_surcharge_percent: Number(e.target.value) })}
                                            className="w-16 p-1 border text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                                        />
                                        <span className="text-xs text-zinc-500">%</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Daily Capacity Limits</span>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-800">
                            <div>
                                <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max Daily Jobs</label>
                                <input 
                                    type="number" 
                                    value={editingProfile.max_daily_jobs !== undefined ? editingProfile.max_daily_jobs : ''} 
                                    onChange={e => setEditingProfile({ ...editingProfile, max_daily_jobs: Number(e.target.value) })} 
                                    className="w-full p-1 border border-zinc-200 dark:border-zinc-800 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100" 
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max Daily Pages</label>
                                <input 
                                    type="number" 
                                    value={editingProfile.max_daily_pages !== undefined ? editingProfile.max_daily_pages : ''} 
                                    onChange={e => setEditingProfile({ ...editingProfile, max_daily_pages: Number(e.target.value) })} 
                                    className="w-full p-1 border border-zinc-200 dark:border-zinc-800 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100" 
                                />
                            </div>
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
                            {loading ? 'Saving...' : 'Save SLA'}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profiles.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-xs font-bold text-zinc-400 border border-dashed ppos-border">
                            No SLA profiles configured.
                        </div>
                    ) : (
                        profiles.map(p => (
                            <div key={p.id} className="p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">{p.profile_name}</span>
                                        <span className="text-[9px] font-black px-1.5 py-0.5 uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                                            SLA
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-zinc-500 space-y-1">
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Production days:</strong> {p.production_days_min} to {p.production_days_max} days</p>
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Cutoff Time:</strong> {p.cutoff_time_local || 'N/A'}</p>
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Weekend:</strong> {p.weekend_production ? 'Active' : 'No'}</p>
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Rush Service:</strong> {p.rush_available ? `Yes (+${p.rush_surcharge_percent}%)` : 'No'}</p>
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Max Capacity:</strong> {p.max_daily_jobs || '∞'} jobs | {p.max_daily_pages || '∞'} pages</p>
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
