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
        <div style={{ position: 'relative', display: 'inline-block', marginLeft: '6px' }}>
            <HelpCircle
                size={14}
                style={{ cursor: 'help', color: '#a1a1aa', verticalAlign: 'middle' }}
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            />
            {show && (
                <div style={{
                    position: 'absolute',
                    bottom: '125%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#18181b',
                    color: '#f4f4f5',
                    border: '1px solid #dc0000',
                    fontSize: '12px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    width: '220px',
                    zIndex: 9999,
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.6)',
                    lineHeight: '1.4'
                }}>
                    <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>{title}</strong>
                    {description}
                </div>
            )}
        </div>
    );
};
