/**
 * src/ui/components/printhouse/setup/FieldGuidance.tsx
 * 
 * Provides field-specific operational guidance explaining why each field is needed.
 */
import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface FieldGuidanceProps {
    title: string;
    description: string;
}

export const FieldGuidance: React.FC<FieldGuidanceProps> = ({ title, description }) => {
    const [show, setShow] = useState(false);

    return (
        <div className="relative inline-block ml-1.5 align-middle">
            <HelpCircle
                size={14}
                className="cursor-help text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            />
            {show && (
                <div className="absolute bottom-[125%] left-1/2 -translate-x-1/2 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-[#dc0000] text-xs p-2.5 rounded-lg w-56 z-[9999] shadow-xl leading-relaxed transition-all pointer-events-none">
                    <strong className="text-zinc-900 dark:text-white block mb-0.5">{title}</strong>
                    {description}
                </div>
            )}
        </div>
    );
};
