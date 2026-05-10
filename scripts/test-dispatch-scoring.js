/**
 * scripts/test-dispatch-scoring.js
 * 
 * Validates the Industrial Dispatch Scoring logic.
 */
const scoringService = require('../src/api/services/industrialDispatchScoringService');

async function testScoring() {
  console.log('--- STARTING DISPATCH SCORING VALIDATION ---');

  const sampleJob = {
    tenant_id: 'tenant_demo_1',
    destination_country: 'IE',
    destination_city: 'Dublin',
    destination_region: 'EU-WEST',
    required_delivery_days: 10,
    product_type: 'SOFTCOVER_BOOK'
  };

  console.log('Evaluating sample job:', JSON.stringify(sampleJob, null, 2));

  try {
    const result = await scoringService.scoreDispatchCandidates(sampleJob);

    if (!result.ok) {
      console.error('Scoring failed:', result.error);
      process.exit(1);
    }

    console.log(`\nFound ${result.candidates.length} eligible candidates.`);
    console.log(`Rejected ${result.rejected.length} candidates.`);

    if (result.candidates.length > 0) {
      console.log('\nTop Candidate:');
      const top = result.candidates[0];
      console.log(`- ID: ${top.node_id}`);
      console.log(`- Name: ${top.display_name}`);
      console.log(`- Score: ${top.score_total}/100`);
      console.log(`- Region: ${top.operational_region}`);
      console.log(`- Breakdown:`, JSON.stringify(top.score_breakdown, null, 2));
    }

    console.log('\n--- VALIDATION COMPLETE ---');
    process.exit(0);
  } catch (err) {
    console.error('Fatal error during test:', err);
    process.exit(1);
  }
}

testScoring();
