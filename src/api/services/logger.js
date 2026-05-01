/**
 * src/api/services/logger.js
 * 
 * Production-grade Structured Logger for PrintPrice OS Control Plane.
 * Supports Trace ID correlation, service scopes, and forensic metadata.
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4
};

const CURRENT_LEVEL = process.env.PPOS_LOG_LEVEL || 'INFO';

class Logger {
    constructor(scope = 'global') {
        this.scope = scope;
    }

    /**
     * Internal formatting for industrial-grade logs
     */
    _log(level, payload) {
        if (LOG_LEVELS[level] < LOG_LEVELS[CURRENT_LEVEL]) return;

        const timestamp = new Date().toISOString();
        
        // Normalize payload: if string, convert to object
        const entry = typeof payload === 'string' 
            ? { message: payload } 
            : { ...payload };

        const structuredEntry = {
            timestamp,
            severity: level,
            service: 'ppos-control-plane',
            scope: entry.scope || this.scope,
            event: entry.event || 'generic_event',
            traceId: entry.traceId || 'no-trace',
            jobId: entry.jobId || null,
            tenantId: entry.tenantId || null,
            metadata: entry.metadata || {},
            message: entry.message || null
        };

        // In production, we use JSON for Datadog/ELK compatibility
        // In dev, we can keep it readable
        if (process.env.NODE_ENV === 'production' || process.env.PPOS_LOG_JSON === 'true') {
            console.log(JSON.stringify(structuredEntry));
        } else {
            const color = level === 'ERROR' ? '\x1b[31m' : level === 'WARN' ? '\x1b[33m' : '\x1b[32m';
            console.log(`${timestamp} [${color}${level}\x1b[0m] [${structuredEntry.scope}] ${structuredEntry.event}: ${structuredEntry.message || ''}`, structuredEntry.metadata);
        }
    }

    debug(payload) { this._log('DEBUG', payload); }
    info(payload) { this._log('INFO', payload); }
    warn(payload) { this._log('WARN', payload); }
    error(payload) { this._log('ERROR', payload); }
    fatal(payload) { this._log('FATAL', payload); }

    /**
     * Creates a scoped logger for a specific module
     */
    child(scope) {
        return new Logger(scope);
    }
}

module.exports = new Logger();
