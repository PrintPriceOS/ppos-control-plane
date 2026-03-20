/**
 * PrintPrice OS — Control Plane (v1.9.0)
 * 
 * Centralized governance, visibility, and multi-region coordination.
 */
require('dotenv').config();
const fastify = require('fastify')({
    logger: true
});

const path = require('path');

// Security: Admin Auth Hook
fastify.addHook('onRequest', async (request, reply) => {
    const url = request.url;

    // 1. PUBLIC ROUTES (Always allowed)
    // Infrastructure health
    if (url.startsWith('/health')) return;
    
    // UI Static Assets & Shell
    if (url === '/' || url === '/index.html' || url.startsWith('/assets/') || url.includes('favicon')) return;

    // 2. API BYPASS (Specific endpoints that handle their own auth or are public)
    if (url.includes('/api/admin') || url.includes('/api/v2/analytics') || url.includes('/api/system') || url.includes('/api/preflight') || url.includes('/api/auth')) return;

    // 3. PROTECTED ROUTES (Require Bearer Token)
    // Currently protecting Federation and any other generic API
    if (url.startsWith('/api') || url.startsWith('/federation')) {
        const token = request.headers['authorization'];
        const validToken = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';

        if (!token || token !== `Bearer ${validToken}`) {
            request.log.warn({ url: request.url, ip: request.ip }, 'Unauthorized control plane access');
            return reply.status(401).send({ error: 'Unauthorized: Valid Bearer token required' });
        }
    }
});

// Register Routes
fastify.get('/health', async () => {
    let mode = 'FULL';
    let dependencies = {
        preflight: 'LIVE',
        learning: 'LIVE',
        federation: 'LIVE'
    };

    try {
        const mocks = require('./src/api/services/sharedMocks');
        if (mocks.wasUsed) {
            mode = 'ISOLATED';
            dependencies = {
                preflight: 'UNAVAILABLE',
                learning: 'MOCKED',
                federation: 'MOCKED'
            };
        }
    } catch (e) {}

    return { 
        status: mode === 'ISOLATED' ? 'DEGRADED' : 'UP',
        mode: mode,
        service: 'ppos-control-plane', 
        version: '1.9.0',
        dependencies: dependencies,
        timestamp: new Date().toISOString()
    };
});

const start = async () => {
    try {
        // 1. Register Fastify Static (Product UI - Decoupled Frontend)
        await fastify.register(require('@fastify/static'), {
            root: path.join(__dirname, '../../../frontend/dist'),
            prefix: '/', // serve from root
            wildcard: false 
        });

        // 2. Register Http Proxy (Product API Gateway)
        await fastify.register(require('@fastify/http-proxy'), {
            upstream: `http://localhost:${process.env.PPOS_SERVICE_PORT || 8001}`,
            prefix: '/api/preflight',
            rewritePrefix: '/api/preflight',
            http2: false
        });

        await fastify.register(require('@fastify/http-proxy'), {
            upstream: `http://localhost:${process.env.PPOS_SERVICE_PORT || 8001}`,
            prefix: '/api/auth',
            rewritePrefix: '/api/auth',
            http2: false
        });

        // 3. Register Express Bridge
        await fastify.register(require('@fastify/express'));
        
        // 3. Mount Admin, Analytics & System Routes (Express)
        fastify.use('/api/admin', require('./src/api/routes/admin'));
        fastify.use('/api/v2/analytics', require('./src/api/routes/analyticsV2'));
        fastify.use('/api/system', require('./src/api/routes/system'));
        
        fastify.log.info('Admin, Analytics & System routes mounted');

        // 4. Mount Federation Routes (Fastify)
        await fastify.register(require('./routes/federation'), { prefix: '/federation' });

        // 5. SPA Fallback: All non-API routes serve index.html
        fastify.setNotFoundHandler((request, reply) => {
            const url = request.url;
            
            // API or Federation 404s should stay as 404s
            if (url.startsWith('/api') || url.startsWith('/federation')) {
                return reply.status(404).send({ error: 'Endpoint not found', path: url });
            }

            // For any other route (SPA), serve the index.html from dist
            // We use a safe check here to prevent fatal crashes if dist/index.html is missing
            return reply.sendFile('index.html');
        });

        // 6. Global Error Handler (Prevention of 500 Passenger Crashes)
        fastify.setErrorHandler((error, request, reply) => {
            fastify.log.error(error);
            
            // If it's a validation error or similar, return 400
            if (error.validation) {
                return reply.status(400).send(error);
            }

            // Generic error response instead of crashing the process
            reply.status(500).send({ 
                error: 'Internal Server Error', 
                message: error.message,
                id: request.id 
            });
        });

        const PORT = process.env.PPOS_CONTROL_PORT || 8080;
        await fastify.listen({ port: parseInt(PORT), host: '0.0.0.0' });
        console.log(`[CONTROL-PLANE] Governance layer active on port ${PORT}`);
    } catch (err) {
        console.error('[FATAL-STARTUP-ERROR]', err);
        // Write to a file so we can see it in Plesk File Manager
        try {
            const fs = require('fs');
            fs.writeFileSync('crash.log', `${new Date().toISOString()}\n${err.stack}\n`);
        } catch (fErr) {
            console.error('Failed to write crash.log:', fErr);
        }
        process.exit(1);
    }
};

start();
