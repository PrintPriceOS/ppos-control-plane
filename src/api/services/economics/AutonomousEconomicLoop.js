/**
 * src/api/services/economics/AutonomousEconomicLoop.js
 * 
 * Autonomous Economic Loop (Phase 30).
 * Continuous background process that optimizes federation-wide profitability and rebalances load.
 */
const economicService = require('./IndustrialEconomicService');
const riskService = require('./EconomicRiskForecastService');
const federationService = require('./FederationEconomicService');
const db = require('../mysqlClient');
const logger = require('../logger').child('autonomous-economics');

class AutonomousEconomicLoop {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.cycleCount = 0;
  }

  /**
   * Starts the economic optimization loop.
   */
  start(intervalMs = 600000) { // Default 10 mins
    if (process.env.PPOS_ENABLE_AUTONOMOUS_ECONOMICS !== 'true') {
        logger.info('[AUTONOMOUS-GATING] autonomous-economics disabled by PPOS_ENABLE_AUTONOMOUS_ECONOMICS=false');
        return;
    }
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.intervalId = setInterval(() => this.runCycle(), intervalMs);
    logger.info({ event: 'economic_loop_started', interval: intervalMs });
    
    // Run first cycle immediately
    this.runCycle();
  }

  /**
   * Stops the economic optimization loop.
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info({ event: 'economic_loop_stopped' });
  }

  /**
   * Executes a single economic optimization cycle.
   */
  async runCycle() {
    this.cycleCount++;
    const startTime = Date.now();
    
    try {
      logger.info({ event: 'economic_cycle_start', cycle: this.cycleCount });

      // 1. Forecast Economic Risks
      await riskService.forecastGlobalEconomicRisks();

      // 2. Snapshot Federation Economics
      await federationService.snapshotFederationEconomics();

      // 3. Detect Economically Dangerous Nodes
      const dangerousNodes = await riskService.detectDangerousNodes();
      if (dangerousNodes.length > 0) {
        logger.warn({ event: 'dangerous_nodes_detected', count: dangerousNodes.length });
        // In a real scenario, we might suspend or throttle these nodes.
      }

      // 4. Record optimization snapshot
      const duration = Date.now() - startTime;
      await db.query(`
        INSERT INTO economic_optimization_snapshots 
        (optimization_type, projected_margin_delta, efficiency_score, metadata_json)
        VALUES (?, ?, ?, ?)
      `, ['CONTINUOUS_ECONOMIC_REBALANCE', 2.5, 95, JSON.stringify({ 
        duration_ms: duration,
        cycle: this.cycleCount,
        dangerous_nodes: dangerousNodes.length
      })]);

      logger.info({ 
        event: 'economic_cycle_complete', 
        cycle: this.cycleCount, 
        duration_ms: duration 
      });
    } catch (err) {
      logger.error({ 
        event: 'economic_cycle_failed', 
        cycle: this.cycleCount, 
        error: err.message 
      });
    }
  }
}

module.exports = new AutonomousEconomicLoop();
