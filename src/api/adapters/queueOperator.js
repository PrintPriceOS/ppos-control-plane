/**
 * Queue Operator Adapter (V2 - REAL INTEGRATION)
 * Goal: Connect to real BullMQ for background job management.
 */
const { Queue, Job } = require('bullmq');
const connection = require('./redisConnection');

const PPOS_QUEUE_NAME = process.env.PPOS_QUEUE_NAME || 'preflight_async_queue';
const PPOS_LARGE_QUEUE_NAME = 'preflight_large_document';

// Local cache for queue instances
const queues = {};

function getQueue(name = PPOS_QUEUE_NAME) {
    if (!queues[name]) {
        queues[name] = new Queue(name, { connection });
    }
    return queues[name];
}

const queueOperator = {
    getQueue,
    pauseQueue: async (queueName = PPOS_QUEUE_NAME) => {
        const q = getQueue(queueName);
        await q.pause();
        return { ok: true };
    },
    resumeQueue: async (queueName = PPOS_QUEUE_NAME) => {
        const q = getQueue(queueName);
        await q.resume();
        return { ok: true };
    },
    drainQueue: async (queueName = PPOS_QUEUE_NAME) => {
        const q = getQueue(queueName);
        await q.drain();
        return { ok: true };
    },
    getAdminStats: async () => {
        try {
            const queueNames = [PPOS_QUEUE_NAME, PPOS_LARGE_QUEUE_NAME];
            const stats = await Promise.all(queueNames.map(async name => {
                const q = getQueue(name);
                const [counts, isPaused] = await Promise.all([
                    q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
                    q.isPaused()
                ]);
                return {
                    name,
                    status: isPaused ? 'PAUSED' : 'RUNNING',
                    size: counts.waiting + counts.active,
                    counts: counts
                };
            }));

            return {
                queues: stats,
                global: {
                    is_ready: true,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (err) {
            return {
                queues: [],
                global: { is_ready: false, error: err.message }
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
