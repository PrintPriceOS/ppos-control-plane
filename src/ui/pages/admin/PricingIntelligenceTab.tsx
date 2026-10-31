import React, { useState, useEffect } from "react";
import {
    ArchiveBoxIcon,
    CalculatorIcon,
    TagIcon,
    ChartPieIcon
} from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";
import { useTheme } from "../../hooks/useTheme";
import { useLocale } from "../../i18n";
import {
    SharedModuleProps,
    TopSummaryKpiBar,
    HeaderActionGroup,
    IndustrialTable,
    StatusBadge
} from "../../components/common";

export const PricingIntelligenceTab: React.FC<SharedModuleProps> = ({
    mode = 'workspace',
    onNextStep,
    onPrevStep,
    printhouseId
}) => {
    const { locale } = useLocale();
    const [view, setView] = useState<'profiles' | 'routing'>('profiles');
    const [profiles, setProfiles] = useState<any[]>([]);
    const [routingHistory, setRoutingHistory] = useState<any[]>([]);
    const [conflicts, setConflicts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useTheme();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        printer_id: printhouseId || '',
        pricing_scope: 'PRINTER',
        target_margin_pct: 20,
        platform_markup_pct: 15,
        dynamic_routing_premium: 0,
        currency: 'EUR',
        minimum_job_fee: 50
    });

    const labels = {
        es: {
            title: 'Pricing Intelligence Engine',
            subtitle: 'Modela la economía de producción y gestiona márgenes.',
            tabProfiles: 'PROFILES',
            tabRouting: 'ROUTING DECISIONS',
            newProfile: 'NEW PROFILE',
            kpiProfiles: 'PRICING PROFILES',
            kpiNodes: 'ACTIVE NODES',
            kpiMarkup: 'AVG MARKUP',
            kpiHealth: 'ECONOMIC HEALTH',
            tableTitle: 'ACTIVE ECONOMIC PROFILES',
            emptyProfiles: 'NO PRICING PROFILES DEFINED',
            saveAndContinue: 'Guardar y Continuar'
        },
        de: {
            title: 'Pricing Intelligence Engine',
            subtitle: 'Produktionsökonomie modellieren und Margen steuern.',
            tabProfiles: 'PROFILES',
            tabRouting: 'ROUTING DECISIONS',
            newProfile: 'NEW PROFILE',
            kpiProfiles: 'PRICING PROFILES',
            kpiNodes: 'ACTIVE NODES',
            kpiMarkup: 'AVG MARKUP',
            kpiHealth: 'ECONOMIC HEALTH',
            tableTitle: 'ACTIVE ECONOMIC PROFILES',
            emptyProfiles: 'NO PRICING PROFILES DEFINED',
            saveAndContinue: 'Speichern & Weiter'
        },
        en: {
            title: 'Pricing Intelligence Engine',
            subtitle: 'Model production economics and manage margins.',
            tabProfiles: 'PROFILES',
            tabRouting: 'ROUTING DECISIONS',
            newProfile: 'NEW PROFILE',
            kpiProfiles: 'PRICING PROFILES',
            kpiNodes: 'ACTIVE NODES',
            kpiMarkup: 'AVG MARKUP',
            kpiHealth: 'ECONOMIC HEALTH',
            tableTitle: 'ACTIVE ECONOMIC PROFILES',
            emptyProfiles: 'NO PRICING PROFILES DEFINED',
            saveAndContinue: 'Save & Continue'
        }
    }[locale === 'es' ? 'es' : locale === 'de' ? 'de' : 'en'];

    useEffect(() => {
        if (view === 'profiles') fetchProfiles();
        if (view === 'routing') fetchRoutingData();
    }, [view]);

    const handleCreateProfile = async () => {
        if (!formData.printer_id) return;
        setIsSaving(true);
        try {
            await adminApi.createPricingProfile(formData);
            setIsModalOpen(false);
            fetchProfiles();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const fetchRoutingData = async () => {
        setLoading(true);
        try {
            const [historyData, conflictData] = await Promise.all([
                adminApi.getEconomicRoutingHistory(),
                adminApi.getEconomicRoutingConflicts()
            ]);
            setRoutingHistory(Array.isArray(historyData) ? historyData : []);
            setConflicts(Array.isArray(conflictData) ? conflictData : []);
        } catch (err: any) {
            setError(err.message);
            setRoutingHistory([]);
            setConflicts([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const data = await adminApi.getPricingProfiles();
            setProfiles(Array.isArray(data) ? data : []);
        } catch (err: any) {
            setError(err.message);
            setProfiles([]);
        } finally {
            setLoading(false);
        }
    };

    const safeProfiles = Array.isArray(profiles) ? profiles : [];
    const safeRoutingHistory = Array.isArray(routingHistory) ? routingHistory : [];
    const safeConflicts = Array.isArray(conflicts) ? conflicts : [];

    return (
        <div
            data-testid="pricing-intelligence-engine"
            data-mode={mode}
            className="space-y-6 font-manrope"
        >
            {/* Canonical Dark Industrial Header */}
            <HeaderActionGroup
                title={labels.title}
                subtitle={labels.subtitle}
                mode={mode}
                tabs={[
                    { id: 'profiles', label: labels.tabProfiles },
                    { id: 'routing', label: labels.tabRouting }
                ]}
                activeTabId={view}
                onTabChange={(id) => setView(id as 'profiles' | 'routing')}
                primaryActionLabel={labels.newProfile}
                onPrimaryAction={() => setIsModalOpen(true)}
            />

            {/* Error Indicator */}
            {error && (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-800 text-red-400 text-xs font-mono">
                    Error: {error}
                </div>
            )}

            {/* Create Profile Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="rounded-xl p-8 max-w-md w-full border transition-all bg-white dark:bg-[#14161a] border-slate-200 dark:border-[#1f2228] text-slate-900 dark:text-white">
                        <h3 className="text-xl font-black mb-6">Create Pricing Profile</h3>
                        <div className="space-y-4 font-mono">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest mb-1 text-slate-400">Printhouse ID</label>
                                <input
                                    type="text"
                                    value={formData.printer_id}
                                    onChange={e => setFormData({ ...formData, printer_id: e.target.value })}
                                    className="w-full px-4 py-3 rounded-lg border text-sm font-bold outline-none transition-all bg-slate-100/50 dark:bg-[#0a0b0d] text-slate-900 dark:text-white border-slate-200 dark:border-[#1f2228]"
                                    placeholder="e.g. adv-2025"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1 text-slate-400">Target Margin (%)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData.target_margin_pct}
                                        onChange={e => setFormData({ ...formData, target_margin_pct: parseFloat(e.target.value) })}
                                        className="w-full px-4 py-3 rounded-lg border text-sm font-bold outline-none transition-all bg-slate-100/50 dark:bg-[#0a0b0d] text-slate-900 dark:text-white border-slate-200 dark:border-[#1f2228]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1 text-slate-400">Platform Markup (%)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData.platform_markup_pct}
                                        onChange={e => setFormData({ ...formData, platform_markup_pct: parseFloat(e.target.value) })}
                                        className="w-full px-4 py-3 rounded-lg border text-sm font-bold outline-none transition-all bg-slate-100/50 dark:bg-[#0a0b0d] text-slate-900 dark:text-white border-slate-200 dark:border-[#1f2228]"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1 text-slate-400">Dynamic Routing Premium (%)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData.dynamic_routing_premium}
                                        onChange={e => setFormData({ ...formData, dynamic_routing_premium: parseFloat(e.target.value) })}
                                        className="w-full px-4 py-3 rounded-lg border text-sm font-bold outline-none transition-all bg-slate-100/50 dark:bg-[#0a0b0d] text-slate-900 dark:text-white border-slate-200 dark:border-[#1f2228]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1 text-slate-400">Min. Job Fee</label>
                                    <input
                                        type="number"
                                        value={formData.minimum_job_fee}
                                        onChange={e => setFormData({ ...formData, minimum_job_fee: parseFloat(e.target.value) })}
                                        className="w-full px-4 py-3 rounded-lg border text-sm font-bold outline-none transition-all bg-slate-100/50 dark:bg-[#0a0b0d] text-slate-900 dark:text-white border-slate-200 dark:border-[#1f2228]"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8 font-sans">
                            <button
                                onClick={handleCreateProfile}
                                disabled={isSaving || !formData.printer_id}
                                className="flex-1 py-3 rounded-lg font-black uppercase text-xs tracking-widest disabled:opacity-50 transition-all bg-white text-black hover:bg-slate-200 cursor-pointer"
                            >
                                {isSaving ? 'Saving...' : 'Save Profile'}
                            </button>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-6 py-3 border rounded-lg font-black uppercase text-xs tracking-widest transition-all border-slate-200 dark:border-[#1f2228] text-slate-400 hover:bg-white/5 cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Canonical 4-Card Top Summary KPI Bar */}
            <TopSummaryKpiBar
                items={[
                    {
                        id: 'pricing-profiles',
                        label: labels.kpiProfiles,
                        value: safeProfiles.length,
                        icon: ArchiveBoxIcon,
                        accent: 'blue'
                    },
                    {
                        id: 'active-nodes',
                        label: labels.kpiNodes,
                        value: safeProfiles.filter(p => p.active).length,
                        icon: TagIcon,
                        accent: 'emerald'
                    },
                    {
                        id: 'avg-markup',
                        label: labels.kpiMarkup,
                        value: '35%',
                        icon: CalculatorIcon,
                        accent: 'amber'
                    },
                    {
                        id: 'economic-health',
                        label: labels.kpiHealth,
                        value: '92%',
                        icon: ChartPieIcon,
                        accent: 'rose'
                    }
                ]}
            />

            {/* Conditional Views */}
            {view === 'profiles' ? (
                <IndustrialTable
                    title={labels.tableTitle}
                    loading={loading}
                    onRefresh={fetchProfiles}
                    data={safeProfiles}
                    emptyEntityName="PRICING PROFILES"
                    emptyMessage={labels.emptyProfiles}
                    columns={[
                        {
                            key: 'printer',
                            header: 'PRINTER / MACHINE',
                            render: (p) => (
                                <div>
                                    <div className="font-bold text-slate-900 dark:text-white">{p.printer_name}</div>
                                    <div className="text-[10px] uppercase font-bold text-slate-400">
                                        {p.machine_nickname || 'Printer-wide'}
                                    </div>
                                </div>
                            )
                        },
                        {
                            key: 'scope',
                            header: 'SCOPE',
                            render: (p) => (
                                <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${p.pricing_scope === 'MACHINE'
                                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                            : 'bg-blue-500/10 text-[#3b82f6] border border-blue-500/20'
                                        }`}
                                >
                                    {p.pricing_scope}
                                </span>
                            )
                        },
                        {
                            key: 'target_margin_pct',
                            header: 'TARGET MARGIN',
                            render: (p) => (
                                <span className="font-mono font-black text-xs text-slate-900 dark:text-white">
                                    {p.target_margin_pct}%
                                </span>
                            )
                        },
                        {
                            key: 'platform_markup_pct',
                            header: 'MARKUP',
                            render: (p) => (
                                <span className="font-mono font-black text-xs text-[#f59e0b]">
                                    {p.platform_markup_pct}%
                                </span>
                            )
                        },
                        {
                            key: 'minimum_job_fee',
                            header: 'MIN. FEE',
                            render: (p) => (
                                <span className="font-mono font-black text-xs text-slate-900 dark:text-white">
                                    {p.minimum_job_fee} {p.currency}
                                </span>
                            )
                        },
                        {
                            key: 'status',
                            header: 'STATUS',
                            render: (p) => <StatusBadge status={p.active ? 'ACTIVE' : 'INACTIVE'} />
                        },
                        {
                            key: 'actions',
                            header: 'ACTIONS',
                            align: 'right',
                            render: () => (
                                <button className="text-[10px] font-black uppercase text-[#3b82f6] hover:underline cursor-pointer">
                                    EDIT
                                </button>
                            )
                        }
                    ]}
                />
            ) : (
                <div className="space-y-6">
                    <IndustrialTable
                        title="ECONOMIC ROUTING DECISIONS"
                        loading={loading}
                        onRefresh={fetchRoutingData}
                        data={safeRoutingHistory}
                        emptyEntityName="ROUTING DECISIONS"
                        columns={[
                            {
                                key: 'job',
                                header: 'TASK / JOB',
                                render: (h) => (
                                    <div>
                                        <div className="font-bold text-slate-900 dark:text-white">{h.job_name}</div>
                                        <div className="text-[10px] font-mono font-black text-slate-400">{h.job_id}</div>
                                    </div>
                                )
                            },
                            {
                                key: 'node',
                                header: 'SELECTED NODE',
                                render: (h) => (
                                    <span className="font-bold text-slate-900 dark:text-white">
                                        {h.final_decision_json?.printer_name || 'N/A'}
                                    </span>
                                )
                            },
                            {
                                key: 'score',
                                header: 'FINAL SCORE',
                                render: (h) => {
                                    const score = h.final_decision_json?.final_routing_score ?? 0;
                                    return (
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-black text-slate-900 dark:text-white">{score}</span>
                                            <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#10b981]" style={{ width: `${score}%` }} />
                                            </div>
                                        </div>
                                    );
                                }
                            },
                            {
                                key: 'margin',
                                header: 'ESTIMATED MARGIN',
                                render: (h) => (
                                    <div>
                                        <div className="font-mono font-black text-xs text-[#10b981]">
                                            {h.final_decision_json?.margin_pct ?? 0}%
                                        </div>
                                        <div className="font-mono text-[10px] text-slate-400">
                                            +{h.final_decision_json?.estimated_margin ?? 0} EUR
                                        </div>
                                    </div>
                                )
                            },
                            {
                                key: 'date',
                                header: 'DECISION DATE',
                                render: (h) => (
                                    <span className="font-mono text-[10px] text-slate-400">
                                        {h.created_at ? new Date(h.created_at).toLocaleString() : '—'}
                                    </span>
                                )
                            }
                        ]}
                    />

                    {/* Conflict Inspector */}
                    <div className="rounded-xl border overflow-hidden transition-all bg-white dark:bg-[#14161a] border-slate-200 dark:border-[#1f2228]">
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-rose-950/20 border-rose-900/40">
                            <h3 className="font-black text-xs uppercase tracking-widest text-rose-400 m-0">
                                Economic Conflict Inspector
                            </h3>
                        </div>
                        <div className="divide-y divide-rose-950/20">
                            {safeConflicts.map((c, i) => (
                                <div key={i} className="px-6 py-4 flex items-start gap-4">
                                    <div className="mt-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase text-rose-400">{c.conflict_type}</span>
                                            <span className="text-[10px] font-bold text-slate-400">• {c.job_name}</span>
                                        </div>
                                        <p className="text-xs mt-0.5 text-slate-900 dark:text-white">{c.conflict_description}</p>
                                    </div>
                                </div>
                            ))}
                            {safeConflicts.length === 0 && (
                                <div className="px-6 py-8 text-center uppercase font-black text-xs tracking-widest text-slate-400">
                                    No economic conflicts detected
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Onboarding Mode Footer CTA */}
            {mode === 'onboarding' && (
                <div
                    data-testid="onboarding-step-footer"
                    className="pt-4 border-t border-slate-200 dark:border-[#1f2228] flex items-center justify-between"
                >
                    {onPrevStep ? (
                        <button
                            type="button"
                            onClick={onPrevStep}
                            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-[#1f2228] text-xs font-black uppercase tracking-wider text-slate-400 hover:text-white cursor-pointer"
                        >
                            Back
                        </button>
                    ) : (
                        <span />
                    )}
                    <button
                        type="button"
                        data-testid="onboarding-save-continue-btn"
                        onClick={onNextStep}
                        className="px-5 py-2.5 rounded-full bg-[#dc2626] hover:bg-[#e11d48] text-white text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                    >
                        {labels.saveAndContinue}
                    </button>
                </div>
            )}
        </div>
    );
};
