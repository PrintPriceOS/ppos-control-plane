import React, { useEffect, useState } from 'react';
import { RiskBadge } from '../../components/RiskBadge';
import { ShieldExclamationIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon, MinusIcon } from '@heroicons/react/24/outline';
import { IntelligenceDetailDrawer } from '../../components/IntelligenceDetailDrawer';

export const TenantRiskPage: React.FC = () => {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);

  useEffect(() => {
    fetch('/api/admin/intelligence/risk/tenants')
      .then(res => res.json())
      .then(data => {
        if (data.ok) setTenants(data.tenantRisks || []);
        setLoading(false);
      });
  }, []);

  const getTrendIcon = (trend: string) => {
    if (trend === 'UP' || trend === 'UP_FAST') return <ArrowTrendingUpIcon className="w-4 h-4 text-rose-500" />;
    if (trend === 'DOWN') return <ArrowTrendingDownIcon className="w-4 h-4 text-emerald-500" />;
    return <MinusIcon className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="p-6">
      <div className="flex items-center space-x-3 mb-8">
        <ShieldExclamationIcon className="w-8 h-8 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900 font-display">Tenant Risk Profiler</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 uppercase text-[10px] tracking-wider text-gray-500 font-bold">
            <tr>
              <th className="px-6 py-4 text-left">Tenant ID</th>
              <th className="px-6 py-4 text-left">Tier</th>
              <th className="px-6 py-4 text-center">Risk Score</th>
              <th className="px-6 py-4 text-center">Risk Level</th>
              <th className="px-6 py-4 text-left">Primary Driver</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">Loading risk profiles...</td></tr>
            ) : tenants.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No high-risk tenants detected.</td></tr>
            ) : tenants.map(tenant => (
              <tr key={tenant.tenantId} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedEntity(tenant)}>
                <td className="px-6 py-4 font-medium text-gray-900">{tenant.tenantId}</td>
                <td className="px-6 py-4 text-gray-500 text-sm italic capitalize">{tenant.contractContext.serviceTier.replace('_', ' ')}</td>
                <td className="px-6 py-4 text-center font-mono text-gray-700">{tenant.riskScore}</td>
                <td className="px-6 py-4 text-center">
                  <RiskBadge level={tenant.riskLevel} score={tenant.riskScore} />
                </td>
                <td className="px-6 py-4 text-gray-500 text-xs">
                  {tenant.drivers.sort((a: any, b: any) => b.value - a.value)[0].type.replace('_', ' ')}
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="text-indigo-600 hover:text-indigo-900 text-sm font-semibold">Inspect</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <IntelligenceDetailDrawer 
        isOpen={!!selectedEntity} 
        onClose={() => setSelectedEntity(null)} 
        type="insight" // Fallback type for styling
        data={selectedEntity ? {
          ...selectedEntity,
          type: 'RISK_PROFILE',
          summary: `Risk Profile for ${selectedEntity.tenantId}`,
          explanation: `Risk Score: ${selectedEntity.riskScore}. Primary drivers: ${selectedEntity.drivers.map((d: any) => `${d.type}(${Math.round(d.value * 100)}%)`).join(', ')}.`
        } : null} 
      />
    </div>
  );
};
