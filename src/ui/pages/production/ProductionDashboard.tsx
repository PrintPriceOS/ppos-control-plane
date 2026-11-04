/**
 * src/ui/pages/production/ProductionDashboard.tsx
 *
 * PrintPrice OS — Phase 13A: Executive Real-Time Profitability & JMF Telemetry Dashboard
 *
 * Consolidates:
 *   - PHASE-12A Commercial Escrow & Split-Payout net manufacturing revenue + EPAL compensation
 *   - PHASE-12B Closed-loop JMF press waste variance (Planned vs. Real make-ready sheets)
 *   - PHASE-12C Machine OEE (%) & Predictive Maintenance health
 *   - PHASE-13B EN 16931 Electronic Invoicing (Facturae 3.2.2 / XRechnung 3.0 XML)
 */
import React, { useState, useEffect } from 'react';
import {
    CurrencyEuroIcon,
    ChartBarIcon,
    SparklesIcon,
    CpuChipIcon,
    DocumentTextIcon
} from '@heroicons/react/24/outline';
import { getAuthToken, isDemoTenant } from '../../lib/authStore';
import {
    SharedModuleProps,
    HeaderActionGroup,
    TopSummaryKpiBar,
    IndustrialTable,
    StatusBadge
} from '../../components/common';
import { ManufacturingQueuePage } from '../manufacturing/ManufacturingQueuePage';

export interface ExecutiveProfitabilityRow {
    orderId: string;
    jobId: string;
    isbn: string;
    title: string;
    machineName: string;
    machineOeePct: number;
    manufacturingShareEur: number;
    epalCompensationEur: number;
    plannedWasteSheets: number;
    actualWasteSheets: number;
    jmfWasteSavingsEur: number;
    realDirectMfgCostEur: number;
    netIndustrialMarginEur: number;
    netIndustrialMarginPct: number;
    escrowStatus: string;
}

const INITIAL_PROFITABILITY_ROWS: ExecutiveProfitabilityRow[] = [
    {
        orderId: 'PUB-ORD-2026-101',
        jobId: 'PF-2026-082',
        isbn: '978-3-8365-9102-7',
        title: 'Atlas de Arquitectura Industrial Europea',
        machineName: 'Heidelberg Speedmaster XL 106-8-P (B1)',
        machineOeePct: 86.4,
        manufacturingShareEur: 21400.0,
        epalCompensationEur: 0.0,
        plannedWasteSheets: 1208,
        actualWasteSheets: 1160,
        jmfWasteSavingsEur: 10.56,
        realDirectMfgCostEur: 14969.44,
        netIndustrialMarginEur: 6430.56,
        netIndustrialMarginPct: 30.05,
        escrowStatus: 'FUNDS_LOCKED_ON_PROOF_APPROVAL'
    },
    {
        orderId: 'PUB-ORD-2026-102',
        jobId: 'PF-2026-084',
        isbn: '978-84-9066-801-6',
        title: 'Crónicas del Diseño Tipográfico Suizo',
        machineName: 'Heidelberg Speedmaster XL 106-8-P (B1)',
        machineOeePct: 86.4,
        manufacturingShareEur: 13850.0,
        epalCompensationEur: 0.0,
        plannedWasteSheets: 740,
        actualWasteSheets: 710,
        jmfWasteSavingsEur: 5.7,
        realDirectMfgCostEur: 9689.3,
        netIndustrialMarginEur: 4160.7,
        netIndustrialMarginPct: 30.04,
        escrowStatus: 'IN_MANUFACTURING_HOLD'
    },
    {
        orderId: 'PUB-ORD-2026-103',
        jobId: 'PF-2026-089',
        isbn: '978-3-9573-0412-9',
        title: 'Catálogo Técnico Feria del Libro de Frankfurt 2026',
        machineName: 'Komori Lithrone G29 (B2)',
        machineOeePct: 75.8,
        manufacturingShareEur: 4100.0,
        epalCompensationEur: 30.0,
        plannedWasteSheets: 340,
        actualWasteSheets: 325,
        jmfWasteSavingsEur: 2.4,
        realDirectMfgCostEur: 2867.6,
        netIndustrialMarginEur: 1262.4,
        netIndustrialMarginPct: 30.57,
        escrowStatus: 'RELEASED_ON_SIGNED_POD'
    }
];

