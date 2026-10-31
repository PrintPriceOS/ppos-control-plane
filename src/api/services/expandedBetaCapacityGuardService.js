const crypto = require('crypto');

class ExpandedBetaCapacityGuardService {
    constructor() {
        this._mockLimits = {
            'c_1': { max_orders_per_day: 100, max_customers_per_day: 50, max_open_orders_per_customer: 5, max_file_size_mb: 200, countries: ['US', 'CA'], order_types: ['STANDARD', 'EXPRESS'], printhouses: ['ph_1', 'ph_2'] }
        };
        this._mockUsage = {
            dailyOrders: 0,
            dailyCustomers: 0,
            customerOpenOrders: {},
        };
        this._mockState = {
            paused: false,
            rolledBack: false,
            emergencyStop: false
        };
        this._mockDecisions = [];
    }

    _assertRole(actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'CUSTOMER'].includes(actor.role)) {
            throw new Error('Unauthorized');
        }
    }

    async evaluateExpandedBetaCapacity({ cohortId, tenantId, customerId, action, payload, actor }) {
        this._assertRole(actor);

        if (this._mockState.emergencyStop) return this._recordDecision(false, 'Emergency stop active');
        if (this._mockState.paused) return this._recordDecision(false, 'Expansion paused');
        if (this._mockState.rolledBack) return this._recordDecision(false, 'Expansion rolled back');

        const limits = this._mockLimits[cohortId];
        if (!limits) return this._recordDecision(false, 'Cohort limits not found');

        if (action === 'CREATE_ORDER') {
            if (this._mockUsage.dailyOrders >= limits.max_orders_per_day) return this._recordDecision(false, 'Exceed max_orders_per_day');
            
            // Simplified check, assuming unique customer count is managed outside
            if (this._mockUsage.dailyCustomers >= limits.max_customers_per_day && !this._mockUsage.customerOpenOrders[customerId]) {
                return this._recordDecision(false, 'Exceed max_customers_per_day');
            }

            const openOrders = this._mockUsage.customerOpenOrders[customerId] || 0;
            if (openOrders >= limits.max_open_orders_per_customer) return this._recordDecision(false, 'Exceed max_open_orders_per_customer');

            if (payload.country && !limits.countries.includes(payload.country)) return this._recordDecision(false, 'Disallowed country');
            if (payload.orderType && !limits.order_types.includes(payload.orderType)) return this._recordDecision(false, 'Disallowed order type');
            if (payload.printhouseId && !limits.printhouses.includes(payload.printhouseId)) return this._recordDecision(false, 'Disallowed printhouse');
        }

        if (action === 'UPLOAD_FILE') {
            if (payload.fileSizeMb > limits.max_file_size_mb) return this._recordDecision(false, 'Exceed max_file_size_mb');
        }

        return this._recordDecision(true, 'Capacity allowed');
    }

    _recordDecision(isAllowed, reason) {
        const dec = {
            id: `ebcg_${crypto.randomUUID()}`,
            is_allowed: isAllowed,
            reason,
            created_at: new Date().toISOString()
        };
        this._mockDecisions.push(dec);
        return { is_allowed: isAllowed, reason };
    }

    // Mock helpers for usage
    _simulateUsage(orders, customers, openOrdersByCust) {
        this._mockUsage.dailyOrders = orders;
        this._mockUsage.dailyCustomers = customers;
        this._mockUsage.customerOpenOrders = openOrdersByCust || {};
    }

    _simulateState(state) {
        this._mockState = { ...this._mockState, ...state };
    }
}

module.exports = ExpandedBetaCapacityGuardService;
