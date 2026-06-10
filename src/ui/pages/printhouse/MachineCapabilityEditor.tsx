import React, { useState, useEffect } from 'react';
import { Machine } from '../../types/printhouseCapabilities';
import { listMachines, createMachine, updateMachine } from '../../api/printhouseCapabilitiesClient';
import { PlusIcon, PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface MachineCapabilityEditorProps {
    printhouseId: string;
    onMutationSuccess: () => void;
}

export const MachineCapabilityEditor: React.FC<MachineCapabilityEditorProps> = ({ 
    printhouseId, 
    onMutationSuccess 
}) => {
    const [machines, setMachines] = useState<Machine[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingMachine, setEditingMachine] = useState<Partial<Machine> | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    useEffect(() => {
        loadMachines();
    }, [printhouseId]);

    const loadMachines = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listMachines(printhouseId);
            if (res.ok) {
                setMachines(res.machines);
            } else {
                setError('Failed to load machines');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const validateForm = (m: Partial<Machine>): string | null => {
        if (!m.machine_name) return 'Machine Name is required';
        if (!m.machine_type) return 'Machine Type is required';
        
        const minW = Number(m.min_sheet_width_mm || 0);
        const maxW = Number(m.max_sheet_width_mm || 0);
        const minH = Number(m.min_sheet_height_mm || 0);
        const maxH = Number(m.max_sheet_height_mm || 0);
        const printW = Number(m.max_print_width_mm || 0);
        const printH = Number(m.max_print_height_mm || 0);
        const tac = Number(m.max_tac_percent || 0);
        const fileSize = Number(m.max_file_size_mb || 0);

        if (maxW && minW && maxW <= minW) {
            return 'Max sheet width must be greater than min sheet width';
        }
        if (maxH && minH && maxH <= minH) {
            return 'Max sheet height must be greater than min sheet height';
        }
        if (printW && maxW && printW > maxW) {
            return 'Max print width cannot exceed max sheet width';
        }
        if (printH && maxH && printH > maxH) {
            return 'Max print height cannot exceed max sheet height';
        }
        if (tac && (tac < 100 || tac > 400)) {
            return 'Max TAC percent must be between 100 and 400';
        }
        if (fileSize && fileSize <= 0) {
            return 'Max file size must be greater than 0';
        }
        return null;
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingMachine) return;

        const validationErr = validateForm(editingMachine);
        if (validationErr) {
            setError(validationErr);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            let res;
            if (editingMachine.id) {
                res = await updateMachine(printhouseId, editingMachine.id, editingMachine);
            } else {
                res = await createMachine(printhouseId, editingMachine);
            }

            if (res.ok) {
                setEditingMachine(null);
                setIsAdding(false);
                await loadMachines();
                onMutationSuccess();
            } else {
                setError((res as any).error || 'Failed to save machine');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred during save');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (m: Machine) => {
        setEditingMachine({ ...m });
        setIsAdding(false);
    };

    const handleNew = () => {
        setEditingMachine({
            machine_name: '',
            machine_type: 'OFFSET',
            status: 'ACTIVE',
            min_sheet_width_mm: 100,
            max_sheet_width_mm: 1000,
            min_sheet_height_mm: 100,
            max_sheet_height_mm: 1000,
            max_print_width_mm: 950,
            max_print_height_mm: 950,
            max_tac_percent: 300,
            max_file_size_mb: 200,
            max_pages_per_job: 128,
            supports_pdfx: true,
            supports_pdfa: false,
            supported_color_modes_json: ['CMYK'],
            supported_print_methods_json: ['OFFSET'],
            supported_sides_json: ['4/4']
        });
        setIsAdding(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b ppos-border pb-4">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Active Machine Fleet</h3>
                {!editingMachine && (
                    <button 
                        onClick={handleNew}
                        className="px-3 py-1.5 bg-primary text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" /> Add Machine
                    </button>
                )}
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-bold border border-red-100 dark:border-red-900/40">
                    {error}
                </div>
            )}

            {editingMachine ? (
                <form onSubmit={handleSave} className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 p-6 space-y-6">
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest border-b ppos-border pb-2">
                        {editingMachine.id ? 'Edit Machine Details' : 'Onboard New Machine'}
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Machine Name *</label>
                            <input 
                                type="text"
                                required
                                value={editingMachine.machine_name || ''}
                                onChange={e => setEditingMachine({ ...editingMachine, machine_name: e.target.value })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Machine Type *</label>
                            <select 
                                value={editingMachine.machine_type || 'OFFSET'}
                                onChange={e => setEditingMachine({ ...editingMachine, machine_type: e.target.value as any })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            >
                                <option value="OFFSET">OFFSET</option>
                                <option value="DIGITAL">DIGITAL</option>
                                <option value="FLEXO">FLEXO</option>
                                <option value="SCREEN">SCREEN</option>
                                <option value="ROTARY">ROTARY</option>
                                <option value="OTHER">OTHER</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Status *</label>
                            <select 
                                value={editingMachine.status || 'ACTIVE'}
                                onChange={e => setEditingMachine({ ...editingMachine, status: e.target.value as any })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            >
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="MAINTENANCE">MAINTENANCE</option>
                                <option value="OFFLINE">OFFLINE</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Manufacturer</label>
                            <input 
                                type="text"
                                value={editingMachine.manufacturer || ''}
                                onChange={e => setEditingMachine({ ...editingMachine, manufacturer: e.target.value })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Model</label>
                            <input 
                                type="text"
                                value={editingMachine.model || ''}
                                onChange={e => setEditingMachine({ ...editingMachine, model: e.target.value })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Max TAC Percent (100-400)</label>
                            <input 
                                type="number"
                                value={editingMachine.max_tac_percent || ''}
                                onChange={e => setEditingMachine({ ...editingMachine, max_tac_percent: e.target.value ? Number(e.target.value) : undefined })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sizing Constraints (mm)</span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                            <div>
                                <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Min Sheet Width</label>
                                <input type="number" value={editingMachine.min_sheet_width_mm || ''} onChange={e => setEditingMachine({ ...editingMachine, min_sheet_width_mm: Number(e.target.value) })} className="w-full p-1 border border-zinc-200 dark:border-zinc-800 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max Sheet Width</label>
                                <input type="number" value={editingMachine.max_sheet_width_mm || ''} onChange={e => setEditingMachine({ ...editingMachine, max_sheet_width_mm: Number(e.target.value) })} className="w-full p-1 border border-zinc-200 dark:border-zinc-800 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Min Sheet Height</label>
                                <input type="number" value={editingMachine.min_sheet_height_mm || ''} onChange={e => setEditingMachine({ ...editingMachine, min_sheet_height_mm: Number(e.target.value) })} className="w-full p-1 border border-zinc-200 dark:border-zinc-800 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max Sheet Height</label>
                                <input type="number" value={editingMachine.max_sheet_height_mm || ''} onChange={e => setEditingMachine({ ...editingMachine, max_sheet_height_mm: Number(e.target.value) })} className="w-full p-1 border border-zinc-200 dark:border-zinc-800 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max Print Width</label>
                                <input type="number" value={editingMachine.max_print_width_mm || ''} onChange={e => setEditingMachine({ ...editingMachine, max_print_width_mm: Number(e.target.value) })} className="w-full p-1 border border-zinc-200 dark:border-zinc-800 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max Print Height</label>
                                <input type="number" value={editingMachine.max_print_height_mm || ''} onChange={e => setEditingMachine({ ...editingMachine, max_print_height_mm: Number(e.target.value) })} className="w-full p-1 border border-zinc-200 dark:border-zinc-800 text-xs bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Max Pages Per Job</label>
                            <input 
                                type="number"
                                value={editingMachine.max_pages_per_job || ''}
                                onChange={e => setEditingMachine({ ...editingMachine, max_pages_per_job: e.target.value ? Number(e.target.value) : undefined })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Max File Size (MB)</label>
                            <input 
                                type="number"
                                value={editingMachine.max_file_size_mb || ''}
                                onChange={e => setEditingMachine({ ...editingMachine, max_file_size_mb: e.target.value ? Number(e.target.value) : undefined })}
                                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:border-primary text-zinc-900 dark:text-zinc-100"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Standards & Features support</span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 bg-white dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-800">
                            {[
                                { key: 'supports_pdfx', label: 'PDF/X Compliant' },
                                { key: 'supports_pdfa', label: 'PDF/A Archive' },
                                { key: 'supports_variable_data', label: 'VDP (Variable Data)' },
                                { key: 'supports_white_ink', label: 'White Specialty Ink' },
                                { key: 'supports_spot_uv', label: 'Spot UV varnish' },
                                { key: 'supports_lamination', label: 'Lamination Unit' },
                                { key: 'supports_hardcover', label: 'Hardcover capabilities' },
                                { key: 'supports_softcover', label: 'Softcover binding' },
                                { key: 'supports_saddle_stitch', label: 'Saddle Stitching' },
                                { key: 'supports_perfect_binding', label: 'Perfect Binding' },
                                { key: 'supports_case_binding', label: 'Case Binding' },
                            ].map(f => (
                                <label key={f.key} className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={!!(editingMachine as any)[f.key]}
                                        onChange={e => setEditingMachine({ ...editingMachine, [f.key]: e.target.checked })}
                                        className="rounded-none border-zinc-300 text-primary focus:ring-primary w-4 h-4"
                                    />
                                    <span>{f.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 border-t ppos-border pt-4">
                        <button 
                            type="button"
                            onClick={() => { setEditingMachine(null); setIsAdding(false); setError(null); }}
                            className="px-4 py-2 border ppos-border text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-primary/95 disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save Machine'}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {machines.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-xs font-bold text-zinc-400 border border-dashed ppos-border">
                            No machines added yet. Onboard at least one machine.
                        </div>
                    ) : (
                        machines.map(m => (
                            <div key={m.id} className="p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">{m.machine_name}</span>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 uppercase tracking-wider ${
                                            m.status === 'ACTIVE' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                                        }`}>
                                            {m.status}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-zinc-500 space-y-1">
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Type:</strong> {m.machine_type} {m.manufacturer ? `(${m.manufacturer} ${m.model || ''})` : ''}</p>
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Sheets:</strong> {m.min_sheet_width_mm}x{m.min_sheet_height_mm}mm to {m.max_sheet_width_mm}x{m.max_sheet_height_mm}mm</p>
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Max Print:</strong> {m.max_print_width_mm}x{m.max_print_height_mm}mm</p>
                                        <p><strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Max TAC:</strong> {m.max_tac_percent}% | <strong className="text-zinc-700 dark:text-zinc-400 uppercase text-[9px] tracking-wider">Max File Size:</strong> {m.max_file_size_mb} MB</p>
                                        <p className="flex flex-wrap gap-1 mt-1">
                                            {m.supports_pdfx && <span className="text-[9px] bg-sky-50 dark:bg-sky-950/30 text-sky-600 px-1 font-bold">PDF/X</span>}
                                            {m.supports_white_ink && <span className="text-[9px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1 font-bold">White Ink</span>}
                                            {m.supports_spot_uv && <span className="text-[9px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1 font-bold">Spot UV</span>}
                                        </p>
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
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
