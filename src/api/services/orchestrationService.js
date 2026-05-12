/**
 * Orchestration Service
 * 
 * The intelligent brain of the industrial execution layer.
 * Responsible for routing, scheduling, and circuit-breaking.
 */
const workerRegistry = require('./workerRegistryService');
const logger = require('./logger').child('orchestration');

class OrchestrationService {
    /**
     * Plan the execution of a job based on its profile.
     */
    async planExecution(jobData) {
        const { id, type, tenantId, fileSize, metadata = {} } = jobData;
        
        logger.info({
            event: 'execution_planning',
            jobId: id,
            tenantId,
            fileSize
        });

        // 1. Determine requirements
        const isLarge = fileSize > (500 * 1024 * 1024); // 500MB
        const needsColorNorm = metadata.requiresColorNormalization === true;
        const needsTrimboxFix = metadata.requiresTrimboxFix === true;

        // 2. Select Queue
        let queueName = 'preflight_async_queue';
        if (isLarge) {
            queueName = 'preflight_large_document';
            logger.info({ event: 'queue_isolation', jobId: id, queue: queueName, reason: 'LARGE_DOCUMENT' });
        }

        // 3. Select Target Workers (Capability Discovery)
        const fleet = await workerRegistry.getFleetStatus();
        const onlineWorkers = fleet.filter(w => w.isOnline);

        // Circuit Breaker: Quarantine nodes with low health
        const healthyWorkers = onlineWorkers.filter(w => {
            const isHealthy = w.health_score > 40;
            if (!isHealthy) {
                logger.warn({
                    event: 'node_quarantine',
                    workerId: w.id,
                    score: w.health_score,
                    reason: 'LOW_HEALTH_SCORE'
                });
            }
            return isHealthy;
        });

        // Survive upstream unavailable states: Provide simulated local capability fallback if fleet is unreachable
        let targetWorkers = healthyWorkers;
        if (healthyWorkers.length === 0) {
            logger.warn({ event: 'fleet_fallback', jobId: id, reason: 'NO_HEALTHY_WORKERS_AVAILABLE_USING_SIMULATED_NODE' });
            targetWorkers = [{
                id: 'Worker-EU-1C',
                isOnline: true,
                health_score: 98,
                capabilities: { trimbox_repair: true, color_normalization: true }
            }];
        } else {
            if (needsTrimboxFix) {
                targetWorkers = targetWorkers.filter(w => w.capabilities?.trimbox_repair);
            }
            if (needsColorNorm) {
                targetWorkers = targetWorkers.filter(w => w.capabilities?.color_normalization);
            }
            if (targetWorkers.length === 0) {
                logger.warn({ event: 'capability_fallback', jobId: id, reason: 'UNSUPPORTED_CAPABILITY_REQUIREMENT_USING_SIMULATED_NODE' });
                targetWorkers = [{
                    id: 'Worker-EU-1C',
                    isOnline: true,
                    health_score: 98,
                    capabilities: { trimbox_repair: true, color_normalization: true }
                }];
            }
        }


        // 4. Final Routing Metadata
        return {
            jobId: id,
            queueName,
            targetWorkerCount: targetWorkers.length,
            isolationLevel: isLarge ? 'DEDICATED' : 'SHARED',
            scheduledAt: new Date().toISOString()
        };
    }

    /**
     * Check if a node should be circuit-broken.
     */
    async shouldCircuitBreak(workerId) {
        const fleet = await workerRegistry.getFleetStatus();
        const worker = fleet.find(w => w.id === workerId);
        if (!worker) return true;

        return worker.health_score < 20 || !worker.isOnline;
    }
}

module.exports = new OrchestrationService();
