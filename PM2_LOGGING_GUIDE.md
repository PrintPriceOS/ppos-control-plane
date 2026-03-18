# PM2 Logging & Observability Guide

Learn how to monitor, inspect, and maintain logs for the Service and Worker.

## 1. Log Inspection

Monitor real-time logs:
```bash
# View all logs
pm2 logs

# View only the service logs
pm2 logs ppos-preflight-service

# View only the worker logs
pm2 logs ppos-preflight-worker
```

Using the PM2 Monitor:
```bash
pm2 monit
```
`pm2 monit` provides a real-time terminal-based dashboard for monitoring CPU, Memory, and log output.

## 2. Structured Log Recommendation

Both the Service and Worker are designed to work well with structured logging (Pino-compatible). PM2 captures `stdout` and `stderr` as defined in `ecosystem.config.js`.

The current log paths:
- Service Out: `/opt/printprice-os/runtime-logs/service-out.log`
- Service Error: `/opt/printprice-os/runtime-logs/service-error.log`
- Worker Out: `/opt/printprice-os/runtime-logs/worker-out.log`
- Worker Error: `/opt/printprice-os/runtime-logs/worker-error.log`

## 3. Log Rotation

To prevent logs from consuming all disk space, implement `pm2-logrotate`.

```bash
# Install the rotation module
pm2 install pm2-logrotate

# Configure rotation parameters
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 10
pm2 set pm2-logrotate:compress true
```

Alternatively, standard system `logrotate` can be configured for files in `/opt/printprice-os/runtime-logs/`.

### Configuration Details:
- `max_size`: Rotates the log once it reaching the defined size.
- `retain`: Number of old logs to keep.
- `compress`: Compress rotated logs with gzip.
