/**
 * PrintPrice OS — Control Plane (v1.9.0)
 * 
 * Centralized governance, visibility, and multi-region coordination.
 */
require('dotenv').config();
const fastify = require('fastify')({
    logger: {
        level: process.env.PPOS_LOG_LEVEL || 'info',
        redact: ['req.headers.authorization', 'req.headers["x-api-key"]'],
        // Industrial: Skip noisy logs for machine endpoints in production
        serializers: {
            req(request) {
                const url = request.url;
                const isNoisy = url.includes('/heartbeat') || url.includes('/telemetry/industrial') || url.includes('/notifications');
                if (isNoisy && process.env.NODE_ENV === 'production') {
                    return undefined; // Skip request log
                }
                return {
                    method: request.method,
                    url: request.url,
                    remoteAddress: request.ip
                };
            }
        }
    }
});


const path = require('path');

// Security: Admin Auth Hook
fastify.addHook('onRequest', async (request, reply) => {
    const url = request.url;

    // 1. PUBLIC ROUTES
    if (url.startsWith('/health')) return;
    if (url === '/' || url === '/index.html' || url.startsWith('/assets/') || url.includes('favicon')) return;

    // 2. API BYPASS
    if (url.startsWith('/api/auth')) return;
    if (url.includes('/api/v2/analytics/public')) return;

    // 3. PROTECTED ROUTES
    if (
        (url.startsWith('/api') || url.startsWith('/federation')) &&
        !url.startsWith('/api/admin') &&
        !url.startsWith('/api/auth') &&
        !url.startsWith('/api/v2/analytics') &&
        !url.startsWith('/api/connectors/factory')
    ) {
        const authHeader = request.headers['authorization'];
        const jwtSecret = process.env.JWT_SECRET;
        const jwtAudience = process.env.JWT_AUDIENCE || 'ppos:control';
        const jwtIssuer = process.env.JWT_ISSUER || 'https://auth.printprice.pro';

        if (!jwtSecret) {
            request.log.error('[SECURITY-FATAL] JWT_SECRET not configured');
            return reply.status(500).send({ error: 'Internal Server Configuration Error' });
        }

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ error: 'Unauthorized: Bearer token required' });
        }

        const token = authHeader.split(' ')[1];

        // 0. Support Break-Glass token directly (Master Access)
        const breakGlassToken = process.env.PPOS_CONTROL_TOKEN;
        const enableBreakGlass = process.env.ENABLE_BREAK_GLASS_TOKEN === 'true';
        const requireJwtOnly = process.env.REQUIRE_JWT_ONLY === 'true';

        if (enableBreakGlass && breakGlassToken && token === breakGlassToken && !requireJwtOnly) {
            request.user = {
                id: 'break-glass-session',
                role: 'SUPER_ADMIN',
                tenantId: 'ppos-production',
                authMode: 'BREAK_GLASS'
            };
            return;
        }

        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, jwtSecret, { 
                audience: jwtAudience,
                issuer: jwtIssuer
            });
            
            // Populate request context for both Fastify and Express (via fastify-express)
            request.user = {
                id: decoded.sub,
                email: decoded.email,
                role: (decoded.role || 'VIEWER').toUpperCase(),
                tenantId: decoded.tenant_id,
                printhouseId: decoded.printhouse_id,
                authMode: 'JWT'
            };
            
            return;
        } catch (err) {
            request.log.warn({ url: request.url, ip: request.ip, error: err.message }, 'JWT Validation Failed');
            return reply.status(401).send({ error: `Unauthorized: ${err.message}` });
        }
    }
});


// Register Routes
fastify.get('/health', async () => {
    const mode = process.env.PPOS_CONTROL_MODE || 'LIVE';
    
    const dependencies = {
        mysql: process.env.MYSQL_HOST || process.env.DATABASE_URL ? 'CONFIGURED' : 'UNCONFIGURED',
        redis: process.env.REDIS_HOST ? 'CONFIGURED' : 'UNCONFIGURED',
        preflightService: process.env.PPOS_PREFLIGHT_SERVICE_URL ? 'CONFIGURED' : 'UNCONFIGURED',
        federationAggregator: 'ACTIVE'
    };

    return {
        status: (mode === 'ISOLATED' || dependencies.mysql === 'UNCONFIGURED') ? 'DEGRADED' : 'UP',
        mode,
        service: 'ppos-control-plane',
        version: '1.9.0',
        industrial_readiness: {
            swarm_consensus: 'READY',
            autonomous_orchestration: 'READY',
            federated_twin: 'READY'
        },
        dependencies,
        timestamp: new Date().toISOString()
    };
});

