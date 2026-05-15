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
    productionCost: raw.production_cost || raw.productionCost || 0,
    suggestedPrice: raw.suggested_price || raw.suggestedPrice || 0,
    estimatedMargin: raw.estimated_margin || raw.estimatedMargin || 0,
    marginPct: raw.margin_pct || raw.marginPct || 0,
    leadTimeDays: raw.lead_time_days || raw.leadTimeDays || null,
    productionLeadDays: raw.production_lead_days || raw.productionLeadDays || null,
    shippingDays: raw.shipping_days || raw.shippingDays || null,
    deliveryTime: raw.delivery_time || raw.deliveryTime || '—',
    offerStatus: raw.offer_status || raw.offerStatus || 'SENT',
    offerSelected: Boolean(raw.offer_selected || raw.offerSelected),
    offerRank: raw.offer_rank || raw.offerRank || null,
    offerPriorityScore: raw.offer_priority_score || raw.offerPriorityScore || 0,
    rawEstimate: raw.raw_estimate || raw.rawEstimate || {},
    metadata: raw.metadata_json || raw.metadata || {}
  };
}

/**
 * Normalizes a marketplace session object from either snake_case (API) or camelCase (Legacy)
 * to a standardized UI format, preventing crashes on missing fields.
 */
export function normalizeMarketplaceSession(raw: any) {
  if (!raw) return null;
  
  const id = raw.id;
  const jobId = raw.job_id || raw.jobId;
  const jobName = raw.job_name || raw.jobName || 'Unnamed Job';
  
  // Enrichment fields for BPE
  const source = raw.source || 'BPE';
  const sourceRef = raw.source_ref || raw.sourceRef || raw.order_ref || '—';
  
  return {
    id,
    jobId,
    jobName,
    orderId: raw.order_id || raw.orderId,
    tenantId: raw.tenant_id || raw.tenantId || 'default',
    source,
    sourceRef,
    sessionStatus: raw.session_status || raw.sessionStatus || 'OPEN',
    selectionMode: raw.selection_mode || raw.selectionMode || 'AUTO',
    selectedOfferId: raw.selected_offer_id || raw.selectedOfferId || null,
    offerCount: Number(raw.offer_count || raw.offerCount || raw.offers?.length || 0),
    createdAt: raw.created_at || raw.createdAt || null,
    updatedAt: raw.updated_at || raw.updatedAt || null,
    offers: safeArray(raw.offers).map(normalizeOffer),
    events: safeArray(raw.events || raw.history || []),
    errorJson: raw.error_json || raw.error || null,
    metadata: raw.metadata_json || raw.metadata || {}
  };
}
