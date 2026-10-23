import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, Clock, AlertTriangle, Sparkles } from 'lucide-react';
import {
    TimezoneItem,
    filterTimezones,
    getTimezones,
    parseTimezoneItem,
    formatTimezoneOffset
} from '../../lib/timezoneCatalog';
import { getLocalizedCountryName } from '../../lib/countryCatalog';
import { useLocale } from '../../i18n';

interface TimezoneSelectProps {
    value: string;
    onChange: (timezoneId: string) => void;
    countryCode?: string;
    id?: string;
    label?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    error?: string;
    className?: string;
    helperText?: React.ReactNode;
}

export const TimezoneSelect: React.FC<TimezoneSelectProps> = ({
    value,
    onChange,
    countryCode,
    id,
    label,
    placeholder = 'Select timezone...',
    required = false,
    disabled = false,
    error,
    className = '',
    helperText
}) => {
    const { locale, t } = useLocale();
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Filter and group timezones based on query and suggested country
    const { suggested, other } = useMemo(() => {
        return filterTimezones(searchQuery, countryCode);
    }, [searchQuery, countryCode]);

    // Flattened items for keyboard navigation index
    const flatOptions = useMemo(() => {
        return [...suggested, ...other];
    }, [suggested, other]);

    // Selected timezone item
    const selectedItem = useMemo(() => {
        if (!value) return null;
        const norm = value.trim();
        const all = getTimezones();
        const found = all.find(t => t.id.toLowerCase() === norm.toLowerCase());
        if (found) return found;

        // If not in catalog, create a synthetic item to preserve the saved legacy value
        return parseTimezoneItem(norm);
    }, [value]);

    const isRecognized = useMemo(() => {
        if (!value) return true;
        const norm = value.trim();
        const all = getTimezones();
        return all.some(t => t.id.toLowerCase() === norm.toLowerCase());
    }, [value]);

    // Country localized name for suggestion header
    const countryName = useMemo(() => {
        if (!countryCode) return '';
        return getLocalizedCountryName(countryCode, locale);
    }, [countryCode, locale]);

    // Reset highlighted index when options change
    useEffect(() => {
        setHighlightedIndex(0);
    }, [flatOptions]);

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
            const activeEl = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`) as HTMLElement;
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleSelect = (tzId: string) => {
        onChange(tzId);
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
                    prev < flatOptions.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (flatOptions[highlightedIndex]) {
                    handleSelect(flatOptions[highlightedIndex].id);
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

    const listboxId = id ? `${id}-listbox` : 'timezone-select-listbox';

    return (
        <div className={`relative ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
            {label && (
                <label
                    htmlFor={id}
                    className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between"
                >
                    <span className="flex items-center gap-1.5">
                        <Clock size={13} className="text-zinc-400" />
                        <span>{label} {required && <span className="text-[#dc0000]">*</span>}</span>
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
                } text-zinc-900 dark:text-zinc-100 px-3.5 py-2.5 rounded-xl text-sm flex items-center justify-between transition-colors focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                <span className="truncate">
                    {selectedItem ? (
                        isRecognized ? (
                            <span className="flex items-center gap-2 truncate">
                                <span className="truncate font-medium">{selectedItem.id.replace(/_/g, ' ')}</span>
                                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0">
                                    {selectedItem.offset}
                                </span>
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                                <AlertTriangle size={14} className="shrink-0" />
                                <span>Legacy / Custom ({value})</span>
                            </span>
                        )
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
                                placeholder="Search timezone, city, offset (e.g. Madrid, GMT+1)..."
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
                    <div ref={listRef} className="max-h-64 overflow-y-auto p-1 text-xs">
                        {flatOptions.length === 0 ? (
                            <div className="py-6 px-3 text-center text-zinc-400 text-xs">
                                No timezones matching "{searchQuery}"
                            </div>
                        ) : (
                            <>
                                {/* Suggested Section (if country specified and matches exist) */}
                                {suggested.length > 0 && (
                                    <div className="mb-1.5">
                                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                                            <Sparkles size={11} className="text-[#dc0000]" />
                                            <span>
                                                {countryName ? `Suggested for ${countryName}` : 'Suggested Timezones'}
                                            </span>
                                        </div>
                                        {suggested.map((item, idx) => {
                                            const flatIdx = idx;
                                            const isSelected = selectedItem?.id.toLowerCase() === item.id.toLowerCase();
                                            const isHighlighted = flatIdx === highlightedIndex;

                                            return (
                                                <div
                                                    key={`sug-${item.id}`}
                                                    data-index={flatIdx}
                                                    role="option"
                                                    aria-selected={isSelected}
                                                    onClick={() => handleSelect(item.id)}
                                                    onMouseEnter={() => setHighlightedIndex(flatIdx)}
                                                    className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                                                        isSelected
                                                            ? 'bg-red-50 dark:bg-red-950/40 text-[#dc0000] font-bold'
                                                            : isHighlighted
                                                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                                                                : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-850'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 truncate">
                                                        <span className="truncate">{item.id.replace(/_/g, ' ')}</span>
                                                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                                            isSelected
                                                                ? 'bg-red-100 dark:bg-red-900/50 text-[#dc0000]'
                                                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                                                        }`}>
                                                            {item.offset}
                                                        </span>
                                                    </div>
                                                    {isSelected && <Check size={14} className="text-[#dc0000] shrink-0" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Other / All Timezones Section */}
                                {other.length > 0 && (
                                    <div>
                                        {suggested.length > 0 && (
                                            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1.5">
                                                All Timezones
                                            </div>
                                        )}
                                        {other.map((item, idx) => {
                                            const flatIdx = suggested.length + idx;
                                            const isSelected = selectedItem?.id.toLowerCase() === item.id.toLowerCase();
                                            const isHighlighted = flatIdx === highlightedIndex;

                                            return (
                                                <div
                                                    key={item.id}
                                                    data-index={flatIdx}
                                                    role="option"
                                                    aria-selected={isSelected}
                                                    onClick={() => handleSelect(item.id)}
                                                    onMouseEnter={() => setHighlightedIndex(flatIdx)}
                                                    className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                                                        isSelected
                                                            ? 'bg-red-50 dark:bg-red-950/40 text-[#dc0000] font-bold'
                                                            : isHighlighted
                                                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                                                                : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-850'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 truncate">
                                                        <span className="truncate">{item.id.replace(/_/g, ' ')}</span>
                                                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                                            isSelected
                                                                ? 'bg-red-100 dark:bg-red-900/50 text-[#dc0000]'
                                                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                                                        }`}>
                                                            {item.offset}
                                                        </span>
                                                    </div>
                                                    {isSelected && <Check size={14} className="text-[#dc0000] shrink-0" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
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
