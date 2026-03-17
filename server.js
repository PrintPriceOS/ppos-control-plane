/**
 * PrintPrice OS — Control Plane (v1.9.0)
 * 
 * Centralized governance, visibility, and multi-region coordination.
 */
require('dotenv').config();
const fastify = require('fastify')({
    logger: true
});

// Security: Admin Auth Hook
fastify.addHook('onRequest', async (request, reply) => {
    // Public routes (Health checks)
    if (request.url.startsWith('/health')) return;
    
    // Legacy Admin API bypass (Handled by Express routers logic)
    if (request.url.startsWith('/api/admin') || request.url.startsWith('/api/v2/analytics') || request.url.startsWith('/api/system')) return;

    const token = request.headers['authorization'];
    const validToken = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';

    if (!token || token !== `Bearer ${validToken}`) {
        request.log.warn({ url: request.url, ip: request.ip }, 'Unauthorized control plane access');
        return reply.status(401).send({ error: 'Unauthorized: Valid Bearer token required' });
    }
});

// Register Routes
fastify.get('/health', async () => {
    return { 
        status: 'UP', 
        service: 'ppos-control-plane', 
        version: '1.9.0',
        timestamp: new Date().toISOString()
    };
});

const start = async () => {
    try {
        // 1. Register Express Bridge
        await fastify.register(require('@fastify/express'));
        
        // 2. Mount Admin, Analytics & System Routes (Express)
        fastify.use('/api/admin', require('./src/api/routes/admin'));
        fastify.use('/api/v2/analytics', require('./src/api/routes/analyticsV2'));
        fastify.use('/api/system', require('./src/api/routes/system'));
        
        fastify.log.info('Admin, Analytics & System routes mounted');

        // 3. Mount Federation Routes (Fastify)
        await fastify.register(require('./routes/federation'), { prefix: '/federation' });

        const PORT = process.env.PPOS_CONTROL_PORT || 8080;
        await fastify.listen({ port: parseInt(PORT), host: '0.0.0.0' });
        console.log(`[CONTROL-PLANE] Governance layer active on port ${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
