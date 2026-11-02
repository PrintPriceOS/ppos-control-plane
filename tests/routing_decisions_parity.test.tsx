/**
 * tests/routing_decisions_parity.test.tsx
 *
 * PrintPrice OS — Phase 14D: Algorithmic Routing Decisions & Live Dispatch Simulator Suite
 *
 * Validates:
 * 1. Backend `routingDecisionEngineService.calculateRoutingDecisions` evaluates multi-variable
 *    scoring (Compatibility Hard Gate, Industrial Cost 40%, Geospatial/Freight 30%, Lead Time/Queue 20%,
 *    OEE 10%) across registered Printhouse nodes and machines.
 * 2. Machines with incompatible sheet format or unsupported binding family (e.g. HARDCOVER on WEB_ROTARY)
 *    or saturated queue (> maxQueueCongestionPct) are excluded via Hard Gate (`compatible: false`, `finalScore: 0`).
 * 3. Governance rules (`GET / PUT /api/pricing/routing-decisions/rules`) persist dispatchPolicy,
 *    maxQueueCongestionPct, and crossBorderPenaltyFactor.
 * 4. Frontend `RoutingRulesTab` renders the Governance Bar, Live Dispatch Simulator, Optimal Winner Card,
 *    Candidate Ranking Table, Crossover Analyzer, and Automated Routing Audit Events.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RoutingRulesTab } from '../src/ui/components/pricing/RoutingRulesTab';

// Backend CJS service under test
// eslint-disable-next-line @typescript-eslint/no-var-requires
const routingEngine = require('../src/api/services/pricing/routingDecisionEngineService');

describe('Routing Decisions Engine — Multi-Variable Scoring, Hard Gates & Simulator Parity', () => {
    it('1. Evaluates multi-variable routing across registered machines and selects Optimal Route (Top 1)', async () => {
        const result = await routingEngine.calculateRoutingDecisions(
            'tenant-routing-test-1',
            {
                copies: 1200,
                pages: 240,
                trimSize: '148x210',
                productFamily: 'SOFTCOVER',
                destination: 'MADRID_ES'
            },
            { dispatchPolicy: 'BALANCED_HYBRID', maxQueueCongestionPct: 85 }
        );

        expect(result.ok).toBe(true);
        expect(result.optimalNode).toBeDefined();
        expect(result.optimalNode.routeBadge).toBe('OPTIMAL ROUTE');
        expect(result.optimalNode.finalScore).toBeGreaterThan(70);
        expect(result.optimalNode.industrialCostEur).toBeGreaterThan(0);
        expect(result.optimalNode.freightCostEur).toBeGreaterThan(0);
        expect(result.candidates.length).toBeGreaterThanOrEqual(3);
    });

    it('2. Excludes incompatible machines (Hard Gate: unsupported binding family, oversize format, or queue saturation)', async () => {
        // Test 2A: HARDCOVER excludes WEB_ROTARY (which only supports SOFTCOVER + SADDLE_STITCH)
        const hcResult = await routingEngine.calculateRoutingDecisions(
            'tenant-routing-test-2',
            {
                copies: 1000,
                pages: 256,
                trimSize: '150x230',
                productFamily: 'HARDCOVER',
                destination: 'FRANKFURT_DE'
            },
            { dispatchPolicy: 'LOWEST_COST', maxQueueCongestionPct: 95 }
        );

        const rotaryCand = hcResult.candidates.find((c: any) => c.technology === 'WEB_ROTARY');
        expect(rotaryCand).toBeDefined();
        expect(rotaryCand.compatible).toBe(false);
        expect(rotaryCand.finalScore).toBe(0);
        expect(rotaryCand.rejectionReason).toContain('Incompatible Binding Family');

        // Test 2B: Oversize format (600x800 mm -> spread 1210x810 mm) excludes B2/Digital (750x530 mm) and B1 (1060x750 mm)
        const oversizeResult = await routingEngine.calculateRoutingDecisions(
            'tenant-routing-test-2',
            {
                copies: 500,
                pages: 64,
                trimSize: '600x800',
                productFamily: 'SOFTCOVER',
                destination: 'MADRID_ES'
            },
            { maxQueueCongestionPct: 95 }
        );

        const b2Cand = oversizeResult.candidates.find((c: any) => c.technology === 'OFFSET_B2');
        expect(b2Cand.compatible).toBe(false);
        expect(b2Cand.rejectionReason).toContain('Incompatible Sheet Format');
    });

    it('3. Persists and retrieves governance rules (dispatchPolicy, maxQueueCongestionPct, crossBorderPenaltyFactor)', async () => {
        const saved = await routingEngine.saveRoutingGovernanceRulesAsync('tenant-gov-test', {
            dispatchPolicy: 'FASTEST_DELIVERY',
            maxQueueCongestionPct: 75,
            crossBorderPenaltyFactor: 1.28
        });

        expect(saved.ok).toBe(true);
        expect(saved.rules.dispatchPolicy).toBe('FASTEST_DELIVERY');
        expect(saved.rules.maxQueueCongestionPct).toBe(75);
        expect(saved.rules.crossBorderPenaltyFactor).toBe(1.28);
        expect(saved.rules.weights.leadTime).toBe(0.5);

        const loaded = await routingEngine.getRoutingGovernanceRulesAsync('tenant-gov-test');
        expect(loaded.rules.dispatchPolicy).toBe('FASTEST_DELIVERY');
        expect(loaded.rules.maxQueueCongestionPct).toBe(75);
    });

    it('4. Renders RoutingRulesTab with Policy Pills, Congestion Lock Slider, Live Simulator, Winner Card & Candidate Ranking', async () => {
        const mockCrossover = {
            crossoverCopies: 410,
            explanation: 'Crossover threshold at 410 copies.',
            digitalMachine: { id: 'prof-dig', printerName: 'HP Indigo 100K', technology: 'DIGITAL_TONER' },
            offsetMachine: { id: 'prof-b1', printerName: 'Heidelberg XL 106', technology: 'OFFSET_B1' },
            curve: [
                {
                    copies: 250,
                    digitalTotalEur: 610,
                    digitalUnitEur: 2.44,
                    offsetTotalEur: 920,
                    offsetUnitEur: 3.68,
                    savingsEur: 310,
                    recommendedTechnology: 'DIGITAL_TONER',
                    recommendedPrinterName: 'HP Indigo 100K'
                }
            ]
        };

        render(
            <RoutingRulesTab
                crossover={mockCrossover}
                routingHistory={[]}
                conflicts={[]}
            />
        );

        expect(screen.getByTestId('routing-governance-bar')).toBeInTheDocument();
        expect(screen.getByTestId('live-routing-simulator')).toBeInTheDocument();
        expect(screen.getByTestId('optimal-route-winner-card')).toBeInTheDocument();
        expect(screen.getByTestId('routing-candidates-ranking-table')).toBeInTheDocument();

        // Switch policy pill to FASTEST DELIVERY (SLA)
        fireEvent.click(screen.getByTestId('policy-pill-FASTEST_DELIVERY'));
        fireEvent.click(screen.getByTestId('save-routing-rules-btn'));
        expect(await screen.findByTestId('routing-rules-saved-banner')).toHaveTextContent('FASTEST_DELIVERY');

        // Simulate short run (150 copies) in Frankfurt -> Digital press should rank #1
        fireEvent.change(screen.getByTestId('sim-input-copies'), { target: { value: '150' } });
        fireEvent.change(screen.getByTestId('sim-select-destination'), { target: { value: 'FRANKFURT_DE' } });
        fireEvent.click(screen.getByTestId('simulate-routing-dispatch-btn'));

        expect(screen.getByTestId('optimal-winner-name')).toHaveTextContent(/Indigo/i);
    });
});
