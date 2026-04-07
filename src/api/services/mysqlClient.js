// src/api/services/mysqlClient.js
const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
    if (pool) return pool;

    pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '3306'),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    console.log('[MYSQL] Connection pool created');
    return pool;
}

async function query(sql, params = []) {
    const [rows] = await getPool().execute(sql, params);
    return rows;
}

module.exports = { getPool, query };
