import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { COUNTRIES, CountryItem, filterCountries, getCountryDisplayName } from '../../lib/countryCatalog';

interface CountrySelectProps {
    value: string;
    onChange: (code: string) => void;
    id?: string;
    label?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    error?: string;
    className?: string;
    showCodeInDisplay?: boolean;
    helperText?: React.ReactNode;
}

export const CountrySelect: React.FC<CountrySelectProps> = ({
    value,
    onChange,
    id,
    label,
    placeholder = 'Select country...',
    required = false,
    disabled = false,
    error,
    className = '',
    showCodeInDisplay = true,
    helperText
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Selected country item
    const selectedCountry = useMemo(() => {
        if (!value) return null;
        const norm = value.trim().toUpperCase();
        return COUNTRIES.find(c => c.code === norm) || null;
    }, [value]);

    // Filtered options based on search query
    const filteredOptions = useMemo(() => {
        return filterCountries(searchQuery);
    }, [searchQuery]);

    // Handle outside click to close dropdown
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

    // Focus search input when dropdown opens
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen]);

    const handleSelect = (code: string) => {
        onChange(code);
        setIsOpen(false);
        setSearchQuery('');
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setSearchQuery('');
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            {label && (
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                    <span>
                        {label} {required && <span className="text-[#dc0000]">*</span>}
                    </span>
                    {helperText}
                </label>
            )}

            {/* Trigger Button */}
            <button
                type="button"
                id={id}
                disabled={disabled}
                onClick={() => !disabled && setIsOpen(prev => !prev)}
                className={`w-full text-left bg-white dark:bg-zinc-900 border ${
                    error 
                        ? 'border-red-500 ring-1 ring-red-500' 
                        : isOpen 
                            ? 'border-[#dc0000] ring-1 ring-[#dc0000]' 
                            : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600'
                } text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                <span className="truncate">
                    {selectedCountry ? (
                        showCodeInDisplay ? `${selectedCountry.name} (${selectedCountry.code})` : selectedCountry.name
                    ) : value ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Legacy / Unrecognized ({value})
                        </span>
                    ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">{placeholder}</span>
                    )}
                </span>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                    {value && !required && !disabled && (
                        <span
                            onClick={handleClear}
                            className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        >
                            <X size={14} />
                        </span>
                    )}
                    <ChevronDown size={16} className={`text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#dc0000]' : ''}`} />
                </div>
            </button>

            {/* Dropdown Popover */}
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
                    {/* Search Field */}
                    <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search country name or code..."
                                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000]"
                                onClick={(e) => e.stopPropagation()}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Results List */}
                    <div className="max-h-60 overflow-y-auto p-1 text-xs">
                        {filteredOptions.length === 0 ? (
                            <div className="py-6 px-3 text-center text-zinc-400 text-xs">
                                No countries matching "{searchQuery}"
                            </div>
                        ) : (
                            filteredOptions.map((c: CountryItem) => {
                                const isSelected = selectedCountry?.code === c.code;
                                return (
                                    <button
                                        key={c.code}
                                        type="button"
                                        onClick={() => handleSelect(c.code)}
                                        className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium flex items-center justify-between transition-colors ${
                                            isSelected
                                                ? 'bg-red-50 dark:bg-red-950/40 text-[#dc0000] font-bold'
                                                : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            <span className="truncate">{c.name}</span>
                                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                                isSelected 
                                                    ? 'bg-red-100 dark:bg-red-900/50 text-[#dc0000]' 
                                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                                            }`}>
                                                {c.code}
                                            </span>
                                        </div>
                                        {isSelected && <Check size={14} className="text-[#dc0000] shrink-0" />}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {error && (
                <span className="block text-[11px] text-red-500 mt-1 font-medium">{error}</span>
            )}
        </div>
    );
};
