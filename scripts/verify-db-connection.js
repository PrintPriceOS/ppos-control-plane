/**
 * scripts/verify-db-connection.js
 * 
 * Verifies MySQL connectivity using the enterprise-grade logic.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { getPool } = require('../src/api/services/mysqlClient');

async function testConnection() {
    console.log('--- MySQL Connection Audit ---');
    console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
    console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
    console.log('MYSQL_HOST:', process.env.MYSQL_HOST || 'NOT_SET');
    console.log('MYSQL_DATABASE:', process.env.MYSQL_DATABASE || 'NOT_SET');
    
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT 1 + 1 AS result');
        console.log('✅ Connection Successful!');
        console.log('Result from DB:', rows[0].result);
        
        // Check grants
        const [userRows] = await pool.query('SELECT USER(), CURRENT_USER()');
        console.log('Current Session User:', userRows[0]['USER()']);
        console.log('Matched User Grant:', userRows[0]['CURRENT_USER()']);
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection Failed!');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('\nPOSSIBLE CAUSE: Invalid credentials or missing grants for this host.');
        } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
            console.error('\nPOSSIBLE CAUSE: MySQL service is not running or host/port is incorrect.');
        }
        
        process.exit(1);
    }
}

testConnection();
