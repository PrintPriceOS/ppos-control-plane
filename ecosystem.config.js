module.exports = {
  apps: [
    {
      name: 'ppos-preflight-service',
      cwd: '/opt/printprice-os/ppos-preflight-service',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      out_file: '/opt/printprice-os/runtime-logs/service-out.log',
      error_file: '/opt/printprice-os/runtime-logs/service-error.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PPOS_SERVICE_PORT: '8001',
        ADMIN_API_KEY: 'my-secret-key',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
        PPOS_UPLOADS_DIR: '/opt/printprice-os/temp-staging',
        LOG_LEVEL: 'info'
      }
    },
    {
      name: 'ppos-preflight-worker',
      cwd: '/opt/printprice-os/ppos-preflight-worker',
      script: 'worker.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '2G',
      out_file: '/opt/printprice-os/runtime-logs/worker-out.log',
      error_file: '/opt/printprice-os/runtime-logs/worker-error.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        HEALTH_PORT: '8002',
        PPOS_QUEUE_NAME: 'preflight_async_queue',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
        PPOS_UPLOADS_DIR: '/opt/printprice-os/temp-staging',
        LOG_LEVEL: 'info'
      }
    }
  ]
};