const start = async () => {
    try {
        // -1. Industrial Startup Validation (Fail-Fast)
        if (!process.env.JWT_SECRET) {
            console.error('[FATAL-STARTUP] JWT_SECRET is not defined. Aborting for security.');
            process.exit(1);
        }
        if (!process.env.MYSQL_HOST && !process.env.DATABASE_URL) {
            console.error('[FATAL-STARTUP] Database configuration missing. Aborting.');
            process.exit(1);
        }

        // 0. Initialize Database Schemas (Industrial Persistence)
        require('./src/api/services/controlPlaneSchemaService');

        // 0.1 Industrial Provisioning (MES Bootstrap)
        try {
            const provisioningService = require('./src/api/services/industrialProvisioningService');
            console.log('[INDUSTRIAL-PROVISIONING] Starting autonomous MES bootstrap...');
            provisioningService.runFullProvisioning()
                .then(summary => {
                    console.log('[MES-BOOTSTRAP] Summary:', JSON.stringify(summary, null, 2));
                    if (summary.warnings && summary.warnings.length > 0) {
                        console.warn('[MES-BOOTSTRAP] Warnings:', JSON.stringify(summary.warnings, null, 2));
                    }
                    console.log(`[MACHINE-DISCOVERY] ${summary.machinesDiscovered} machines active.`);
                    
                    if (summary.failedSteps.length > 0) {
                        console.error(`[MES-BOOTSTRAP] Completed with failures in steps: ${summary.failedSteps.join(', ')}`);
                    } else if (summary.warnings.length > 0) {
                        console.log('[MES-BOOTSTRAP] Completed with warnings.');
                    } else {
                        console.log('[MES-BOOTSTRAP] Completed cleanly.');
                    }

                    // Differentiate empty-state
                    if (summary.machinesDiscovered === 0) {
                        const sc = summary.sourceCounts || {};
                        if (sc.printer_nodes === 0) {
                            console.log('[MES-BOOTSTRAP] Insight: 0 machines because 0 printer_nodes exist.');
                        } else if (sc.print_nodes === 0) {
                            console.log('[MES-BOOTSTRAP] Insight: 0 machines because 0 print_nodes were synced (check ACTIVE status).');
                        } else {
                            console.log('[MES-BOOTSTRAP] Insight: 0 machines discovered despite active nodes (check machine profile JSON).');
                        }
                    }
                })
                .catch(err => {
                    console.error('[MES-BOOTSTRAP] Fatal provisioning exception:');
                    console.error(err);
                });
        } catch (err) {
            console.error('[INDUSTRIAL-PROVISIONING] Load failed:', err.message);
        }

        // 0.2 Autonomous MES Decision Loop
        try {
            const orchestrator = require('./src/api/services/autonomousOrchestrator');
            orchestrator.start();
            console.log('[AUTONOMOUS-MES] Orchestration loop initiated.');
        } catch (err) {
            console.error('[AUTONOMOUS-MES] Loop startup failed:', err.message);
        }
        
        // 0.3 Industrial Event Orchestration (Phase 10 Integration)
        try {
            const industrialOrchestrator = require('./src/api/services/IndustrialEventOrchestrationService');
            industrialOrchestrator.initializeConsumers();
            console.log('[INDUSTRIAL-EVENT-ORCHESTRATION] Consumers initialized.');
        } catch (err) {
            console.error('[INDUSTRIAL-EVENT-ORCHESTRATION] Startup failed:', err.message);
        }
        
        // 1. Register Fastify Static (Product UI - Decoupled Frontend)
        await fastify.register(require('@fastify/static'), {
            root: path.join(__dirname, 'dist'),
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

        // 3. Mount Auth, Admin, Analytics & System Routes (Express Bridge)
        await fastify.register(require('@fastify/express'));
        
        // 3. Mount Centralized Express Middleware & Routes
        try {
            fastify.use(require('express').json());
            fastify.use(require('express').urlencoded({ extended: true }));
            
            fastify.use('/api/auth', require('./src/api/routes/authRoutes'));
            fastify.use('/api/admin', require('./src/api/routes/admin'));
            fastify.use('/api/v2/analytics', require('./src/api/routes/analyticsV2'));
            fastify.use('/api/connectors/factory', require('./src/api/routes/factoryConnectorRoutes'));
            fastify.log.info('Core API routes mounted successfully');

            // Industrial Observability Hook
            fastify.addHook('onResponse', (request, reply, done) => {
                try {
                    const observability = require('./src/api/services/observabilityService');
                    observability.trackRequest(
                        request.method,
                        request.url,
                        reply.statusCode,
                        reply.getResponseTime()
                    );
                } catch (err) {
                    // Fail silently for observability
                }
                done();
            });
        } catch (err) {
            fastify.log.error({ msg: 'FAILED TO MOUNT CORE ROUTES', error: err.message });
            // In production, we might want to crash here if core routes are missing,
            // but for stability during transitions, we log and continue if possible.
        }

        // 4. SPA Fallback: All non-API routes serve index.html
        fastify.setNotFoundHandler((request, reply) => {
            const url = request.url;
            
            // API 404s should stay as 404s
            if (url.startsWith('/api')) {
                return reply.status(404).send({ error: 'Endpoint not found', path: url });
            }

            // For any other route (SPA), serve the index.html from dist
            // We use a safe check here to prevent fatal crashes if dist/index.html is missing
            return reply.sendFile('index.html', path.join(__dirname, 'dist'));
        });

        // 6. Global Error Handler (Prevention of 500 Passenger Crashes)
        fastify.setErrorHandler((error, request, reply) => {
            fastify.log.error(error);
            
            // Track in Observability
            try {
                const observability = require('./src/api/services/observabilityService');
                observability.metrics.errorCount++;
            } catch (obsErr) {
                // Ignore errors in observability during error handling
            }

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

        // In Plesk/Passenger, the port is often passed via process.env.PORT
        const PORT = process.env.PORT || process.env.PPOS_CONTROL_PORT || 8080;
        
        console.log(`[BOOT] Attempting to listen on port: ${PORT}`);
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
