import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, AlertTriangle } from 'lucide-react';
import { COUNTRIES, CountryItem, filterCountries, getCountryDisplayName, getLocalizedCountryName } from '../../lib/countryCatalog';
import { useLocale } from '../../i18n';

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
    triggerClassName?: string;
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
    triggerClassName,
    showCodeInDisplay = true,
    helperText
}) => {
    const { locale, t } = useLocale();
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Selected country item from canonical catalog
    const selectedCountry = useMemo(() => {
        if (!value) return null;
        const norm = value.trim().toUpperCase();
        return COUNTRIES.find(c => c.code === norm) || null;
    }, [value]);

    // Localized display name for trigger button
    const triggerDisplay = useMemo(() => {
        if (selectedCountry) {
            const locName = getLocalizedCountryName(selectedCountry.code, locale);
            return showCodeInDisplay ? `${locName} (${selectedCountry.code})` : locName;
        }
        if (value) {
            return null; // Will render legacy badge
        }
        return null;
    }, [selectedCountry, value, locale, showCodeInDisplay]);

    // Filtered options based on search query and active locale
    const filteredOptions = useMemo(() => {
        return filterCountries(searchQuery, locale);
    }, [searchQuery, locale]);

    // Reset highlighted index when filtered options change
    useEffect(() => {
        setHighlightedIndex(0);
    }, [filteredOptions]);

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

    // Scroll active item into view
    useEffect(() => {
        if (isOpen && listRef.current) {
            const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex, isOpen]);

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
                    prev < filteredOptions.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredOptions[highlightedIndex]) {
                    handleSelect(filteredOptions[highlightedIndex].code);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                setSearchQuery('');
                break;
            default:
                break;
        }
    };

    const listboxId = id ? `${id}-listbox` : 'country-select-listbox';

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

            {/* Trigger Button */}
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
                } text-zinc-900 dark:text-zinc-100 ${triggerClassName || 'px-3.5 py-2.5 rounded-xl text-sm'} flex items-center justify-between transition-colors focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                <span className="truncate">
                    {triggerDisplay ? (
                        <span>{triggerDisplay}</span>
                    ) : value ? (
                        <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                            <AlertTriangle size={14} className="shrink-0" />
                            <span>Legacy / Unrecognized ({value})</span>
                        </span>
                    ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">{placeholder}</span>
                    )}
                </span>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                    {value && !required && !disabled && (
                        <span
                            onClick={handleClear}
                            title="Clear"
                            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
                        >
                            <X size={14} />
                        </span>
                    )}
                    <ChevronDown size={16} className={`text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#dc0000]' : ''}`} />
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
                                placeholder="Search country name or code..."
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

                    {/* Results List */}
                    <div ref={listRef} className="max-h-60 overflow-y-auto p-1 text-xs">
                        {filteredOptions.length === 0 ? (
                            <div className="py-6 px-3 text-center text-zinc-400 text-xs">
                                No countries matching "{searchQuery}"
                            </div>
                        ) : (
                            filteredOptions.map((c: CountryItem, idx: number) => {
                                const isSelected = selectedCountry?.code === c.code;
                                const isHighlighted = idx === highlightedIndex;
                                const localizedName = getLocalizedCountryName(c.code, locale);

                                return (
                                    <div
                                        key={c.code}
                                        role="option"
                                        aria-selected={isSelected}
                                        onClick={() => handleSelect(c.code)}
                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                        className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                                            isSelected
                                                ? 'bg-red-50 dark:bg-red-950/40 text-[#dc0000] font-bold'
                                                : isHighlighted
                                                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                                                    : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-850'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            <span className="truncate">{localizedName}</span>
                                            {localizedName !== c.name && (
                                                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
                                                    ({c.name})
                                                </span>
                                            )}
                                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                                isSelected 
                                                    ? 'bg-red-100 dark:bg-red-900/50 text-[#dc0000]' 
                                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                                            }`}>
                                                {c.code}
                                            </span>
                                        </div>
                                        {isSelected && <Check size={14} className="text-[#dc0000] shrink-0" />}
                                    </div>
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
