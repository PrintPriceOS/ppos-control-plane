const Redis = require('ioredis');

const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null
};

const connection = new Redis(redisConfig);

connection.on('error', (err) => {
    console.error('[REDIS-CONNECTION-ERROR]', err.message);
});

module.exports = connection;
