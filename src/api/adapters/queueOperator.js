/**
 * Queue Operator Adapter (V2 - REAL INTEGRATION)
 * Goal: Connect to real BullMQ for background job management.
 */
const { Queue, Job } = require('bullmq');
const connection = require('./redisConnection');

const PPOS_QUEUE_NAME = process.env.PPOS_QUEUE_NAME || 'preflight_async_queue';

// Local cache for queue instances
const queues = {};

function getQueue(name = PPOS_QUEUE_NAME) {
    if (!queues[name]) {
        queues[name] = new Queue(name, { connection });
    }
    return queues[name];
}

const queueOperator = {
    pauseQueue: async (queueName = PPOS_QUEUE_NAME) => {
        try {
            const queue = getQueue(queueName);
            await queue.pause();
            console.log(`[QUEUE-OPERATOR] Paused queue: ${queueName}`);
            return { ok: true, message: `Queue ${queueName} paused` };
        } catch (err) {
            console.error(`[QUEUE-OPERATOR] Failed to pause ${queueName}:`, err.message);
            return { ok: false, error: err.message };
        }
    },

    resumeQueue: async (queueName = PPOS_QUEUE_NAME) => {
        try {
            const queue = getQueue(queueName);
            await queue.resume();
            console.log(`[QUEUE-OPERATOR] Resumed queue: ${queueName}`);
            return { ok: true, message: `Queue ${queueName} resumed` };
        } catch (err) {
            console.error(`[QUEUE-OPERATOR] Failed to resume ${queueName}:`, err.message);
            return { ok: false, error: err.message };
        }
    },

    drainQueue: async (queueName = PPOS_QUEUE_NAME) => {
        try {
            const queue = getQueue(queueName);
            await queue.drain();
            console.log(`[QUEUE-OPERATOR] Drained queue: ${queueName}`);
            return { ok: true, message: `Queue ${queueName} drained` };
        } catch (err) {
            console.error(`[QUEUE-OPERATOR] Failed to drain ${queueName}:`, err.message);
            return { ok: false, error: err.message };
        }
    },

    getAdminStats: async (queueName = PPOS_QUEUE_NAME) => {
        try {
            const queue = getQueue(queueName);
            const [counts, isPaused] = await Promise.all([
                queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
                queue.isPaused()
            ]);

            return {
                queues: [
                    { 
                        name: queueName, 
                        status: isPaused ? 'PAUSED' : 'RUNNING', 
                        size: counts.waiting + counts.active,
                        counts: counts
                    }
                ],
                global: {
                    is_ready: true,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (err) {
            console.warn('[QUEUE-OPERATOR] Real stats failed, returning fallback mock:', err.message);
            return {
                queues: [
                    { name: queueName, status: 'UNKNOWN', size: 0, error: err.message }
                ],
                global: { is_ready: false }
            };
        }
    },

    /**
     * Phase 7.3: Get Real Jobs
     */
    getJobs: async (queueName = PPOS_QUEUE_NAME, limit = 50, offset = 0) => {
        try {
            const queue = getQueue(queueName);
            // Get raw job objects
            const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed'], offset, offset + limit - 1, false);
            
            // Hydrate status for current page (async)
            const hydrated = await Promise.all(jobs.map(async j => {
                const status = await j.getState();
                const processedAt = j.processedOn ? new Date(j.processedOn).toISOString() : null;
                const finishedAt = j.finishedOn ? new Date(j.finishedOn).toISOString() : null;
                
                let durationMs = null;
                if (j.processedOn && j.finishedOn) {
                    durationMs = j.finishedOn - j.processedOn;
                }

                return {
                    id: j.id,
                    name: j.name,
                    status: status.toUpperCase(),
                    progress: j.progress,
                    created_at: new Date(j.timestamp).toISOString(),
                    processed_at: processedAt,
                    finished_at: finishedAt,
                    duration_ms: durationMs,
                    error: j.failedReason || null,
                    data: j.data,
                    attempts: j.attemptsMade
                };
            }));

            return hydrated;
        } catch (err) {
            console.error('[QUEUE-OPERATOR] Failed to fetch real jobs:', err.message);
            return [];
        }
    }
};

module.exports = queueOperator;
