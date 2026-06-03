/**
 * src/api/services/autonomousOrchestrator.js
 * 
 * Orchestrates background loops for autonomous dispatch, SLA monitoring, 
 * rerouting, and capacity conflict detection.
 */
const logger = require('./logger').child('autonomous-mes');
const autoDispatch = require('./autonomousDispatchService');
const slaMonitor = require('./slaMonitoringService');
const autoReroute = require('./autonomousRerouteService');
const capacityConflict = require('./capacityConflictService');
const learningLoop = require('./manufacturingLearningService');

class AutonomousOrchestrator {
    constructor() {
        this.loops = {
            dispatch: { interval: 30000, lastRun: null, running: false },
            sla: { interval: 60000, lastRun: null, running: false },
            reroute: { interval: 90000, lastRun: null, running: false },
            conflict: { interval: 60000, lastRun: null, running: false },
            learning: { interval: 300000, lastRun: null, running: false }
        };
    }

    /**
     * Starts the autonomous manufacturing loops.
     */
    start() {
        logger.info({ event: 'autonomous_loop_start', message: 'Autonomous MES Orchestrator Booted' });

        // 1. Dispatch Loop
        setInterval(() => this.executeLoop('dispatch', () => autoDispatch.evaluateQueuedJobs()), this.loops.dispatch.interval);

        // 2. SLA Monitoring Loop
        setInterval(() => this.executeLoop('sla', () => slaMonitor.scanActiveDispatches()), this.loops.sla.interval);

        // 3. Autonomous Reroute Loop
        if (process.env.PPOS_ENABLE_AUTO_REROUTE === 'true') {
            setInterval(() => this.executeLoop('reroute', () => autoReroute.evaluateReroutes()), this.loops.reroute.interval);
        } else {
            logger.info('[AUTONOMOUS-GATING] auto-reroute disabled by PPOS_ENABLE_AUTO_REROUTE=false');
        }

        // 4. Capacity Conflict Loop
        setInterval(() => this.executeLoop('conflict', () => capacityConflict.detectConflicts()), this.loops.conflict.interval);

        // 5. Learning Feedback Loop
        if (process.env.PPOS_ENABLE_LEARNING_LOOP === 'true') {
            setInterval(() => this.executeLoop('learning', () => learningLoop.recomputeIntelligence()), this.loops.learning.interval);
        } else {
            logger.info('[AUTONOMOUS-GATING] learning-loop disabled by PPOS_ENABLE_LEARNING_LOOP=false');
        }
    }

    /**
     * Safe execution wrapper for interval-driven loops.
     */
    async executeLoop(name, fn) {
        if (this.loops[name].running) return;

        this.loops[name].running = true;
        this.loops[name].lastRun = new Date().toISOString();

        try {
            logger.debug({ event: 'loop_iteration_start', loop: name });
            const result = await fn();
            
            // Log if anything actually happened
            if (result && (result.assigned > 0 || result.riskDetected > 0 || result.rerouted > 0 || result.overbookedMachines > 0)) {
                logger.info({ 
                    event: `loop_iteration_success`, 
                    loop: name, 
                    summary: result 
                });
            }
        } catch (err) {
            logger.error({ 
                event: `loop_iteration_failed`, 
                loop: name, 
                error: err.message 
            });
        } finally {
            this.loops[name].running = false;
        }
    }

    getStatus() {
        return this.loops;
    }
}

module.exports = new AutonomousOrchestrator();
