/**
 * src/ui/components/printhouse/setup/SetupDrawer.tsx
 * 
 * Accessible, keyboard-friendly slide-over drawer for secondary detail inspection.
 * Traps focus, closes on Escape, provides click-outside handling.
 */
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface SetupDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    widthClass?: string;
}

export const SetupDrawer: React.FC<SetupDrawerProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    children,
    widthClass = 'max-w-xl'
}) => {
    const drawerRef = useRef<HTMLDivElement>(null);
    const closeBtnRef = useRef<HTMLButtonElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            previousFocusRef.current = document.activeElement as HTMLElement;
            // Focus drawer close button or first focusable element
            setTimeout(() => {
                const focusableElements = drawerRef.current?.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                if (closeBtnRef.current) {
                    closeBtnRef.current.focus();
                } else if (focusableElements && focusableElements.length > 0) {
                    focusableElements[0].focus();
                }
            }, 50);

            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    onClose();
                    return;
                }

                if (e.key === 'Tab') {
                    if (!drawerRef.current) return;
                    const focusables = Array.from(
                        drawerRef.current.querySelectorAll<HTMLElement>(
                            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
                        )
                    ).filter(el => {
                        return el.style.display !== 'none' && el.style.visibility !== 'hidden' && !el.hasAttribute('hidden');
                    });

                    if (focusables.length === 0) {
                        e.preventDefault();
                        return;
                    }

                    const firstElement = focusables[0];
                    const lastElement = focusables[focusables.length - 1];

                    if (e.shiftKey) {
                        if (document.activeElement === firstElement || !drawerRef.current.contains(document.activeElement)) {
                            e.preventDefault();
                            lastElement.focus();
                        }
                    } else {
                        if (document.activeElement === lastElement || !drawerRef.current.contains(document.activeElement)) {
                            e.preventDefault();
                            firstElement.focus();
                        }
                    }
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

    return (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
                <div 
                    ref={drawerRef}
                    className={`w-screen ${widthClass} bg-white dark:bg-[#18181b] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200`}
                >
                    {/* Drawer Header */}
                    <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/70 dark:bg-zinc-900/60">
                        <div>
                            <h3 id="drawer-title" className="text-sm font-bold text-zinc-900 dark:text-white">
                                {title}
                            </h3>
                            {subtitle && (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                        <button
                            ref={closeBtnRef}
                            type="button"
                            onClick={onClose}
                            aria-label="Close drawer"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#dc0000]"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Drawer Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};
