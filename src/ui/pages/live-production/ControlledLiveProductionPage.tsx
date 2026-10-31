import React, { useEffect, useState } from 'react';
import { LiveProductionClient } from '../../api/liveProductionClient';

export const ControlledLiveProductionPage: React.FC<{ tenantId: string; printhouseId: string }> = ({ tenantId, printhouseId }) => {
    const [enablement, setEnablement] = useState<any>(null);
    const [readiness, setReadiness] = useState<any>(null);
    const [timeline, setTimeline] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [e, r, t] = await Promise.all([
                LiveProductionClient.getEnablement(tenantId, printhouseId),
                LiveProductionClient.getReadiness(tenantId, printhouseId),
                LiveProductionClient.getTimeline(tenantId, printhouseId)
            ]);
            setEnablement(e);
            setReadiness(r);
            setTimeline(t);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [tenantId, printhouseId]);

    const handleAction = async (actionFn: () => Promise<any>) => {
        try {
            await actionFn();
            await loadData();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    if (loading) return <div>Loading controlled live production data...</div>;
    if (error) return <div className="text-red-500">Error loading data: {error}</div>;

    return (
        <div className="p-6 bg-white rounded shadow">
            <h1 className="text-2xl font-bold mb-4">Controlled Live Production Dashboard</h1>
            
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6" role="alert">
                <p className="font-bold">Governance Warning</p>
                <p>Monitoring mode only — LIVE production remains disabled unless explicitly approved.</p>
                <p>This is a controlled pilot enablement process. It does not certify "guaranteed delivery" or "production-ready" PDFs without explicit governance.</p>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div>
                    <h2 className="text-xl font-semibold mb-2">Live Status</h2>
                    <ul className="list-disc pl-5">
                        <li><strong>Enablement Status:</strong> {enablement.enablement_status}</li>
                        <li><strong>Commercial Status:</strong> {enablement.commercial_status}</li>
                        <li><strong>LIVE PRODUCTION ENABLED:</strong> {enablement.live_production_enabled ? 'YES' : 'DISABLED'}</li>
                        <li><strong>Live Scope:</strong> {enablement.live_scope || 'None'}</li>
                    </ul>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {enablement.enablement_status === 'NOT_REQUESTED' && (
                            <button className="px-4 py-2 bg-blue-500 text-white rounded" onClick={() => handleAction(() => LiveProductionClient.requestEnablement(tenantId, printhouseId, 'LIMITED_LIVE', 'Initial Request'))}>Request Review</button>
                        )}
                        {enablement.enablement_status === 'REQUESTED' && (
                            <button className="px-4 py-2 bg-yellow-500 text-white rounded" onClick={() => handleAction(() => LiveProductionClient.moveToReview(tenantId, printhouseId))}>Move to Review</button>
                        )}
                        {enablement.enablement_status === 'UNDER_REVIEW' && (
                            <>
                                <button className="px-4 py-2 bg-green-500 text-white rounded" onClick={() => handleAction(() => LiveProductionClient.approve(tenantId, printhouseId, 'Looks good', {}))}>Approve</button>
                                <button className="px-4 py-2 bg-red-500 text-white rounded" onClick={() => handleAction(() => LiveProductionClient.reject(tenantId, printhouseId, 'Needs work'))}>Reject</button>
                            </>
                        )}
                        {(enablement.enablement_status === 'APPROVED' || enablement.enablement_status === 'PAUSED') && (
                            <button className="px-4 py-2 bg-indigo-500 text-white rounded" onClick={() => handleAction(() => LiveProductionClient.activate(tenantId, printhouseId))}>Activate LIVE</button>
                        )}
                        {enablement.enablement_status === 'ACTIVE' && (
                            <>
                                <button className="px-4 py-2 bg-orange-500 text-white rounded" onClick={() => handleAction(() => LiveProductionClient.pause(tenantId, printhouseId, 'Temporary Pause'))}>Pause LIVE</button>
                                <button className="px-4 py-2 bg-red-700 text-white rounded" onClick={() => handleAction(() => LiveProductionClient.revoke(tenantId, printhouseId, 'Revoked by Admin', 'FULL_STOP'))}>Revoke</button>
                            </>
                        )}
                    </div>
                </div>

                <div>
                    <h2 className="text-xl font-semibold mb-2">Readiness Evaluation</h2>
                    <ul className="list-disc pl-5">
                        <li><strong>Ready for Controlled Live:</strong> {readiness.ready_for_controlled_live ? 'YES' : 'NO'}</li>
                        <li><strong>Tenant Pilot:</strong> {readiness.domains.tenant_pilot}</li>
                        <li><strong>Printhouse:</strong> {readiness.domains.printhouse}</li>
                        <li><strong>Commercial:</strong> {readiness.domains.commercial}</li>
                        <li><strong>Monitoring:</strong> {readiness.domains.operational_monitoring}</li>
                        <li><strong>Governance:</strong> {readiness.domains.governance}</li>
                        <li><strong>Isolation:</strong> {readiness.domains.tenant_isolation}</li>
                    </ul>
                    {readiness.blocking_reasons.length > 0 && (
                        <div className="mt-2 text-red-600">
                            <strong>Blockers:</strong>
                            <ul className="list-disc pl-5">
                                {readiness.blocking_reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-8">
                <h2 className="text-xl font-semibold mb-2">Approval Timeline</h2>
                <table className="min-w-full border text-sm">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border px-4 py-2">Date</th>
                            <th className="border px-4 py-2">Event</th>
                            <th className="border px-4 py-2">Actor</th>
                            <th className="border px-4 py-2">Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        {timeline.map((event, i) => (
                            <tr key={i}>
                                <td className="border px-4 py-2">{new Date(event.created_at).toLocaleString()}</td>
                                <td className="border px-4 py-2">{event.event_type}</td>
                                <td className="border px-4 py-2">{event.actor_role} ({event.actor_user_id})</td>
                                <td className="border px-4 py-2">{event.message}</td>
                            </tr>
                        ))}
                        {timeline.length === 0 && (
                            <tr><td colSpan={4} className="border px-4 py-2 text-center">No timeline events found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
