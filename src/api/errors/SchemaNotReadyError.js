'use strict';

class SchemaNotReadyError extends Error {
  constructor(capability, findings = []) {
    super('Required database schema is not ready');
    this.name = 'SchemaNotReadyError';
    this.code = 'SCHEMA_NOT_READY';
    this.statusCode = 503;
    this.capability = capability;
    this.findings = findings;
  }
}

module.exports = SchemaNotReadyError;
