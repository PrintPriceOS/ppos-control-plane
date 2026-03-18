import React, { useEffect, useState } from 'react';
import { RiskBadge } from '../../components/RiskBadge';
import { ServerStackIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { IntelligenceDetailDrawer } from '../../components/IntelligenceDetailDrawer';

export const DeploymentRiskPage: React.FC = () => {
  const [deployments, setDeployments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);

  useEffect(() => {
    fetch('/api/admin/intelligence/risk/deployments')
      .then(res => res.json())
      .then(data => {
        if (data.ok) setDeployments(data.deploymentRisks || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center space-x-3 mb-8">
        <ServerStackIcon className="w-8 h-8 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900 font-display">Deployment Risk Radar</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-gray-400 font-medium">Scanning deployment nodes...</div>
        ) : deployments.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
            No infrastructure risks detected. System health is optimal.
          </div>
        ) : deployments.map(dep => (
          <div 
            key={dep.deploymentId} 
            className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-indigo-500"
            onClick={() => setSelectedEntity(dep)}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-gray-900">{dep.deploymentId}</h3>
              <RiskBadge level={dep.riskLevel} score={dep.riskScore} />
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center text-sm text-gray-500">
                <ExclamationCircleIcon className="w-4 h-4 mr-2 text-amber-500" />
                <span className="font-medium">Factor:</span>
                <span className="ml-1 text-gray-700">{dep.dominantFactor.replace('_', ' ')}</span>
              </div>
              <div className="text-xs text-gray-400">
                <span className="font-semibold">{dep.affectedTenants.length}</span> tenants currently affected
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
              <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Health Metrics</span>
              <button className="text-indigo-600 font-semibold text-xs hover:underline">View Node Detail</button>
            </div>
          </div>
        ))}
      </div>

      <IntelligenceDetailDrawer 
        isOpen={!!selectedEntity} 
        onClose={() => setSelectedEntity(null)} 
        type="insight" // Fallback type
        data={selectedEntity ? {
          ...selectedEntity,
          type: 'DEPLOYMENT_RISK',
          summary: `Deployment Risk Analysis: ${selectedEntity.deploymentId}`,
          explanation: `Node risk evaluated at ${selectedEntity.riskScore}/100. Primary driver: ${selectedEntity.dominantFactor}.`
        } : null} 
      />
    </div>
  );
};
