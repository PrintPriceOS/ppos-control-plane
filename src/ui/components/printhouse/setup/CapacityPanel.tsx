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

    return (
        <div style={{ background: '#18181b', padding: '24px', borderRadius: '12px', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={20} style={{ color: '#dc0000' }} />
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>Indicative Production Capacity</h2>
                </div>

                {sites.length > 1 && (
                    <select
                        value={selectedSiteId}
                        onChange={(e) => setSelectedSiteId(e.target.value)}
                        style={{
                            background: '#09090b',
                            color: '#ffffff',
                            border: '1px solid #3f3f46',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            outline: 'none',
                            fontSize: '13px'
                        }}
                    >
                        {sites.map(site => (
                            <option key={site.siteId} value={site.siteId}>{site.siteName}</option>
                        ))}
                    </select>
                )}
            </div>

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#450a0a', border: '1px solid #991b1b', color: '#fca5a5', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {successMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#064e3b', border: '1px solid #065f46', color: '#a7f3d0', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                    <CheckCircle size={16} />
                    <span>{successMsg}</span>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '24px' }} className="responsive-grid-split">
                {/* Site Capacity Config Form */}
                <form onSubmit={handleSaveSiteCapacity} style={{ background: '#09090b', padding: '20px', borderRadius: '8px', border: '1px solid #27272a', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px 0', color: '#ffffff' }}>Site Throughput Targets</h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>DAILY JOBS LIMIT</label>
                            <input
                                type="number"
                                placeholder="No limit"
                                value={dailyJobsLimit}
                                onChange={(e) => setDailyJobsLimit(e.target.value === '' ? '' : Number(e.target.value))}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>DAILY SHEETS LIMIT</label>
                            <input
                                type="number"
                                placeholder="No limit"
                                value={dailySheetsLimit}
                                onChange={(e) => setDailySheetsLimit(e.target.value === '' ? '' : Number(e.target.value))}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>WORKING DAYS / WEEK</label>
                            <input
                                type="number"
                                min="1"
                                max="7"
                                value={workingDays}
                                onChange={(e) => setWorkingDays(Number(e.target.value))}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>OPERATING HOURS / DAY</label>
                            <input
                                type="number"
                                min="1"
                                max="24"
                                value={operatingHours}
                                onChange={(e) => setOperatingHours(Number(e.target.value))}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>NOTES / EXCEPTIONS</label>
                        <textarea
                            placeholder="e.g. Closed during national bank holidays"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box', minHeight: '60px', resize: 'vertical' }}
                        />
                    </div>

                    <div style={{ background: '#27272a', padding: '10px', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'flex-start', margin: '4px 0' }}>
                        <ShieldAlert size={14} style={{ color: '#f59e0b', marginTop: '2px', flexShrink: 0 }} />
                        <span style={{ fontSize: '10.5px', color: '#d4d4d8', lineHeight: '1.4' }}>
                            <strong>Indicative capacity only.</strong> Dynamic job scheduling, allocation queues, and live routing are not active in this phase.
                        </span>
                    </div>

                    <button
                        type="submit"
                        style={{
                            background: '#dc0000',
                            color: '#ffffff',
                            border: 'none',
                            padding: '10px',
                            borderRadius: '6px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginTop: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            fontSize: '13px'
                        }}
                    >
                        <Check size={16} /> Save Site Capacity
                    </button>
                </form>

                {/* Machine-Specific Throughput Constraints */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0', color: '#ffffff' }}>Machinery Limits</h3>
                    {machines.length === 0 ? (
                        <div style={{ background: '#09090b', padding: '24px', borderRadius: '8px', border: '1px solid #27272a', textColors: '#71717a', textAlign: 'center' }}>
                            <p style={{ fontSize: '13px', margin: 0, color: '#a1a1aa' }}>No active machines configured at this site.</p>
                            <p style={{ fontSize: '11px', margin: '4px 0 0 0', color: '#71717a' }}>Go to Machinery tab to add presses first.</p>
                        </div>
                    ) : (
                        machines.map(m => (
                            <div key={m.id} style={{ background: '#09090b', padding: '14px 16px', borderRadius: '8px', border: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', margin: 0 }}>{m.machine_name}</h4>
                                    <span style={{ fontSize: '11px', color: '#a1a1aa' }}>{m.machine_type}</span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="number"
                                        value={machineCapacityVal[m.id] !== undefined ? machineCapacityVal[m.id] : 0}
                                        onChange={(e) => setMachineCapacityVal({ ...machineCapacityVal, [m.id]: Number(e.target.value) })}
                                        style={{ background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '6px 8px', borderRadius: '4px', fontSize: '12px', width: '80px' }}
                                    />
                                    <select
                                        value={machineCapacityUnit[m.id] || 'impressions'}
                                        onChange={(e) => setMachineCapacityUnit({ ...machineCapacityUnit, [m.id]: e.target.value })}
                                        style={{ background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '6px 8px', borderRadius: '4px', fontSize: '12px' }}
                                    >
                                        <option value="impressions">impressions/day</option>
                                        <option value="sheets">sheets/day</option>
                                        <option value="hours">hours/day</option>
                                        <option value="jobs">jobs/day</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => handleSaveMachineCapacity(m.id)}
                                        style={{ background: '#27272a', border: '1px solid #3f3f46', color: '#ffffff', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
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
