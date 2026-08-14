/**
 * src/ui/components/printhouse/setup/LeadTimesPanel.tsx
 * 
 * Lead Times Panel.
 * Configures site timezone, working days, daily cutoff times, and tests production completion estimates.
 */
import React, { useState, useEffect } from 'react';
import { getAuthToken } from '../../../lib/authStore';
import { Clock, Calculator, HelpCircle, Check, AlertCircle, CheckCircle } from 'lucide-react';

interface LeadTimesPanelProps {
    sites: { siteId: string; siteName: string }[];
    onSaved?: () => void;
}

const COMMON_TIMEZONES = [
    { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
    { value: 'Europe/Madrid', label: 'Europe/Madrid (CET/CEST)' },
    { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
    { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
    { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
    { value: 'America/Chicago', label: 'America/Chicago (CST/CDT)' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' }
];

export const LeadTimesPanel: React.FC<LeadTimesPanelProps> = ({ sites, onSaved }) => {
    const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.siteId || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Config state
    const [timezone, setTimezone] = useState('UTC');
    const [workdays, setWorkdays] = useState<number[]>([1, 2, 3, 4, 5]); // 1-5 Mon-Fri
    const [cutoffTime, setCutoffTime] = useState('14:00');
    const [baseLeadDays, setBaseLeadDays] = useState(3);

    // Estimator simulator state
    const [simulateDate, setSimulateDate] = useState('');
    const [simulateTime, setSimulateTime] = useState('10:00');
    const [simulationResult, setSimulationResult] = useState<string | null>(null);
    const [simulating, setSimulating] = useState(false);

    const token = getAuthToken();

    useEffect(() => {
        // Set simulateDate to today in YYYY-MM-DD
        const today = new Date().toISOString().split('T')[0];
        setSimulateDate(today);
    }, []);

    const fetchLeadTimes = async () => {
        if (!selectedSiteId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/leadtimes`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.ok && data.leadTimes) {
                const lt = data.leadTimes;
                setTimezone(lt.timezone || 'UTC');
                setCutoffTime(lt.daily_cutoff_time || '14:00');
                setBaseLeadDays(lt.base_lead_time_days !== undefined ? lt.base_lead_time_days : 3);
                
                const wDays = typeof lt.workdays_json === 'string'
                    ? JSON.parse(lt.workdays_json)
                    : lt.workdays_json || [1, 2, 3, 4, 5];
                setWorkdays(wDays);
            } else {
                setTimezone('UTC');
                setCutoffTime('14:00');
                setBaseLeadDays(3);
                setWorkdays([1, 2, 3, 4, 5]);
            }
        } catch (err: any) {
            setError(err.message || 'Error loading lead times config');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeadTimes();
    }, [selectedSiteId]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/leadtimes`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    timezone,
                    workdays_json: workdays,
                    daily_cutoff_time: cutoffTime,
                    base_lead_time_days: Number(baseLeadDays)
                })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setSuccessMsg('Lead times and cutoff rules saved.');
                if (onSaved) onSaved();
            } else {
                setError(data.error || 'Failed to save lead times');
            }
        } catch (err: any) {
            setError(err.message || 'Network error');
        }
    };

    const toggleWorkday = (day: number) => {
        if (workdays.includes(day)) {
            setWorkdays(workdays.filter(d => d !== day));
        } else {
            setWorkdays([...workdays, day].sort());
        }
    };

    const handleSimulateCompletion = async () => {
        if (!simulateDate || !simulateTime) return;
        setSimulating(true);
        setSimulationResult(null);
        try {
            const isoDateTimeStr = `${simulateDate}T${simulateTime}:00`;
            // Get local timestamp, parse in JS
            const inputDate = new Date(isoDateTimeStr);

            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/leadtimes/estimate?start_time=${inputDate.toISOString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setSimulationResult(data.estimated_completion);
            } else {
                setError(data.error || 'Failed to compute estimate');
            }
        } catch (err: any) {
            setError(err.message || 'Error running simulator');
        } finally {
            setSimulating(false);
        }
    };

    const inputClass = "w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors";
    const labelClass = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5";

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-7 shadow-sm transition-colors">
            <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <Clock size={20} className="text-[#dc0000]" />
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white m-0">Lead Times & Operating Calendar</h2>
                </div>

                {sites.length > 1 && (
                    <select
                        value={selectedSiteId}
                        onChange={(e) => setSelectedSiteId(e.target.value)}
                        className={`${inputClass} cursor-pointer max-w-xs`}
                    >
                        {sites.map(site => (
                            <option key={site.siteId} value={site.siteId}>{site.siteName}</option>
                        ))}
                    </select>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 p-3 rounded-lg text-xs mb-4">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {successMsg && (
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 p-3 rounded-lg text-xs mb-4">
                    <CheckCircle size={16} />
                    <span>{successMsg}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Configuration form */}
                <form onSubmit={handleSave} className="lg:col-span-7 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl flex flex-col gap-3.5 transition-colors">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white m-0">Local Site Rules</h3>

                    <div>
                        <label className={labelClass}>SITE TIMEZONE</label>
                        <select
                            value={timezone}
                            onChange={(e) => setTimezone(e.target.value)}
                            className={`${inputClass} cursor-pointer`}
                        >
                            {COMMON_TIMEZONES.map(tz => (
                                <option key={tz.value} value={tz.value}>{tz.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass}>WORKDAYS</label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { val: 1, label: 'Mon' },
                                { val: 2, label: 'Tue' },
                                { val: 3, label: 'Wed' },
                                { val: 4, label: 'Thu' },
                                { val: 5, label: 'Fri' },
                                { val: 6, label: 'Sat' },
                                { val: 0, label: 'Sun' }
                            ].map(day => {
                                const selected = workdays.includes(day.val);
                                return (
                                    <button
                                        key={day.val}
                                        type="button"
                                        onClick={() => toggleWorkday(day.val)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors min-w-[50px] border ${
                                            selected
                                                ? 'bg-[#dc0000] text-white border-[#dc0000]'
                                                : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                                        }`}
                                    >
                                        {day.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>DAILY CUT-OFF TIME</label>
                            <input
                                type="text"
                                placeholder="14:00"
                                value={cutoffTime}
                                onChange={(e) => setCutoffTime(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>BASE LEAD TIME (DAYS)</label>
                            <input
                                type="number"
                                min="0"
                                value={baseLeadDays}
                                onChange={(e) => setBaseLeadDays(Number(e.target.value))}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 mt-2 shadow-xs cursor-pointer"
                    >
                        <Check size={16} /> Save Lead Times
                    </button>
                </form>

                {/* Estimate Simulator Tool */}
                <div className="lg:col-span-5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl flex flex-col gap-4 transition-colors">
                    <div className="flex items-center gap-1.5">
                        <Calculator size={16} className="text-sky-600 dark:text-sky-400" />
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white m-0">Completion Estimate Simulator</h3>
                    </div>

                    <p className="text-xs text-zinc-500 dark:text-zinc-400 m-0 leading-relaxed">
                        Test how the backend computes the completion timestamp for incoming job dispatches based on cutoff time and local workdays.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">INTAKE DATE</label>
                            <input
                                type="date"
                                value={simulateDate}
                                onChange={(e) => setSimulateDate(e.target.value)}
                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 rounded-lg text-xs"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">INTAKE TIME</label>
                            <input
                                type="time"
                                value={simulateTime}
                                onChange={(e) => setSimulateTime(e.target.value)}
                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 rounded-lg text-xs"
                            />
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleSimulateCompletion}
                        disabled={simulating}
                        className="bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 p-2 rounded-lg font-semibold text-xs cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                    >
                        {simulating ? 'Estimating...' : 'Calculate completion'}
                    </button>

                    {simulationResult && (
                        <div className="bg-white dark:bg-zinc-900/90 p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                            <span className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">ESTIMATED COMPLETION</span>
                            <span className="block text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                {new Date(simulationResult).toLocaleString('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                            <span className="block text-[10px] text-zinc-500 mt-1 italic">
                                (Local time in site timezone: {timezone}. Transit and delivery time are strictly excluded.)
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
