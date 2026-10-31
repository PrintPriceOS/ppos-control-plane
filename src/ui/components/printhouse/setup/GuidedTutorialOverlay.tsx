/**
 * src/ui/components/printhouse/setup/GuidedTutorialOverlay.tsx
 * 
 * Interactive Guided Tutorial with Dimmed Backdrop and Spotlight around active target.
 * Optional, dismissible, resumable, restartable.
 * Supports Next, Back, Exit and "Do this now" actions.
 */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, ArrowRight, ArrowLeft, X, Check, Target, Compass } from 'lucide-react';
import { useLocale } from '../../../i18n';

export interface TutorialStep {
    id: string;
    title: string;
    description: string;
    targetSelector: string;
    requiredTab: string;
    actionLabel?: string;
    onAction?: () => void;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'step-nav',
        title: 'Printhouse Setup Sections Switcher',
        description: 'Easily navigate between all 8 setup modules (Company Profile, Fleet, Materials, Pricing, and more) or review your overall setup status from this top toolbar control.',
        targetSelector: '#setup-module-switcher',
        requiredTab: 'PRICING',
        actionLabel: 'Sections Menu'
    },
    {
        id: 'step-pricing-assistant',
        title: 'AI Pricing Calibration Assistant',
        description: 'Our primary pricing experience. Simply describe a previously produced book or upload a quote PDF, and Hawkeye will solve and calibrate your production rate cards.',
        targetSelector: '#pricing-workflow-assistant',
        requiredTab: 'PRICING',
        actionLabel: 'Open Pricing Assistant'
    },
    {
        id: 'step-pricing-manual',
        title: 'Instant Manual Mode Toggle',
        description: 'Prefer traditional spreadsheet rate cards? Switch to Manual anytime with one click. Your draft changes, attached quotes, and calculations remain intact.',
        targetSelector: '#pricing-mode-toggle',
        requiredTab: 'PRICING',
        actionLabel: 'Inspect Mode Toggle'
    },
    {
        id: 'step-help-search',
        title: 'Find Settings & Get Help',
        description: 'Search for any printing term, substrate name, or configuration setting quickly without guessing where it lives.',
        targetSelector: '#setup-help-search-btn',
        requiredTab: 'PRICING',
        actionLabel: 'Open Help Search'
    }
];

interface GuidedTutorialOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    activeTab: string;
    onNavigateToTab: (tab: string) => void;
    onOpenSectionsMenu?: () => void;
    onActivateAssistant?: () => void;
    onSwitchToManual?: () => void;
    onOpenHelpSearch?: () => void;
}

