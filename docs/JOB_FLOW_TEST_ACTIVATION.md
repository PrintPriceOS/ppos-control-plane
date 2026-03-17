# JOB_FLOW_TEST_ACTIVATION

**Purpose**: Safely trigger a real job to verify the end-to-end runtime without full product integration.

## 🛠️ Test Enqueue Mechanism

A standalone script has been created to bypass the frontend/service layer and inject a job directly into the BullMQ system.

**Location**: `ppos-control-plane/scripts/enqueue_test_job.js`

### How to use:
1. Ensure the Control Plane is configured (Redis host/port in `.env`).
2. Run the script:
   ```bash
   cd workspace/PrintPriceOS_Workspace/ppos-control-plane
   node scripts/enqueue_test_job.js
   ```

## 📋 Activation Payload (Real-World Match)

The script uses a payload that mimics a large file analysis request:

```json
{
  "filePath": "/tmp/test_activation_seed.pdf",
  "tenantId": "tenant-activation-test",
  "assetId": "test-asset-1773783621000",
  "testJob": true
}
```

## 📡 Verification Chain
1. **Queue**: Run `node scripts/enqueue_test_job.js`. Check if a new job appears in Redis.
2. **Worker**: Check `ppos-preflight-worker` logs for `[PROCESSOR][ANALYZE] Running engine...`.
3. **Control Plane**: Navigate to `Jobs` tab on `control.printprice.pro` (or localhost) and verify the job status moves from `Wait` to `Active` to `Completed`.
