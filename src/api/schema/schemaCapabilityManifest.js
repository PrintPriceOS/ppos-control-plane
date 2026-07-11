'use strict';

module.exports = {
  manifestVersion: 1,
  capabilities: {
    CORE_RUNTIME: {
      required: true,
      tables: {
        tenants: {
          columns: ['id', 'status', 'plan']
        },
        api_keys: {
          columns: ['id', 'tenant_id']
        },
        jobs: {
          columns: ['id', 'tenant_id', 'status']
        }
      }
    },
    PREFLIGHT_REGISTRY: {
      required: true,
      tables: {
        preflight_jobs: {
          columns: ['id', 'tenant_id', 'status', 'original_name']
        }
      }
    }
  }
};
