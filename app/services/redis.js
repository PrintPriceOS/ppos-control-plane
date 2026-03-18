/**
 * Monolith Redis Client Proxy
 * Redirects to the federated @ppos/shared-infra package.
 */
try {
    const { redis } = require('@ppos/shared-infra');
    module.exports = redis;
} catch (err) {
    console.warn('[MONOLITH-REDIS] @ppos/shared-infra not linked, falling back to relative path');
    module.exports = require('../../workspace/PrintPriceOS_Workspace/ppos-shared-infra/packages/data/redis');
}
