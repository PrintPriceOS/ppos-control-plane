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

        if (healthyWorkers.length === 0) {
            throw new Error('NO_HEALTHY_WORKERS_AVAILABLE');
        }

        // Capability Match
        let targetWorkers = healthyWorkers;
        if (needsTrimboxFix) {
            targetWorkers = targetWorkers.filter(w => w.capabilities?.trimbox_repair);
        }
        if (needsColorNorm) {
            targetWorkers = targetWorkers.filter(w => w.capabilities?.color_normalization);
        }

        // If no specialized worker found, fallback to general if safe, or fail-loud
        if (targetWorkers.length === 0) {
            logger.error({
                event: 'scheduling_failure',
                jobId: id,
                requirements: { isLarge, needsColorNorm, needsTrimboxFix }
            });
            throw new Error('UNSUPPORTED_CAPABILITY_REQUIREMENT');
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
