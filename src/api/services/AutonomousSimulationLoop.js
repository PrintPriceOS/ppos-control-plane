/**
 * src/api/services/AutonomousSimulationLoop.js
 * 
 * Autonomous Reality Simulation Loop (Phase 33).
 * Background process that continuously runs simulations and generates future-state recommendations.
 */
const simulationService = require('./RealitySimulationService');
const twinService = require('./SyntheticOperationsTwinService');
const evaluator = require('./SimulationOutcomeEvaluator');
const projector = require('./FutureOutcomeProjectionService');
const logger = require('./logger').child('autonomous-simulation');

class AutonomousSimulationLoop {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.cycleCount = 0;
  }

  start(intervalMs = 300000) { // Default 5 mins
    if (process.env.PPOS_ENABLE_AUTONOMOUS_SIMULATION !== 'true') {
        logger.info('[AUTONOMOUS-GATING] reality-simulation disabled by PPOS_ENABLE_AUTONOMOUS_SIMULATION=false');
        return;
    }
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.runCycle(), intervalMs);
    logger.info({ event: 'simulation_loop_started', interval: intervalMs });
    this.runCycle();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info({ event: 'simulation_loop_stopped' });
  }

  async runCycle() {
    this.cycleCount++;
    const startTime = Date.now();
    
    try {
      logger.info({ event: 'simulation_cycle_start', cycle: this.cycleCount });

      // 1. Run Reality Simulation
      const { simulation_id, outcome } = await simulationService.runSimulation('FEDERATION_STABILITY', { depth: 'SYSTEMIC' });

      // 2. Capture Synthetic Snapshot
      await twinService.captureSnapshot(simulation_id);

      // 3. Evaluate Outcome
      await evaluator.evaluateOutcome(simulation_id, outcome);

      // 4. Project Future State (24h, 72h)
      await projector.projectOutcome(simulation_id, 24);
      await projector.projectOutcome(simulation_id, 72);

      const duration = Date.now() - startTime;
      logger.info({ 
        event: 'simulation_cycle_complete', 
        cycle: this.cycleCount, 
        duration_ms: duration 
      });
    } catch (err) {
      logger.error({ 
        event: 'simulation_cycle_failed', 
        cycle: this.cycleCount, 
        error: err.message 
      });
    }
  }
}

module.exports = new AutonomousSimulationLoop();
