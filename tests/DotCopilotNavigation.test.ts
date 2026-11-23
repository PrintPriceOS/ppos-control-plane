import { describe, it, expect } from 'vitest';
import dotCopilotService from '../src/api/services/copilot/dotCopilotService';

describe('Dotty In-App Navigation Tool & Route Resolver (DE / EN / ES)', () => {
    it('1. Resolves DE, EN, and ES navigation queries to allowlisted Control Plane routes', () => {
        expect(dotCopilotService.resolveNavigationIntent('Wo trage ich meine Papierpreise ein?')).toBe('MATERIALS');
        expect(dotCopilotService.resolveNavigationIntent('Take me to machine fleet')).toBe('MACHINES');
        expect(dotCopilotService.resolveNavigationIntent('Where is marketplace review?')).toBe('MARKETPLACE_REVIEW');
        expect(dotCopilotService.resolveNavigationIntent('Ir a tarifas industriales')).toBe('PRICING');
        expect(dotCopilotService.resolveNavigationIntent('Öffne Versand und Paletten')).toBe('SHIPPING');
        expect(dotCopilotService.resolveNavigationIntent('Show me API keys')).toBe('DEVELOPERS');
        expect(dotCopilotService.resolveNavigationIntent('Llévame al onboarding guiado')).toBe('ONBOARDING_GUIDED');
    });

    it('2. Executes navigate_to_screen with localized labels and autoNavigate NAVIGATION card payload', async () => {
        const resDe = await dotCopilotService.executeCopilotTool(
            'navigate_to_screen',
            { destinationId: 'MATERIALS' },
            'node-primary',
            'de'
        );
        expect(resDe.ok).toBe(true);
        expect(resDe.route).toBe('/printhouse/setup?tab=MATERIALS');
        expect(resDe.cardPayload).toMatchObject({
            type: 'NAVIGATION',
            destinationId: 'MATERIALS',
            route: '/printhouse/setup?tab=MATERIALS',
            label: 'Materialien & Papierkatalog',
            autoNavigate: true
        });

        const resEn = await dotCopilotService.executeCopilotTool(
            'navigate_to_screen',
            { destinationId: 'MARKETPLACE_REVIEW' },
            'node-primary',
            'en'
        );
        expect(resEn.ok).toBe(true);
        expect(resEn.route).toBe('/printhouse/setup?tab=MARKETPLACE');
        expect(resEn.cardPayload.label).toBe('Marketplace Review & Activation');
    });

    it('3. Rejects unknown or non-allowlisted destinations cleanly', async () => {
        const bad = await dotCopilotService.executeCopilotTool(
            'navigate_to_screen',
            { destinationId: 'https://evil.example.com' },
            'node-primary',
            'en'
        );
        expect(bad.ok).toBe(false);
        expect(bad.cardPayload).toBeUndefined();
    });
});
