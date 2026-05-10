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
    },
    {
      name: 'ppos-control-plane',
      script: 'server.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1500M',
      kill_timeout: 10000,       // 10s graceful shutdown window
      listen_timeout: 15000,     // 15s startup readiness timeout
      wait_ready: false,
      restart_delay: 2000,       // 2s cooldown between restarts
      exp_backoff_restart_delay: 100,
      error_file: './logs/control-plane-error.log',
      out_file: './logs/control-plane-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        PORT: 8081,
        PPOS_CONTROL_MODE: 'LIVE',
        PPOS_LOG_LEVEL: 'info',
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 8081,
        PPOS_LOG_LEVEL: 'debug',
      },
    }
  ]
};
