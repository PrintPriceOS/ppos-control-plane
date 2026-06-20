import React, { useEffect, useState } from 'react';
import { observationClient } from '../../api/controlledBetaRuntimeObservationClient';

export const ControlledBetaRuntimeObservation: React.FC = () => {
  const [activationId, setActivationId] = useState('dummy_act');
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadState = async () => {
    setLoading(true);
    try {
      const data = await observationClient.getDashboardState(activationId);
      setState(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState();
  }, [activationId]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
        <h3 className="text-red-800 font-bold">WARNING</h3>
        <p className="text-red-700">
          Observation-only controlled beta monitoring. This does not enable FULL_PUBLIC, open marketplace, payment execution, provider submission, tax/accounting submission, or uncontrolled source mutation.
        </p>
      </div>

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Controlled Beta Runtime Observation</h1>
        <button onClick={loadState} className="bg-blue-600 text-white px-4 py-2 rounded">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {state && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-4 shadow rounded border border-gray-200">
            <h2 className="text-lg font-bold mb-4">Runtime Health Snapshot</h2>
            <div className={`text-2xl font-bold mb-2 ${state.health?.health === 'HEALTHY' ? 'text-green-600' : 'text-red-600'}`}>
              {state.health?.health}
            </div>
            <ul className="space-y-2 text-sm">
              <li>Active Participants: {state.health?.summary?.activeParticipants}</li>
              <li>Active Sessions: {state.health?.summary?.activeSessions}</li>
              <li>Incidents: {state.health?.summary?.incidentCount}</li>
              <li>Kill Switch State: {state.health?.summary?.killSwitchState}</li>
            </ul>
          </div>

          <div className="bg-white p-4 shadow rounded border border-gray-200">
            <h2 className="text-lg font-bold mb-4">Risk Score</h2>
            <div className={`text-3xl font-bold mb-2 ${state.risk?.risk_level === 'LOW' ? 'text-green-600' : 'text-red-600'}`}>
              {state.risk?.risk_score} / 100 ({state.risk?.risk_level})
            </div>
            {state.risk?.risk_factors?.length > 0 && (
              <div className="mt-2 text-sm text-gray-600">
                <strong>Factors:</strong> {state.risk.risk_factors.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Placeholders for other panels as requested */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-75">
        <div className="bg-gray-50 p-4 border rounded">Observation Readiness</div>
        <div className="bg-gray-50 p-4 border rounded">Active Cohort Scope</div>
        <div className="bg-gray-50 p-4 border rounded">Participant Activity</div>
        <div className="bg-gray-50 p-4 border rounded">Access Allowed / Denied</div>
        <div className="bg-gray-50 p-4 border rounded">Guardrail Events</div>
        <div className="bg-gray-50 p-4 border rounded">Forbidden Feature Attempts</div>
        <div className="bg-gray-50 p-4 border rounded">Incidents</div>
        <div className="bg-gray-50 p-4 border rounded">Support Queue</div>
        <div className="bg-gray-50 p-4 border rounded">SLA Warnings</div>
        <div className="bg-gray-50 p-4 border rounded">Monitoring Findings</div>
        <div className="bg-gray-50 p-4 border rounded">Audit Timeline</div>
        <div className="bg-gray-50 p-4 border rounded">Evidence Pack</div>
      </div>
    </div>
  );
};
