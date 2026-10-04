/**
 * src/ui/components/printhouse/setup/SetupHelpModal.tsx
 * 
 * Contextual Help & Setting Search Modal.
 * Searches across modules, fields, concepts and print terminology.
 * Keyboard accessible: Escape closes, Enter selects result.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Search, X, BookOpen, ArrowRight, ExternalLink, HelpCircle, Tag, Factory, Cog, Layers } from 'lucide-react';
import { useLocale } from '../../../i18n';

export interface HelpSearchResult {
    id: string;
    title: string;
    category: 'module' | 'setting' | 'concept' | 'term';
    description: string;
    targetTab: string;
    targetFieldId?: string;
    keywords: string[];
}

const HELP_DATABASE: HelpSearchResult[] = [
    {
        id: 'pricing-assistant',
        title: 'AI Pricing Calibration Assistant',
        category: 'module',
        description: 'Inverse pricing solver that extracts book specifications from quotes or descriptions and calibrates production rates.',
        targetTab: 'PRICING',
        targetFieldId: 'pricing-workflow-assistant',
        keywords: ['pricing', 'calibration', 'ai', 'assistant', 'hawkeye', 'rates', 'quote', 'fahrmann', 'solver']
    },
    {
        id: 'pricing-manual',
        title: 'Manual Rate Card Configuration',
        category: 'setting',
        description: 'Directly configure industrial rates including setup fees, sheet costs, click rates, and binding operation prices.',
        targetTab: 'PRICING',
        targetFieldId: 'pricing-workflow-manual',
        keywords: ['manual', 'rate card', 'rates', 'cost', 'click', 'setup fee', 'sheet cost', 'industrial']
    },
    {
        id: 'manufacturing-price',
        title: 'Manufacturing Price vs Quoted Total',
        category: 'concept',
        description: 'Manufacturing price covers press setup, printing, paper and binding. Quoted total includes freight/transport and taxes, which are kept separate.',
        targetTab: 'PRICING',
        targetFieldId: 'pricing-workflow-assistant',
        keywords: ['manufacturing price', 'total', 'transport', 'tax', 'separation', 'commercial', 'freight']
    },
    {
        id: 'supported-specs',
        title: 'Supported vs Unsupported Specifications',
        category: 'concept',
        description: 'Features not directly modelled in standard rate formulas (e.g. spot UV or complex packaging) generate explicit advisories and prevent automatic acceptance.',
        targetTab: 'PRICING',
        targetFieldId: 'pricing-workflow-assistant',
        keywords: ['spot uv', 'unsupported', 'partial calculation', 'varnish', 'blocking', 'relief varnish']
    },
    {
        id: 'company-profile',
        title: 'Company Profile & Legal Details',
        category: 'module',
        description: 'Legal registered name, tax ID (CIF/NIF/VAT), legal address, and billing contacts for contract compliance.',
        targetTab: 'COMPANY',
        targetFieldId: 'company-name',
        keywords: ['company', 'cif', 'nif', 'vat', 'legal', 'tax', 'address', 'profile', 'billing']
    },
    {
        id: 'production-sites',
        title: 'Production Sites & Plants',
        category: 'module',
        description: 'Physical printing plants, operating addresses, city locations, and timezone for job routing.',
        targetTab: 'SITES',
        targetFieldId: 'site-name',
        keywords: ['sites', 'plant', 'factory', 'facility', 'address', 'timezone', 'location']
    },
    {
        id: 'machinery-fleet',
        title: 'Machinery Fleet & Presses',
        category: 'module',
        description: 'Offset and digital presses, folding machines, cutters, binders, and finishing lines.',
        targetTab: 'MACHINES',
        targetFieldId: 'machine-fleet',
        keywords: ['press', 'machine', 'fleet', 'heidelberg', 'komori', 'hp indigo', 'offset', 'digital', 'cutter', 'folder']
    },
    {
        id: 'materials-substrates',
        title: 'Materials & Paper Grammages',
        category: 'module',
        description: 'Substrate catalog, paper types (Offset, Coated MC, Munken, Lux), grammages (80-400 gsm), and sheet sizes.',
        targetTab: 'MATERIALS',
        targetFieldId: 'materials-list',
        keywords: ['paper', 'substrate', 'munken', 'coated', 'offset', 'gsm', 'grammage', 'sheet', 'mc']
    },
    {
        id: 'production-capacity',
        title: 'Production Capacity & Shifts',
        category: 'module',
        description: 'Weekly operating shifts, daily sheet throughput capacity, and maintenance schedules.',
        targetTab: 'CAPACITY',
        targetFieldId: 'capacity-shifts',
        keywords: ['capacity', 'shifts', 'hours', 'throughput', 'working calendar', 'schedule']
    },
    {
        id: 'lead-times',
        title: 'Lead Times & Cut-Offs',
        category: 'module',
        description: 'Daily file cut-off times, standard turnaround SLAs, and express production windows.',
        targetTab: 'LEAD_TIMES',
        targetFieldId: 'lead-times',
        keywords: ['lead times', 'cut-off', 'turnaround', 'sla', 'days', 'delivery time']
    },
    {
        id: 'shipping-logistics',
        title: 'Shipping & Freight Rates',
        category: 'module',
        description: 'Zone shipping rates, transport pricing per kg or pallet, and carrier integrations.',
        targetTab: 'SHIPPING',
        targetFieldId: 'shipping-rates',
        keywords: ['shipping', 'transport', 'freight', 'carrier', 'delivery', 'dhl', 'pallet', 'kg']
    }
];

interface SetupHelpModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectTarget: (tab: string, fieldId?: string) => void;
}

export const SetupHelpModal: React.FC<SetupHelpModalProps> = ({
    isOpen,
    onClose,
    onSelectTarget
}) => {
    const { t } = useLocale();
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            previousFocusRef.current = document.activeElement as HTMLElement;
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);

            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    onClose();
                }
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
                previousFocusRef.current?.focus?.();
            };
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const filteredResults = HELP_DATABASE.filter(item => {
        if (!query.trim()) return true;
        const q = query.toLowerCase().trim();
        return (
            item.title.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.keywords.some(k => k.toLowerCase().includes(q))
        );
    });

    const handleKeyDownInInput = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % (filteredResults.length || 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + filteredResults.length) % (filteredResults.length || 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredResults[selectedIndex]) {
                const item = filteredResults[selectedIndex];
                onSelectTarget(item.targetTab, item.targetFieldId);
                onClose();
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-start justify-center pt-20 p-4" role="dialog" aria-modal="true" aria-labelledby="help-search-title">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal Box */}
            <div className="relative w-full max-w-2xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150">
                {/* Search Bar Header */}
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3 bg-zinc-50/70 dark:bg-zinc-900/60">
                    <Search size={18} className="text-[#dc0000] shrink-0" />
                    <input
                        ref={inputRef}
                        id="setup-help-search-input"
                        type="text"
                        value={query}
                        onChange={e => {
                            setQuery(e.target.value);
                            setSelectedIndex(0);
                        }}
                        onKeyDown={handleKeyDownInInput}
                        placeholder={t('onboarding.help.searchPlaceholder') || 'Search settings, modules, terms (e.g. Munken, CMYK, VAT, transport)...'}
                        className="flex-1 bg-transparent border-none text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
                        aria-label={t('setup.help.searchLabel') || 'Search settings and help documentation'}
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            aria-label={t('setup.help.clearQuery') || 'Clear query'}
                            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                        >
                            <X size={16} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('setup.help.closeBtn') || 'Close help modal'}
                        title={t('setup.help.closeBtn') || 'Close help modal'}
                        className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-md"
                    >
                        Esc
                    </button>
                </div>

                {/* Results List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                    {filteredResults.length === 0 ? (
                        <div className="py-12 text-center text-zinc-500">
                            <HelpCircle size={32} className="mx-auto mb-2 text-zinc-400 stroke-1" />
                            <p className="text-sm font-semibold">{t('onboarding.help.noResults') || 'No matching settings or help topics found.'}</p>
                            <p className="text-xs text-zinc-400 mt-1">Try searching for keywords like "rates", "Munken", "press", "address", or "transport".</p>
                        </div>
                    ) : (
                        filteredResults.map((item, index) => {
                            const isSelected = index === selectedIndex;
                            return (
                                <div
                                    key={item.id}
                                    onClick={() => {
                                        onSelectTarget(item.targetTab, item.targetFieldId);
                                        onClose();
                                    }}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={`p-3.5 rounded-xl cursor-pointer transition-colors flex items-start justify-between gap-3 ${
                                        isSelected 
                                            ? 'bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50' 
                                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/60 border border-transparent'
                                    }`}
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                                {item.title}
                                            </span>
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                                item.category === 'module' 
                                                    ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                                    : item.category === 'setting'
                                                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                                            }`}>
                                                {item.category.toUpperCase()}
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed m-0">
                                            {item.description}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 text-zinc-400 text-xs font-semibold self-center">
                                        <span className="hidden sm:inline text-[11px] text-[#dc0000]">Go to {item.targetTab}</span>
                                        <ArrowRight size={14} className={isSelected ? 'text-[#dc0000] translate-x-0.5 transition-transform' : ''} />
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Tip */}
                <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 text-[11px] text-zinc-400 flex items-center justify-between">
                    <span>{t('onboarding.help.tip') || 'Press Esc to close, ↑↓ to navigate, Enter to select.'}</span>
                    <span className="font-semibold text-zinc-500">PrintPrice OS Setup Hub</span>
                </div>
            </div>
        </div>
    );
};
