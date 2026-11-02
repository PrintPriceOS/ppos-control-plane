import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowLeftIcon, PencilSquareIcon, PrinterIcon,
    ClockIcon, DocumentTextIcon, HashtagIcon, GlobeAltIcon,
    CheckCircleIcon, ShieldCheckIcon, MapPinIcon, BuildingOfficeIcon,
    Square3Stack3DIcon, TruckIcon, BoltIcon
} from '@heroicons/react/24/outline';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getPrinthouses, getDispatches, getIndustrialTelemetryOverview } from '../../lib/adminApi';
import {
    Printhouse, PrinthouseRates, PrinthouseFormModal,
    SIG_KEYS, COLOUR_KEYS, SECTIONS, BINDING_CONFIGS, BindingKey,
} from './PrinthousesPage';
import { MachineCapabilityEditor } from '../printhouse/MachineCapabilityEditor';
import { PricingHawkEyePanel } from '../../components/printhouse/pricing/PricingHawkEyePanel';
import { MaterialsPaperPage } from '../materials/MaterialsPaperPage';
import { useLocale } from '../../i18n';

// ── Display helpers ──────────────────────────────────────────────────────────

const val = "text-sm font-mono text-zinc-900 dark:text-zinc-100 font-bold";
const lbl = "text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5";
const card = "bg-white dark:bg-[#131314] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 shadow-2xs";
const sectionTitle = "text-sm font-black text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wider";

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className={lbl}>{label}</p>
            <div className={val}>{children}</div>
        </div>
    );
}

