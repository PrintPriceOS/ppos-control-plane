import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

interface VerifiedBadgeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGoToDashboard: () => void;
    isGovernedVerified?: boolean;
}

export const VerifiedBadgeModal: React.FC<VerifiedBadgeModalProps> = ({ 
    isOpen, 
    onClose, 
    onGoToDashboard,
    isGovernedVerified = false
}) => {
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    return (
        <AnimatePresence>
            {isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                }}>
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        style={{
                            background: isDark ? '#09090b' : '#ffffff',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                            borderRadius: '24px',
                            padding: '48px',
                            textAlign: 'center',
                            maxWidth: '420px',
                            width: '90%',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                        }}
                    >
                        <motion.div 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
                            style={{ 
                                display: 'inline-flex', 
                                padding: '24px', 
                                background: 'rgba(16, 185, 129, 0.1)', 
                                borderRadius: '50%',
                                marginBottom: '24px'
                            }}
                        >
                            <ShieldCheck size={80} color="#10b981" strokeWidth={1.5} />
                        </motion.div>

                        <h2 style={{ 
                            fontSize: '24px', 
                            fontWeight: 700, 
                            color: isDark ? '#ffffff' : '#0f172a',
                            marginBottom: '12px'
                        }}>
                            {isGovernedVerified ? 'Verified Partner' : 'Workspace Activated'}
                        </h2>
                        
                        <p style={{ 
                            fontSize: '15px', 
                            color: isDark ? '#a1a1aa' : '#64748b',
                            marginBottom: '32px',
                            lineHeight: 1.5
                        }}>
                            {isGovernedVerified 
                                ? 'Your node is fully provisioned and securely integrated. You are now authorized to receive automated orders from the PrintPrice Marketplace.'
                                : 'Your PrintPrice workspace has been created. Complete your guided printhouse setup to configure machines, paper materials, lead times, and commercial pricing.'
                            }
                        </p>

                        <button
                            type="button"
                            aria-label={isGovernedVerified ? "Go to Dashboard" : "Start Printhouse Setup"}
                            onClick={onGoToDashboard}
                            style={{
                                width: '100%',
                                padding: '14px 24px',
                                background: '#10b981',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '12px',
                                fontSize: '15px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.39)'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            {isGovernedVerified ? 'Go to Dashboard' : 'Start Printhouse Setup'}
                        </button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

