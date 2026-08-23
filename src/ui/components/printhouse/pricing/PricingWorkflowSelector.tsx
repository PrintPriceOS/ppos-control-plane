/**
 * src/ui/components/printhouse/pricing/PricingWorkflowSelector.tsx
 *
 * Phase 193H — Choice-First Pricing Workflow Selector
 *
 * Presents two distinct configuration paths for production node pricing:
 * 1. Assistant-Guided Pricing (Guided calibration from a real completed job)
 * 2. Manual Rate Card Setup (Direct industrial cost rates configuration)
 *
 * Presentation-only component: no pricing state mutation, zero backend calls.
 */
import React from 'react';
import { Sparkles, Calculator, CheckCircle2 } from 'lucide-react';

export type PricingWorkflow = 'assistant' | 'manual';

interface PricingWorkflowSelectorProps {
    selectedWorkflow: PricingWorkflow;
    onSelectWorkflow: (workflow: PricingWorkflow) => void;
}

export const PricingWorkflowSelector: React.FC<PricingWorkflowSelectorProps> = ({
    selectedWorkflow,
    onSelectWorkflow
}) => {
    return (
        <div className="space-y-4">
            {/* Header / Intro */}
            <div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                    Choose Your Pricing Workflow
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Select how you want to configure pricing for this production node. You can switch later.
                </p>
            </div>

            {/* Side-by-side Choice Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Assistant-Guided Pricing Card */}
                <div
                    onClick={() => onSelectWorkflow('assistant')}
                    className={`relative flex flex-col justify-between p-5 rounded-2xl border transition-all cursor-pointer ${
                        selectedWorkflow === 'assistant'
                            ? 'bg-red-50/40 dark:bg-red-950/20 border-[#dc0000] ring-1 ring-[#dc0000]/50 shadow-xs'
                            : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-2xs'
                    }`}
                >
                    {/* Top row: Radio + Recommended badge */}
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full border flex items-center justify-center transition-colors"
                                style={{
                                    borderColor: selectedWorkflow === 'assistant' ? '#dc0000' : '#d4d4d8',
                                    backgroundColor: selectedWorkflow === 'assistant' ? '#dc0000' : 'transparent'
                                }}
                            >
                                {selectedWorkflow === 'assistant' && (
                                    <div className="w-2 h-2 rounded-full bg-white" />
                                )}
                            </div>
                            <div className="p-2 rounded-xl bg-red-100 dark:bg-red-950/60 text-[#dc0000] dark:text-red-400">
                                <Sparkles size={18} />
                            </div>
                        </div>

                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/80 text-[#dc0000] dark:text-red-300 border border-red-200 dark:border-red-800/60">
                            Recommended
                        </span>
                    </div>

                    {/* Content */}
                    <div className="mt-4 space-y-2">
                        <div>
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                                Assistant-Guided Pricing
                            </h3>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Best for calibrating from a real completed job
                            </p>
                        </div>

                        <ul className="space-y-1.5 pt-2 text-xs text-zinc-600 dark:text-zinc-300">
                            <li className="flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-[#dc0000] shrink-0" />
                                <span>Describe the job in natural language</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-[#dc0000] shrink-0" />
                                <span>Review extracted specifications</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-[#dc0000] shrink-0" />
                                <span>Run guided calibration</span>
                            </li>
                        </ul>
                    </div>

                    {/* Action Button */}
                    <div className="mt-5 pt-2">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectWorkflow('assistant');
                            }}
                            className={`w-full py-2 px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                                selectedWorkflow === 'assistant'
                                    ? 'bg-[#dc0000] text-white hover:bg-red-700 shadow-xs'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                        >
                            Use Assistant
                        </button>
                    </div>
                </div>

                {/* 2. Manual Rate Card Setup Card */}
                <div
                    onClick={() => onSelectWorkflow('manual')}
                    className={`relative flex flex-col justify-between p-5 rounded-2xl border transition-all cursor-pointer ${
                        selectedWorkflow === 'manual'
                            ? 'bg-red-50/40 dark:bg-red-950/20 border-[#dc0000] ring-1 ring-[#dc0000]/50 shadow-xs'
                            : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-2xs'
                    }`}
                >
                    {/* Top row: Radio */}
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full border flex items-center justify-center transition-colors"
                                style={{
                                    borderColor: selectedWorkflow === 'manual' ? '#dc0000' : '#d4d4d8',
                                    backgroundColor: selectedWorkflow === 'manual' ? '#dc0000' : 'transparent'
                                }}
                            >
                                {selectedWorkflow === 'manual' && (
                                    <div className="w-2 h-2 rounded-full bg-white" />
                                )}
                            </div>
                            <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                                <Calculator size={18} />
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="mt-4 space-y-2">
                        <div>
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                                Manual Rate Card Setup
                            </h3>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Best for entering exact industrial cost rates manually
                            </p>
                        </div>

                        <ul className="space-y-1.5 pt-2 text-xs text-zinc-600 dark:text-zinc-300">
                            <li className="flex items-center gap-2">
                                <CheckCircle2 size={14} className={selectedWorkflow === 'manual' ? "text-[#dc0000] shrink-0" : "text-zinc-400 shrink-0"} />
                                <span>Edit rate cards directly</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle2 size={14} className={selectedWorkflow === 'manual' ? "text-[#dc0000] shrink-0" : "text-zinc-400 shrink-0"} />
                                <span>Configure paper, binding and transport</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle2 size={14} className={selectedWorkflow === 'manual' ? "text-[#dc0000] shrink-0" : "text-zinc-400 shrink-0"} />
                                <span>Use for advanced or fallback setup</span>
                            </li>
                        </ul>
                    </div>

                    {/* Action Button */}
                    <div className="mt-5 pt-2">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectWorkflow('manual');
                            }}
                            className={`w-full py-2 px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                                selectedWorkflow === 'manual'
                                    ? 'bg-[#dc0000] text-white hover:bg-red-700 shadow-xs'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                        >
                            Use Manual Setup
                        </button>
                    </div>
                </div>
            </div>

            {/* Slim contextual row under cards */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs">
                <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                    {selectedWorkflow === 'assistant' ? (
                        <Sparkles size={14} className="text-[#dc0000]" />
                    ) : (
                        <Calculator size={14} className="text-zinc-500" />
                    )}
                    <span>
                        Workflow selected:{' '}
                        <strong className="text-zinc-900 dark:text-white font-semibold capitalize">
                            {selectedWorkflow === 'assistant' ? 'Assistant' : 'Manual Rate Card'}
                        </strong>
                    </span>
                </div>

                <button
                    type="button"
                    onClick={() => onSelectWorkflow(selectedWorkflow === 'assistant' ? 'manual' : 'assistant')}
                    className="text-xs font-semibold text-[#dc0000] hover:text-red-700 dark:hover:text-red-400 underline cursor-pointer bg-transparent border-0 p-0"
                >
                    Switch
                </button>
            </div>
        </div>
    );
};