export const GuidedTutorialOverlay: React.FC<GuidedTutorialOverlayProps> = ({
    isOpen,
    onClose,
    activeTab,
    onNavigateToTab,
    onOpenSectionsMenu,
    onActivateAssistant,
    onSwitchToManual,
    onOpenHelpSearch
}) => {
    const { t } = useLocale();
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

    const [cardDimensions, setCardDimensions] = useState<{ width: number; height: number }>({ width: 390, height: 260 });
    const cardRef = useRef<HTMLDivElement>(null);

    // Reset to first step whenever the tutorial is opened
    useEffect(() => {
        if (isOpen) {
            setCurrentStepIndex(0);
        }
    }, [isOpen]);

    const step = TUTORIAL_STEPS[currentStepIndex];

    const updateSpotlight = () => {
        if (!isOpen || !step) return;

        // Ensure correct tab is active
        if (step.requiredTab && step.requiredTab !== activeTab) {
            onNavigateToTab(step.requiredTab);
        }

        const measure = () => {
            const el = document.querySelector(step.targetSelector);
            if (el) {
                const rect = el.getBoundingClientRect();
                // Ensure target is actually visible with non-zero dimensions
                if (rect.width > 0 && rect.height > 0) {
                    setTargetRect(rect);
                    if (rect.top < 0 || rect.bottom > window.innerHeight) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                } else {
                    setTargetRect(null);
                }
            } else {
                // Honest fallback: if target is missing or hidden, do not draw a misleading spotlight
                setTargetRect(null);
            }

            // Measure actual card dimensions if mounted
            if (cardRef.current) {
                const cRect = cardRef.current.getBoundingClientRect();
                if (cRect.width > 0 && cRect.height > 0) {
                    setCardDimensions({ width: cRect.width, height: cRect.height });
                }
            }
        };

        // Measure immediately and after animation/layout frames settle
        measure();
        requestAnimationFrame(() => {
            setTimeout(measure, 100);
            setTimeout(measure, 300);
        });
    };

    useEffect(() => {
        if (isOpen) {
            updateSpotlight();
            const onScrollOrResize = () => {
                requestAnimationFrame(() => {
                    const el = document.querySelector(step?.targetSelector || '');
                    if (el) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            setTargetRect(rect);
                        } else {
                            setTargetRect(null);
                        }
                    }
                    if (cardRef.current) {
                        const cRect = cardRef.current.getBoundingClientRect();
                        if (cRect.width > 0 && cRect.height > 0) {
                            setCardDimensions({ width: cRect.width, height: cRect.height });
                        }
                    }
                });
            };

            window.addEventListener('resize', onScrollOrResize);
            window.addEventListener('scroll', onScrollOrResize, true);
            window.addEventListener('click', updateSpotlight, true);

            // Also observe DOM additions/removals to catch popup opens immediately
            let observer: MutationObserver | null = null;
            if (typeof MutationObserver !== 'undefined' && document.body) {
                observer = new MutationObserver(() => {
                    updateSpotlight();
                });
                observer.observe(document.body, { childList: true, subtree: true });
            }

            return () => {
                window.removeEventListener('resize', onScrollOrResize);
                window.removeEventListener('scroll', onScrollOrResize, true);
                window.removeEventListener('click', updateSpotlight, true);
                if (observer) {
                    observer.disconnect();
                }
            };
        }
    }, [isOpen, currentStepIndex, activeTab, step?.targetSelector]);

    // Measure card dimensions whenever step changes
    useEffect(() => {
        if (isOpen && cardRef.current) {
            const cRect = cardRef.current.getBoundingClientRect();
            if (cRect.width > 0 && cRect.height > 0) {
                setCardDimensions({ width: cRect.width, height: cRect.height });
            }
        }
    }, [isOpen, currentStepIndex]);

    if (!isOpen || !step) return null;

    const handleNext = () => {
        if (currentStepIndex < TUTORIAL_STEPS.length - 1) {
            setCurrentStepIndex(prev => prev + 1);
        } else {
            onClose();
        }
    };

    const handleBack = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(prev => prev - 1);
        }
    };

    const handleDoThisNow = () => {
        if (step.requiredTab && step.requiredTab !== activeTab) {
            onNavigateToTab(step.requiredTab);
        }

        // Perform advertised operation per step ID
        switch (step.id) {
            case 'step-nav':
                if (onOpenSectionsMenu) {
                    onOpenSectionsMenu();
                } else {
                    const btn = document.querySelector<HTMLElement>('#setup-module-switcher');
                    btn?.click();
                }
                break;
            case 'step-pricing-assistant':
                if (onActivateAssistant) {
                    onActivateAssistant();
                } else {
                    const btn = document.querySelector<HTMLElement>('#pricing-mode-assistant-btn');
                    btn?.click();
                }
                break;
            case 'step-pricing-manual':
                if (onSwitchToManual) {
                    onSwitchToManual();
                } else {
                    const btn = document.querySelector<HTMLElement>('#pricing-mode-manual-btn');
                    btn?.click();
                }
                break;
            case 'step-help-search':
                if (onOpenHelpSearch) {
                    onOpenHelpSearch();
                } else {
                    const btn = document.querySelector<HTMLElement>('#setup-help-search-btn');
                    btn?.click();
                }
                break;
            default:
                if (step.onAction) {
                    step.onAction();
                }
                break;
        }

        updateSpotlight();
    };

    // Calculate tooltip position relative to spotlight target with strict clamping using actual card dimensions
    let tooltipStyle: React.CSSProperties = {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 60
    };

    if (targetRect) {
        const margin = 16;
        // Bounded card width: at most 390px, but fits within viewport margins on smaller screens
        const cardWidth = Math.min(390, window.innerWidth - (margin * 2));
        const actualHeight = cardDimensions.height || 260;

        // Check if collision surfaces are currently open:
        // 1. Sections Menu dropdown (#setup-sections-menu)
        // 2. Help Search modal ([aria-labelledby="help-search-title"])
        const sectionsMenuEl = typeof document !== 'undefined' ? document.getElementById('setup-sections-menu') : null;
        const helpModalEl = typeof document !== 'undefined' ? document.querySelector('[aria-labelledby="help-search-title"]') : null;

        if (helpModalEl) {
            // When Help Search modal is open, dock tutorial card at bottom-left corner
            // completely clear of the centered modal dialog (max-w-2xl) and search results.
            const top = Math.max(margin, window.innerHeight - actualHeight - margin);
            const left = margin;
            tooltipStyle = {
                position: 'fixed',
                top: `${Math.round(top)}px`,
                left: `${Math.round(left)}px`,
                width: `${Math.round(cardWidth)}px`,
                maxWidth: `${Math.round(cardWidth)}px`,
                transform: 'none',
                zIndex: 60
            };
        } else if (sectionsMenuEl) {
            // When Sections Menu is open, place tutorial card either to the left of the menu
            // or docked at the bottom-right so that all menu items can be clicked and reached by keyboard.
            const menuRect = sectionsMenuEl.getBoundingClientRect();
            // Attempt placing to the left of the switcher/dropdown
            const leftOfMenu = menuRect.left - cardWidth - margin;
            if (leftOfMenu >= margin) {
                // Room on left
                let top = Math.max(margin, Math.min(menuRect.top, window.innerHeight - actualHeight - margin));
                tooltipStyle = {
                    position: 'fixed',
                    top: `${Math.round(top)}px`,
                    left: `${Math.round(leftOfMenu)}px`,
                    width: `${Math.round(cardWidth)}px`,
                    maxWidth: `${Math.round(cardWidth)}px`,
                    transform: 'none',
                    zIndex: 60
                };
            } else {
                // Dock to bottom-right
                const top = Math.max(margin, window.innerHeight - actualHeight - margin);
                const left = Math.max(margin, window.innerWidth - cardWidth - margin);
                tooltipStyle = {
                    position: 'fixed',
                    top: `${Math.round(top)}px`,
                    left: `${Math.round(left)}px`,
                    width: `${Math.round(cardWidth)}px`,
                    maxWidth: `${Math.round(cardWidth)}px`,
                    transform: 'none',
                    zIndex: 60
                };
            }
        } else {
            // Place below if room; otherwise place above target
            const spaceBelow = window.innerHeight - targetRect.bottom;
            const placeBelow = spaceBelow >= (actualHeight + margin);
            let top = placeBelow ? targetRect.bottom + 12 : Math.max(margin, targetRect.top - actualHeight - 12);
            
            // Clamp vertically strictly within viewport
            top = Math.max(margin, Math.min(top, window.innerHeight - actualHeight - margin));

            // Horizontal alignment: align with target left, clamp strictly within viewport bounds
            let left = targetRect.left;
            if (left + cardWidth > window.innerWidth - margin) {
                left = window.innerWidth - cardWidth - margin;
            }
            left = Math.max(margin, left);

            tooltipStyle = {
                position: 'fixed',
                top: `${Math.round(top)}px`,
                left: `${Math.round(left)}px`,
                width: `${Math.round(cardWidth)}px`,
                maxWidth: `${Math.round(cardWidth)}px`,
                transform: 'none',
                zIndex: 60
            };
        }
    }

    const content = (
        <div className="fixed inset-0 z-50 pointer-events-none" role="dialog" aria-modal="true" aria-label="Interactive Guided Tutorial">
            {/* SVG Dimmed Backdrop with Spotlight Cutout */}
            <svg 
                className="fixed inset-0 w-full h-full pointer-events-none transition-all duration-300"
                style={{ zIndex: 51 }}
            >
                <defs>
                    <mask id="spotlight-mask">
                        <rect x="0" y="0" width="100%" height="100%" fill="white" />
                        {targetRect && (
                            <rect
                                x={targetRect.left - 6}
                                y={targetRect.top - 6}
                                width={targetRect.width + 12}
                                height={targetRect.height + 12}
                                rx="8"
                                fill="black"
                            />
                        )}
                    </mask>
                </defs>
                <rect
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    fill="rgba(0, 0, 0, 0.65)"
                    mask="url(#spotlight-mask)"
                />
            </svg>

            {/* Target Highlight Border Ring */}
            {targetRect && (
                <div
                    style={{
                        position: 'fixed',
                        top: `${targetRect.top - 6}px`,
                        left: `${targetRect.left - 6}px`,
                        width: `${targetRect.width + 12}px`,
                        height: `${targetRect.height + 12}px`,
                        zIndex: 55,
                        pointerEvents: 'none'
                    }}
                    className="border-2 border-[#dc0000] rounded-xl shadow-lg ring-4 ring-[#dc0000]/20 animate-pulse-slow"
                />
            )}

            {/* Tutorial Explanatory Tooltip Card */}
            <div 
                id="guided-tutorial-card"
                data-testid="guided-tutorial-card"
                ref={cardRef}
                style={tooltipStyle}
                className="w-full max-w-[390px] bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200 pointer-events-auto"
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-950/60 text-[#dc0000] flex items-center justify-center shrink-0">
                            <Compass size={16} />
                        </div>
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                            {t('onboarding.tutorial.stepOf', { current: currentStepIndex + 1, total: TUTORIAL_STEPS.length }) || `Step ${currentStepIndex + 1} of ${TUTORIAL_STEPS.length}`}
                        </span>
                    </div>
                    <button
                        id="tutorial-close-btn"
                        type="button"
                        onClick={onClose}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                        aria-label={t('setup.tutorial.exitBtn') || 'Exit tutorial'}
                        title={t('setup.tutorial.exitBtn') || 'Exit tutorial'}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Content */}
                <div>
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                        {step.id === 'step-nav' ? t('tutorial.step1.title') :
                         step.id === 'step-pricing-assistant' ? t('tutorial.step2.title') :
                         step.id === 'step-pricing-manual' ? t('tutorial.step3.title') :
                         step.id === 'step-help-search' ? t('tutorial.step4.title') : step.title}
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
                        {step.id === 'step-nav' ? t('tutorial.step1.desc') :
                         step.id === 'step-pricing-assistant' ? t('tutorial.step2.desc') :
                         step.id === 'step-pricing-manual' ? t('tutorial.step3.desc') :
                         step.id === 'step-help-search' ? t('tutorial.step4.desc') : step.description}
                    </p>
                </div>

                {/* Do this now button if step has action */}
                {step.actionLabel && (
                    <button
                        id="tutorial-action-btn"
                        data-action-id={step.id}
                        type="button"
                        onClick={handleDoThisNow}
                        className="w-full py-2 px-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                        <Target size={14} className="text-[#dc0000]" />
                        <span>
                            {step.id === 'step-nav' ? t('tutorial.step1.action') :
                             step.id === 'step-pricing-assistant' ? t('tutorial.step2.action') :
                             step.id === 'step-pricing-manual' ? t('tutorial.step3.action') :
                             step.id === 'step-help-search' ? t('tutorial.step4.action') : step.actionLabel}
                        </span>
                    </button>
                )}

                {/* Navigation Footer */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={handleBack}
                        disabled={currentStepIndex === 0}
                        className="px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                        <ArrowLeft size={13} />
                        <span>{t('onboarding.tutorial.back') || 'Back'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleNext}
                        className="px-4 py-1.5 bg-[#dc0000] hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                        <span>{currentStepIndex === TUTORIAL_STEPS.length - 1 ? (t('onboarding.tutorial.exit') || 'Finish') : (t('onboarding.tutorial.next') || 'Next')}</span>
                        {currentStepIndex < TUTORIAL_STEPS.length - 1 && <ArrowRight size={13} />}
                    </button>
                </div>
            </div>
        </div>
    );

    if (typeof document !== 'undefined') {
        return createPortal(content, document.body);
    }
    return content;
};
