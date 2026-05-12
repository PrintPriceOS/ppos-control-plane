/**
 * src/ui/pages/PrinthouseRegistrationPage.tsx
 * 
 * Self-service onboarding for new Printhouses.
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

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Registration failed');
            }

            setAuthToken(data.token);
            setAuthUser(data.user);
            setSuccess(true);
            
            setTimeout(() => {
                navigate('/dashboard');
            }, 2000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="text-center animate-fade-in">
                    <CheckCircleIcon className="w-20 h-20 text-emerald-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-black text-slate-900">Registration Successful!</h1>
                    <p className="text-slate-500 mt-2">Redirecting you to your Printhouse Dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 py-12">
            <div className="w-full max-w-2xl bg-white p-10 rounded-none shadow-xl border border-slate-100">
                <div className="mb-8">
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Join PrintPrice Network</h1>
                    <p className="text-slate-500 mt-2">Register your printhouse to start receiving industrial jobs.</p>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Company Info */}
                    <div className="space-y-4">
                        <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">Company Details</h2>
                        
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Company Name</label>
                            <div className="relative">
                                <BuildingOfficeIcon className="absolute left-3 top-3 w-5 h-5 text-slate-300" />
                                <input 
                                    type="text" required
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-none focus:border-red-500/50 outline-none font-bold text-sm"
                                    value={formData.companyName}
                                    onChange={e => setFormData({...formData, companyName: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Website (Optional)</label>
                            <div className="relative">
                                <GlobeAltIcon className="absolute left-3 top-3 w-5 h-5 text-slate-300" />
                                <input 
                                    type="url"
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-none focus:border-red-500/50 outline-none font-bold text-sm"
                                    value={formData.website}
                                    onChange={e => setFormData({...formData, website: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Account Info */}
                    <div className="space-y-4">
                        <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">Admin Account</h2>
                        
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Email Address</label>
                            <div className="relative">
                                <EnvelopeIcon className="absolute left-3 top-3 w-5 h-5 text-slate-300" />
                                <input 
                                    type="email" required
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-none focus:border-red-500/50 outline-none font-bold text-sm"
                                    value={formData.email}
                                    onChange={e => setFormData({...formData, email: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Security Key (Password)</label>
                            <div className="relative">
                                <LockClosedIcon className="absolute left-3 top-3 w-5 h-5 text-slate-300" />
                                <input 
                                    type="password" required
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-none focus:border-red-500/50 outline-none font-bold text-sm"
                                    value={formData.password}
                                    onChange={e => setFormData({...formData, password: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="md:col-span-2 p-3 bg-red-50 border border-red-100 rounded-none text-red-600 text-xs font-bold">
                            {toDisplayText(error)}
                        </div>
                    )}

                    <div className="md:col-span-2 pt-4">
                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-[#dc0000] text-white font-black rounded-none shadow-lg shadow-red-500/20 hover:opacity-90 disabled:opacity-50 transition-all uppercase tracking-widest text-sm"
                        >
                            {loading ? 'Processing...' : 'Complete Registration'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
