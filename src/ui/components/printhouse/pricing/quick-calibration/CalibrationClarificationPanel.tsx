/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationClarificationPanel.tsx
 *
 * Phase 193H.3 — Clarification Choice Controlled Interaction UX
 */
import React, { useState } from 'react';
import { HelpCircle, Check, ArrowRight } from 'lucide-react';

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

    const handleOptionSelect = (field: string, opt: string) => {
        setSelectedAnswers(prev => ({
            ...prev,
            [field]: opt
        }));
    };

    const handleTextInputChange = (field: string, val: string) => {
        setTextInputs(prev => ({ ...prev, [field]: val }));
        setSelectedAnswers(prev => ({ ...prev, [field]: val }));
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
                    return (
                        <div key={idx} className="p-3.5 bg-white dark:bg-zinc-900 rounded-xl border border-amber-200/80 dark:border-amber-800/50 text-xs space-y-2.5">
                            <div className="font-bold text-zinc-900 dark:text-zinc-100">
                                {q.question}
                            </div>
                            {q.options && q.options.length > 0 ? (
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
