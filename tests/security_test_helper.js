/**
 * tests/security_test_helper.js
 * 
 * Shared test fixtures, mock request/response builders, and in-memory express route dispatchers.
 */
const express = require('express');
const jwt = require('jsonwebtoken');

// Global mock for Redis and BullMQ before loading any routers
const mockRedis = {
    on: () => {},
    defineCommand: () => {},
    ping: () => 'PONG',
    info: () => 'redis_version:7.0.0',
    multi: () => ({ exec: async () => [] })
};

require('module').prototype.require = (function(originalRequire) {
    return function(name) {
        if (name === 'ioredis') {
            const Redis = function() { return mockRedis; };
            Redis.Cluster = function() { return mockRedis; };
            return Redis;
        }
        if (name === 'bullmq') {
            return {
                Queue: function() { return { add: async () => {}, on: () => {} }; },
                Worker: function() { return { on: () => {} }; },
                QueueEvents: function() { return { on: () => {} }; }
            };
        }
        return originalRequire.apply(this, arguments);
    };
})(require('module').prototype.require);

// Hijack Autonomous Governance Loop to prevent hanging background intervals during tests
const governanceLoop = require('../src/api/services/governance/AutonomousGovernanceLoop');
governanceLoop.start = function() {};
governanceLoop.stop = function() {};

const mysqlClient = require('../src/api/services/mysqlClient');
const dataAdapter = require('../src/api/adapters/dataAdapter');

process.env.JWT_SECRET = 'test_secret';
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';
process.env.PPOS_CONTROL_TOKEN = 'secret_internal_token';

// Fixture Accounts
const FIXTURES = {
    tenantA: {
        tenantId: 'tenant-a',
        printhouses: ['printhouse-a1', 'printhouse-a2'],
        factoryId: 'factory-a1',
        machineId: 'machine-a1',
        orderId: 'order-a1',
        jobId: 'job-a1',
        materialId: 'material-a1'
    },
    tenantB: {
        tenantId: 'tenant-b',
        printhouses: ['printhouse-b1'],
        factoryId: 'factory-b1',
        machineId: 'machine-b1',
        orderId: 'order-b1',
        jobId: 'job-b1',
        materialId: 'material-b1'
    }
};

/**
 * Generates a mock JWT token.
 */
function generateMockToken(userPayload) {
    const payload = {
        sub: userPayload.id,
        email: userPayload.email || 'test@printprice.pro',
        role: userPayload.role,
        tenant_id: userPayload.tenantId,
        printhouse_id: userPayload.printhouseId,
        ...userPayload
    };
    return jwt.sign(payload, 'test_secret', {
        audience: 'ppos:control',
        issuer: 'https://auth.printprice.pro'
    });
}

/**
 * Creates mock req & res objects.
 */
function createMockReq(options = {}) {
    const { method = 'GET', url = '/', headers = {}, query = {}, body = {}, user = null } = options;
    
    return {
        method,
        url,
        originalUrl: url,
        path: url.split('?')[0],
        headers: {
            'content-type': 'application/json',
            ...headers
        },
        query,
        body,
        user,
        ip: '127.0.0.1'
    };
}

/**
 * Dispatches a request in-memory to the given Express router.
 */
function dispatchRequest(router, req) {
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            headers: {},
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                this.body = data;
                resolve(this);
                return this;
            },
            send(data) {
                this.body = data;
                resolve(this);
                return this;
            },
            setHeader(name, value) {
                this.headers[name] = value;
                return this;
            },
            end() {
                resolve(this);
            }
        };

        // Express router execution
        router(req, res, (err) => {
            if (err) {
                res.statusCode = err.status || 500;
                res.body = { error: err.message };
            } else {
                res.statusCode = res.statusCode || 404;
                res.body = res.body || { error: 'Not Found' };
            }
            resolve(res);
        });
    });
}

// Global Query Stubbing Hook
let queryStub = null;

mysqlClient.query = async function(sql, params) {
    if (queryStub) {
        return queryStub(sql, params);
    }
    return [];
};

if (dataAdapter) {
    dataAdapter.query = mysqlClient.query;
}

function setQueryStub(stub) {
    queryStub = stub;
}

/**
 * Clean up connections to end testing naturally.
 */
async function teardown() {
    await mysqlClient.closePool();
}

module.exports = {
    FIXTURES,
    generateMockToken,
    createMockReq,
    dispatchRequest,
    setQueryStub,
    teardown
};
