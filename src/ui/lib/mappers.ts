import { safeText, safeArray } from './formatters';

/**
 * Normalizes an offer object from either snake_case (API) or camelCase (Legacy)
 * to a standardized UI format, preventing crashes on missing fields.
 */
export function normalizeOffer(raw: any) {
  if (!raw) return null;
  
  // Support both API (snake) and Legacy (camel) formats
  const id = raw.id || 'unknown';
  const printerId = raw.printer_id || raw.printerId || raw.house_id || raw.houseId || 'unknown';
  const printerName = raw.printer_name || raw.printerName || raw.print_house || raw.name || raw.printer_id || raw.printerId || 'Unknown printer';
  
  return {
    id,
    printerId,
    printerName,
    productionCost: Number(raw.production_cost || raw.productionCost || 0),
    suggestedPrice: Number(raw.suggested_price || raw.suggestedPrice || 0),
    estimatedMargin: Number(raw.estimated_margin || raw.estimatedMargin || 0),
    marginPct: Number(raw.margin_pct || raw.marginPct || 0),
    leadTimeDays: raw.lead_time_days || raw.leadTimeDays || null,
    productionLeadDays: raw.production_lead_days || raw.productionLeadDays || null,
    shippingDays: raw.shipping_days || raw.shippingDays || null,
    deliveryTime: raw.delivery_time || raw.deliveryTime || '—',
    offerStatus: raw.offer_status || raw.offerStatus || 'SENT',
    offerSelected: Boolean(raw.offer_selected || raw.offerSelected),
    offerRank: raw.offer_rank != null ? Number(raw.offer_rank) : null,
    offerPriorityScore: Number(raw.offer_priority_score || raw.offerPriorityScore || 0),
    rawEstimate: raw.raw_estimate || raw.rawEstimate || {},
    metadata: raw.metadata_json || raw.metadata || {}
  };
}

/**
 * Derives a robust human-readable name for a session based on available metadata.
 */
function deriveJobName(raw: any): string {
  const orderSummary = raw.order_summary || raw.orderSummary || {};
  const customer = orderSummary.customer || raw.customer || {};
  const specs = raw.specs || orderSummary.specs || {};

  if (customer.name) return String(customer.name);
  if (raw.source_ref) return String(raw.source_ref);
  if (raw.order_ref) return String(raw.order_ref);

  if (specs.quantity) {
    const qty = specs.quantity;
    const size = specs.book_size || specs.size || 'standard size';
    const binding = specs.binding_method || specs.binding || 'binding';
    return `${qty} books · ${size} · ${binding}`;
  }

  const name = raw.job_name || raw.jobName;
  if (name && name !== 'Unnamed Job') return name;
  
  return 'Marketplace Session';
}

/**
 * Normalizes a marketplace session object from either snake_case (API) or camelCase (Legacy)
 * to a standardized UI format, preventing crashes on missing fields.
 */
export function normalizeMarketplaceSession(raw: any) {
  if (!raw) return null;
  
  const id = raw.id;
  const jobId = raw.job_id || raw.jobId;
  const sessionStatus = raw.session_status || raw.sessionStatus || 'OPEN';
  const selectedOfferId = raw.selected_offer_id || raw.selectedOfferId || null;
  
  // Enrichment fields for BPE
  const source = raw.source || 'BPE';
  const sourceRef = raw.source_ref || raw.sourceRef || raw.order_ref || '—';
  
  const offers = safeArray(raw.offers).map(normalizeOffer).sort((a: any, b: any) => {
    // SELECTED sessions: move the selected offer to top
    if (sessionStatus === 'SELECTED' && selectedOfferId) {
        if (a.id === selectedOfferId) return -1;
        if (b.id === selectedOfferId) return 1;
    }
    
    // Default sort: Rank ASC -> Score DESC -> Price ASC
    if (a.offerRank !== b.offerRank) {
        const rankA = a.offerRank === null ? 999 : a.offerRank;
        const rankB = b.offerRank === null ? 999 : b.offerRank;
        return rankA - rankB;
    }
    if (a.offerPriorityScore !== b.offerPriorityScore) {
        return b.offerPriorityScore - a.offerPriorityScore;
    }
    return a.productionCost - b.productionCost;
  });

  return {
    id,
    jobId,
    jobName: deriveJobName(raw),
    orderId: raw.order_id || raw.orderId,
    tenantId: raw.tenant_id || raw.tenantId || 'default',
    source,
    sourceRef,
    sessionStatus,
    selectionMode: raw.selection_mode || raw.selectionMode || 'AUTO',
    selectedOfferId,
    offerCount: Number(raw.offer_count || raw.offerCount || raw.offers?.length || 0),
    createdAt: raw.created_at || raw.createdAt || null,
    updatedAt: raw.updated_at || raw.updatedAt || null,
    offers,
    events: safeArray(raw.events || raw.history || []),
    errorJson: raw.error_json || raw.error || null,
    metadata: raw.metadata_json || raw.metadata || {}
  };
}
