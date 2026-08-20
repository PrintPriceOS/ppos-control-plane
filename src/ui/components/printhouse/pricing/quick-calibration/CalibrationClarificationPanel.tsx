/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationClarificationPanel.tsx
 *
 * Phase 193F — Clarification & Ambiguity Questions UX
 */
import React from 'react';
import { HelpCircle, ChevronRight } from 'lucide-react';

interface Question {
    field: string;
    question: string;
    options?: string[];
}

interface CalibrationClarificationPanelProps {
    questions: Question[];
    onAnswer: (field: string, answer: any) => void;
}

export const CalibrationClarificationPanel: React.FC<CalibrationClarificationPanelProps> = ({
    questions,
    onAnswer
}) => {
    if (!questions || questions.length === 0) return null;

    return (
        <div className="p-4 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                <HelpCircle size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Clarification Required Before Calculation:</span>
            </div>

            <div className="space-y-2.5">
                {questions.map((q, idx) => (
                    <div key={idx} className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-amber-200/70 dark:border-amber-800/40 text-xs">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                            {q.question}
                        </div>
                        {q.options && q.options.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {q.options.map((opt, oIdx) => (
                                    <button
                                        key={oIdx}
                                        type="button"
                                        onClick={() => onAnswer(q.field, opt)}
                                        className="px-2.5 py-1 bg-amber-100/70 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-800/50 text-amber-900 dark:text-amber-200 font-medium rounded text-[11px] transition-colors flex items-center gap-1"
                                    >
                                        <span>{opt}</span>
                                        <ChevronRight size={12} className="opacity-60" />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-[11px] text-zinc-500">
                                Please specify this in the chat or structured summary.
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
