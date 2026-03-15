/**
 * PrintPrice OS — Control Plane (v1.9.0)
 * 
 * Centralized governance, visibility, and multi-region coordination.
 */
require('dotenv').config();
const fastify = require('fastify')({
    logger: true
});

// Register Routes
fastify.get('/health', async () => {
    return { status: 'UP', service: 'ppos-control-plane' };
});

// Federation Health Endpoint
fastify.register(require('./routes/federation'), { prefix: '/federation' });

const start = async () => {
    try {
        const PORT = process.env.PPOS_CONTROL_PORT || 8080;
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`[CONTROL-PLANE] Active on port ${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
