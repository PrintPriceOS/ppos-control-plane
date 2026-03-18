# LOGGING_ROLLOUT_NOTES

**Version**: 1.11.1 (Structured Logging)
**Status**: 🟢 SAFE / STAGED

Correlation fields have been added to the worker processing logic to improve observability without altering the job flow.

## 📡 Traceability Logic
The `QueueManager.js` now implements a `childLogger`:
- **Inputs**: `job.id`, `job.name`, `tenantId`, `assetId`.
- **Propagation**: Passed to `JobRouter.route` and both `AnalyzeProcessor` and `AutofixProcessor`.

## 📋 Log Sample (JSON)
Logs will now appear as structured JSON instead of flat console strings:
```json
{
  "level": 30,
  "time": 1679050000000,
  "message": "Job processing started",
  "jobId": "...",
  "type": "AUTOFIX",
  "tenantId": "...",
  "assetId": "...",
  "worker": "preflight-worker-..."
}
```

## ✅ Regression Check
- **Output**: JSON logs are easier to parse by systems like **DataDog, ELK, or CloudWatch**.
- **Performance**: Pino's overhead is minimal. No impact on job throughput.
- **Safety**: No sensitive information (passwords, file contents) is included in the metadata.
