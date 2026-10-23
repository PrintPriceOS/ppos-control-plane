import React, { Fragment, useRef } from 'react';
import { Dialog, Transition, TransitionChild, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface AccessibleModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    badge?: string;
    maxWidth?: 'max-w-md' | 'max-w-lg' | 'max-w-xl' | 'max-w-2xl' | 'max-w-3xl' | 'max-w-4xl' | 'max-w-5xl' | 'max-w-6xl';
    children: React.ReactNode;
    footer?: React.ReactNode;
    hasUnsavedChanges?: boolean;
    unsavedWarningMessage?: string;
    initialFocusRef?: React.RefObject<any>;
}

export const AccessibleModal: React.FC<AccessibleModalProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    badge,
    maxWidth = 'max-w-xl',
    children,
    footer,
    hasUnsavedChanges = false,
    unsavedWarningMessage = 'Tiene cambios sin guardar. ¿Está seguro de que desea cerrar?',
    initialFocusRef
}) => {
    const defaultCloseRef = useRef<HTMLButtonElement>(null);

    const handleClose = () => {
        if (hasUnsavedChanges) {
            if (!window.confirm(unsavedWarningMessage)) {
                return;
            }
        }
        onClose();
    };

    return (
        <Transition show={isOpen} as={Fragment}>
            <Dialog 
                as="div" 
                className="fixed inset-0 z-50" 
                onClose={handleClose}
                initialFocus={initialFocusRef || defaultCloseRef}
            >
                {/* Backdrop / Overlay covering entire browser viewport */}
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-200"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-150"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div 
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
                        aria-hidden="true" 
                    />
                </TransitionChild>

                {/* Viewport centering container - immune to scroll offset or ancestor transforms */}
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
                    <TransitionChild
                        as={Fragment}
                        enter="ease-out duration-200"
                        enterFrom="opacity-0 scale-95"
                        enterTo="opacity-100 scale-100"
                        leave="ease-in duration-150"
                        leaveFrom="opacity-100 scale-100"
                        leaveTo="opacity-0 scale-95"
                    >
                        <DialogPanel 
                            className={`w-full ${maxWidth} bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[88vh] text-left align-middle rounded-2xl overflow-hidden my-auto`}
                        >
                            {/* Sticky Header */}
                            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 px-6 py-4.5 shrink-0 bg-white dark:bg-[#18181b]">
                                <div>
                                    {badge && (
                                        <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white rounded-full inline-block mb-1.5 shadow-2xs">
                                            {badge}
                                        </span>
                                    )}
                                    <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                                        {title}
                                    </DialogTitle>
                                    {subtitle && (
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                            {subtitle}
                                        </p>
                                    )}
                                </div>
                                <button
                                    ref={defaultCloseRef}
                                    type="button"
                                    onClick={handleClose}
                                    className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                                    aria-label="Cerrar diálogo"
                                >
                                    <XMarkIcon className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Scrollable Content Body */}
                            <div className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar space-y-4 text-xs text-slate-700 dark:text-zinc-300">
                                {children}
                            </div>

                            {/* Sticky / Dedicated Footer */}
                            {footer && (
                                <div className="border-t border-slate-200 dark:border-zinc-800 px-6 py-3.5 bg-slate-50 dark:bg-zinc-900/50 flex items-center justify-end gap-3 shrink-0">
                                    {footer}
                                </div>
                            )}
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </Dialog>
        </Transition>
    );
};
