# PM2 Boot Persistence Guide

This guide describes how to ensure that the PM2-managed services (Service + Worker) persist through server reboots in Ubuntu/Plesk environments.

## 1. Generate Startup Script

Run the following command as the user who will be running the processes.

```bash
pm2 startup
```

This will output a command starting with `sudo env PATH=...`. 
**Copy and run that generated command** to register PM2 as a systemd service.

## 2. Save Current Process List

Once the services are run via `pm2 start ecosystem.config.js`, you MUST save the process list.

```bash
pm2 save
```

This ensures that upon reboot, PM2 will restore the currently running processes (Service + Worker).

## 3. Verification

To verify that the startup script is correctly installed:

```bash
systemctl status pm2-<user>
```

Testing the reboot:
1.  Verify processes are running: `pm2 list`
2.  (Optional) Perform a planned reboot: `sudo reboot`
3.  After reboot, check: `pm2 list`
    Expect: Service and Worker to be in `online` status.
