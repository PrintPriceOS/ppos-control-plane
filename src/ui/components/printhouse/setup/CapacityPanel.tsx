/**
 * src/ui/components/printhouse/setup/CapacityPanel.tsx
 * 
 * Capacity Panel.
 * Configures site-level indicative capacities and machine-level daily throughput limits.
 */
import React, { useState, useEffect } from 'react';
import { getAuthToken } from '../../../lib/authStore';
import { Activity, ShieldAlert, Check, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

interface CapacityPanelProps {
    sites: { siteId: string; siteName: string }[];
    onSaved?: () => void;
}

export const CapacityPanel: React.FC<CapacityPanelProps> = ({ sites, onSaved }) => {
    const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.siteId || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Site capacity state
    const [dailyJobsLimit, setDailyJobsLimit] = useState<number | ''>('');
    const [dailySheetsLimit, setDailySheetsLimit] = useState<number | ''>('');
    const [workingDays, setWorkingDays] = useState<number>(5);
    const [operatingHours, setOperatingHours] = useState<number>(8);
    const [notes, setNotes] = useState('');

    // Machines list
    const [machines, setMachines] = useState<any[]>([]);
    const [machineCapacityVal, setMachineCapacityVal] = useState<Record<string, number>>({});
    const [machineCapacityUnit, setMachineCapacityUnit] = useState<Record<string, string>>({});

    const token = getAuthToken();

    const fetchCapacityData = async () => {
        if (!selectedSiteId) return;
        setLoading(true);
        setError(null);
        try {
            // Fetch site capacity
            const capRes = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/capacity`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const capData = await capRes.json();
            if (capRes.ok && capData.ok && capData.capacity) {
                const cap = capData.capacity;
                setDailyJobsLimit(cap.daily_jobs_limit !== null ? cap.daily_jobs_limit : '');
                setDailySheetsLimit(cap.daily_sheets_limit !== null ? cap.daily_sheets_limit : '');
                setWorkingDays(cap.working_days_per_week || 5);
                setOperatingHours(Number(cap.operating_hours_per_day) || 8);
                setNotes(cap.notes || '');
            } else {
                setDailyJobsLimit('');
                setDailySheetsLimit('');
                setWorkingDays(5);
                setOperatingHours(8);
                setNotes('');
            }

            // Fetch machines
            const machRes = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/machines`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const machData = await machRes.json();
            if (machRes.ok && machData.ok) {
                const activeMachines = (machData.machines || []).filter((m: any) => m.status !== 'ARCHIVED');
                setMachines(activeMachines);

                const capVals: Record<string, number> = {};
                const capUnits: Record<string, string> = {};
                for (const m of activeMachines) {
                    capVals[m.id] = m.indicative_daily_capacity || 0;
                    capUnits[m.id] = m.capacity_unit_name || 'impressions';
                }
                setMachineCapacityVal(capVals);
                setMachineCapacityUnit(capUnits);
            }
        } catch (err: any) {
            setError(err.message || 'Error loading capacity profile');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCapacityData();
    }, [selectedSiteId]);

    const handleSaveSiteCapacity = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/capacity`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    daily_jobs_limit: dailyJobsLimit === '' ? null : Number(dailyJobsLimit),
                    daily_sheets_limit: dailySheetsLimit === '' ? null : Number(dailySheetsLimit),
                    working_days_per_week: Number(workingDays),
                    operating_hours_per_day: Number(operatingHours),
                    notes
                })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setSuccessMsg('Site capacity configuration saved.');
                if (onSaved) onSaved();
            } else {
                setError(data.error || 'Failed to save capacity');
            }
        } catch (err: any) {
            setError(err.message || 'Network error');
        }
    };

    const handleSaveMachineCapacity = async (machineId: string) => {
        setError(null);
        setSuccessMsg(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/machines/${machineId}/capacity`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    indicative_daily_capacity: Number(machineCapacityVal[machineId] || 0),
                    capacity_unit_name: machineCapacityUnit[machineId] || 'impressions'
                })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setSuccessMsg('Machine capacity limit configured.');
                fetchCapacityData();
            } else {
                setError(data.error || 'Failed to update machine capacity');
            }
        } catch (err: any) {
            setError(err.message || 'Network error');
        }
    };

    const inputClass = "w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors";
    const labelClass = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5";

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-7 shadow-sm transition-colors">
            <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <Activity size={20} className="text-[#dc0000]" />
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white m-0">Indicative Production Capacity</h2>
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
                {/* Site Capacity Config Form */}
                <form onSubmit={handleSaveSiteCapacity} className="lg:col-span-5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl flex flex-col gap-3 transition-colors">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white m-0 mb-1">Site Throughput Targets</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                            <label className={labelClass}>DAILY JOBS LIMIT</label>
                            <input
                                type="number"
                                placeholder="No limit"
                                value={dailyJobsLimit}
                                onChange={(e) => setDailyJobsLimit(e.target.value === '' ? '' : Number(e.target.value))}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>DAILY SHEETS LIMIT</label>
                            <input
                                type="number"
                                placeholder="No limit"
                                value={dailySheetsLimit}
                                onChange={(e) => setDailySheetsLimit(e.target.value === '' ? '' : Number(e.target.value))}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                            <label className={labelClass}>WORKING DAYS / WEEK</label>
                            <input
                                type="number"
                                min="1"
                                max="7"
                                value={workingDays}
                                onChange={(e) => setWorkingDays(Number(e.target.value))}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>OPERATING HOURS / DAY</label>
                            <input
                                type="number"
                                min="1"
                                max="24"
                                value={operatingHours}
                                onChange={(e) => setOperatingHours(Number(e.target.value))}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>NOTES / EXCEPTIONS</label>
                        <textarea
                            placeholder="e.g. Closed during national bank holidays"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className={`${inputClass} min-h-[60px] resize-y`}
                        />
                    </div>

                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-2.5 rounded-lg flex gap-2 items-start my-1 text-xs text-amber-900 dark:text-amber-300">
                        <ShieldAlert size={14} className="text-amber-500 mt-0.5 shrink-0" />
                        <span className="leading-tight">
                            <strong>Indicative capacity only.</strong> Dynamic job scheduling, allocation queues, and live routing are not active in this phase.
                        </span>
                    </div>

                    <button
                        type="submit"
                        className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 mt-1 shadow-xs cursor-pointer"
                    >
                        <Check size={16} /> Save Site Capacity
                    </button>
                </form>

                {/* Machine-Specific Throughput Constraints */}
                <div className="lg:col-span-7 flex flex-col gap-3">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white m-0">Machinery Limits</h3>
                    {machines.length === 0 ? (
                        <div className="bg-zinc-50 dark:bg-zinc-900/60 p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 text-center text-zinc-500">
                            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 m-0">No active machines configured at this site.</p>
                            <p className="text-xs text-zinc-500 mt-1 mb-0">Go to Machinery tab to add presses first.</p>
                        </div>
                    ) : (
                        machines.map(m => (
                            <div key={m.id} className="bg-zinc-50 dark:bg-zinc-900/60 p-3.5 sm:px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center flex-wrap gap-3 transition-colors">
                                <div>
                                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white m-0">{m.machine_name}</h4>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{m.machine_type}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={machineCapacityVal[m.id] !== undefined ? machineCapacityVal[m.id] : 0}
                                        onChange={(e) => setMachineCapacityVal({ ...machineCapacityVal, [m.id]: Number(e.target.value) })}
                                        className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-2 py-1.5 rounded-lg text-xs w-20"
                                    />
                                    <select
                                        value={machineCapacityUnit[m.id] || 'impressions'}
                                        onChange={(e) => setMachineCapacityUnit({ ...machineCapacityUnit, [m.id]: e.target.value })}
                                        className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-2 py-1.5 rounded-lg text-xs cursor-pointer"
                                    >
                                        <option value="impressions">impressions/day</option>
                                        <option value="sheets">sheets/day</option>
                                        <option value="hours">hours/day</option>
                                        <option value="jobs">jobs/day</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => handleSaveMachineCapacity(m.id)}
                                        className="bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
