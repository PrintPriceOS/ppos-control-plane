import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { setAuthToken } from '../lib/authStore';
import { ShieldCheckIcon, KeyIcon } from '@heroicons/react/24/outline';

export const LoginPage: React.FC = () => {
    const [token, setToken] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const navigate = useNavigate();
    const location = useLocation();
    
    const from = (location.state as any)?.from?.pathname || '/';

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const cleanToken = token.trim();
        if (!cleanToken) {
            setError('Please provide a valid Control Plane Bearer Token.');
            return;
        }

        setIsSubmitting(true);
        try {
            // We save the token and attempt to navigate. 
            // The AuthGuard or the first API call will handle validation fail-loudly.
            setAuthToken(cleanToken);
            navigate(from, { replace: true });
        } catch (err: any) {
            setError(err.message || 'Failed to authenticate.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0F0F10] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <div className="w-16 h-16 bg-slate-900 dark:bg-primary/10 rounded-2xl flex items-center justify-center shadow-2xl ring-1 ring-white/10">
                        <ShieldCheckIcon className="w-10 h-10 text-white dark:text-primary" />
                    </div>
                </div>
                <h2 className="mt-6 text-center text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                    PrintPrice OS
                </h2>
                <p className="mt-2 text-center text-sm font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-[0.2em]">
                    Control Plane Access
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white dark:bg-[#1C1C1E] py-8 px-4 shadow-xl shadow-slate-200/50 dark:shadow-none sm:rounded-3xl sm:px-10 border border-slate-200/60 dark:border-white/[0.06]">
                    <form className="space-y-6" onSubmit={handleLogin}>
                        <div>
                            <label htmlFor="token" className="block text-xs font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest ml-1 mb-2">
                                Admin Bearer Token
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <KeyIcon className="h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" aria-hidden="true" />
                                </div>
                                <textarea
                                    id="token"
                                    name="token"
                                    rows={3}
                                    required
                                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 dark:border-white/[0.08] rounded-2xl bg-slate-50/50 dark:bg-white/[0.03] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none font-mono text-sm"
                                    placeholder="Paste your Control Plane secret token here..."
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                />
                            </div>
                            <p className="mt-3 text-[11px] text-slate-400 dark:text-zinc-600 leading-relaxed italic">
                                Paste a valid Control Plane JWT or system-level bearer token provided by your infrastructure administrator.
                            </p>
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <div className="h-2 w-2 mt-1.5 rounded-full bg-red-400" />
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm font-bold text-red-800 dark:text-red-400">
                                            {error}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full flex justify-center py-4 px-4 border border-transparent rounded-2xl shadow-lg text-sm font-black text-white bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest"
                            >
                                {isSubmitting ? 'Authenticating...' : 'Enter Control Plane'}
                            </button>
                        </div>
                    </form>

                    <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/[0.04]">
                        <div className="flex items-center justify-between text-[10px] font-black text-slate-400 dark:text-zinc-700 uppercase tracking-widest">
                            <span>Governance Layer</span>
                            <span>v2.10.0-PROD</span>
                        </div>
                    </div>
                </div>
                
                <p className="mt-6 text-center text-[10px] text-slate-400 dark:text-zinc-600 uppercase tracking-widest">
                    Authorized Personnel Only &bull; Forensic Audit Enabled
                </p>
            </div>
        </div>
    );
};
