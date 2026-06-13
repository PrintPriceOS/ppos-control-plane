import React, { useState, useEffect } from 'react';
import { getFederationClusterStatus, FederationClusterStatusResponse, FederatedNode } from '../lib/adminApi';
import { GlobeAltIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export const FederatedNodesNetworkPanel: React.FC = () => {
  const [data, setData] = useState<FederationClusterStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchStatus = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    try {
      const res = await getFederationClusterStatus();
      if (res) {
        setData(res);
        setError(null);
      } else {
        setError('Federation telemetry source returned invalid format.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sync with federation telemetry service.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(() => {
      fetchStatus();
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="bg-[#18181b] border border-white/10 p-6 flex flex-col items-center justify-center gap-3">
        <ArrowPathIcon className="w-6 h-6 text-slate-400 animate-spin" />
        <p className="text-xs font-mono text-slate-400">Loading federation mesh status...</p>
      </div>
    );
  }

  const nodes = data?.nodes || [];
  const activeLease = data?.activeLease;
  const isReadOnly = data?.isReadOnly || false;
  const localNodeId = data?.localNodeId;

  // Find Leader LSN
  const leaderNode = nodes.find(n => n.id === activeLease?.holder_node_id);
  const leaderLsn = leaderNode ? Number(leaderNode.current_lsn) : 0;

  return (
    <div className="bg-[#18181b] border border-white/10 p-4 font-mono text-slate-300">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-3">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <GlobeAltIcon className="w-4 h-4 text-emerald-400" />
          Federated Nodes Network
        </h3>
        <button 
          onClick={() => fetchStatus(true)} 
          disabled={refreshing} 
          className="hover:text-white transition-colors"
          title="Force refresh status"
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 mb-3">
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Split-Brain Lockdown Alert Banner */}
      {isReadOnly && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold animate-pulse flex items-center gap-3 mb-3">
          <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-[10px] tracking-wider uppercase font-black">SPLIT-BRAIN LOCKDOWN: READ-ONLY ACTIVE</p>
            <p className="text-[9px] font-normal text-amber-500 mt-0.5">Cluster quorum lost. Mutations and production intake are frozen regional-wide.</p>
          </div>
        </div>
      )}

      {/* Nodes List */}
      {nodes.length === 0 ? (
        <p className="text-xs text-slate-500 italic text-center py-4">No federated nodes registered in mesh</p>
      ) : (
        <div className="space-y-3">
          {nodes.map((node: FederatedNode) => {
            const isLeader = activeLease?.holder_node_id === node.id;
            const isLocal = node.id === localNodeId;

            // Calculate sync percentage compared to leader LSN
            const nodeLsn = Number(node.current_lsn);
            const syncPercent = leaderLsn > 0 ? Math.min(100, Math.round((nodeLsn / leaderLsn) * 100)) : 100;
            const isOutdated = nodeLsn < leaderLsn;

            // Determine status style classes
            let statusStyle = 'border-slate-800 text-slate-400';
            let statusDot = 'bg-slate-500';
            if (node.status === 'LIVE') {
              statusStyle = 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400';
              statusDot = 'bg-emerald-500';
            } else if (node.status === 'DEGRADED') {
              statusStyle = 'border-amber-500/30 bg-amber-500/5 text-amber-400';
              statusDot = 'bg-amber-400';
            } else if (node.status === 'OFFLINE') {
              statusStyle = 'border-rose-500/20 bg-rose-500/5 text-rose-400 animate-pulse';
              statusDot = 'bg-rose-500';
            }

            return (
              <div 
                key={node.id} 
                className={`p-3 border rounded-sm ${statusStyle} transition-all duration-300`}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                      <span className="font-bold text-white text-xs">{node.node_name}</span>
                      {isLocal && <span className="text-[8px] bg-slate-800 text-slate-400 px-1 border border-white/5 rounded-xs">LOCAL</span>}
                    </div>
                    <span className="text-[10px] text-slate-500">{node.id}</span>
                  </div>
                  
                  {/* Role Badge */}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-xs font-bold uppercase ${
                    isLeader 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-slate-800 text-slate-400 border border-white/5'
                  }`}>
                    {isLeader ? 'LEADER' : 'FOLLOWER'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-[10px] text-slate-400 pt-1 border-t border-white/5">
                  <div>
                    <span className="text-slate-500">PING LATENCY: </span>
                    <span className="text-slate-300">
                      {node.status === 'OFFLINE' ? 'N/A' : (node.sync_latency_ms !== undefined ? `${node.sync_latency_ms} ms` : '< 5ms')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">LSN POINTER: </span>
                    <span className="text-slate-300 font-bold">LSN {nodeLsn}</span>
                  </div>
                  
                  {/* URL */}
                  <div className="col-span-2 text-slate-500 truncate">
                    URL: <span className="text-slate-400 hover:underline cursor-pointer">{node.base_url}</span>
                  </div>
                </div>

                {/* Catch-up progress bar if outdated */}
                {isOutdated && (
                  <div className="mt-2 pt-2 border-t border-white/5">
                    <div className="flex justify-between text-[9px] text-slate-500 mb-1">
                      <span>LSN CONCILIATION CATCH-UP</span>
                      <span>{syncPercent}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                      <div 
                        className="bg-amber-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${syncPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