export const ProductionDashboard: React.FC<SharedModuleProps> = (props) => {
    const { mode = 'workspace' } = props;
    const isDemo = isDemoTenant();
    const [viewMode, setViewMode] = useState<'profitability' | 'queue'>('profitability');
    const [rows, setRows] = useState<ExecutiveProfitabilityRow[]>(isDemo ? INITIAL_PROFITABILITY_ROWS : []);
    const [loading, setLoading] = useState<boolean>(!isDemo);
    const [invoicePreview, setInvoicePreview] = useState<{
        orderId: string;
        standard: 'FACTURAE_3_2_2' | 'XRECHNUNG_3_0';
        xml: string;
    } | null>(null);

    useEffect(() => {
        let isMounted = true;
        const token = getAuthToken();
        fetch('/api/financials/escrow/profitability', {
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
        })
            .then((res) => (res && res.ok ? res.json() : null))
            .then((data) => {
                if (!isMounted) return;
                setLoading(false);
                if (data && Array.isArray(data.orders)) {
                    if (data.orders.length > 0) {
                        const mapped: ExecutiveProfitabilityRow[] = data.orders.map((o: any) => ({
                            orderId: o.orderId,
                            jobId: o.jobId || `JOB-${o.orderId}`,
                            isbn: o.isbn || '978-84-000000-0-0',
                            title: o.title || `Order ${o.orderId}`,
                            machineName: o.machineName || 'Industrial Press',
                            machineOeePct: Number(o.machineOeePct || 85.0),
                            manufacturingShareEur: Number(o.manufacturingShareEur || 0),
                            epalCompensationEur: Number(o.epalCompensationEur || 0),
                            plannedWasteSheets: Number(o.plannedWasteSheets || 0),
                            actualWasteSheets: Number(o.actualWasteSheets || 0),
                            jmfWasteSavingsEur: Number(o.jmfWasteSavingsEur || 0),
                            realDirectMfgCostEur: Number(o.realDirectMfgCostEur || 0),
                            netIndustrialMarginEur: Number(o.netIndustrialMarginEur || 0),
                            netIndustrialMarginPct: Number(o.netIndustrialMarginPct || 0),
                            escrowStatus: o.escrowStatus || 'PENDING'
                        }));
                        setRows(mapped);
                    } else if (!isDemo) {
                        // Enforce clean zero-slate for real tenant
                        setRows([]);
                    }
                }
            })
            .catch(() => {
                if (isMounted) setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [isDemo]);

    const handlePreviewEInvoice = (
        row: ExecutiveProfitabilityRow,
        standard: 'FACTURAE_3_2_2' | 'XRECHNUNG_3_0'
    ) => {
        const xml =
            standard === 'XRECHNUNG_3_0'
                ? [
                      `<?xml version="1.0" encoding="UTF-8"?>`,
                      `<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`,
                      `  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>`,
                      `  <cbc:ID>INV-2026-${row.orderId.slice(-3)}</cbc:ID>`,
                      `  <cbc:BuyerReference>${row.orderId}</cbc:BuyerReference>`,
                      `  <!-- Segregated EN 16931 Lines: MFG_EDITORIAL_PRINT (${row.manufacturingShareEur.toFixed(2)} EUR) | PACK_EPAL_FEFCO | FREIGHT_LANDED_DOCK -->`,
                      `</ubl:Invoice>`
                  ].join('\n')
                : [
                      `<?xml version="1.0" encoding="UTF-8"?>`,
                      `<fe:Facturae xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml">`,
                      `  <FileHeader><SchemaVersion>3.2.2</SchemaVersion></FileHeader>`,
                      `  <!-- Orden ${row.orderId} · Mfg: ${row.manufacturingShareEur.toFixed(2)} EUR · EPAL Comp: ${row.epalCompensationEur.toFixed(2)} EUR -->`,
                      `</fe:Facturae>`
                  ].join('\n');

        setInvoicePreview({ orderId: row.orderId, standard, xml });
    };

    const totalNetMfgRevenue = rows.reduce(
        (acc, r) => acc + r.manufacturingShareEur + r.epalCompensationEur,
        0
    );
    const totalNetMarginEur = rows.reduce((acc, r) => acc + r.netIndustrialMarginEur, 0);
    const avgNetMarginPct =
        totalNetMfgRevenue > 0 ? ((totalNetMarginEur / totalNetMfgRevenue) * 100).toFixed(1) : '0.0';
    const totalJmfSavingsEur = rows.reduce((acc, r) => acc + r.jmfWasteSavingsEur, 0);

    return (
        <div
            data-testid="executive-profitability-dashboard"
            data-mode={mode}
            className="space-y-6"
        >
            <HeaderActionGroup
                title="Executive Plant Profitability & JMF Yield"
                subtitle="PHASE-13A/13B · Real-Time Net Margin (Escrow Split-Payout × Closed-Loop JMF Waste × EN 16931 E-Invoicing)"
                mode={mode}
                tabs={[
                    { id: 'profitability', label: 'PROFITABILITY & E-INVOICING' },
                    { id: 'queue', label: 'IMPOSITION & JMF QUEUE' }
                ]}
                activeTabId={viewMode}
                onTabChange={(id) => setViewMode(id as 'profitability' | 'queue')}
            />

            {viewMode === 'queue' ? (
                <ManufacturingQueuePage {...props} />
            ) : (
                <>
                    <TopSummaryKpiBar
                        items={[
                            {
                                id: 'net-mfg-revenue',
                                label: 'NET MFG REVENUE EUR',
                                value: `€${totalNetMfgRevenue.toLocaleString()}`,
                                icon: CurrencyEuroIcon,
                                accent: 'blue'
                            },
                            {
                                id: 'real-net-margin',
                                label: 'REAL NET MARGIN EUR',
                                value: `€${totalNetMarginEur.toLocaleString()}`,
                                icon: ChartBarIcon,
                                accent: 'emerald'
                            },
                            {
                                id: 'avg-margin-pct',
                                label: 'AVG. INDUSTRIAL MARGIN %',
                                value: `${avgNetMarginPct}%`,
                                icon: CpuChipIcon,
                                accent: 'amber'
                            },
                            {
                                id: 'jmf-waste-savings',
                                label: 'JMF CLOSED-LOOP SAVINGS',
                                value: `+€${totalJmfSavingsEur.toFixed(2)}`,
                                icon: SparklesIcon,
                                accent: 'emerald'
                            }
                        ]}
                    />

                    <IndustrialTable
                        title="REAL-TIME ORDER PROFITABILITY & EN 16931 E-INVOICING LEDGER"
                        subtitle={`${rows.length} ORDERS RECONCILED ACROSS ESCROW, JMF PRESS WASTE & OEE`}
                        data={rows}
                        loading={loading}
                        emptyEntityName="PROFITABILITY LEDGER ENTRIES"
                        emptyMessage="NO ACTIVE ORDER PROFITABILITY ENTRIES FOUND · ESCROW ORDERS AND CLOSED-LOOP JMF RUNS WILL RECONCILE HERE"
                        rowKey={(r) => r.orderId}
                        columns={[
                            {
                                key: 'order',
                                header: 'ORDER / JOB / ISBN',
                                render: (row) => (
                                    <div>
                                        <div className="font-mono font-black text-white">
                                            {row.orderId} · <span className="text-slate-400">{row.jobId}</span>
                                        </div>
                                        <div className="text-xs font-bold text-slate-300 truncate max-w-[240px]">
                                            {row.title}
                                        </div>
                                        <div className="text-[10px] font-mono text-slate-400">
                                            ISBN: {row.isbn}
                                        </div>
                                    </div>
                                )
                            },
                            {
                                key: 'pressOee',
                                header: 'PRESS & OEE %',
                                render: (row) => (
                                    <div>
                                        <div className="text-xs font-mono font-bold text-slate-200">
                                            {row.machineName}
                                        </div>
                                        <div className="text-[10px] font-mono text-emerald-400">
                                            OEE: {row.machineOeePct.toFixed(1)}%
                                        </div>
                                    </div>
                                )
                            },
                            {
                                key: 'jmfWaste',
                                header: 'JMF WASTE (PLAN VS REAL)',
                                render: (row) => (
                                    <div className="font-mono text-xs">
                                        <span className="text-slate-400">{row.plannedWasteSheets} sh</span>
                                        {' → '}
                                        <span className="text-emerald-400 font-bold">
                                            {row.actualWasteSheets} sh
                                        </span>
                                        <div className="text-[10px] text-emerald-400">
                                            Saved +{row.plannedWasteSheets - row.actualWasteSheets} sh (+€
                                            {row.jmfWasteSavingsEur.toFixed(2)})
                                        </div>
                                    </div>
                                )
                            },
                            {
                                key: 'margin',
                                header: 'NET INDUSTRIAL MARGIN',
                                render: (row) => (
                                    <div className="font-mono">
                                        <div className="text-xs font-black text-emerald-400">
                                            €{row.netIndustrialMarginEur.toLocaleString()} ({row.netIndustrialMarginPct.toFixed(2)}%)
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            Mfg Rev: €{row.manufacturingShareEur.toLocaleString()} · Cost: €
                                            {row.realDirectMfgCostEur.toLocaleString()}
                                        </div>
                                    </div>
                                )
                            },
                            {
                                key: 'status',
                                header: 'ESCROW & E-INVOICE (EN 16931)',
                                render: (row) => (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge
                                            status={
                                                row.escrowStatus === 'RELEASED_ON_SIGNED_POD'
                                                    ? 'HEALTHY'
                                                    : 'ACTIVE'
                                            }
                                            label={row.escrowStatus.replace(/_/g, ' ')}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handlePreviewEInvoice(row, 'FACTURAE_3_2_2')}
                                            data-testid={`einvoice-facturae-btn-${row.orderId}`}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0a0b0d] hover:bg-[#181b20] border border-[#1f2228] text-[10px] font-mono font-bold text-slate-300 hover:text-white cursor-pointer"
                                        >
                                            <DocumentTextIcon className="w-3.5 h-3.5" />
                                            FACTURAE 3.2.2
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handlePreviewEInvoice(row, 'XRECHNUNG_3_0')}
                                            data-testid={`einvoice-xrechnung-btn-${row.orderId}`}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-[10px] font-mono font-bold text-blue-400 cursor-pointer"
                                        >
                                            XRECHNUNG 3.0
                                        </button>
                                    </div>
                                )
                            }
                        ]}
                    />

                    {invoicePreview && (
                        <div
                            data-testid="einvoice-xml-modal"
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
                        >
                            <div className="w-full max-w-2xl rounded-xl bg-[#14161a] border border-[#1f2228] p-6 space-y-4 text-white">
                                <div className="flex items-center justify-between border-b border-[#1f2228] pb-3">
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-wider">
                                            EN 16931 ELECTRONIC INVOICE ({invoicePreview.standard}) ·{' '}
                                            {invoicePreview.orderId}
                                        </h3>
                                        <p className="text-[11px] font-mono text-slate-400">
                                            Automated emission on POD settlement · Mfg ≠ Pack ≠ Freight
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setInvoicePreview(null)}
                                        className="text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                                    >
                                        ✕
                                    </button>
                                </div>
                                <pre
                                    data-testid="einvoice-xml-code"
                                    className="max-h-80 overflow-auto rounded-lg bg-[#0a0b0d] border border-[#1f2228] p-4 text-[11px] font-mono text-emerald-400"
                                >
                                    {invoicePreview.xml}
                                </pre>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
export default ProductionDashboard;
