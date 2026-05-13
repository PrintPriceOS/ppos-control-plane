/**
 * src/ui/components/LiveDispatchMap.tsx
 * 
 * Industrial Routing Visualization Layer for PrintPrice OS.
 * Monolith Pure aesthetic: high-density, high-contrast command system visualization.
 * Fully responsive to Light Mode Bloomberg cartography & Dark Mode cinematic views.
 */
import React from 'react';
import { useAdminQuery } from '../hooks/useAdminData';
import { getRoutingMap, getRoutingHeatmap } from '../lib/adminApi';
import { useTheme } from '../hooks/useTheme';

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
    const theme = useTheme();
    const isLight = theme === 'light';

    // Coordinate Projection (Simple linear for EU focus)
    // Map Range: Lat 35 to 65, Lng -15 to 35
    const project = (lat: number, lng: number) => {
        const x = ((lng + 15) / 50) * 100;
        const y = 100 - (((lat - 35) / 30) * 100);
        return { x: `${x}%`, y: `${y}%` };
    };

    if (isLoading) {
        return (
            <div className={`w-full h-[600px] border flex items-center justify-center ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-black border-white/5'}`}>
                <div className="flex flex-col items-center gap-4">
                    <div className={`w-12 h-12 border-2 rounded-none animate-spin ${isLight ? 'border-[#dc0000]/20 border-t-[#dc0000]' : 'border-primary/20 border-t-primary'}`} />
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>Initializing Tactical Surface...</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`relative w-full h-[700px] border rounded-none overflow-hidden group ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-[#050505] border-white/10'}`}>
            {/* Grid Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-20" 
                 style={{ 
                     backgroundImage: isLight 
                        ? 'linear-gradient(#e4e4e7 1px, transparent 1px), linear-gradient(90deg, #e4e4e7 1px, transparent 1px)' 
                        : 'linear-gradient(#111 1px, transparent 1px), linear-gradient(90deg, #111 1px, transparent 1px)', 
                     backgroundSize: '40px 40px' 
                 }} />
            
            {/* Map Canvas */}
            <svg className="absolute inset-0 w-full h-full p-4 sm:p-12" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
                {/* Tactical World Map Background */}
                <g className={isLight ? "text-zinc-200" : "text-white/[0.03]"}>
                   {/* Simplified Continents for Tactical feel */}
                   <path d="M10,20 L25,15 L40,25 L35,45 L20,50 L10,40 Z" fill="currentColor" /> {/* N. America */}
                   <path d="M25,55 L35,50 L40,65 L30,85 L20,75 Z" fill="currentColor" /> {/* S. America */}
                   <path d="M50,15 L70,10 L90,15 L95,45 L75,50 L55,45 Z" fill="currentColor" /> {/* Eurasia */}
                   <path d="M55,50 L70,45 L75,65 L65,85 L50,75 Z" fill="currentColor" /> {/* Africa */}
                   <path d="M80,65 L95,60 L98,75 L85,85 Z" fill="currentColor" /> {/* Australia */}
                </g>

                {/* Europe Region Highlight (Focus Area) */}
                <rect x="45" y="15" width="20" height="25" fill="currentColor" className={isLight ? "text-[#dc0000]/5" : "text-primary/5"} stroke="currentColor" strokeWidth="0.2" />

                {/* Connection Lines (Routes) */}
                {Array.isArray(mapState?.routes) && mapState.routes.map((route: MapRoute) => {
                    const start = project(route.origin.lat, route.origin.lng);
                    const end = project(route.destination.lat, route.destination.lng);
                    const isDegraded = route.status === 'DEGRADED';
                    const lineColor = isDegraded ? (isLight ? '#d97706' : '#f59e0b') : (isLight ? '#dc0000' : '#ef4444');

                    return (
                        <g key={route.id} className="routing-line">
                            <line 
                                x1={start.x} y1={start.y} 
                                x2={end.x} y2={end.y} 
                                stroke={lineColor} 
                                strokeWidth="0.5"
                                strokeOpacity={0.4}
                                strokeDasharray="1,1"
                            />
                            {/* Animated Particle */}
                            <circle r="0.5" fill={lineColor}>
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
                    const isSupplyExhausted = h.status === 'SUPPLY_EXHAUSTED' || h.has_supply_risk;
                    const isSaturated = h.status === 'SATURATED' || isSupplyExhausted;
                    const clusterColor = isSupplyExhausted ? (isLight ? '#9333ea' : '#c084fc') : isSaturated ? (isLight ? '#dc0000' : '#ef4444') : (isLight ? '#2563eb' : '#3b82f6');
                    return (
                        <circle 
                            key={h.region}
                            cx={pos.x} cy={pos.y}
                            r={3 + (h.pressure / 20)}
                            fill={clusterColor}
                            fillOpacity={isLight ? 0.15 : 0.1}
                            className={isSaturated ? 'animate-pulse' : ''}
                        />
                    );
                })}

                {/* Nodes */}
                {Array.isArray(mapState?.nodes) && mapState.nodes.map((node: any) => {
                    const pos = project(node.lat, node.lng);
                    const hasShortage = node.has_material_shortage || node.hasMaterialShortage;
                    const color = hasShortage ? (isLight ? '#9333ea' : '#c084fc') :
                                  node.status === 'ONLINE' ? (isLight ? '#059669' : '#10b981') : 
                                  node.status === 'DEGRADED' ? (isLight ? '#d97706' : '#f59e0b') : 
                                  node.status === 'OFFLINE' ? (isLight ? '#a1a1aa' : '#4b5563') : (isLight ? '#dc0000' : '#ef4444');

                    return (
                        <g key={node.id} className="cursor-pointer group/node" onClick={() => (window as any).openMachine?.(node.id)}>
                            {hasShortage && (
                                <circle 
                                    cx={pos.x} cy={pos.y} r="2.2" 
                                    fill={isLight ? '#9333ea' : '#c084fc'} 
                                    fillOpacity="0.3"
                                    className="animate-ping pointer-events-none"
                                />
                            )}
                            <circle 
                                cx={pos.x} cy={pos.y} r="0.8" 
                                fill={color} 
                                className="transition-all group-hover/node:r-1.5 shadow-lg"
                            />
                            <text 
                                x={pos.x} y={pos.y} 
                                dy="-2" 
                                textAnchor="middle" 
                                className={`text-[1.5px] font-black uppercase tracking-tighter opacity-0 group-hover/node:opacity-100 transition-opacity pointer-events-none ${isLight ? 'fill-zinc-900' : 'fill-white/60'}`}
                            >
                                {node.name} {hasShortage ? '(EXHAUSTED)' : ''}
                            </text>
                        </g>
                    );
                })}
            </svg>

            {/* Tactical HUD Overlay */}
            <div className="absolute top-4 left-4 sm:top-6 sm:left-6 flex flex-col gap-2 sm:gap-4 pointer-events-none max-w-[calc(100%-2rem)] z-20">
                <div className={`p-3 sm:p-4 backdrop-blur-md border rounded-none ${isLight ? 'bg-white/90 border-zinc-200' : 'bg-black/60 border-white/10'}`}>
                    <h2 className={`text-[8px] sm:text-[10px] font-black uppercase tracking-[0.3em] mb-2 sm:mb-4 ${isLight ? 'text-zinc-900' : 'text-white'}`}>Federation Dispatch Live</h2>
                    <div className="space-y-2 sm:space-y-3">
                        <div className="flex justify-between items-center gap-4 sm:gap-12">
                            <span className="text-[7px] sm:text-[8px] font-bold text-zinc-500 uppercase">Active Routes</span>
                            <span className={`text-xs font-black tabular-nums ${isLight ? 'text-[#dc0000]' : 'text-primary'}`}>{mapState?.summary?.active_dispatches || 0}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4 sm:gap-12">
                            <span className="text-[7px] sm:text-[8px] font-bold text-zinc-500 uppercase">Operational Nodes</span>
                            <span className={`text-xs font-black tabular-nums ${isLight ? 'text-emerald-600' : 'text-emerald-500'}`}>{mapState?.summary?.total_active_nodes || 0}</span>
                        </div>
                    </div>
                </div>

                <div className={`p-4 backdrop-blur-md border rounded-none ${isLight ? 'bg-white/90 border-zinc-200' : 'bg-black/60 border-white/10'}`}>
                    <h3 className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-3">Regional Pressure</h3>
                    <div className="space-y-2">
                        {Array.isArray(heatmap) && heatmap.slice(0, 4).map((h: any) => (
                            <div key={h.region} className="flex items-center gap-3">
                                <div className={`w-20 h-1 rounded-none overflow-hidden ${isLight ? 'bg-zinc-100' : 'bg-white/5'}`}>
                                    <div className={`h-full ${h.status === 'SUPPLY_EXHAUSTED' || h.has_supply_risk ? 'bg-purple-500' : 'bg-[#dc0000]'}`} style={{ width: `${h.pressure}%` }} />
                                </div>
                                <span className={`text-[7px] font-black uppercase w-12 ${isLight ? 'text-zinc-900' : 'text-white'}`}>{h.region}</span>
                                <span className={`text-[7px] font-black ${h.status === 'SUPPLY_EXHAUSTED' || h.has_supply_risk ? 'text-purple-400' : h.status === 'SATURATED' ? 'text-[#dc0000]' : 'text-zinc-500'}`}>{h.status === 'SUPPLY_EXHAUSTED' || h.has_supply_risk ? 'RISK' : `${h.pressure}%`}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className={`absolute bottom-4 right-4 sm:bottom-6 sm:right-6 flex flex-wrap items-center justify-end gap-3 sm:gap-6 p-2 sm:p-3 border rounded-none max-w-[calc(100%-2rem)] z-20 ${isLight ? 'bg-white/90 border-zinc-200' : 'bg-black/40 border-white/5'}`}>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-none ${isLight ? 'bg-emerald-600' : 'bg-emerald-500'}`} />
                    <span className="text-[6px] sm:text-[7px] font-black text-zinc-500 uppercase">Online</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-none ${isLight ? 'bg-amber-600' : 'bg-amber-500'}`} />
                    <span className="text-[6px] sm:text-[7px] font-black text-zinc-500 uppercase">Degraded</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-none ${isLight ? 'bg-[#dc0000]' : 'bg-red-500'}`} />
                    <span className="text-[6px] sm:text-[7px] font-black text-zinc-500 uppercase">Saturation</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-none ${isLight ? 'bg-purple-600' : 'bg-purple-500'}`} />
                    <span className="text-[6px] sm:text-[7px] font-black text-zinc-500 uppercase">Exhausted</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className={`w-2 sm:w-3 h-[1px] border-t border-dashed ${isLight ? 'border-[#dc0000]' : 'border-red-500/60'}`} />
                    <span className="text-[6px] sm:text-[7px] font-black text-zinc-500 uppercase">Active Route</span>
                </div>
            </div>

            {/* Corner Coordinates */}
            <div className={`absolute top-4 right-4 text-[6px] font-mono z-10 ${isLight ? 'text-zinc-400' : 'text-white/20'}`}>
                52.5200° N, 13.4050° E // VECTOR: FEDERATION-V1
            </div>
            <div className={`absolute bottom-4 left-4 text-[6px] font-mono z-10 ${isLight ? 'text-zinc-400' : 'text-white/20'}`}>
                INDUSTRIAL REAL-TIME ORCHESTRATION // PRINT-PRICE OS
            </div>
        </div>
    );
};
