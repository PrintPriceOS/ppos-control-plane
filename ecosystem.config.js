module.exports = {
  apps: [
    {
      name: 'ppos-preflight-service',
      script: './server.js',
      cwd: './ppos-preflight-service',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PPOS_SERVICE_PORT: 8001,
        PPOS_UPLOADS_DIR: '/opt/printprice-os/temp-staging'
      }
    },
    {
      name: 'ppos-preflight-worker',
      script: './worker.js',
      cwd: './ppos-preflight-worker',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        HEALTH_PORT: 8002,
        PPOS_UPLOADS_DIR: '/opt/printprice-os/temp-staging'
      }
    }
  ]
};
