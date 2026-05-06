// src/api/services/mysqlClient.js
const mysql = require('mysql2/promise');

const logger = require('./logger').child('mysql-client');

let pool = null;

function getPool() {
    if (pool) return pool;

    let config = {
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT || '3306'),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };

    let usedUrl = false;

    // Priority 1: Parse DATABASE_URL if available
    if (process.env.DATABASE_URL) {
        try {
            const dbUrl = new URL(process.env.DATABASE_URL);
            config.host = dbUrl.hostname;
            config.port = parseInt(dbUrl.port || '3306');
            config.user = dbUrl.username;
            config.password = decodeURIComponent(dbUrl.password);
            config.database = dbUrl.pathname.replace(/^\//, '');
            usedUrl = true;
            
            logger.info({
                event: 'config_parsed_from_url',
                message: 'MySQL configuration parsed from DATABASE_URL',
                metadata: { host: config.host, database: config.database, user: config.user }
            });
        } catch (err) {
            logger.warn({
                event: 'config_url_parse_failed',
                message: 'Failed to parse DATABASE_URL, falling back to discrete variables',
                metadata: { error: err.message }
            });
        }
    }

    pool = mysql.createPool(config);

    // Bootstrap validation logic
    pool.on('connection', (connection) => {
        logger.debug({ event: 'new_connection', message: 'New MySQL connection established' });
    });

    pool.on('error', (err) => {
        logger.error({
            event: 'pool_error',
            message: 'MySQL Pool Error',
            metadata: { 
                code: err.code,
                host: config.host,
                database: config.database,
                user: config.user,
                usedUrl
            }
        });
    });

    logger.info({
        event: 'pool_created',
        message: 'MySQL Connection pool initialized',
        metadata: { 
            host: config.host || 'NOT_SET',
            database: config.database || 'NOT_SET',
            user: config.user || 'NOT_SET',
            usedUrl
        }
    });

    return pool;
}

async function query(sql, params = []) {
    const [rows] = await getPool().query(sql, params);
    return rows;
}

module.exports = { getPool, query };
