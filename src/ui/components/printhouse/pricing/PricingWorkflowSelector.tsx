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
import { useLocale } from '../../../i18n';

export type PricingWorkflow = 'assistant' | 'manual';

interface PricingWorkflowSelectorProps {
    selectedWorkflow: PricingWorkflow;
    onSelectWorkflow: (workflow: PricingWorkflow) => void;
}

export const PricingWorkflowSelector: React.FC<PricingWorkflowSelectorProps> = ({
    selectedWorkflow,
    onSelectWorkflow
}) => {
    const { t } = useLocale();

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#dc0000] dark:text-red-400">
                        {t('pricing.workflow.pricingConfig') || 'Pricing Configuration'}
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-700">•</span>
                    <span className="text-xs font-semibold text-zinc-500">
                        {selectedWorkflow === 'assistant' 
                            ? (t('pricing.workflow.aiGuided') || 'AI-Guided Calibration') 
                            : (t('pricing.workflow.directIndustrial') || 'Direct Industrial Rate Cards')}
                    </span>
                </div>
                <h2 className="text-base font-extrabold text-zinc-900 dark:text-white mt-1 m-0">
                    {t('pricing.workflow.chooseWorkflow') || 'Choose Your Pricing Workflow'}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 m-0">
                    {selectedWorkflow === 'assistant'
                        ? (t('pricing.workflow.assistantDesc') || 'Describe a book or attach a PDF to solve and calibrate industrial rate cards.')
                        : (t('pricing.workflow.manualDesc') || 'Configure paper, binding, click and machine rates directly in standard industrial tables.')}
                </p>
            </div>

            {/* Prominent, 1-Click Persistent Mode Segment Switcher (Accessible Button Group) */}
            <div
                id="pricing-mode-toggle"
                className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shrink-0 self-start sm:self-auto"
                role="group"
                aria-label={t('pricing.workflow.group') || 'Pricing mode selector'}
            >
                <button
                    id="pricing-mode-assistant-btn"
                    type="button"
                    aria-label={t('pricing.mode.assistant') || 'AI assistant'}
                    title={t('pricing.workflow.assistantBtn') || 'AI pricing calibration assistant'}
                    aria-pressed={selectedWorkflow === 'assistant'}
                    onClick={() => onSelectWorkflow('assistant')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        selectedWorkflow === 'assistant'
                            ? 'bg-white dark:bg-zinc-900 text-[#dc0000] dark:text-red-400 shadow-sm border border-zinc-200/80 dark:border-zinc-700'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                >
                    <Sparkles size={14} className={selectedWorkflow === 'assistant' ? 'text-[#dc0000]' : 'text-zinc-400'} />
                    <span>{t('pricing.mode.assistant') || 'AI assistant'}</span>
                </button>

                <button
                    id="pricing-mode-manual-btn"
                    type="button"
                    aria-label={t('pricing.mode.manual') || 'Manual rate cards'}
                    title={t('pricing.workflow.manualBtn') || 'Manual rate cards setup'}
                    aria-pressed={selectedWorkflow === 'manual'}
                    onClick={() => onSelectWorkflow('manual')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        selectedWorkflow === 'manual'
                            ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm border border-zinc-200/80 dark:border-zinc-700'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                >
                    <Calculator size={14} className={selectedWorkflow === 'manual' ? 'text-zinc-900 dark:text-white' : 'text-zinc-400'} />
                    <span>{t('pricing.mode.manual') || 'Manual rate cards'}</span>
                </button>
            </div>
        </div>
    );
};
