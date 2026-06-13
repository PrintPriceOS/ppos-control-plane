/**
 * src/ui/pages/PrinthouseRegistrationPage.tsx
 * 
 * Self-service onboarding for new Printhouses in dark cyber-aesthetic layout.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    BuildingOfficeIcon, 
    EnvelopeIcon, 
    LockClosedIcon, 
    GlobeAltIcon,
    PhoneIcon,
    CheckCircleIcon
} from "@heroicons/react/24/outline";
import { setAuthToken, setAuthUser } from '../lib/authStore';
import { toDisplayText } from '../lib/display';

export const PrinthouseRegistrationPage: React.FC = () => {
    const [formData, setFormData] = useState({
        companyName: '',
        contactName: '',
        email: '',
        password: '',
        country: 'ES',
        city: '',
        phone: '',
        website: ''
    });
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/auth/printhouse/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            // Defensive check: handle non-json responses or network issues gracefully
            const contentType = response.headers.get("content-type");
            let data: any = {};
            if (contentType && contentType.includes("application/json")) {
                data = await response.json();
            } else {
                throw new Error(`Invalid response format from authorization server (Status: ${response.status})`);
            }

            if (!response.ok) {
                throw new Error(data.error || 'Onboarding registration operation failed.');
            }

            if (!data.token || !data.user) {
                throw new Error('Incomplete session payload returned from security node.');
            }

            setAuthToken(data.token);
            setAuthUser(data.user);
            setSuccess(true);
            
            setTimeout(() => {
                navigate('/dashboard');
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Onboarding timeout or connection refusal encountered.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-[#0e0e0f] flex items-center justify-center p-6 font-mono text-xs">
                <div className="text-center animate-pulse space-y-4">
                    <CheckCircleIcon className="w-16 h-16 text-emerald-500 mx-auto" />
                    <h1 className="text-sm font-black text-white uppercase tracking-widest">Registration Successful!</h1>
                    <p className="text-slate-500">Redirecting to industrial master console...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0e0e0f] flex items-center justify-center p-6 py-12 font-mono text-xs text-slate-300">
            <div className="w-full max-w-2xl bg-[#131314] p-10 border border-white/10 shadow-2xl">
                <div className="mb-8 border-b border-white/5 pb-4">
                    <h1 className="text-lg font-black text-white tracking-tight uppercase flex items-center gap-2">
                        <BuildingOfficeIcon className="w-5 h-5 text-emerald-400" />
                        Join PrintPrice Network
                    </h1>
                    <p className="text-slate-500 mt-2">Self-service registration portal for print partners and manufacturing nodes.</p>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Company Info */}
                    <div className="space-y-4">
                        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">Company Details</h2>
                        
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Company Name *</label>
                            <div className="relative">
                                <BuildingOfficeIcon className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                <input 
                                    type="text" required
                                    className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 text-white outline-none focus:border-[#dc0000]/50 font-bold"
                                    value={formData.companyName}
                                    onChange={e => setFormData({...formData, companyName: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Website (Optional)</label>
                            <div className="relative">
                                <GlobeAltIcon className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                <input 
                                    type="url"
                                    className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 text-white outline-none focus:border-[#dc0000]/50 font-bold"
                                    value={formData.website}
                                    onChange={e => setFormData({...formData, website: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Contact Phone (Optional)</label>
                            <div className="relative">
                                <PhoneIcon className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                <input 
                                    type="tel"
                                    className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 text-white outline-none focus:border-[#dc0000]/50 font-bold"
                                    value={formData.phone}
                                    onChange={e => setFormData({...formData, phone: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Account Info */}
                    <div className="space-y-4">
                        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">Admin Account</h2>
                        
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Email Address *</label>
                            <div className="relative">
                                <EnvelopeIcon className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                <input 
                                    type="email" required
                                    className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 text-white outline-none focus:border-[#dc0000]/50 font-bold"
                                    value={formData.email}
                                    onChange={e => setFormData({...formData, email: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Security Key (Password) *</label>
                            <div className="relative">
                                <LockClosedIcon className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                <input 
                                    type="password" required
                                    className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 text-white outline-none focus:border-[#dc0000]/50 font-bold"
                                    value={formData.password}
                                    onChange={e => setFormData({...formData, password: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="md:col-span-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold uppercase tracking-wider">
                            {toDisplayText(error)}
                        </div>
                    )}

                    <div className="md:col-span-2 pt-4">
                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-[#dc0000] text-white font-black hover:bg-[#dc0000]/90 disabled:opacity-50 transition-colors uppercase tracking-widest"
                        >
                            {loading ? 'Processing...' : 'Complete Registration'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
