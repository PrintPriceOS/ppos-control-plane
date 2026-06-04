async function run() {
  const { shouldRemoveBackgroundJob, isTerminalPreflightStatus, normalizeBackgroundJobStatus } = await import('../src/ui/lib/jobMonitorHelpers.js');

  console.log("=====================================================");
  console.log("PHASE 43 SMOKE TEST: BACKGROUND MONITOR STALE CLEANUP");
  console.log("=====================================================\n");

  let failures = 0;
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  console.log("1. Testing isTerminalPreflightStatus...");
  const terminalTests = [
    { status: 'COMPLETED', expected: true },
    { status: 'FAILED', expected: true },
    { status: 'QUEUED', expected: false },
    { status: 'PROCESSING', expected: false },
    { status: '', expected: false }
  ];

  for (const t of terminalTests) {
    if (isTerminalPreflightStatus(t.status) !== t.expected) {
      console.error(`   ❌ Failed: ${t.status} should be ${t.expected}`);
      failures++;
    }
  }
  if (failures === 0) console.log("   ✅ isTerminalPreflightStatus verified.");

  console.log("\n2. Testing normalizeBackgroundJobStatus...");
  const normTests = [
    { display: 'A', upstream: 'B', registry: 'C', expected: 'A' },
    { display: null, upstream: 'B', registry: 'C', expected: 'B' },
    { display: null, upstream: null, registry: 'C', expected: 'C' },
    { display: null, upstream: null, registry: null, expected: 'UNKNOWN' },
  ];
  for (const t of normTests) {
    if (normalizeBackgroundJobStatus(t.display, t.upstream, t.registry) !== t.expected) {
      console.error(`   ❌ Failed normalizeBackgroundJobStatus for ${JSON.stringify(t)}`);
      failures++;
    }
  }
  if (failures === 0) console.log("   ✅ normalizeBackgroundJobStatus verified.");

  console.log("\n3. Testing shouldRemoveBackgroundJob...");
  const removeTests = [
    {
      name: "old submittedAt > 24h is removed",
      job: { submittedAt: now - TWENTY_FOUR_HOURS - 1000, status: 'PROCESSING' },
      expectedRemove: true,
      expectedReason: 'STALE_TIME_EXCEEDED'
    },
    {
      name: "active PROCESSING job under 24h remains",
      job: { submittedAt: now - 1000, status: 'PROCESSING' },
      expectedRemove: false
    },
    {
      name: "terminal job is removed",
      job: { submittedAt: now - 1000, status: 'COMPLETED' },
      expectedRemove: true,
      expectedReason: 'TERMINAL_STATUS'
    },
    {
      name: "failedPollCount >= 3 is removed",
      job: { submittedAt: now - 1000, status: 'PROCESSING', failedPollCount: 3 },
      expectedRemove: true,
      expectedReason: 'POLL_FAILURE_LIMIT'
    },
    {
      name: "failedPollCount < 3 remains",
      job: { submittedAt: now - 1000, status: 'PROCESSING', failedPollCount: 2 },
      expectedRemove: false
    },
    {
      name: "NOT_FOUND is removed",
      job: { submittedAt: now - 1000, status: 'PROCESSING', lastError: '404' },
      expectedRemove: true,
      expectedReason: 'TERMINAL_ERROR'
    },
    {
      name: "JOB_NOT_FOUND is removed",
      job: { submittedAt: now - 1000, status: 'PROCESSING', lastError: 'JOB_NOT_FOUND' },
      expectedRemove: true,
      expectedReason: 'TERMINAL_ERROR'
    },
    {
      name: "Random error remains",
      job: { submittedAt: now - 1000, status: 'PROCESSING', lastError: 'NETWORK_ERROR' },
      expectedRemove: false
    }
  ];

  for (const t of removeTests) {
    const res = shouldRemoveBackgroundJob(t.job, now);
    if (res.remove !== t.expectedRemove || (res.remove && res.reason !== t.expectedReason)) {
      console.error(`   ❌ Failed: ${t.name}. Got remove=${res.remove}, reason=${res.reason}`);
      failures++;
    }
  }

  if (failures === 0) {
    console.log("   ✅ shouldRemoveBackgroundJob verified.");
    console.log("\n=====================================================");
    console.log("ALL TESTS PASSED SUCCESSFULLY");
    console.log("=====================================================");
    process.exit(0);
  } else {
    console.error(`\n❌ ${failures} test(s) failed.`);
    process.exit(1);
  }
}

run();
