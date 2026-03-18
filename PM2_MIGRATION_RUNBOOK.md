# PM2 Migration Runbook (NOHUP → PM2)

This document outlines the zero-risk migration plan for the PrintPrice OS runtime layer (Service + Worker).

## 1. Pre-Migration Verification

Ensure the systems are healthy before starting:

```bash
# Verify current processes
ps aux | grep node

# Check current nohup log size/tail to ensure activities
tail -f nohup.out
```

## 2. Stop CURRENT Processes

We MUST stop the existing `nohup` processes gracefully if possible, or forcefully if not.

```bash
# Locate and stop the service
# Assuming you know where they were started from.
pkill -f "node server.js"
pkill -f "node worker.js"

# Alternatively, find PIDs and kill:
# ps -ef | grep node
# kill <pid>
```

## 3. Prepare Environment

Ensure the log directory exists.

```bash
sudo mkdir -p /opt/printprice-os/runtime-logs/
sudo chmod 777 /opt/printprice-os/runtime-logs/
```

## 4. Start via PM2

Using the `ecosystem.config.js` provided in the repository.

```bash
cd /opt/printprice-os/
pm2 start ecosystem.config.js
```

## 5. Migration Validation

Check the status of the processes.

```bash
pm2 list
pm2 show ppos-preflight-service
pm2 show ppos-preflight-worker
```

Verify logs:
```bash
pm2 logs
```

## 6. Validation Checkpoints

1.  **Health Endpoints**: Test the service health URL.
2.  **Control Plane Visibility**: Open the Plesk-managed control plane to see if workers are active.
3.  **Job Execution**: Trigger a test job to ensure BullMQ is processing correctly.

## 7. Rollback Path

If anything fails, proceed to the [PM2_ROLLBACK_PLAN.md](file:///opt/printprice-os/PM2_ROLLBACK_PLAN.md).
