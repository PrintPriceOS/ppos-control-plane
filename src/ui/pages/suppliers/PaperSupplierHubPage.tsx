import React, { useEffect, useMemo, useState } from 'react';
import {
    Building2,
    CheckCircle2,
    AlertTriangle,
    Clock,
    Upload,
    FileSpreadsheet,
    ShieldCheck,
    RefreshCw,
    Plus,
    X,
    Search,
    Layers,
    ArrowUpRight
} from 'lucide-react';
import { getAuthToken, getUserTenantId } from '../../lib/authStore';

function getAuthHeaders(): Record<string, string> {
    const token = getAuthToken();
    const tenantId = getUserTenantId() || 'tenant-default';
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-tenant-id': tenantId
    };
}

interface DistributorCard {
    supplierId: string;
    name: string;
    country: string;
    tier: string;
    specialties: string[];
    defaultBenchmarkEurKg: number;
    agreementStatus: 'ACTIVE' | 'EXPIRING_SOON' | 'MISSING' | 'EXPIRED';
    contractedSkuCount: number;
    activeSkuCount: number;
    avgContractedEurKg: number | null;
    latestAgreementName: string | null;
    validUntil: string | null;
}

interface AgreementRecord {
    id: string;
    tenantId: string;
    supplierId: string;
    agreementName: string;
    validFrom: string;
    validUntil: string;
    vendorSku: string;
    masterVariantId: string;
    productName: string;
    brand: string;
    category: string;
    gsm: number;
    contractedPriceEurKg: number;
    benchmarkPriceEurKg: number;
    minOrderQtyKg: number;
    versionNumber: number;
    lifecycleStatus: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';
    isEffectiveNow: boolean;
}

interface ParsedItemPreview {
    vendorSku: string;
    masterVariantId: string;
    contractedPriceEurKg: number;
    minOrderQtyKg: number;
    valid: boolean;
    validationNote?: string;
}

const DEFAULT_CSV_TEMPLATE = `vendorSku,masterVariantId,contractedPriceEurKg,minOrderQtyKg
LEC-CORAL-80,MAT-CORAL-BOOK-IVORY-80,1.2100,500
LEC-GARDA-150,MAT-GARDA-GLOSS-B2-150,1.2600,450
FED-SYMBOL-300,BOARD-FEDRIGONI-SYMBOL-300,1.4900,300
SAP-MAGNO-135,MAT-SAPPI-MAGNO-SATIN-135,1.1900,1000
ARC-MUNKEN-90,MAT-MUNKEN-PRINT-WHITE-90,1.3100,600`;

