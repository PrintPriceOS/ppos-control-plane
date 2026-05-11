/**
 * src/ui/pages/LoginPage.tsx
 * 
 * Secure Login for PrintPrice OS Control Plane (Auth v1).
 */
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    ShieldCheckIcon, 
    ArrowPathIcon, 
    ArrowRightIcon, 
    EnvelopeIcon, 
    LockClosedIcon 
} from "@heroicons/react/24/outline";
import { setAuthToken, setAuthUser } from '../lib/authStore';

export const LoginPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as any)?.from?.pathname || "/dashboard";

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!email || !password) {
            setError("Email and password are required");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Authentication failed');
            }

            // Save JWT and user info
            setAuthToken(data.token);
            setAuthUser(data.user);
            
            // Success redirect
            navigate(from, { replace: true });
        } catch (err: any) {
            console.error('[LOGIN-ERROR]', err);
            setError(err.message || "Connection Error: Backend unreachable or auth header blocked.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0e0e0f] flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                {/* Branding */}
                <div className="flex flex-col items-center mb-8 text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-none flex items-center justify-center mb-4">
                        <ShieldCheckIcon className="w-10 h-10 text-[#dc0000]" />
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">PrintPrice Control Plane</h1>
                    <p className="text-sm text-slate-500 font-medium mt-1 uppercase tracking-widest">Governance & Operations</p>
                </div>

                {/* Login Card */}
                <div className="bg-white dark:bg-[#131314] p-8 rounded-none border border-slate-200 dark:border-white/[0.08] shadow-none">
                    <div className="mb-6">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-[#ECECF1]">Authentication Required</h2>
                        <p className="text-sm text-slate-500 mt-1">Access the platform using your credentials.</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        {/* Email Field */}
                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                Email Address
                            </label>
                            <div className="relative">
                                <div className="absolute left-4 top-3.5">
                                    <EnvelopeIcon className="w-5 h-5 text-slate-400" />
                                </div>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                                    placeholder="admin@printprice.pro"
                                    className="w-full bg-slate-50 dark:bg-[#131314]/[0.03] border border-slate-100 dark:border-white/[0.05] focus:border-red-500/50 rounded-none pl-12 pr-4 py-3 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 transition-all outline-none"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                Security Key
                            </label>
                            <div className="relative">
                                <div className="absolute left-4 top-3.5">
                                    <LockClosedIcon className="w-5 h-5 text-slate-400" />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                                    placeholder="••••••••••••"
                                    className="w-full bg-slate-50 dark:bg-[#131314]/[0.03] border border-slate-100 dark:border-white/[0.05] focus:border-red-500/50 rounded-none pl-12 pr-4 py-3 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 transition-all outline-none"
                                />
                            </div>
                        </div>

                        {error && (
                            <p className="text-xs font-bold text-red-500 ml-1 mt-2">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#dc0000] text-white font-black py-4 rounded-none shadow-none hover:opacity-90 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                        >
                            {loading ? (
                                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <span>Authorize Access</span>
                                    <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/[0.05] text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Restricted to Authorized Operators Only
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-slate-400 mt-8 font-medium italic-text-off">
                    PrintPrice OS v1.9.0 © {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
};
