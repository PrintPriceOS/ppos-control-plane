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
    // Public routes
    if (request.url.startsWith('/health')) return;

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
        timestamp: new Date().toISOString(),
        metrics: {
            memory: process.memoryUsage(),
            uptime: process.uptime()
        }
    };
});

// Federation Health Endpoint
fastify.register(require('./routes/federation'), { prefix: '/federation' });

const start = async () => {
    try {
        const PORT = process.env.PPOS_CONTROL_PORT || 8080;
        await fastify.listen({ port: parseInt(PORT), host: '0.0.0.0' });
        console.log(`[CONTROL-PLANE] Governance layer active on port ${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
