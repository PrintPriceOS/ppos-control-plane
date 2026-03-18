# PM2_PRODUCTION_DEPLOY_PLAN

**Goal**: Standardize process supervision and log management.
**Status**: 🚀 READY FOR PRODUCTION DEPLOYMENT

## 📊 Process Summary

| App Name | Executable | CWD | Initial Env | Memory Limit |
| :--- | :--- | :--- | :--- | :--- |
| `ppos-preflight-service` | `server.js` | `ppos-preflight-service/` | `PPOS_SERVICE_PORT=8001` | `1G` |
| `ppos-preflight-worker` | `worker.js` | `ppos-preflight-worker/` | `HEALTH_PORT=8002` | `2G` |

## 🚀 Deployment Sequence

### 1. File Sync (Local → Production)
- Update `ecosystem.config.js` to match the **actual** production absolute paths if they differ from the defaults.
- Copy/Sync the file to the root of the workspace.

### 2. Execution Commands
```bash
# Register and start the services
pm2 start ecosystem.config.js --env production

# Ensure startup on reboot
pm2 save
pm2 startup
```

### 3. Log Management
PM2 will automatically capture STDOUT/STDERR from Pino and structure them:
- Logs are located at: `~/.pm2/logs/`
- Recommendation: Use `pm2 install pm2-logrotate` on the server to prevent disk exhaustion.

## 🚧 Health Monitoring
- `pm2 monit` to see real-time performance.
- `pm2 logs ppos-preflight-worker` to verify heartbeat and job flow.
