/**
 * src/ui/components/LiveDispatchMap.tsx
 * 
 * Industrial Routing Visualization Layer for PrintPrice OS.
 * Monolith Pure aesthetic: high-density, high-contrast command system visualization.
 */
import React, { useMemo, useEffect, useState } from 'react';
import { useAdminQuery } from '../hooks/useAdminData';
import { getRoutingMap, getRoutingHeatmap } from '../lib/adminApi';

interface MapNode {
    id: string;
    name: string;
    lat: number;
    lng: number;
    status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'SATURATED';
    utilization: number;
}

interface MapRoute {
    id: string;
    status: string;
    origin: { lat: number, lng: number };
    destination: { lat: number, lng: number };
    intensity: number;
}

export const LiveDispatchMap: React.FC = () => {
    const { data: mapState, isLoading } = useAdminQuery('routing:map', getRoutingMap, 5000);
    const { data: heatmap } = useAdminQuery('routing:heatmap', getRoutingHeatmap, 10000);

    // Coordinate Projection (Simple linear for EU focus)
    // Map Range: Lat 35 to 65, Lng -15 to 35
    const project = (lat: number, lng: number) => {
        const x = ((lng + 15) / 50) * 100;
        const y = 100 - (((lat - 35) / 30) * 100);
        return { x: `${x}%`, y: `${y}%` };
    };

    if (isLoading) {
        return (
            <div className="w-full h-[600px] bg-black border border-white/5 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-none animate-spin" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Initializing Tactical Surface...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-[700px] bg-[#050505] border border-white/10 rounded-none overflow-hidden group">
            {/* Grid Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-20" 
                 style={{ backgroundImage: 'linear-gradient(#111 1px, transparent 1px), linear-gradient(90deg, #111 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            
            {/* Map Canvas */}
            <svg className="absolute inset-0 w-full h-full p-12">
                {/* Connection Lines (Routes) */}
                {Array.isArray(mapState?.routes) && mapState.routes.map((route: MapRoute) => {
                    const start = project(route.origin.lat, route.origin.lng);
                    const end = project(route.destination.lat, route.destination.lng);
                    const isDegraded = route.status === 'DEGRADED';

                    return (
                        <g key={route.id} className="routing-line">
                            <line 
                                x1={start.x} y1={start.y} 
                                x2={end.x} y2={end.y} 
                                stroke={isDegraded ? '#f59e0b' : '#ef4444'} 
                                strokeWidth={1 + route.intensity}
                                strokeOpacity={0.4}
                                strokeDasharray="5,5"
                            />
                            {/* Animated Particle */}
                            <circle r="2" fill={isDegraded ? '#f59e0b' : '#ef4444'}>
                                <animateMotion 
                                    path={`M ${start.x} ${start.y} L ${end.x} ${end.y}`} 
                                    dur="3s" 
                                    repeatCount="indefinite" 
                                />
                            </circle>
                        </g>
                    );
                })}

                {/* Regional Clusters (Heatmap) */}
                {Array.isArray(heatmap) && heatmap.map((h: any) => {
                    const pos = project(h.center.lat, h.center.lng);
                    const isSaturated = h.status === 'SATURATED';
                    return (
                        <circle 
                            key={h.region}
                            cx={pos.x} cy={pos.y}
                            r={20 + (h.pressure / 2)}
                            fill={isSaturated ? '#ef4444' : '#3b82f6'}
                            fillOpacity={0.05}
                            className={isSaturated ? 'animate-pulse' : ''}
                        />
                    );
                })}

                {/* Nodes */}
                {Array.isArray(mapState?.nodes) && mapState.nodes.map((node: MapNode) => {
                    const pos = project(node.lat, node.lng);
                    const color = node.status === 'ONLINE' ? '#10b981' : 
                                  node.status === 'DEGRADED' ? '#f59e0b' : 
                                  node.status === 'OFFLINE' ? '#4b5563' : '#ef4444';

                    return (
                        <g key={node.id} className="cursor-pointer group/node" onClick={() => (window as any).openMachine?.(node.id)}>
                            <circle 
                                cx={pos.x} cy={pos.y} r="3" 
                                fill={color} 
                                className="transition-all group-hover/node:r-4"
                            />
                            <text 
                                x={pos.x} y={pos.y} 
                                dy="-10" 
                                textAnchor="middle" 
                                className="text-[6px] font-black fill-white/40 uppercase tracking-tighter opacity-0 group-hover/node:opacity-100 transition-opacity pointer-events-none"
                            >
                                {node.name}
                            </text>
                        </g>
                    );
                })}
            </svg>

            {/* Tactical HUD Overlay */}
            <div className="absolute top-4 left-4 sm:top-6 sm:left-6 flex flex-col gap-2 sm:gap-4 pointer-events-none max-w-[calc(100%-2rem)]">
                <div className="p-3 sm:p-4 bg-black/60 backdrop-blur-md border border-white/10 rounded-none">
                    <h2 className="text-[8px] sm:text-[10px] font-black text-white uppercase tracking-[0.3em] mb-2 sm:mb-4">Federation Dispatch Live</h2>
                    <div className="space-y-2 sm:space-y-3">
                        <div className="flex justify-between items-center gap-4 sm:gap-12">
                            <span className="text-[7px] sm:text-[8px] font-bold text-slate-500 uppercase">Active Routes</span>
                            <span className="text-xs font-black text-primary tabular-nums">{mapState?.summary?.active_dispatches || 0}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4 sm:gap-12">
                            <span className="text-[7px] sm:text-[8px] font-bold text-slate-500 uppercase">Operational Nodes</span>
                            <span className="text-xs font-black text-emerald-500 tabular-nums">{mapState?.summary?.total_active_nodes || 0}</span>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-black/60 backdrop-blur-md border border-white/10 rounded-none">
                    <h3 className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3">Regional Pressure</h3>
                    <div className="space-y-2">
                        {Array.isArray(heatmap) && heatmap.slice(0, 4).map((h: any) => (
                            <div key={h.region} className="flex items-center gap-3">
                                <div className="w-20 h-1 bg-white/5 rounded-none overflow-hidden">
                                    <div className="h-full bg-primary" style={{ width: `${h.pressure}%` }} />
                                </div>
                                <span className="text-[7px] font-black text-white uppercase w-12">{h.region}</span>
                                <span className={`text-[7px] font-black ${h.status === 'SATURATED' ? 'text-red-500' : 'text-slate-500'}`}>{h.pressure}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 flex flex-wrap items-center justify-end gap-3 sm:gap-6 p-2 sm:p-3 bg-black/40 border border-white/5 rounded-none max-w-[calc(100%-2rem)]">
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-none bg-emerald-500" />
                    <span className="text-[6px] sm:text-[7px] font-black text-slate-400 uppercase">Online</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-none bg-amber-500" />
                    <span className="text-[6px] sm:text-[7px] font-black text-slate-400 uppercase">Degraded</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-none bg-red-500" />
                    <span className="text-[6px] sm:text-[7px] font-black text-slate-400 uppercase">Saturation</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-2 sm:w-3 h-[1px] bg-red-500/40 border-t border-dashed border-red-500/60" />
                    <span className="text-[6px] sm:text-[7px] font-black text-slate-400 uppercase">Active Route</span>
                </div>
            </div>

            {/* Corner Coordinates */}
            <div className="absolute top-4 right-4 text-[6px] font-mono text-white/20">
                52.5200° N, 13.4050° E // VECTOR: FEDERATION-V1
            </div>
            <div className="absolute bottom-4 left-4 text-[6px] font-mono text-white/20">
                INDUSTRIAL REAL-TIME ORCHESTRATION // PRINT-PRICE OS
            </div>
        </div>
    );
};
