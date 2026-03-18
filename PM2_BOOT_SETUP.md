# PM2_BOOT_SETUP.md

Ensure the PrintPrice OS Runtime persists across server reboots.

## 1. Initial Setup

After starting the ecosystem via `pm2 start ecosystem.config.js`:

```bash
# 1. Generate the systemd startup script
pm2 startup
```

The output will contain a command starting with `sudo env PATH=...`. 
**COPY AND RUN THAT GENERATED COMMAND** to register PM2 as a systemd service.

## 2. Save Current State

Once the startup script is installed, save the currently running process list.

```bash
# 2. Save the process list to the config file
pm2 save
```

This updates the `dump.pm2` file, ensuring that upon reboot, PM2 will restore both the Service and the Worker.

## 3. Verification

After saving the state, you can verify that the systemd service is active:

```bash
# 3. Check the status of the PM2 systemd service
systemctl status pm2-<user>
```

Testing the reboot:
1.  Verify processes are running: `pm2 list` (Expect: online)
2.  (Optional) Perform a planned reboot: `sudo reboot`
3.  After reboot, check: `pm2 list`
    Expect: Both Service and Worker to be in `online` status.

## 4. Updates to Ecosystem

If you modify the `ecosystem.config.js` or add new services, you MUST run:

```bash
pm2 save
```

to ensure the changes persist across reboots.
