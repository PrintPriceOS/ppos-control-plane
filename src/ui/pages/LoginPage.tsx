import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheckIcon, KeyIcon, ArrowRightIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { setAdminKey, verifyToken } from '../lib/adminApi';

export const LoginPage: React.FC = () => {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError('Please enter your administration key');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await verifyToken(key.trim());
      setAdminKey(key.trim());
      navigate('/dashboard');
    } catch (err: any) {
      console.error('[LOGIN-ERROR]', err);
      if (err.message.includes('401')) {
        setError('Invalid access token. Please check your credentials.');
      } else {
        setError(`Connection Error: ${err.message}. If this persists, check if the Authorization header is being blocked by the server.`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#121214] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <ShieldCheckIcon className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">PrintPrice Control Plane</h1>
          <p className="text-sm text-slate-500 font-medium mt-1 uppercase tracking-widest">Governance & Operations</p>
        </div>

        {/* Login Card */}
        <div className="glass p-8 rounded-3xl border border-white dark:border-white/[0.08] shadow-2xl shadow-slate-200/50 dark:shadow-black/50">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-[#ECECF1]">Authentication Required</h2>
            <p className="text-sm text-slate-500 mt-1">Please enter your PPOS Control Token to access the platform.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                Access Token
              </label>
              <div className="relative">
                <div className="absolute left-4 top-3.5">
                  <KeyIcon className="w-5 h-5 text-slate-400" />
                </div>
                <input 
                  type="password"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setError('');
                  }}
                  placeholder="Enter your secure token..."
                  className="w-full bg-slate-50 dark:bg-white/[0.03] border-2 border-slate-100 dark:border-white/[0.05] focus:border-primary/50 rounded-2xl pl-12 pr-4 py-3 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 transition-all outline-none"
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <p className="text-xs font-bold text-red-500 ml-1">{error}</p>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="btn-primary-premium w-full flex items-center justify-center !py-4"
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

        <p className="text-center text-xs text-slate-400 mt-8 font-medium italic-text-off">
          PrintPrice OS v1.9.0 &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};
