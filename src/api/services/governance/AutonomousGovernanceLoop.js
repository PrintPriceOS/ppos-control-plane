/**
 * src/api/services/governance/AutonomousGovernanceLoop.js
 * 
 * Autonomous Governance & Resilience Loop (Phase 31).
 * Continuous background process that rebalances survivability risk and optimizes redundancy.
 */
const governanceService = require('./IndustrialGovernanceService');
const cascadingService = require('./CascadingFailureService');
const continuityService = require('./ContinuityProtectionService');
const resilienceService = require('./FederationResilienceService');
const db = require('../mysqlClient');
const logger = require('../logger').child('autonomous-governance');

class AutonomousGovernanceLoop {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.cycleCount = 0;
  }

  start(intervalMs = 900000) { // Default 15 mins
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.runCycle(), intervalMs);
    logger.info({ event: 'governance_loop_started', interval: intervalMs });
    this.runCycle();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info({ event: 'governance_loop_stopped' });
  }

  async runCycle() {
    this.cycleCount++;
    const startTime = Date.now();
    
    try {
      logger.info({ event: 'governance_cycle_start', cycle: this.cycleCount });

      // 1. Snapshot Governance Diversity
      await governanceService.snapshotGovernance();

      // 2. Analyze Cascading Risk
      await cascadingService.analyzeSystemicRisk();

      // 3. Evaluate Global Continuity
      await continuityService.evaluateContinuity();

      // 4. Forecast Regional Survivability
      await resilienceService.forecastRegionalSurvivability();

      const duration = Date.now() - startTime;
      logger.info({ 
        event: 'governance_cycle_complete', 
        cycle: this.cycleCount, 
        duration_ms: duration 
      });
    } catch (err) {
      logger.error({ 
        event: 'governance_cycle_failed', 
        cycle: this.cycleCount, 
        error: err.message 
      });
    }
  }
}

module.exports = new AutonomousGovernanceLoop();