export const PaperSupplierHubPage: React.FC<{ locale?: string }> = () => {

    const [distributors, setDistributors] = useState<DistributorCard[]>([]);
    const [agreements, setAgreements] = useState<AgreementRecord[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedDistributorFilter, setSelectedDistributorFilter] = useState<string>('ALL');

    // Modal state for [+ UPLOAD MERCHANT AGREEMENT]
    const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
    const [supplierId, setSupplierId] = useState<string>('SUP-LECTA-TORRASPAPEL');
    const [agreementName, setAgreementName] = useState<string>('Q1-Q4 Annual Paper Rate Contract');
    const [validFrom, setValidFrom] = useState<string>(() => new Date(Date.now() - 86400000).toISOString().slice(0, 10));
    const [validUntil, setValidUntil] = useState<string>(() => new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
    const [inputMode, setInputMode] = useState<'CSV' | 'JSON'>('CSV');
    const [rawInputText, setRawInputText] = useState<string>(DEFAULT_CSV_TEMPLATE);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

    const fetchHubData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/suppliers/hub', {
                headers: getAuthHeaders()
            });
            const body = await res.json();
            if (!res.ok || !body.ok) {
                throw new Error(body?.error?.message || 'Failed to load Paper Supplier Hub.');
            }
            setDistributors(body.data.distributors || []);
            setAgreements(body.data.agreements || []);
        } catch (err: any) {
            setError(err.message || 'Unable to fetch distributor agreements.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHubData();
    }, []);

    const parsedPreview: { items: ParsedItemPreview[]; dateValid: boolean; dateError?: string } = useMemo(() => {
        const fromMs = new Date(validFrom).getTime();
        const untilMs = new Date(validUntil).getTime();
        const dateValid = !Number.isNaN(fromMs) && !Number.isNaN(untilMs) && untilMs > fromMs;
        const dateError = !dateValid ? 'validUntil must be strictly greater than validFrom.' : undefined;

        const items: ParsedItemPreview[] = [];
        const trimmed = rawInputText.trim();
        if (!trimmed) {
            return { items, dateValid, dateError };
        }

        if (inputMode === 'JSON') {
            try {
                const parsed = JSON.parse(trimmed);
                const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];
                for (const row of arr) {
                    const vendorSku = String(row.vendorSku || '').trim();
                    const masterVariantId = String(row.masterVariantId || '').trim();
                    const contractedPriceEurKg = Number(row.contractedPriceEurKg);
                    const minOrderQtyKg = Number(row.minOrderQtyKg ?? 500);
                    const valid =
                        Boolean(vendorSku) &&
                        Boolean(masterVariantId) &&
                        Number.isFinite(contractedPriceEurKg) &&
                        contractedPriceEurKg > 0 &&
                        Number.isFinite(minOrderQtyKg) &&
                        minOrderQtyKg >= 0;
                    items.push({
                        vendorSku,
                        masterVariantId,
                        contractedPriceEurKg: Number.isFinite(contractedPriceEurKg) ? contractedPriceEurKg : 0,
                        minOrderQtyKg: Number.isFinite(minOrderQtyKg) ? minOrderQtyKg : 500,
                        valid,
                        validationNote: valid ? 'Ready for Master Mapping' : 'Invalid SKU, masterVariantId, or price'
                    });
                }
            } catch (e: any) {
                items.push({
                    vendorSku: 'JSON_PARSE_ERROR',
                    masterVariantId: '-',
                    contractedPriceEurKg: 0,
                    minOrderQtyKg: 0,
                    valid: false,
                    validationNote: e.message
                });
            }
            return { items, dateValid, dateError };
        }

        // CSV Mode
        const lines = trimmed
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
        if (lines.length < 2) {
            return { items, dateValid, dateError };
        }

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const skuIdx = headers.findIndex((h) => h.includes('sku') || h.includes('vendor'));
        const varIdx = headers.findIndex((h) => h.includes('variant') || h.includes('master') || h.includes('id'));
        const priceIdx = headers.findIndex((h) => h.includes('price') || h.includes('eur') || h.includes('cost'));
        const moqIdx = headers.findIndex((h) => h.includes('min') || h.includes('moq') || h.includes('qty'));

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map((c) => c.trim());
            if (cols.length < 3) continue;
            const vendorSku = cols[skuIdx >= 0 ? skuIdx : 0] || '';
            const masterVariantId = cols[varIdx >= 0 ? varIdx : 1] || '';
            const contractedPriceEurKg = Number(cols[priceIdx >= 0 ? priceIdx : 2]);
            const minOrderQtyKg = moqIdx >= 0 && cols[moqIdx] !== undefined ? Number(cols[moqIdx]) : 500;

            const valid =
                Boolean(vendorSku) &&
                Boolean(masterVariantId) &&
                Number.isFinite(contractedPriceEurKg) &&
                contractedPriceEurKg > 0 &&
                Number.isFinite(minOrderQtyKg) &&
                minOrderQtyKg >= 0;

            items.push({
                vendorSku,
                masterVariantId,
                contractedPriceEurKg: Number.isFinite(contractedPriceEurKg) ? contractedPriceEurKg : 0,
                minOrderQtyKg: Number.isFinite(minOrderQtyKg) ? minOrderQtyKg : 500,
                valid,
                validationNote: valid ? 'Canonical Match Candidate' : 'Invalid column value'
            });
        }

        return { items, dateValid, dateError };
    }, [rawInputText, inputMode, validFrom, validUntil]);

    const handleIngestSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setSubmitSuccess(null);

        if (!parsedPreview.dateValid) {
            setSubmitError(parsedPreview.dateError || 'Invalid agreement date range.');
            return;
        }
        const validItems = parsedPreview.items.filter((i) => i.valid);
        if (validItems.length === 0) {
            setSubmitError('Please provide at least one valid rate line item.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch('/api/suppliers/agreements/ingest', {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    supplierId,
                    agreementName,
                    validFrom: new Date(validFrom).toISOString(),
                    validUntil: new Date(validUntil).toISOString(),
                    items: validItems.map((item) => ({
                        vendorSku: item.vendorSku,
                        masterVariantId: item.masterVariantId,
                        contractedPriceEurKg: item.contractedPriceEurKg,
                        minOrderQtyKg: item.minOrderQtyKg
                    }))
                })
            });

            const body = await res.json();
            if (!res.ok || !body.ok) {
                throw new Error(body?.error?.message || 'Failed to ingest merchant agreement.');
            }

            setSubmitSuccess(
                `Ingested ${body.data.ingestedCount} contracted paper rates for ${supplierId} (Tenant Scope: ${body.data.tenantId}).`
            );
            await fetchHubData();
            setTimeout(() => {
                setIsUploadModalOpen(false);
                setSubmitSuccess(null);
            }, 1100);
        } catch (err: any) {
            setSubmitError(err.message || 'Error ingesting rate agreement.');
        } finally {
            setSubmitting(false);
        }
    };

    const filteredAgreements = useMemo(() => {
        return agreements.filter((a) => {
            if (selectedDistributorFilter !== 'ALL' && a.supplierId !== selectedDistributorFilter) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                return (
                    a.productName?.toLowerCase().includes(q) ||
                    a.masterVariantId?.toLowerCase().includes(q) ||
                    a.vendorSku?.toLowerCase().includes(q) ||
                    a.brand?.toLowerCase().includes(q) ||
                    a.agreementName?.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [agreements, selectedDistributorFilter, searchQuery]);

    const renderStatusBadge = (status: DistributorCard['agreementStatus']) => {
        switch (status) {
            case 'ACTIVE':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Active
                    </span>
                );
            case 'EXPIRING_SOON':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="w-3.5 h-3.5" />
                        Expiring Soon
                    </span>
                );
            case 'EXPIRED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Expired (Benchmark Fallback)
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        <Layers className="w-3.5 h-3.5" />
                        Missing (Benchmark Active)
                    </span>
                );
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="paper-supplier-hub-page">
            {/* Top Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-600">
                        <ShieldCheck className="w-4 h-4" />
                        Multi-Tenant Supply Chain Governance · Master Catalog (1,524 Variants)
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mt-1">
                        European Paper Supplier Hub &amp; Contracted Rate Agreements
                    </h1>
                    <p className="text-sm text-slate-600 mt-0.5">
                        Tenant-isolated B2B merchant rate cards (€/kg) with automatic BPE pricing fallback to European Master Benchmark rates.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={fetchHubData}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh Hub
                    </button>

                    <button
                        type="button"
                        data-testid="open-upload-agreement-modal-btn"
                        onClick={() => {
                            setSubmitError(null);
                            setSubmitSuccess(null);
                            setIsUploadModalOpen(true);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#dc0000] hover:bg-red-700 text-white text-xs font-bold tracking-wide uppercase shadow-sm transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        + UPLOAD MERCHANT AGREEMENT
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={fetchHubData} className="text-xs font-bold underline">
                        Retry
                    </button>
                </div>
            )}

            {/* European Paper Distributors Grid */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-500" />
                        Active European Paper Distributors &amp; Mills
                    </h2>
                    <span className="text-xs text-slate-500">
                        Click a distributor to filter contracted SKUs or upload a new rate sheet
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4" data-testid="distributors-grid">
                    {distributors.map((dist) => {
                        const isSelected = selectedDistributorFilter === dist.supplierId;
                        return (
                            <div
                                key={dist.supplierId}
                                data-testid={`distributor-card-${dist.supplierId}`}
                                onClick={() =>
                                    setSelectedDistributorFilter(isSelected ? 'ALL' : dist.supplierId)
                                }
                                className={`cursor-pointer rounded-xl border p-4 transition-all bg-white flex flex-col justify-between ${
                                    isSelected
                                        ? 'border-red-600 ring-2 ring-red-600/15 shadow-sm'
                                        : 'border-slate-200 hover:border-slate-300 shadow-xs'
                                }`}
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                                {dist.country}
                                            </span>
                                            <h3 className="text-base font-bold text-slate-900 mt-1.5">
                                                {dist.name}
                                            </h3>
                                        </div>
                                    </div>

                                    <div className="mt-3">{renderStatusBadge(dist.agreementStatus)}</div>

                                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1 text-xs">
                                        <div className="flex justify-between text-slate-600">
                                            <span>Contracted SKUs:</span>
                                            <span className="font-bold text-slate-900">{dist.contractedSkuCount}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-600">
                                            <span>Avg Contract Rate:</span>
                                            <span className="font-mono font-bold text-slate-900">
                                                {dist.avgContractedEurKg
                                                    ? `€${dist.avgContractedEurKg.toFixed(2)}/kg`
                                                    : `€${dist.defaultBenchmarkEurKg.toFixed(2)}/kg (Bench)`}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                                    <span className="text-[11px] text-slate-500 truncate max-w-[130px]">
                                        {dist.specialties.slice(0, 2).join(', ')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={(ev) => {
                                            ev.stopPropagation();
                                            setSupplierId(dist.supplierId);
                                            setAgreementName(`${dist.name} — 2026 Tenant Rate Agreement`);
                                            setIsUploadModalOpen(true);
                                        }}
                                        className="text-[11px] font-bold text-red-600 hover:text-red-700 inline-flex items-center gap-0.5"
                                    >
                                        Ingest
                                        <ArrowUpRight className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Tenant Rate Agreements Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
                    <div>
                        <h2 className="text-sm font-bold text-slate-900">
                            Tenant-Scoped Contracted Paper Rates (`printhouse_paper_agreements`)
                        </h2>
                        <p className="text-xs text-slate-500">
                            Strictly isolated by `tenant_id`. Expired or uncontracted variants automatically fall back to Master Catalog benchmark rates in BPE calculations.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Filter SKU, variant, brand..."
                                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-red-600"
                            />
                        </div>
                        {selectedDistributorFilter !== 'ALL' && (
                            <button
                                type="button"
                                onClick={() => setSelectedDistributorFilter('ALL')}
                                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300"
                            >
                                Clear Filter ({selectedDistributorFilter})
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase text-[11px] font-bold">
                                <th className="py-3 px-4">Supplier / Agreement</th>
                                <th className="py-3 px-4">Vendor SKU</th>
                                <th className="py-3 px-4">Master Variant Mapping</th>
                                <th className="py-3 px-4 text-right">GSM</th>
                                <th className="py-3 px-4 text-right">Contracted (€/kg)</th>
                                <th className="py-3 px-4 text-right">Benchmark (€/kg)</th>
                                <th className="py-3 px-4 text-right">MOQ (kg)</th>
                                <th className="py-3 px-4">Validity Window</th>
                                <th className="py-3 px-4">BPE Resolution Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {filteredAgreements.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-10 text-center text-slate-500">
                                        No custom merchant rate agreements ingested for this tenant yet. BPE is currently using Master Catalog Benchmark rates.
                                    </td>
                                </tr>
                            ) : (
                                filteredAgreements.map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-50/80">
                                        <td className="py-3 px-4">
                                            <div className="font-bold text-slate-900">{row.supplierId}</div>
                                            <div className="text-[11px] text-slate-500">
                                                {row.agreementName} · v{row.versionNumber}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                                            {row.vendorSku}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="font-semibold text-slate-900">{row.productName}</div>
                                            <div className="font-mono text-[11px] text-slate-500">
                                                {row.masterVariantId}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono">{row.gsm} g/m²</td>
                                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                                            €{Number(row.contractedPriceEurKg).toFixed(4)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono text-slate-500">
                                            €{Number(row.benchmarkPriceEurKg || 1.34).toFixed(4)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono">
                                            {Number(row.minOrderQtyKg).toLocaleString()} kg
                                        </td>
                                        <td className="py-3 px-4 text-[11px] text-slate-600">
                                            <div>From: {new Date(row.validFrom).toLocaleDateString()}</div>
                                            <div>Until: {new Date(row.validUntil).toLocaleDateString()}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            {renderStatusBadge(row.lifecycleStatus)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal: [+ UPLOAD MERCHANT AGREEMENT] */}
            {isUploadModalOpen && (
                <div
                    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
                    data-testid="upload-agreement-modal"
                >
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                            <div className="flex items-center gap-2.5">
                                <FileSpreadsheet className="w-5 h-5 text-red-600" />
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">
                                        Upload Merchant Rate Agreement (`POST /api/suppliers/agreements/ingest`)
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        Maps distributor SKUs to the 1,524 canonical master substrates with strict tenant isolation.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsUploadModalOpen(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleIngestSubmit} className="p-6 overflow-y-auto space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                                        European Distributor
                                    </label>
                                    <select
                                        value={supplierId}
                                        onChange={(e) => setSupplierId(e.target.value)}
                                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold"
                                    >
                                        <option value="SUP-LECTA-TORRASPAPEL">Lecta / Torraspapel</option>
                                        <option value="SUP-ANTALIS-EUROPE">Antalis</option>
                                        <option value="SUP-FEDRIGONI-GROUP">Fedrigoni</option>
                                        <option value="SUP-SAPPI-EUROPE">Sappi</option>
                                        <option value="SUP-ARCTIC-PAPER">Arctic Paper</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                                        Agreement Reference
                                    </label>
                                    <input
                                        type="text"
                                        value={agreementName}
                                        onChange={(e) => setAgreementName(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                                        Valid From
                                    </label>
                                    <input
                                        type="date"
                                        value={validFrom}
                                        onChange={(e) => setValidFrom(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                                        Valid Until
                                    </label>
                                    <input
                                        type="date"
                                        value={validUntil}
                                        onChange={(e) => setValidUntil(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 font-mono"
                                    />
                                </div>
                            </div>

                            {/* Format Switcher & Input */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold uppercase text-slate-700">
                                        Rate Sheet Payload ({inputMode})
                                    </label>
                                    <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-xs">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setInputMode('CSV');
                                                setRawInputText(DEFAULT_CSV_TEMPLATE);
                                            }}
                                            className={`px-3 py-1 font-bold ${
                                                inputMode === 'CSV'
                                                    ? 'bg-slate-900 text-white'
                                                    : 'bg-white text-slate-600'
                                            }`}
                                        >
                                            CSV
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setInputMode('JSON');
                                                setRawInputText(
                                                    JSON.stringify(
                                                        [
                                                            {
                                                                vendorSku: 'LEC-CORAL-80',
                                                                masterVariantId: 'MAT-CORAL-BOOK-IVORY-80',
                                                                contractedPriceEurKg: 1.21,
                                                                minOrderQtyKg: 500
                                                            },
                                                            {
                                                                vendorSku: 'ARC-MUNKEN-90',
                                                                masterVariantId: 'MAT-MUNKEN-PRINT-WHITE-90',
                                                                contractedPriceEurKg: 1.31,
                                                                minOrderQtyKg: 600
                                                            }
                                                        ],
                                                        null,
                                                        2
                                                    )
                                                );
                                            }}
                                            className={`px-3 py-1 font-bold ${
                                                inputMode === 'JSON'
                                                    ? 'bg-slate-900 text-white'
                                                    : 'bg-white text-slate-600'
                                            }`}
                                        >
                                            JSON
                                        </button>
                                    </div>
                                </div>

                                <textarea
                                    rows={6}
                                    value={rawInputText}
                                    onChange={(e) => setRawInputText(e.target.value)}
                                    className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs bg-slate-950 text-emerald-400 focus:outline-none"
                                />
                            </div>

                            {/* Live Validation Preview */}
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
                                    <span className="font-bold text-slate-800">
                                        Pre-Ingestion Validation Preview ({parsedPreview.items.filter((i) => i.valid).length} valid items)
                                    </span>
                                    {!parsedPreview.dateValid && (
                                        <span className="text-red-600 font-bold">{parsedPreview.dateError}</span>
                                    )}
                                </div>
                                <div className="max-h-44 overflow-y-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                                                <th className="py-2 px-3">Vendor SKU</th>
                                                <th className="py-2 px-3">Target Master Variant ID</th>
                                                <th className="py-2 px-3 text-right">Contracted (€/kg)</th>
                                                <th className="py-2 px-3 text-right">MOQ (kg)</th>
                                                <th className="py-2 px-3">Validation</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {parsedPreview.items.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td className="py-2 px-3 font-mono font-semibold">{item.vendorSku}</td>
                                                    <td className="py-2 px-3 font-mono text-slate-700">{item.masterVariantId}</td>
                                                    <td className="py-2 px-3 text-right font-mono font-bold">
                                                        €{item.contractedPriceEurKg.toFixed(4)}
                                                    </td>
                                                    <td className="py-2 px-3 text-right font-mono">{item.minOrderQtyKg} kg</td>
                                                    <td className="py-2 px-3">
                                                        {item.valid ? (
                                                            <span className="text-emerald-700 font-semibold">
                                                                ✓ {item.validationNote}
                                                            </span>
                                                        ) : (
                                                            <span className="text-red-600 font-semibold">
                                                                ✗ {item.validationNote}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {submitError && (
                                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                                    {submitError}
                                </div>
                            )}
                            {submitSuccess && (
                                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                                    {submitSuccess}
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setIsUploadModalOpen(false)}
                                    className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || !parsedPreview.dateValid}
                                    data-testid="submit-agreement-ingest-btn"
                                    className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#dc0000] hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wide"
                                >
                                    <Upload className="w-3.5 h-3.5" />
                                    {submitting ? 'Ingesting Agreement...' : 'Confirm & Ingest Rate Sheet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaperSupplierHubPage;
