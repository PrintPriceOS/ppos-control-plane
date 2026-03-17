/**
 * Queue Operator Adapter
 * Goal: Safe no-op implementation for background job management.
 */

const queueOperator = {
    pauseQueue: async (queueName) => {
        console.log(`[QUEUE-OPERATOR-MOCK] Pausing queue: ${queueName}`);
        return { ok: true, message: `Queue ${queueName} paused (mock)` };
    },

    resumeQueue: async (queueName) => {
        console.log(`[QUEUE-OPERATOR-MOCK] Resuming queue: ${queueName}`);
        return { ok: true, message: `Queue ${queueName} resumed (mock)` };
    },

    drainQueue: async (queueName) => {
        console.log(`[QUEUE-OPERATOR-MOCK] Draining queue: ${queueName}`);
        return { ok: true, message: `Queue ${queueName} drained (mock)` };
    },

    getAdminStats: async () => {
        return {
            queues: [
                { name: 'analysis', status: 'PAUSED', size: 12 },
                { name: 'fix', status: 'RUNNING', size: 0 }
            ],
            workers: 4
        };
    }
};

module.exports = queueOperator;