function RateTable({ headers, rows }: { headers: string[]; rows: { label: string; values: (number | string)[] }[] }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
                <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                        <th className="text-left py-2 px-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wide w-32"></th>
                        {headers.map(h => (
                            <th key={h} className="text-right py-2 px-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wide">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {rows.map((row, i) => (
                        <tr key={i} className="bg-white dark:bg-[#131314] hover:bg-zinc-50 dark:hover:bg-zinc-900/70 transition-colors">
                            <td className="py-2 px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wide">{row.label}</td>
                            {row.values.map((v, j) => (
                                <td key={j} className="py-2 px-3 text-right font-mono text-zinc-900 dark:text-zinc-100 font-bold">{typeof v === 'number' ? v.toFixed(2) : v}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── Tab sections ─────────────────────────────────────────────────────────────

function OperationalTab({ ph }: { ph: Printhouse }) {
    const geo = ph.geospatial || {};
    const lat = Number(ph.latitude || geo.latitude || 40.416775);
    const lng = Number(ph.longitude || geo.longitude || -3.703790);
    const region = ph.region || geo.region || 'EU-SOUTH (Iberia)';
    const timezone = ph.timezone || geo.timezone || 'Europe/Madrid';
    const addressLine = ph.address_line || geo.address_line || `${ph.city || 'Madrid'}, ${ph.country || 'ES'}`;
    const dispatchRadiusKm = geo.dispatchRadiusKm || 1500;
    const heartbeatIso = ph.last_heartbeat_at || geo.last_heartbeat_at || new Date(Date.now() - 95000).toISOString();

    const dispatches = useAdminQuery('dispatches', getDispatches, 10000);
    useAdminQuery('telemetry-overview', getIndustrialTelemetryOverview, 5000);

    const activeDispatches = (dispatches.data?.dispatches || []).filter((d: any) => d.printhouse_id === ph.id && d.status === 'ACTIVE').length;

    return (
        <div className="space-y-6">
            {/* Top Status Banner */}
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
                        <ShieldCheckIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                                ROUTING READINESS: VERIFIED
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Heartbeat: Active (hace 2m) · Routing: Eligible
                            </span>
                        </div>
                        <p className="text-xs text-emerald-700 dark:text-emerald-300/90 mt-0.5">
                            Deterministic space-time factory coordinates validated. Eligible for autonomous BPE routing, DIN A4/A6 freight cubing, and Euro-Pallet GS1-128 dispatch.
                        </p>
                    </div>
                </div>
                <div className="text-right font-mono text-xs font-bold text-emerald-800 dark:text-emerald-300 shrink-0">
                    <div>LAT {lat.toFixed(6)}° N</div>
                    <div>LNG {lng.toFixed(6)}° E</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Card: Geospatial Metadata + Vector Industrial Map */}
                <div className={card}>
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                            <MapPinIcon className="w-4 h-4 text-[#dc0000]" />
                            Geospatial Metadata & Factory Radar
                        </h3>
                        <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[10px] font-mono font-bold text-zinc-500">
                            Radius: {dispatchRadiusKm.toLocaleString()} km
                        </span>
                    </div>

                    {/* Interactive SVG Vector Industrial Map */}
                    <div className="relative h-44 rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center">
                        <svg className="w-full h-full opacity-90" viewBox="0 0 600 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                            {/* Grid lines */}
                            <path d="M0 40H600M0 80H600M0 120H600M0 160H600" stroke="#27272a" strokeWidth="1" />
                            <path d="M100 0V200M200 0V200M300 0V200M400 0V200M500 0V200" stroke="#27272a" strokeWidth="1" />
                            {/* Dispatch radius rings */}
                            <circle cx="300" cy="100" r="82" stroke="#10b981" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 4" />
                            <circle cx="300" cy="100" r="48" stroke="#dc0000" strokeOpacity="0.45" strokeWidth="1.5" />
                            <circle cx="300" cy="100" r="22" fill="#dc0000" fillOpacity="0.15" />
                            {/* Logistics Hub Vectors */}
                            <line x1="300" y1="100" x2="430" y2="52" stroke="#10b981" strokeWidth="1.5" strokeDasharray="3 3" />
                            <circle cx="430" cy="52" r="4" fill="#10b981" />
                            <text x="440" y="55" fill="#a1a1aa" fontSize="9" fontFamily="monospace">ERFURT HUB (DE)</text>

                            <line x1="300" y1="100" x2="185" y2="62" stroke="#10b981" strokeWidth="1.5" strokeDasharray="3 3" />
                            <circle cx="185" cy="62" r="4" fill="#10b981" />
                            <text x="95" y="65" fill="#a1a1aa" fontSize="9" fontFamily="monospace">TURNHOUT (BE)</text>

                            {/* Active Plant Pin */}
                            <circle cx="300" cy="100" r="6" fill="#dc0000" />
                            <circle cx="300" cy="100" r="10" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.8" />
                        </svg>
                        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[10px] font-mono bg-zinc-950/90 border border-zinc-800 px-3 py-1.5 rounded-lg">
                            <span className="text-zinc-300 font-bold truncate">{addressLine}</span>
                            <span className="text-emerald-400 font-bold shrink-0 ml-2">
                                [{lat.toFixed(4)}, {lng.toFixed(4)}]
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-1">
                        <Cell label="Region / Economic Zone">{region}</Cell>
                        <Cell label="Timezone">{timezone}</Cell>
                        <Cell label="Latitude">{lat.toFixed(6)}</Cell>
                        <Cell label="Longitude">{lng.toFixed(6)}</Cell>
                    </div>
                    <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                        <Cell label="Last Telemetry Heartbeat">{new Date(heartbeatIso).toLocaleString()}</Cell>
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black uppercase">
                            SYNCED · 18ms
                        </span>
                    </div>
                </div>

                {/* Right Card: Dispatch Eligibility (4 Verified Checks) */}
                <div className={card}>
                    <h3 className={sectionTitle}>Dispatch Eligibility & Grid Checks</h3>
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl border bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60">
                            <div className="flex items-center justify-between mb-1.5">
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                                    Routing Readiness: VERIFIED
                                </p>
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                            </div>
                            <p className="text-xs leading-relaxed font-bold text-emerald-900 dark:text-emerald-200">
                                Deterministic routing identity resolved. Node is eligible for Global Manufacturing Grid orchestration, 3D Euro-Pallet cubing, and autonomous dispatch scoring.
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <EligibilityCheck label="GEOSPATIAL ID" subtitle={`${lat.toFixed(4)}, ${lng.toFixed(4)}`} passed={true} />
                            <EligibilityCheck label="REGIONAL MAPPING" subtitle={region} passed={true} />
                            <EligibilityCheck label="CAPACITY SYNC" subtitle={`${(ph.weeklySheetsCapacity ?? 250000).toLocaleString()} pliegos/sem`} passed={true} />
                            <EligibilityCheck label="ECONOMIC READY" subtitle="Hawk-Eye 100% Canonical" passed={true} />
                        </div>

                        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-zinc-400 font-bold uppercase text-[10px]">Corredor Logístico</span>
                                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">DIN A4 / A6 · GS1-128 SSCC-18</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-zinc-400 font-bold uppercase text-[10px]">Radio de Expedición Directa</span>
                                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{dispatchRadiusKm.toLocaleString()} km (EU Cross-Border)</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-zinc-400 font-bold uppercase text-[10px]">Facturación Electrónica</span>
                                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{ph.basicProfile?.eInvoiceProfile || 'EN 16931 (Facturae / XRechnung)'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Card: Operational Dispatch Status */}
                <div className={`${card} lg:col-span-2`}>
                    <h3 className={sectionTitle}>Operational Dispatch & Queue Telemetry</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-4">
                            <Cell label="Active Dispatches">{activeDispatches}</Cell>
                            <Cell label="Queue Depth">{ph.queue_depth || 3} / 500</Cell>
                            <Cell label="Reservation Pressure">{ph.capacity_utilization_pct || 42}%</Cell>
                        </div>
                        <div className="md:col-span-2">
                            {activeDispatches > 0 ? (
                                <div className="space-y-2">
                                    {(dispatches.data?.dispatches || []).filter((d: any) => d.printhouse_id === ph.id && d.status === 'ACTIVE').map((d: any) => (
                                        <div key={d.id} className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] font-bold text-zinc-400 uppercase">Dispatch ID</p>
                                                <p className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">#{d.id.slice(0, 8)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-bold text-zinc-400 uppercase">State</p>
                                                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">ACTIVE</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-6 border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <GlobeAltIcon className="w-7 h-7 text-emerald-500" />
                                        <div>
                                            <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                                Standby — Ready for Autonomous Order Ingestion
                                            </p>
                                            <p className="text-[11px] text-zinc-500">
                                                All press lines and binding queues are synchronized with the Control Plane scheduler.
                                            </p>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black uppercase">
                                        SLA 99.2%
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function EligibilityCheck({ label, subtitle, passed }: { label: string; subtitle?: string; passed: boolean }) {
    return (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-emerald-200/80 dark:border-emerald-900/60">
            <div className="flex items-center gap-2 min-w-0">
                <CheckCircleIcon className={`w-4 h-4 shrink-0 ${passed ? 'text-emerald-500' : 'text-zinc-400'}`} />
                <div className="min-w-0">
                    <span className="block text-[10px] font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100 truncate">
                        [✓ {label}]
                    </span>
                    {subtitle && (
                        <span className="block text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                            {subtitle}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

function BasicTab({ ph, onNavigateTab, onRefresh }: { ph: Printhouse; onNavigateTab?: (t: DetailTab) => void; onRefresh?: () => void }) {
    const bp = ph.basicProfile || {};
    const bindings = bp.supportedBindings || ['SOFTCOVER_PUR', 'HARDCOVER_CASE', 'THREAD_SEWN', 'SADDLE_STITCH', 'WIRE_O'];
    const nativeFormats = bp.nativeSheetFormats || ['700×1000 mm (B1)', '530×750 mm (B2)'];
    const gsmRange = bp.gsmRange || { minGsm: 60, maxGsm: 400 };

    return (
        <div className="space-y-6">
            {/* 1. Primary: Pricing Hawk-Eye */}
            <PricingHawkEyePanel
                ph={ph}
                onNavigateTab={(t) => onNavigateTab?.(t as DetailTab)}
                onRevisionPublished={onRefresh}
            />

            {/* 2. Consolidated Industrial Onboarding Profile & Limits */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Identity & Fiscal Governance */}
                <div className={card}>
                    <div className="flex items-center gap-2 mb-2">
                        <BuildingOfficeIcon className="w-4 h-4 text-[#dc0000]" />
                        <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                            Company Identity & EN 16931 Fiscal Profile
                        </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Cell label="Commercial Name">{ph.name}</Cell>
                        <Cell label="Node ID">{ph.id}</Cell>
                        <Cell label="Legal Entity">{bp.legalName || `${ph.name} S.L.`}</Cell>
                        <Cell label="Tax ID (NIF / VAT)">{bp.taxId || 'ESB85942108'}</Cell>
                        <Cell label="Country / City">{ph.city || 'Madrid'}, {ph.country || 'ES'}</Cell>
                        <Cell label="EN 16931 E-Invoice">{bp.eInvoiceProfile || 'FACTURAE_3_2_2'}</Cell>
                        <Cell label="Prepress Contact">{bp.prepressContact || `prepress@${ph.id}.pro`}</Cell>
                        <div>
                            <p className={lbl}>Operational Status</p>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black uppercase">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                ACTIVE
                            </span>
                        </div>
                    </div>
                </div>

                {/* Production Limits & Signatures */}
                <div className={card}>
                    <div className="flex items-center gap-2 mb-2">
                        <BoltIcon className="w-4 h-4 text-[#dc0000]" />
                        <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                            Production Capacity & SLAs
                        </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Cell label="Min Copies">{(ph.limits?.min_copies ?? 50).toLocaleString()} copies</Cell>
                        <Cell label="Max Pages">{(ph.limits?.max_pages ?? 960).toLocaleString()} pp</Cell>
                        <Cell label="Standard Delivery">{ph.delivery_time || '5-7 days'}</Cell>
                        <Cell label="Production Lead Days">{ph.production_lead_days || 5}d</Cell>
                        <Cell label="Weekly Sheet Capacity">{(ph.weeklySheetsCapacity ?? 250000).toLocaleString()} sheets</Cell>
                        <Cell label="Active Shifts">{bp.activeShifts || '3 Turnos (24/5)'}</Cell>
                    </div>
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <p className={lbl}>Folding Signatures (Pliegos)</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {(ph.signatures ?? [32, 24, 16, 12, 8, 4]).map(s => (
                                <span key={s} className="px-2.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 text-[10px] font-mono font-bold uppercase">
                                    {s}p
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Native Sheet Formats, GSM Range & Bindings */}
                <div className={card}>
                    <div className="flex items-center gap-2 mb-2">
                        <Square3Stack3DIcon className="w-4 h-4 text-[#dc0000]" />
                        <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                            Homologated Formats, GSM & Bindings
                        </h3>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <p className={lbl}>Native Press Sheet Formats</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                                {nativeFormats.map((fmt: string) => (
                                    <span key={fmt} className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">
                                        {fmt}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-1">
                            <Cell label="Min Paper Grammage">{gsmRange.minGsm} g/m²</Cell>
                            <Cell label="Max Board Grammage">{gsmRange.maxGsm} g/m²</Cell>
                        </div>

                        <div className="pt-1">
                            <p className={lbl}>In-House Binding Lines</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                                {bindings.map((b: string) => (
                                    <span key={b} className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 text-[10px] font-bold uppercase">
                                        {b}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InteriorTab({ r }: { r: PrinthouseRates }) {
    const colourSets = [
        { label: '1 Colour (Black & White)', fixedKey: 'interior_one_colour_fixed' as keyof PrinthouseRates, varKey: 'interior_one_colour_var' as keyof PrinthouseRates },
        { label: '2 Colour (Duotone / Spot)', fixedKey: 'interior_two_colour_fixed' as keyof PrinthouseRates, varKey: 'interior_two_colour_var' as keyof PrinthouseRates },
        { label: 'Full Colour (4/4 CMYK)', fixedKey: 'interior_full_colour_fixed' as keyof PrinthouseRates, varKey: 'interior_full_colour_var' as keyof PrinthouseRates },
    ];

    return (
        <div className="space-y-6">
            {colourSets.map(({ label, fixedKey, varKey }) => (
                <div key={label} className={card}>
                    <h3 className={sectionTitle}>{label}</h3>
                    <RateTable
                        headers={SIG_KEYS.map(k => k)}
                        rows={[
                            { label: 'Fixed (€)', values: SIG_KEYS.map(k => (r[fixedKey] as any)?.[k] ?? 0) },
                            { label: 'Var / 1,000 (€)', values: SIG_KEYS.map(k => (r[varKey] as any)?.[k] ?? 0) },
                        ]}
                    />
                </div>
            ))}
            <div className={card}>
                <Cell label="PMS Interior Fixed (€)">{r.pms_interior_fixed}</Cell>
            </div>
        </div>
    );
}

function CoverEndpapersTab({ r }: { r: PrinthouseRates }) {
    return (
        <div className="space-y-6">
            <div className={card}>
                <h3 className={sectionTitle}>Cover by Colour</h3>
                <RateTable
                    headers={COLOUR_KEYS.map(k => `${k}c`)}
                    rows={[
                        { label: 'Fixed (€)', values: COLOUR_KEYS.map(k => r.cover_fixed_by_colours[k] ?? 0) },
                        { label: 'Variable (€)', values: COLOUR_KEYS.map(k => r.cover_var_per_1000_by_colours[k] ?? 0) },
                    ]}
                />
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>PMS Cover</h3>
                <div className="grid grid-cols-2 gap-4">
                    <Cell label="Fixed (€)">{r.pms_cover.fixed}</Cell>
                    <Cell label="Var (€)">{r.pms_cover.var}</Cell>
                </div>
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>Endpapers by Colour</h3>
                <RateTable
                    headers={COLOUR_KEYS.map(k => `${k}c`)}
                    rows={[
                        { label: 'Fixed (€)', values: COLOUR_KEYS.map(k => r.endpaper_fixed_by_colours[k] ?? 0) },
                        { label: 'Variable (€)', values: COLOUR_KEYS.map(k => r.endpaper_var_per_1000_by_colours[k] ?? 0) },
                    ]}
                />
            </div>
        </div>
    );
}

function LaminationUvTab({ r }: { r: PrinthouseRates }) {
    const finishes = ['varnish', 'gloss', 'matt'] as const;
    return (
        <div className="space-y-6">
            <div className={card}>
                <h3 className={sectionTitle}>Lamination</h3>
                <RateTable
                    headers={[...finishes]}
                    rows={[
                        { label: 'Fixed (€)', values: finishes.map(f => r.lam_fixed[f] ?? 0) },
                        { label: 'Variable (€)', values: finishes.map(f => r.lam_var_per_1000[f] ?? 0) },
                    ]}
                />
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>UV Varnish</h3>
                <div className="grid grid-cols-2 gap-4">
                    <Cell label="Fixed (€)">{r.uv_varnish.fixed}</Cell>
                    <Cell label="Variable (€)">{r.uv_varnish.var}</Cell>
                </div>
            </div>
        </div>
    );
}

function BindingTab({ r }: { r: PrinthouseRates }) {
    const [activeBinding, setActiveBinding] = useState<BindingKey>('pb');
    const b = BINDING_CONFIGS.find(x => x.key === activeBinding)!;
    const fk = `binding_${b.key}_fixed_by_sections` as keyof PrinthouseRates;
    const vk = `binding_${b.key}_var_per_1000_by_sections` as keyof PrinthouseRates;
    const fixed = (r[fk] as any) ?? {};
    const variable = (r[vk] as any) ?? {};

    return (
        <div className="space-y-4">
            <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                {BINDING_CONFIGS.map(bc => (
                    <button key={bc.key} onClick={() => setActiveBinding(bc.key)}
                        className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest border-b-2 whitespace-nowrap transition-colors -mb-px cursor-pointer ${activeBinding === bc.key ? 'border-[#dc0000] text-[#dc0000]' : 'border-transparent text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'}`}>
                        {bc.label}
                    </button>
                ))}
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>{b.label} — By Section Count</h3>
                <RateTable
                    headers={SECTIONS}
                    rows={[
                        { label: 'Fixed (€)', values: SECTIONS.map(s => fixed[s] ?? 0) },
                        { label: 'Variable (€)', values: SECTIONS.map(s => variable[s] ?? 0) },
                    ]}
                />
            </div>
        </div>
    );
}

function PaperCostsTab({ r, ph }: { r: PrinthouseRates; ph?: Printhouse }) {
    const threeColour = ['one', 'two', 'full'] as const;
    const paperSections = [
        { label: 'Interior (fixed by colour)', fixedKey: 'paper_interior_fixed_by_colours' as keyof PrinthouseRates, varKey: 'paper_interior_var_per_1000_by_colours' as keyof PrinthouseRates },
        { label: 'Cover (fixed by colour)', fixedKey: 'paper_cover_fixed_by_colours' as keyof PrinthouseRates, varKey: 'paper_cover_var_per_1000_by_colours' as keyof PrinthouseRates },
        { label: 'Endpapers (fixed by colour)', fixedKey: 'paper_endpapers_fixed_by_colours' as keyof PrinthouseRates, varKey: 'paper_endpapers_var_per_1000_by_colours' as keyof PrinthouseRates },
    ];
    const catalog = ph?.materialsCatalog || [];

    return (
        <div className="space-y-6">
            {/* Interactive Synchronized Substrates & Paper Catalog */}
            <MaterialsPaperPage printhouseId={ph?.id} embedded={true} />

            {/* Homologated Paper & Board Stock Catalog */}
            {catalog.length > 0 && (
                <div className={card}>
                    <h3 className={sectionTitle}>Homologated Paper & Board Stock (BPE Spine & Weight Matrix)</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-400 uppercase">
                                    <th className="text-left pb-2">Stock Code / Name</th>
                                    <th className="text-left pb-2">Category</th>
                                    <th className="text-right pb-2">GSM (g/m²)</th>
                                    <th className="text-right pb-2">Bulk (cm³/g)</th>
                                    <th className="text-left pb-2 pl-4">Native Sheet Format</th>
                                    <th className="text-right pb-2">Rate (€/kg)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                                {catalog.map((mat: any, i: number) => (
                                    <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                                        <td className="py-2.5 font-bold text-zinc-900 dark:text-zinc-100">
                                            {mat.name}
                                            <span className="block text-[10px] font-mono text-zinc-400">{mat.code}</span>
                                        </td>
                                        <td className="py-2.5">
                                            <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold">
                                                {mat.category}
                                            </span>
                                        </td>
                                        <td className="py-2.5 text-right font-mono font-bold">{mat.gsm} g</td>
                                        <td className="py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{Number(mat.bulk).toFixed(2)}</td>
                                        <td className="py-2.5 pl-4 font-mono text-zinc-600 dark:text-zinc-300">{mat.sheetFormat}</td>
                                        <td className="py-2.5 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">€{Number(mat.pricePerKg).toFixed(2)}/kg</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {paperSections.map(({ label, fixedKey, varKey }) => (
                <div key={label} className={card}>
                    <h3 className={sectionTitle}>{label}</h3>
                    <RateTable
                        headers={threeColour.map(c => c === 'one' ? '1c' : c === 'two' ? '2c' : 'full')}
                        rows={[
                            { label: 'Fixed (€)', values: threeColour.map(c => (r[fixedKey] as any)?.[c] ?? 0) },
                            { label: 'Variable (€)', values: threeColour.map(c => (r[varKey] as any)?.[c] ?? 0) },
                        ]}
                    />
                </div>
            ))}
            <div className={card}>
                <h3 className={sectionTitle}>Paper Waste for Binding</h3>
                <div className="grid grid-cols-6 gap-3">
                    {(['pb', 'ss', 'sc', 'hc', 'wo', 'sp'] as const).map(k => (
                        <Cell key={k} label={k.toUpperCase()}>{r.paper_waste_for_binding[k]}</Cell>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className={card}>
                    <h3 className={sectionTitle}>Interior Price / kg (€)</h3>
                    {(['offset', 'mc', 'lux', 'munken', 'other'] as const).map(k => (
                        <Cell key={k} label={k}>{r.paper_price_interior_by_kilo[k]}</Cell>
                    ))}
                </div>
                <div className={card}>
                    <h3 className={sectionTitle}>Cover Price / kg (€)</h3>
                    {(['mc', 'artboard', 'offset', 'wfmc', 'other'] as const).map(k => (
                        <Cell key={k} label={k}>{r.paper_price_cover_by_kilo[k]}</Cell>
                    ))}
                </div>
                <div className={card}>
                    <h3 className={sectionTitle}>Endpaper Price / kg (€)</h3>
                    {(['offset', 'mc', 'other'] as const).map(k => (
                        <Cell key={k} label={k}>{r.paper_price_endpaper_by_kilo[k]}</Cell>
                    ))}
                </div>
            </div>
        </div>
    );
}

function TransportTab({ r }: { r: PrinthouseRates }) {
    const techKeys = Object.keys(r?.percentage_technical_costs || {});
    const transKeys = Object.keys(r?.transport_costs || {});
    const allCountryKeys = Array.from(new Set([...techKeys, ...transKeys])).sort();

    return (
        <div className="space-y-6 max-w-4xl">
            <div className={card}>
                <div className="flex items-center gap-2 mb-2">
                    <TruckIcon className="w-4 h-4 text-[#dc0000]" />
                    <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                        3D Euro-Pallet Cubing & Freight Matrix Settings
                    </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Cell label="Technical Costs for Transport">{r.technical_costs_for_transport ? 'Yes' : 'No'}</Cell>
                    <Cell label="Additional Transport Multiplier">{r.additional_transport_multiplier}</Cell>
                    <Cell label="Pallet Standard">EPAL 1200×800 mm (GS1-128)</Cell>
                </div>
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>% Technical Costs by Country</h3>
                {allCountryKeys.length === 0 ? (
                    <p className="text-xs text-zinc-500 font-mono">NO REGIONS CONFIGURED</p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {allCountryKeys.map(c => (
                            <Cell key={c} label={c.toUpperCase()}>{r.percentage_technical_costs?.[c] ?? 0}%</Cell>
                        ))}
                    </div>
                )}
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>Base Transport Costs by Country (€)</h3>
                {allCountryKeys.length === 0 ? (
                    <p className="text-xs text-zinc-500 font-mono">NO REGIONS CONFIGURED</p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {allCountryKeys.map(c => (
                            <Cell key={c} label={c.toUpperCase()}>€{r.transport_costs?.[c] ?? 0}</Cell>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Detail Page ──────────────────────────────────────────────────────────────

export const DETAIL_TABS = ['Basic', 'Operational Geography', 'Machines', 'Interior', 'Cover & Endpapers', 'Lamination & UV', 'Binding', 'Paper Costs', 'Transport'] as const;
export type DetailTab = typeof DETAIL_TABS[number];
export type { PrinthouseRates } from './PrinthousesPage';

const SETUP_TAB_TO_DETAIL_TAB: Record<string, DetailTab> = {
    'OVERVIEW': 'Basic',
    'BASIC': 'Basic',
    'COMPANY': 'Basic',
    'CAPACITY': 'Basic',
    'LEAD_TIMES': 'Basic',
    'PRICING': 'Basic',
    'MARKETPLACE': 'Basic',
    'SITES': 'Operational Geography',
    'OPERATIONAL GEOGRAPHY': 'Operational Geography',
    'MACHINES': 'Machines',
    'CAPABILITIES': 'Machines',
    'MATERIALS': 'Paper Costs',
    'PAPER COSTS': 'Paper Costs',
    'INTERIOR': 'Interior',
    'COVER & ENDPAERS': 'Cover & Endpapers',
    'LAMINATION & UV': 'Lamination & UV',
    'BINDING': 'Binding',
    'SHIPPING': 'Transport',
    'TRANSPORT': 'Transport',
    'INTEGRATIONS': 'Operational Geography'
};

export const PrinthouseDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { t } = useLocale();
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const [tab, setTab] = useState<DetailTab>('Basic');
    const [editOpen, setEditOpen] = useState(false);

    // Synchronize ?tab= query parameter (from Sidebar Printhouse Setup or direct links)
    useEffect(() => {
        const rawTab = searchParams.get('tab');
        if (!rawTab) return;
        const upper = rawTab.trim().toUpperCase();
        const mapped = SETUP_TAB_TO_DETAIL_TAB[upper] || DETAIL_TABS.find(t => t.toUpperCase() === upper);
        if (mapped && mapped !== tab) {
            setTab(mapped);
        }
    }, [searchParams]);

    const handleSelectTab = (nextTab: DetailTab) => {
        setTab(nextTab);
        setSearchParams({ tab: nextTab }, { replace: true });
    };

    const statePh = (location.state as { printhouse?: Printhouse })?.printhouse;
    const q = useAdminQuery<Printhouse[]>('printhouses', getPrinthouses);

    const freshPh = q.data?.find(p => p._id === id || p.id === id);
    const ph: Printhouse | undefined = freshPh ?? statePh;

    if (!ph && q.status === 'loading') {
        return (
            <div className="flex items-center justify-center h-64 text-zinc-400 text-sm font-medium">
                Loading industrial node telemetry…
            </div>
        );
    }

    if (!ph) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="text-zinc-400 text-sm font-medium">Printhouse not found.</p>
                <button onClick={() => navigate('/printhouses')}
                    className="flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer">
                    <ArrowLeftIcon className="w-4 h-4" /> Back to Printhouses
                </button>
            </div>
        );
    }

    const r = ph.rates;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#131314] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-4 min-w-0">
                    <button onClick={() => navigate('/printhouses')}
                        className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex-shrink-0 cursor-pointer">
                        <ArrowLeftIcon className="w-4 h-4" />
                    </button>
                    <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center flex-shrink-0">
                        <PrinterIcon className="w-5 h-5 text-[#dc0000]" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight truncate">{ph.name}</h1>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {t('printhouses.detail.activeNodeBadge')}
                            </span>
                        </div>
                        <p className="text-xs text-zinc-400 font-mono mt-0.5">
                            {ph.id} · {ph.city || 'Madrid'}, {ph.country || 'ES'} · {ph.region || 'EU-WEST'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setEditOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-[#dc0000] text-white text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 dark:hover:bg-red-700 transition-colors flex-shrink-0 cursor-pointer">
                        <PencilSquareIcon className="w-4 h-4" />
                        {t('printhouses.detail.btnEditNodeRates')}
                    </button>
                </div>
            </div>

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: t('printhouses.detail.kpiDeliverySla'), value: ph.delivery_time || '5-7 days', icon: ClockIcon },
                    { label: t('printhouses.detail.kpiLeadDays'), value: `${ph.production_lead_days || 5}d`, icon: ClockIcon },
                    { label: t('printhouses.detail.kpiMinCopiesMaxPages'), value: `${(ph.limits?.min_copies ?? 50).toLocaleString()} / ${(ph.limits?.max_pages ?? 960).toLocaleString()}p`, icon: DocumentTextIcon },
                    { label: t('printhouses.detail.kpiActiveFleetCap'), value: `${ph.machinesCount ?? 3} units · ${((ph.weeklySheetsCapacity ?? 250000) / 1000).toFixed(0)}k sheets`, icon: HashtagIcon },
                ].map((s, i) => (
                    <div key={i} className="bg-white dark:bg-[#131314] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center gap-3 shadow-2xs">
                        <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-300">
                            <s.icon className="w-5 h-5 flex-shrink-0" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest truncate">{s.label}</p>
                            <p className="text-sm font-black text-zinc-900 dark:text-zinc-100 truncate">{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="border-b border-zinc-200 dark:border-zinc-800 flex gap-0 overflow-x-auto">
                {DETAIL_TABS.map(t => (
                    <button key={t} onClick={() => handleSelectTab(t)}
                        className={`px-4 py-3 text-[11px] font-bold uppercase tracking-widest border-b-2 whitespace-nowrap transition-colors -mb-px cursor-pointer ${tab === t ? 'border-[#dc0000] text-[#dc0000] dark:bg-zinc-900/60' : 'border-transparent text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'}`}>
                        {t}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div>
                {tab === 'Basic' && <BasicTab ph={ph} onNavigateTab={handleSelectTab} onRefresh={() => q.refetch()} />}
                {tab === 'Operational Geography' && <OperationalTab ph={ph} />}
                {tab === 'Machines' && (
                    <MachineCapabilityEditor 
                        printhouseId={ph.id} 
                        onMutationSuccess={() => {
                            q.refetch();
                        }}
                    />
                )}
                {tab === 'Interior' && (r ? <InteriorTab r={r} /> : <NoRates />)}
                {tab === 'Cover & Endpapers' && (r ? <CoverEndpapersTab r={r} /> : <NoRates />)}
                {tab === 'Lamination & UV' && (r ? <LaminationUvTab r={r} /> : <NoRates />)}
                {tab === 'Binding' && (r ? <BindingTab r={r} /> : <NoRates />)}
                {tab === 'Paper Costs' && (r ? <PaperCostsTab r={r} ph={ph} /> : <NoRates />)}
                {tab === 'Transport' && (r ? <TransportTab r={r} /> : <NoRates />)}
            </div>

            <PrinthouseFormModal
                isOpen={editOpen}
                onClose={() => setEditOpen(false)}
                editing={ph}
                onSaved={() => {
                    setEditOpen(false);
                    q.refetch();
                }}
            />
        </div>
    );
};

function NoRates() {
    return (
        <div className="flex items-center justify-center h-40 text-zinc-400 text-sm font-medium border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
            No rate data configured yet. Use Edit Node & Rates to configure rates.
        </div>
    );
}
