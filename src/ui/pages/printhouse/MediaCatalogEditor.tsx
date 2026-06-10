import React, { useState, useEffect } from 'react';
import { Media, Machine } from '../../types/printhouseCapabilities';
import { listMedia, createMedia, updateMedia, listMachines } from '../../api/printhouseCapabilitiesClient';
import { PlusIcon, PencilIcon } from '@heroicons/react/24/outline';

interface MediaCatalogEditorProps {
    printhouseId: string;
    onMutationSuccess: () => void;
}

export const MediaCatalogEditor: React.FC<MediaCatalogEditorProps> = ({ 
    printhouseId, 
    onMutationSuccess 
}) => {
    const [mediaList, setMediaList] = useState<Media[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingMedia, setEditingMedia] = useState<Partial<Media> | null>(null);

    useEffect(() => {
        loadMediaAndMachines();
    }, [printhouseId]);

    const loadMediaAndMachines = async () => {
        setLoading(true);
        setError(null);
        try {
            const mediaRes = await listMedia(printhouseId);
            const machRes = await listMachines(printhouseId);
            if (mediaRes.ok && machRes.ok) {
                setMediaList(mediaRes.media);
                setMachines(machRes.machines);
            } else {
                setError('Failed to load media or machines data');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const validateForm = (m: Partial<Media>): string | null => {
        if (!m.media_name) return 'Media Name is required';
        if (!m.media_type) return 'Media Type is required';

        const gsmVal = Number(m.gsm || 0);
        const thicknessVal = Number(m.thickness_microns || 0);
        const recycledVal = Number(m.recycled_content_percent || 0);

        if (m.gsm !== undefined && gsmVal <= 0) {
            return 'GSM must be greater than 0';
        }
        if (m.thickness_microns !== undefined && thicknessVal < 0) {
            return 'Thickness must be greater than or equal to 0';
        }
        if (m.recycled_content_percent !== undefined && (recycledVal < 0 || recycledVal > 100)) {
            return 'Recycled Content Percent must be between 0 and 100';
        }

        // Parse compatible machines list
        const comps = typeof m.compatible_machine_ids_json === 'string' 
            ? JSON.parse(m.compatible_machine_ids_json) 
            : (m.compatible_machine_ids_json || []);

        if (m.status === 'ACTIVE' && machines.length > 0 && comps.length === 0) {
            return 'At least one compatible machine must be selected for active media';
        }
        return null;
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingMedia) return;

        const validationErr = validateForm(editingMedia);
        if (validationErr) {
            setError(validationErr);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            let res;
            if (editingMedia.id) {
                res = await updateMedia(printhouseId, editingMedia.id, editingMedia);
            } else {
                res = await createMedia(printhouseId, editingMedia);
            }

            if (res.ok) {
                setEditingMedia(null);
                await loadMediaAndMachines();
                onMutationSuccess();
            } else {
                setError((res as any).error || 'Failed to save media');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred during save');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (m: Media) => {
        setEditingMedia({
            ...m,
            // Ensure array/json fields are formatted correctly for checkbox selection
            compatible_machine_ids_json: typeof m.compatible_machine_ids_json === 'string'
                ? JSON.parse(m.compatible_machine_ids_json)
                : (m.compatible_machine_ids_json || [])
        });
    };

    const handleNew = () => {
        setEditingMedia({
            media_name: '',
            media_type: 'COATED_PAPER',
            gsm: 130,
            thickness_microns: 110,
            finish: 'MATTE',
            color: 'WHITE',
            status: 'ACTIVE',
            fsc_available: false,
            pefc_available: false,
            recycled_content_percent: 0,
            compatible_machine_ids_json: machines.length > 0 ? [machines[0].id] : []
        });
    };

    const handleMachineToggle = (machId: string) => {
        if (!editingMedia) return;
        const current = (editingMedia.compatible_machine_ids_json as string[]) || [];
        const updated = current.includes(machId)
            ? current.filter(id => id !== machId)
            : [...current, machId];
        setEditingMedia({ ...editingMedia, compatible_machine_ids_json: updated });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b ppos-border pb-4">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Media Catalog</h3>
                {!editingMedia && (
                    <button 
                        onClick={handleNew}
                        className="px-3 py-1.5 bg-primary text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" /> Add Media
                    </button>
                )}
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-bold border border-red-100 dark:border-red-900/40">
                    {error}
                </div>
            )}

            {editingMedia ? (
                <form onSubmit={handleSave} className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 p-6 space-y-6">
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest border-b ppos-border pb-2">
                        {editingMedia.id ? 'Edit Media Product' : 'Register New Media'}
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Media Name *</label>
                            <input 
                                type="text"
                                required
                                value={editingMedia.media_name || ''}
                                onChange={e => setEditingMedia({ ...editingMedia, media_name: e.target.value })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Media Type *</label>
                            <input 
                                type="text"
                                required
                                placeholder="e.g. COATED_PAPER, UNCOATED_PAPER"
                                value={editingMedia.media_type || ''}
                                onChange={e => setEditingMedia({ ...editingMedia, media_type: e.target.value })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Status *</label>
                            <select 
                                value={editingMedia.status || 'ACTIVE'}
                                onChange={e => setEditingMedia({ ...editingMedia, status: e.target.value as any })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            >
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="INACTIVE">INACTIVE</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">GSM (g/m²)</label>
                            <input 
                                type="number"
                                value={editingMedia.gsm || ''}
                                onChange={e => setEditingMedia({ ...editingMedia, gsm: e.target.value ? Number(e.target.value) : undefined })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Thickness (microns)</label>
                            <input 
                                type="number"
                                value={editingMedia.thickness_microns || ''}
                                onChange={e => setEditingMedia({ ...editingMedia, thickness_microns: e.target.value ? Number(e.target.value) : undefined })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Finish</label>
                            <input 
                                type="text"
                                placeholder="GLOSS, MATTE, SILK, etc."
                                value={editingMedia.finish || ''}
                                onChange={e => setEditingMedia({ ...editingMedia, finish: e.target.value })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Sheet Width (mm)</label>
                            <input type="number" value={editingMedia.sheet_width_mm || ''} onChange={e => setEditingMedia({ ...editingMedia, sheet_width_mm: Number(e.target.value) })} className="w-full p-1.5 border border-zinc-200 dark:border-zinc-800 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Sheet Height (mm)</label>
                            <input type="number" value={editingMedia.sheet_height_mm || ''} onChange={e => setEditingMedia({ ...editingMedia, sheet_height_mm: Number(e.target.value) })} className="w-full p-1.5 border border-zinc-200 dark:border-zinc-800 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Roll Width (mm)</label>
                            <input type="number" value={editingMedia.roll_width_mm || ''} onChange={e => setEditingMedia({ ...editingMedia, roll_width_mm: Number(e.target.value) })} className="w-full p-1.5 border border-zinc-200 dark:border-zinc-800 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Recycled Content %</label>
                            <input 
                                type="number" 
                                min="0" 
                                max="100"
                                value={editingMedia.recycled_content_percent !== undefined ? editingMedia.recycled_content_percent : ''} 
                                onChange={e => setEditingMedia({ ...editingMedia, recycled_content_percent: Number(e.target.value) })} 
                                className="w-full p-1.5 border border-zinc-200 dark:border-zinc-800 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100" 
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sustainability Certifications</span>
                            <div className="flex gap-4 bg-white dark:bg-zinc-950 p-3 border border-zinc-200 dark:border-zinc-800">
                                <label className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={!!editingMedia.fsc_available}
                                        onChange={e => setEditingMedia({ ...editingMedia, fsc_available: e.target.checked })}
                                        className="rounded-none border-zinc-300 text-primary w-4 h-4"
                                    />
                                    <span>FSC Available</span>
                                </label>
                                <label className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={!!editingMedia.pefc_available}
                                        onChange={e => setEditingMedia({ ...editingMedia, pefc_available: e.target.checked })}
                                        className="rounded-none border-zinc-300 text-primary w-4 h-4"
                                    />
                                    <span>PEFC Available</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Machine Compatibility *</span>
                        <div className="bg-white dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-800 max-h-48 overflow-y-auto space-y-2">
                            {machines.length === 0 ? (
                                <p className="text-xs text-zinc-400 font-bold">Please onboard machines first to configure compatibility.</p>
                            ) : (
                                machines.map(mach => {
                                    const comps = (editingMedia.compatible_machine_ids_json as string[]) || [];
                                    const isChecked = comps.includes(mach.id);
                                    return (
                                        <label key={mach.id} className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer">
                                            <input 
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => handleMachineToggle(mach.id)}
                                                className="rounded-none border-zinc-300 text-primary w-4 h-4"
                                            />
                                            <span>{mach.machine_name} ({mach.machine_type})</span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 border-t ppos-border pt-4">
                        <button 
                            type="button"
                            onClick={() => { setEditingMedia(null); setError(null); }}
                            className="px-4 py-2 border ppos-border text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-primary/95 disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save Media'}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {mediaList.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-xs font-bold text-zinc-400 border border-dashed ppos-border">
                            No media defined in the catalog.
                        </div>
                    ) : (
                        mediaList.map(m => {
                            const comps = typeof m.compatible_machine_ids_json === 'string'
                                ? JSON.parse(m.compatible_machine_ids_json)
                                : (m.compatible_machine_ids_json || []);
                            return (
                                <div key={m.id} className="p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">{m.media_name}</span>
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 uppercase tracking-wider ${
                                                m.status === 'ACTIVE' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                                            }`}>
                                                {m.status}
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-zinc-500 space-y-1">
                                            <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Type:</strong> {m.media_type}</p>
                                            <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Weight:</strong> {m.gsm} gsm | <strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Thickness:</strong> {m.thickness_microns}μ</p>
                                            <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Finish:</strong> {m.finish || 'N/A'} | <strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Color:</strong> {m.color || 'N/A'}</p>
                                            <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Sustain:</strong> FSC {m.fsc_available ? 'Yes' : 'No'} | PEFC {m.pefc_available ? 'Yes' : 'No'} | Recycled: {m.recycled_content_percent || 0}%</p>
                                            <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Compatible machines:</strong> {comps.length}</p>
                                        </div>
                                    </div>
                                    <div className="border-t ppos-border mt-4 pt-3 flex justify-end">
                                        <button 
                                            onClick={() => handleEdit(m)}
                                            className="px-2 py-1 border ppos-border text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
                                        >
                                            <PencilIcon className="w-3.5 h-3.5" /> Edit
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};
