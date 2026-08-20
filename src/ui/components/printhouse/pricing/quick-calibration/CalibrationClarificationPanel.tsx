/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationClarificationPanel.tsx
 *
 * Phase 193H.3 — Clarification Choice Controlled Interaction UX
 */
import React, { useState } from 'react';
import { HelpCircle, Check, ArrowRight, Search } from 'lucide-react';
import { getCountryName, getCountryDisplayName, filterCountries } from '../../../../lib/countryCatalog';

interface Question {
    field: string;
    question: string;
    options?: string[];
}

interface CalibrationClarificationPanelProps {
    questions: Question[];
    onApplyAnswers: (answers: Record<string, string>) => void;
}

export const CalibrationClarificationPanel: React.FC<CalibrationClarificationPanelProps> = ({
    questions,
    onApplyAnswers
}) => {
    // ── Controlled selection state: { [field]: selectedOptionOrText } ──
    const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
    const [textInputs, setTextInputs] = useState<Record<string, string>>({});

    if (!questions || questions.length === 0) return null;

    // Keyboard highlighted candidate index per field
    const [highlightedIndices, setHighlightedIndices] = useState<Record<string, number>>({});

    const handleOptionSelect = (field: string, opt: string) => {
        setSelectedAnswers(prev => ({
            ...prev,
            [field]: opt
        }));
    };

    const handleTextInputChange = (field: string, val: string) => {
        setTextInputs(prev => ({ ...prev, [field]: val }));
        setSelectedAnswers(prev => ({ ...prev, [field]: val }));
        setHighlightedIndices(prev => ({ ...prev, [field]: 0 }));
    };

    const handleCountryKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement>,
        field: string,
        filteredList: Array<{ code: string; name: string }>
    ) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (filteredList.length > 0) {
                const currentIndex = highlightedIndices[field] ?? 0;
                const safeIndex = (currentIndex >= 0 && currentIndex < filteredList.length) ? currentIndex : 0;
                const chosen = filteredList[safeIndex];
                if (chosen) {
                    handleOptionSelect(field, chosen.code);
                    setTextInputs(prev => ({ ...prev, [field]: '' }));
                }
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            if (filteredList.length > 0) {
                setHighlightedIndices(prev => {
                    const curr = prev[field] ?? 0;
                    return { ...prev, [field]: (curr + 1) % filteredList.length };
                });
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            if (filteredList.length > 0) {
                setHighlightedIndices(prev => {
                    const curr = prev[field] ?? 0;
                    return { ...prev, [field]: curr <= 0 ? filteredList.length - 1 : curr - 1 };
                });
            }
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setTextInputs(prev => ({ ...prev, [field]: '' }));
            return;
        }
    };

    const hasAnyAnswers = Object.keys(selectedAnswers).some(k => Boolean(selectedAnswers[k]?.trim()));

    const handleContinue = (e: React.FormEvent) => {
        e.preventDefault();
        if (!hasAnyAnswers) return;
        onApplyAnswers(selectedAnswers);
    };

    return (
        <div className="p-4 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-2xl space-y-4 animate-in fade-in duration-200 shadow-xs">
            <div>
                <div className="flex items-center gap-2 text-xs font-bold text-amber-950 dark:text-amber-100">
                    <HelpCircle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>We just need a few more details</span>
                </div>
                <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1">
                    Choose an option where available, or type the missing information below.
                </p>
            </div>

            <form onSubmit={handleContinue} className="space-y-3">
                {questions.map((q, idx) => {
                    const currentSelected = selectedAnswers[q.field];
                    const isDestinationField = q.field === 'delivery_country' || q.field === 'destination' || q.field === 'transport_destination' || q.question.toLowerCase().includes('destination') || q.question.toLowerCase().includes('country');
                    return (
                        <div key={idx} className="p-3.5 bg-white dark:bg-zinc-900 rounded-xl border border-amber-200/80 dark:border-amber-800/50 text-xs space-y-2.5">
                            <div className="font-bold text-zinc-900 dark:text-zinc-100">
                                {q.question}
                            </div>
                            {/* Special UX for destination / delivery country questions */}
                            {isDestinationField ? (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-1.5">
                                        <button
                                            type="button"
                                            aria-pressed={currentSelected === 'Transport not included'}
                                            onClick={() => handleOptionSelect(q.field, 'Transport not included')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border shadow-2xs ${
                                                currentSelected === 'Transport not included'
                                                    ? 'bg-amber-600 text-white border-amber-700 dark:bg-amber-600 dark:border-amber-500 font-bold'
                                                    : 'bg-zinc-50 hover:bg-amber-100/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'
                                            }`}
                                        >
                                            {currentSelected === 'Transport not included' && <Check size={13} className="stroke-[3]" />}
                                            <span>Transport not included</span>
                                        </button>

                                        {['ES', 'DE', 'FR', 'IT', 'PT', 'GB', 'TR'].map(code => {
                                            const isSelected = currentSelected === code || currentSelected === getCountryName(code);
                                            return (
                                                <button
                                                    key={code}
                                                    type="button"
                                                    aria-pressed={isSelected}
                                                    onClick={() => handleOptionSelect(q.field, code)}
                                                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 border shadow-2xs ${
                                                        isSelected
                                                            ? 'bg-amber-600 text-white border-amber-700 dark:bg-amber-600 dark:border-amber-500 font-bold'
                                                            : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100'
                                                    }`}
                                                >
                                                    {isSelected && <Check size={11} className="stroke-[3]" />}
                                                    <span>{getCountryName(code)} ({code})</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Selected State vs Search State Machine */}
                                    {(() => {
                                        const isCountrySelected = Boolean(currentSelected && currentSelected !== 'Transport not included');
                                        const selectedIso = isCountrySelected ? (currentSelected.length === 2 ? currentSelected.toUpperCase() : currentSelected) : null;
                                        const selectedName = selectedIso ? getCountryDisplayName(selectedIso) : currentSelected;
                                        const query = textInputs[q.field] || '';
                                        const filteredCandidates = query.trim().length > 0 ? filterCountries(query).slice(0, 12) : [];
                                        const highlightedIdx = highlightedIndices[q.field] ?? 0;

                                        if (isCountrySelected) {
                                            return (
                                                <div className="p-3 bg-amber-100/60 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/80 rounded-xl flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                                                            ✓
                                                        </div>
                                                        <div>
                                                            <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300 block">
                                                                Selected Destination
                                                            </span>
                                                            <strong className="text-xs text-amber-950 dark:text-amber-100 font-bold">
                                                                {selectedName} {selectedIso && selectedIso.length === 2 ? `(${selectedIso})` : ''}
                                                            </strong>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            handleOptionSelect(q.field, '');
                                                            setTextInputs(prev => ({ ...prev, [q.field]: '' }));
                                                        }}
                                                        className="px-2.5 py-1 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:text-amber-950 bg-white/80 dark:bg-zinc-800 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-white transition-colors"
                                                    >
                                                        Change
                                                    </button>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="space-y-2">
                                                <div className="relative">
                                                    <Search size={13} className="absolute left-3 top-2.5 text-zinc-400 pointer-events-none" />
                                                    <input
                                                        type="text"
                                                        placeholder="Or search another destination country (e.g. Poland, Réunion, Switzerland)..."
                                                        value={query}
                                                        onChange={(e) => handleTextInputChange(q.field, e.target.value)}
                                                        onKeyDown={(e) => handleCountryKeyDown(e, q.field, filteredCandidates)}
                                                        className="w-full text-xs pl-8 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                                    />
                                                </div>

                                                {/* Dynamic filtered country list when search query is active */}
                                                {query.trim().length > 0 && (
                                                    <div className="flex flex-wrap gap-1 p-2 bg-zinc-100/70 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-lg max-h-32 overflow-y-auto">
                                                        {filteredCandidates.map((c, cIdx) => {
                                                            const isHighlighted = highlightedIdx === cIdx;
                                                            return (
                                                                <button
                                                                    key={c.code}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        handleOptionSelect(q.field, c.code);
                                                                        setTextInputs(prev => ({ ...prev, [q.field]: '' }));
                                                                    }}
                                                                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 border ${
                                                                        isHighlighted
                                                                            ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-950 dark:text-amber-100 border-amber-400 dark:border-amber-600 font-semibold ring-1 ring-amber-400'
                                                                            : 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50'
                                                                    }`}
                                                                >
                                                                    <span>{c.name} ({c.code})</span>
                                                                </button>
                                                            );
                                                        })}
                                                        {filteredCandidates.length === 0 && (
                                                            <span className="text-[11px] text-zinc-400 py-1 px-2">No matching country found</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : q.options && q.options.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {q.options.map((opt, oIdx) => {
                                        const isSelected = currentSelected === opt;
                                        return (
                                            <button
                                                key={oIdx}
                                                type="button"
                                                aria-pressed={isSelected}
                                                onClick={() => handleOptionSelect(q.field, opt)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border shadow-2xs ${
                                                    isSelected
                                                        ? 'bg-amber-600 text-white border-amber-700 dark:bg-amber-600 dark:border-amber-500 font-bold'
                                                        : 'bg-zinc-50 hover:bg-amber-100/60 dark:bg-zinc-800 dark:hover:bg-zinc-700/60 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'
                                                }`}
                                            >
                                                {isSelected && <Check size={13} className="stroke-[3]" />}
                                                <span>{opt}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div>
                                    <input
                                        type="text"
                                        placeholder="Enter details here..."
                                        value={textInputs[q.field] || ''}
                                        onChange={(e) => handleTextInputChange(q.field, e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }
                                        }}
                                        className="w-full text-xs px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}

                <div className="pt-1 flex justify-end">
                    <button
                        type="submit"
                        disabled={!hasAnyAnswers}
                        className="px-4 py-2 bg-[#dc0000] hover:bg-[#b00000] disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                        <span>Continue with these answers</span>
                        <ArrowRight size={14} />
                    </button>
                </div>
            </form>
        </div>
    );
};
