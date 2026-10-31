/**
 * src/ui/components/common/SupplierSelect.tsx
 *
 * Searchable supplier combobox & selector.
 * Populates with active and newly registered paper suppliers from the system,
 * while allowing custom supplier names when required.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, Building2, Plus, Loader2 } from 'lucide-react';
import { useLocale } from '../../i18n';
import * as adminApi from '../../lib/adminApi';

export interface SupplierOption {
    id: string;
    name: string;
    country?: string | null;
    contactEmail?: string | null;
    status?: string;
    isSystem?: boolean;
}

interface SupplierSelectProps {
    value: string;
    onChange: (supplierName: string, countryCode?: string) => void;
    id?: string;
    label?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    error?: string;
    className?: string;
    triggerClassName?: string;
    helperText?: React.ReactNode;
}

export const SupplierSelect: React.FC<SupplierSelectProps> = ({
    value,
    onChange,
    id = 'supplier-select',
    label,
    placeholder = 'Select or enter supplier...',
    required = false,
    disabled = false,
    error,
    className = '',
    triggerClassName,
    helperText
}) => {
    const { t } = useLocale();
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Initial fallback suppliers
    const defaultSuppliers: SupplierOption[] = useMemo(() => [
        { id: 'supp-mediterraneo', name: 'Papelera del Mediterraneo (Demo)', country: 'ES', contactEmail: 'proveedor@demo-papel.pro', isSystem: true },
        { id: 'supp-antalis', name: 'Antalis Co.', country: 'ES', contactEmail: 'contact@antalis.es', isSystem: true },
        { id: 'supp-torraspapel', name: 'Torraspapel Distribución', country: 'ES', contactEmail: 'info@torraspapel.com', isSystem: true },
        { id: 'supp-fedrigoni', name: 'Fedrigoni Special Papers', country: 'IT', contactEmail: 'sales@fedrigoni.com', isSystem: true },
        { id: 'supp-inapa', name: 'Inapa España', country: 'ES', contactEmail: 'comercial@inapa.es', isSystem: true },
        { id: 'supp-papyrus', name: 'Papyrus Group', country: 'DE', contactEmail: 'info@papyrus.com', isSystem: true }
    ], []);

    // Fetch suppliers on mount
    useEffect(() => {
        let isMounted = true;
        async function fetchSuppliers() {
            setLoading(true);
            try {
                const res = await adminApi.listSystemSuppliers();
                if (isMounted && res?.ok && Array.isArray(res?.data?.items) && res.data.items.length > 0) {
                    setSuppliers(res.data.items);
                } else if (isMounted) {
                    setSuppliers(defaultSuppliers);
                }
            } catch (err) {
                if (isMounted) {
                    setSuppliers(defaultSuppliers);
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        fetchSuppliers();
        return () => { isMounted = false; };
    }, [defaultSuppliers]);

    // Filter suppliers by searchQuery
    const filteredSuppliers = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return suppliers;
        return suppliers.filter(s =>
            s.name.toLowerCase().includes(q) ||
            (s.country && s.country.toLowerCase().includes(q)) ||
            (s.contactEmail && s.contactEmail.toLowerCase().includes(q))
        );
    }, [suppliers, searchQuery]);

    // Check if searchQuery is an exact match with an existing supplier
    const hasExactMatch = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        return suppliers.some(s => s.name.toLowerCase() === q);
    }, [suppliers, searchQuery]);

    // Reset highlighted index on search change
    useEffect(() => {
        setHighlightedIndex(0);
    }, [filteredSuppliers]);

    // Handle click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchQuery('');
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // Focus search input when popover opens
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen]);

    // Scroll active item into view
    useEffect(() => {
        if (isOpen && listRef.current) {
            const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleSelect = (name: string, country?: string | null) => {
        onChange(name, country || undefined);
        setIsOpen(false);
        setSearchQuery('');
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setSearchQuery('');
    };

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;

        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < filteredSuppliers.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (!hasExactMatch && searchQuery.trim() && highlightedIndex === 0) {
                    handleSelect(searchQuery.trim());
                } else if (filteredSuppliers[highlightedIndex]) {
                    handleSelect(filteredSuppliers[highlightedIndex].name, filteredSuppliers[highlightedIndex].country);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                setSearchQuery('');
                break;
        }
    };

    const listboxId = `${id}-listbox`;
    const selectedSupplier = suppliers.find(s => s.name.toLowerCase() === value.trim().toLowerCase());

    return (
        <div className={`relative ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
            {label && (
                <label
                    htmlFor={id}
                    className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between"
                >
                    <span>
                        {label} {required && <span className="text-[#dc0000]">*</span>}
                    </span>
                    {helperText}
                </label>
            )}

            {/* Trigger Combobox Button */}
            <button
                type="button"
                id={id}
                role="combobox"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-controls={listboxId}
                disabled={disabled}
                onClick={() => !disabled && setIsOpen(prev => !prev)}
                className={`w-full text-left bg-white dark:bg-zinc-900 border ${
                    error
                        ? 'border-red-500 ring-1 ring-red-500'
                        : isOpen
                            ? 'border-[#dc0000] ring-1 ring-[#dc0000]'
                            : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600'
                } text-zinc-900 dark:text-zinc-100 ${triggerClassName || 'px-3 py-2 rounded-lg text-sm'} flex items-center justify-between transition-colors focus:outline-none focus:ring-1 focus:ring-[#dc0000] disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                <div className="flex items-center gap-2 truncate min-w-0">
                    <Building2 size={15} className="text-zinc-400 shrink-0" />
                    <span className="truncate">
                        {value ? (
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                {value}
                            </span>
                        ) : (
                            <span className="text-zinc-400 dark:text-zinc-500">{placeholder}</span>
                        )}
                    </span>
                    {selectedSupplier?.isSystem && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-50 dark:bg-red-950/40 text-[#dc0000] border border-red-200 dark:border-red-900 shrink-0">
                            {t('setup.materials.registeredSupplier') || 'Sistema'}
                        </span>
                    )}
                    {selectedSupplier?.country && (
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 shrink-0">
                            {selectedSupplier.country}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                    {value && !required && !disabled && (
                        <span
                            onClick={handleClear}
                            title="Clear"
                            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
                        >
                            <X size={13} />
                        </span>
                    )}
                    <ChevronDown size={15} className={`text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#dc0000]' : ''}`} />
                </div>
            </button>

            {/* Dropdown Popover */}
            {isOpen && (
                <div
                    id={listboxId}
                    role="listbox"
                    className="absolute z-50 mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150"
                >
                    {/* Search Field */}
                    <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('setup.materials.searchSupplier') || 'Search supplier by name or country...'}
                                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000]"
                                onClick={(e) => e.stopPropagation()}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Results / Custom Option List */}
                    <div ref={listRef} className="max-h-60 overflow-y-auto p-1 text-xs">
                        {loading && (
                            <div className="py-4 px-3 text-center text-zinc-400 text-xs flex items-center justify-center gap-2">
                                <Loader2 size={14} className="animate-spin text-red-500" />
                                <span>Cargando proveedores...</span>
                            </div>
                        )}

                        {/* Option to use custom typed supplier name if not in list */}
                        {!hasExactMatch && searchQuery.trim().length > 0 && (
                            <div
                                onClick={() => handleSelect(searchQuery.trim())}
                                className="p-2 mb-1 rounded-lg bg-red-50/70 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 hover:bg-red-100/70 dark:hover:bg-red-900/40 text-[#dc0000] dark:text-red-300 font-semibold cursor-pointer flex items-center justify-between gap-2 transition-colors"
                            >
                                <div className="flex items-center gap-1.5 truncate">
                                    <Plus size={14} className="shrink-0" />
                                    <span className="truncate">
                                        {t('setup.materials.customSupplier') || 'Usar como proveedor:'} <span className="font-bold underline">"{searchQuery.trim()}"</span>
                                    </span>
                                </div>
                                <span className="text-[10px] uppercase font-bold shrink-0 opacity-80">Nuevo</span>
                            </div>
                        )}

                        {!loading && filteredSuppliers.length === 0 && hasExactMatch && (
                            <div className="py-6 px-3 text-center text-zinc-400 text-xs">
                                {t('setup.materials.noSuppliersFound') || 'No matching suppliers found.'}
                            </div>
                        )}

                        {!loading && filteredSuppliers.map((item, idx) => {
                            const isSelected = item.name.toLowerCase() === value.trim().toLowerCase();
                            return (
                                <div
                                    key={item.id}
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => handleSelect(item.name, item.country)}
                                    className={`px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                                        isSelected
                                            ? 'bg-red-50 dark:bg-red-950/40 text-[#dc0000] dark:text-red-200 font-bold'
                                            : idx === highlightedIndex
                                                ? 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100'
                                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="truncate font-semibold">{item.name}</span>
                                            {item.isSystem && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-50 dark:bg-red-950/50 text-[#dc0000] border border-red-200 dark:border-red-900 shrink-0">
                                                    {t('setup.materials.registeredSupplier') || 'Sistema'}
                                                </span>
                                            )}
                                            {item.country && (
                                                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 shrink-0">
                                                    {item.country}
                                                </span>
                                            )}
                                        </div>
                                        {item.contactEmail && (
                                            <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                                                {item.contactEmail}
                                            </div>
                                        )}
                                    </div>
                                    {isSelected && <Check size={14} className="text-[#dc0000] shrink-0" />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
