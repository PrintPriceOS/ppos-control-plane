/**
 * src/ui/pages/admin/IndustrialMapTab.tsx
 * 
 * Visualization tab for the global federation dispatch map.
 */
import React, { useState } from 'react';
import { FederationMap } from '../../components/federation/FederationMap';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getRoutingLive, getRoutingMap } from '../../lib/adminApi';
import { toDisplayText } from '../../lib/formatters';
import { safeArray } from '../../lib/display';
import { useLocale } from '../../i18n';

export const IndustrialMapTab: React.FC = () => {
    const { t } = useLocale();
    const { data: liveData } = useAdminQuery('routing:live', getRoutingLive, 5000);
    const { data: mapState } = useAdminQuery('routing:map', getRoutingMap, 5000);
    const [isExpanded, setIsExpanded] = useState(false);

    const warnings = safeArray(mapState?.warnings ?? []);
    const sourceStatus = mapState?.source_status || '';
    const hasWarnings = warnings.length > 0 || sourceStatus === 'PARTIAL_COORDINATES' || sourceStatus === 'NO_COORDINATES_AVAILABLE';

    const safeDecisions = safeArray(liveData?.decisions ?? []);
    const nodes = safeArray(mapState?.nodes ?? []);
    const routes = safeArray(mapState?.routes ?? []);

    const avgScore = safeDecisions.length > 0
        ? Math.round(safeDecisions.reduce((acc: number, d: any) => acc + (Number(d?.routing_score) || 0), 0) / safeDecisions.length)
        : null;

    return (
        <div className="space-y-6">
            {/* Compact Telemetry Warning Strip */}
            {hasWarnings && (
                <div className="border-l-2 border-amber-500 bg-amber-500/5 border border-amber-500/20 rounded-none overflow-hidden transition-all">
                    <div
                        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-amber-500/10 transition-colors select-none"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 bg-amber-500 animate-pulse" />
                            <span className="text-[10px] font-black text-amber-500 uppercase tracking-wider">
                                {toDisplayText(sourceStatus).replace(/_/g, ' ')} — {warnings.length} {warnings.length === 1 ? (t('map.nodeExcluded') || 'nodo excluido del mapa geoespacial') : (t('map.nodesExcluded') || 'nodos excluidos del mapa geoespacial')}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[8px] font-bold text-amber-500/80 uppercase tracking-widest">
                                {isExpanded ? (t('map.collapseTelemetry') || 'Colapsar Telemetría') : (t('map.inspectExclusions') || 'Inspeccionar Exclusiones')}
                            </span>
                            <span className="text-[9px] font-mono text-amber-500 font-bold">
                                {isExpanded ? '▲' : '▼'}
                            </span>
                        </div>
                    </div>

                    {isExpanded && warnings.length > 0 && (
                        <div className="border-t border-amber-500/10 ppos-surface-muted divide-y divide-amber-500/10 max-h-60 overflow-y-auto custom-scrollbar">
                            {warnings.map((w: any, idx: number) => (
                                <div key={w?.id || idx} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[9px] font-mono">
                                    <div className="flex items-center gap-2">
                                        <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 font-bold text-[8px]">
                                            {toDisplayText(w?.type || w?.entityType || 'NODE')}
                                        </span>
                                        <span className="font-bold text-slate-800 dark:text-zinc-200">
                                            {toDisplayText(w?.name || 'Unknown')}
                                        </span>
                                        <span className="text-zinc-500 text-[8px]">
                                            ({toDisplayText(w?.id || w?.entityId || 'N/A')})
                                        </span>
                                    </div>
                                    <span className="text-amber-500/90 text-[8px] max-w-md truncate">
                                        {toDisplayText(w?.message || w?.reason || w)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                {/* Main Tactical Surface */}
                <div className="xl:col-span-3 min-h-[650px] flex flex-col">
                    <div className="flex-1 relative">
                        <FederationMap />
                    </div>
                </div>

                {/* Live Event Stream */}
                <div className="space-y-6">
                    <div className="border ppos-border ppos-card overflow-hidden flex flex-col h-[650px] rounded-none">
                        <div className="px-4 py-3 border-b ppos-border ppos-surface-muted flex items-center justify-between">
                            <div>
                                <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">
                                    {t('map.routingDecalog') || 'Decálogo de Enrutamiento'}
                                </h3>
                                <p className="text-[9px] text-zinc-500">
                                    {t('map.routingExplanation') || 'Historial de decisiones operativas de enrutamiento y asignación.'}
                                </p>
                            </div>
                            <div className="w-1.5 h-1.5 bg-primary animate-pulse" />
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {safeDecisions.map((d: any) => {
                                const safeDecId = d?.id ? String(d.id).substring(0, 8) : 'N/A';
                                return (
                                    <div key={d?.id || Math.random()} className="p-3 ppos-surface border ppos-border rounded-none">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-[8px] font-mono font-bold text-blue-500 uppercase tracking-tighter">#{safeDecId}</span>
                                            <span className="text-[9px] font-black text-emerald-500 uppercase">{toDisplayText(d?.routing_score)}%</span>
                                        </div>
                                        <p className="text-[10px] font-medium text-slate-700 dark:text-zinc-300 leading-relaxed mb-2">
                                            {toDisplayText(d?.explanation)}
                                        </p>
                                        <div className="flex justify-between items-center text-[8px] font-mono text-zinc-500 uppercase">
                                            <span>Nodo: {toDisplayText(d?.selected_machine_id || 'Auto')}</span>
                                            <span>{d?.created_at ? new Date(d.created_at).toLocaleTimeString() : ''}</span>
                                        </div>
                                    </div>
                                );
                            })}

                            {safeDecisions.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-zinc-400">
                                    <div className="w-8 h-8 border border-dashed ppos-border mb-3 rounded-none" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                                        Sin decisiones de enrutamiento recientes
                                    </span>
                                    <span className="text-[8px] text-zinc-400 mt-1 max-w-xs">
                                        Las decisiones se registrarán en tiempo real cuando se despachen trabajos a través de la federación.
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="p-3 border-t ppos-border ppos-surface-muted flex items-center justify-between text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                            <span>Decisiones en Sesión</span>
                            <span className="text-slate-900 dark:text-white font-bold">{safeDecisions.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Regional / Operational Stats backed by real data */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusCard 
                    label="Nodos de Federación" 
                    value={nodes.length > 0 ? String(nodes.length) : '0'} 
                    trend={nodes.length > 0 ? 'CONECTADO' : 'SIN NODOS'} 
                    explanation="Nodos de impresión activos en el clúster"
                />
                <StatusCard 
                    label="Eficacia de Enrutamiento" 
                    value={avgScore !== null ? `${avgScore}%` : '---'} 
                    trend={avgScore !== null ? 'CALCULADO' : 'A LA ESPERA'} 
                    explanation={avgScore !== null ? 'Puntuación media de despacho' : 'Requiere sesiones de enrutamiento activas'}
                />
                <StatusCard 
                    label="Rutas Activas" 
                    value={String(routes.length)} 
                    trend={routes.length > 0 ? 'EN CURSO' : 'INACTIVO'} 
                    explanation="Líneas de despacho transfronterizo activas"
                />
                <StatusCard 
                    label="Reducción de Carbono" 
                    value="---" 
                    trend="SIN CONFIGURAR" 
                    explanation="Requiere activación de telemetría de sostenibilidad"
                />
            </div>
        </div>
    );
};

const StatusCard = ({ label, value, trend, explanation }: { label: string, value: string, trend: string, explanation: string }) => {
    const isPositive = trend === 'CONECTADO' || trend === 'CALCULADO' || trend === 'EN CURSO';
    return (
        <div className="p-4 ppos-card border ppos-border rounded-none">
            <div className="flex justify-between items-start mb-2">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">{label}</span>
                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 ${isPositive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-500/10 text-zinc-500'}`}>
                    {trend}
                </span>
            </div>
            <div className="text-xl font-mono font-black text-slate-900 dark:text-white tabular-nums">{value}</div>
            <p className="text-[9px] text-zinc-500 dark:text-zinc-400 mt-1 truncate" title={explanation}>
                {explanation}
            </p>
        </div>
    );
};
