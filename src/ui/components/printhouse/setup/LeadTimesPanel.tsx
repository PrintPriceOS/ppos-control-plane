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

    return (
        <div style={{ background: '#18181b', padding: '24px', borderRadius: '12px', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={20} style={{ color: '#dc0000' }} />
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>Lead Times & Operating Calendar</h2>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }} className="responsive-grid-split">
                {/* Configuration form */}
                <form onSubmit={handleSave} style={{ background: '#09090b', padding: '20px', borderRadius: '8px', border: '1px solid #27272a', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0', color: '#ffffff' }}>Local Site Rules</h3>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '6px', fontWeight: 600 }}>SITE TIMEZONE</label>
                        <select
                            value={timezone}
                            onChange={(e) => setTimezone(e.target.value)}
                            style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px' }}
                        >
                            {COMMON_TIMEZONES.map(tz => (
                                <option key={tz.value} value={tz.value}>{tz.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '6px', fontWeight: 600 }}>WORKDAYS</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
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
                                        style={{
                                            background: selected ? '#dc0000' : '#18181b',
                                            color: '#ffffff',
                                            border: selected ? 'none' : '1px solid #3f3f46',
                                            padding: '6px 12px',
                                            borderRadius: '4px',
                                            fontSize: '11.5px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            minWidth: '50px'
                                        }}
                                    >
                                        {day.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '6px', fontWeight: 600 }}>DAILY CUT-OFF TIME</label>
                            <input
                                type="text"
                                placeholder="14:00"
                                value={cutoffTime}
                                onChange={(e) => setCutoffTime(e.target.value)}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '6px', fontWeight: 600 }}>BASE LEAD TIME (DAYS)</label>
                            <input
                                type="number"
                                min="0"
                                value={baseLeadDays}
                                onChange={(e) => setBaseLeadDays(Number(e.target.value))}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                        </div>
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
                            marginTop: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            fontSize: '13px'
                        }}
                    >
                        <Check size={16} /> Save Lead Times
                    </button>
                </form>

                {/* Estimate Simulator Tool */}
                <div style={{ background: '#09090b', padding: '20px', borderRadius: '8px', border: '1px solid #27272a', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calculator size={16} style={{ color: '#38bdf8' }} />
                        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#ffffff' }}>Completion Estimate Simulator</h3>
                    </div>

                    <p style={{ fontSize: '11.5px', color: '#a1a1aa', margin: 0, lineHeight: '1.5' }}>
                        Test how the backend computes the completion timestamp for incoming job dispatches based on cutoff time and local workdays.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '10px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '10px', color: '#71717a', marginBottom: '4px', fontWeight: 600 }}>INTAKE DATE</label>
                            <input
                                type="date"
                                value={simulateDate}
                                onChange={(e) => setSimulateDate(e.target.value)}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '6px 8px', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '10px', color: '#71717a', marginBottom: '4px', fontWeight: 600 }}>INTAKE TIME</label>
                            <input
                                type="time"
                                value={simulateTime}
                                onChange={(e) => setSimulateTime(e.target.value)}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ffffff', padding: '6px 8px', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleSimulateCompletion}
                        disabled={simulating}
                        style={{
                            background: '#27272a',
                            color: '#ffffff',
                            border: '1px solid #3f3f46',
                            padding: '8px',
                            borderRadius: '6px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                        }}
                    >
                        {simulating ? 'Estimating...' : 'Calculate completion'}
                    </button>

                    {simulationResult && (
                        <div style={{ background: '#18181b', padding: '14px', borderRadius: '6px', border: '1px solid #27272a' }}>
                            <span style={{ display: 'block', fontSize: '10px', color: '#a1a1aa', fontWeight: 600, marginBottom: '2px' }}>ESTIMATED COMPLETION</span>
                            <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#34d399' }}>
                                {new Date(simulationResult).toLocaleString('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                            <span style={{ display: 'block', fontSize: '10px', color: '#71717a', marginTop: '6px', fontStyle: 'italic' }}>
                                (Local time in site timezone: {timezone}. Transit and delivery time are strictly excluded.)
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
