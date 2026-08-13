/**
 * src/api/services/printhouseDeliveryEstimateService.js
 * 
 * Phase 191G: Non-Binding Delivery Estimate Service.
 * Computes estimated delivery date windows by adding:
 *   PRODUCTION_LEAD_TIME (Phase 191E)
 *   + HANDLING_TIME
 *   + TRANSIT_TIME
 *   = ESTIMATED_DELIVERY_WINDOW
 * 
 * Non-binding, non-contractual, zero side-effects, does not alter orders or purchase labels.
 */
const shippingRegionService = require('./printhouseShippingRegionService');

class PrinthouseDeliveryEstimateService {

    async computeDeliveryEstimate(tenantId, payload) {
        const {
            siteId,
            regionId,
            productionLeadDays = 5, // Default from Phase 191E if omitted
            isExpedited = false,
            startDateIso = new Date().toISOString()
        } = payload || {};

        let handlingDays = 1;
        let transitDaysMin = isExpedited ? 1 : 3;
        let transitDaysMax = isExpedited ? 2 : 5;
        let pickupAvailable = false;
        let regionName = 'Standard Shipping Region';

        if (regionId) {
            try {
                const region = await shippingRegionService.getShippingRegionById(tenantId, regionId);
                handlingDays = region.handlingDays || 1;
                transitDaysMin = isExpedited ? (region.expeditedTransitDays || 1) : (region.standardTransitDays || 3);
                transitDaysMax = transitDaysMin + 2;
                pickupAvailable = region.pickupAvailable;
                regionName = region.name;
            } catch (e) {
                // If region not found, fallback gracefully to default estimate bounds
            }
        }

        const baseDate = new Date(startDateIso);
        
        // 1. Production Complete Date
        const prodCompleteDate = new Date(baseDate);
        prodCompleteDate.setDate(prodCompleteDate.getDate() + Number(productionLeadDays));

        // 2. Dispatch Ready Date (Production Complete + Handling Days)
        const dispatchReadyDate = new Date(prodCompleteDate);
        dispatchReadyDate.setDate(dispatchReadyDate.getDate() + Number(handlingDays));

        // 3. Estimated Delivery Window (Dispatch Ready + Transit Min/Max Days)
        const deliveryFromDate = new Date(dispatchReadyDate);
        deliveryFromDate.setDate(deliveryFromDate.getDate() + Number(transitDaysMin));

        const deliveryToDate = new Date(dispatchReadyDate);
        deliveryToDate.setDate(deliveryToDate.getDate() + Number(transitDaysMax));

        return {
            tenantId,
            siteId: siteId || 'default-site',
            regionId: regionId || null,
            regionName,
            isExpedited: Boolean(isExpedited),
            pickupAvailable,
            timelineComponents: {
                productionLeadDays: Number(productionLeadDays),
                handlingDays: Number(handlingDays),
                transitDaysMin: Number(transitDaysMin),
                transitDaysMax: Number(transitDaysMax),
                totalEstimatedDaysMin: Number(productionLeadDays) + Number(handlingDays) + Number(transitDaysMin),
                totalEstimatedDaysMax: Number(productionLeadDays) + Number(handlingDays) + Number(transitDaysMax)
            },
            timestamps: {
                estimateRequestedAt: baseDate.toISOString(),
                productionCompleteAt: prodCompleteDate.toISOString(),
                dispatchReadyAt: dispatchReadyDate.toISOString()
            },
            estimatedDeliveryWindow: {
                from: deliveryFromDate.toISOString().split('T')[0],
                to: deliveryToDate.toISOString().split('T')[0]
            },
            provenance: 'SYSTEM_COMPUTED_NON_BINDING',
            nonBinding: true,
            disclaimer: 'Delivery estimate is indicative for operational planning and does not constitute a contractual guarantee or carrier shipping label creation.'
        };
    }
}

module.exports = new PrinthouseDeliveryEstimateService();
