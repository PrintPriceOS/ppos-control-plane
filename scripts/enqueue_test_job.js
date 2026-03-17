/**
 * Test Job Enqueue Script (Activation Phase 7.5)
 * 
 * Enqueues a real BullMQ job into 'preflight_async_queue'
 * to verify worker consumption and control plane visibility.
 */
require('dotenv').config({ path: '../../.env' }); // Adjust path to find the .env
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null
};

const queueName = process.env.PPOS_QUEUE_NAME || 'preflight_async_queue';

async function enqueueTest() {
    console.log(`[TEST-ENQUEUE] Connecting to Redis at ${redisConfig.host}:${redisConfig.port}...`);
    const connection = new IORedis(redisConfig);
    
    const testQueue = new Queue(queueName, { connection });

    const jobType = 'ANALYZE';
    const payload = {
        filePath: '/tmp/test_activation_seed.pdf',
        tenantId: 'tenant-activation-test',
        assetId: `test-asset-${Date.now()}`,
        testJob: true
    };

    console.log(`[TEST-ENQUEUE] Adding ${jobType} job to ${queueName}...`);
    
    try {
        const job = await testQueue.add(jobType, payload, {
            attempts: 1,
            removeOnComplete: false,
            removeOnFail: false
        });

        console.log(`[TEST-ENQUEUE] SUCCESS! Job ID: ${job.id}`);
        console.log(`[TEST-ENQUEUE] Check Control Plane -> Jobs Tab for ID: ${job.id}`);
    } catch (err) {
        console.error(`[TEST-ENQUEUE] FAILED: ${err.message}`);
    } finally {
        await connection.quit();
        process.exit(0);
    }
}

enqueueTest();
