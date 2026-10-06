/**
 * tests/SetupModuleCard.test.tsx
 *
 * Unit regression suite for Printhouse Setup Hub card states.
 * Verifies:
 * 1. Exactly one canonical status badge is rendered per module card.
 * 2. Elimination of multi-badge state collisions (no "Completado + Pendiente" or "En curso + Pendiente").
 * 3. Status badges render correctly for COMPLETE, IN_PROGRESS, NOT_STARTED, LOCKED, and NEEDS_ATTENTION.
 * 4. Recommended action badge displays the concise copy across ES, EN, and DE.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { SetupModuleCard } from '../src/ui/components/printhouse/setup/SetupModuleCard';
import { LocaleProvider, Locale } from '../src/ui/i18n';

function renderCard(
    props: React.ComponentProps<typeof SetupModuleCard>,
    locale: Locale = 'es'
) {
    return render(
        <LocaleProvider initialLocale={locale}>
            <SetupModuleCard {...props} />
        </LocaleProvider>
    );
}

describe('SetupModuleCard - Status Badge Mutex and Canonical States', () => {

    it('renders exactly one badge (badge-complete) for a COMPLETE module', () => {
        renderCard({
            moduleNumber: 1,
            title: 'Sedes de Producción',
            description: 'Configuración de talleres físicos',
            status: 'COMPLETE',
            isActionable: true,
        }, 'es');

        // Verify exactly one badge-complete exists
        const completeBadge = screen.getByTestId('badge-complete');
        expect(completeBadge).toBeInTheDocument();
        expect(completeBadge.textContent).toContain('Completado');

        // Verify other badges do NOT exist
        expect(screen.queryByTestId('badge-in-progress')).toBeNull();
        expect(screen.queryByTestId('badge-not-started')).toBeNull();
        expect(screen.queryByTestId('badge-locked')).toBeNull();
        expect(screen.queryByTestId('badge-needs-attention')).toBeNull();
    });

    it('renders exactly one badge (badge-in-progress) for an IN_PROGRESS module', () => {
        renderCard({
            moduleNumber: 2,
            title: 'Parque de Maquinaria',
            description: 'Prensas offset y digitales',
            status: 'IN_PROGRESS',
            isActionable: true,
        }, 'es');

        const inProgressBadge = screen.getByTestId('badge-in-progress');
        expect(inProgressBadge).toBeInTheDocument();
        expect(inProgressBadge.textContent).toContain('En curso');

        // Confirm pending badge is eliminated
        expect(screen.queryByTestId('badge-complete')).toBeNull();
        expect(screen.queryByTestId('badge-not-started')).toBeNull();
        expect(screen.queryByTestId('badge-locked')).toBeNull();
    });

    it('renders exactly one badge (badge-not-started) for an actionable NOT_STARTED module', () => {
        renderCard({
            moduleNumber: 3,
            title: 'Capacidades de Acabado',
            description: 'Encuadernación y laminado',
            status: 'NOT_STARTED',
            isActionable: true,
        }, 'es');

        const notStartedBadge = screen.getByTestId('badge-not-started');
        expect(notStartedBadge).toBeInTheDocument();
        expect(notStartedBadge.textContent).toContain('Pendiente');

        expect(screen.queryByTestId('badge-complete')).toBeNull();
        expect(screen.queryByTestId('badge-in-progress')).toBeNull();
        expect(screen.queryByTestId('badge-locked')).toBeNull();
    });

    it('renders exactly one badge (badge-locked) for a non-actionable locked module', () => {
        renderCard({
            moduleNumber: 8,
            title: 'Activación en Marketplace',
            description: 'Revisión final de cumplimiento',
            status: 'NOT_STARTED',
            isActionable: false,
        }, 'es');

        const lockedBadge = screen.getByTestId('badge-locked');
        expect(lockedBadge).toBeInTheDocument();
        expect(lockedBadge.textContent).toContain('Bloqueado');

        // Crucial: NOT_STARTED should NOT display "Pendiente" when card is locked
        expect(screen.queryByTestId('badge-not-started')).toBeNull();
        expect(screen.queryByTestId('badge-complete')).toBeNull();
        expect(screen.queryByTestId('badge-in-progress')).toBeNull();
    });

    it('renders exactly one badge (badge-needs-attention) when status is NEEDS_ATTENTION', () => {
        renderCard({
            moduleNumber: 4,
            title: 'Materiales y Papeles',
            description: 'Configuración de gramajes',
            status: 'NEEDS_ATTENTION',
            isActionable: true,
        }, 'es');

        const needsAttentionBadge = screen.getByTestId('badge-needs-attention');
        expect(needsAttentionBadge).toBeInTheDocument();
        expect(needsAttentionBadge.textContent?.toLowerCase()).toContain('atención');

        expect(screen.queryByTestId('badge-complete')).toBeNull();
        expect(screen.queryByTestId('badge-in-progress')).toBeNull();
        expect(screen.queryByTestId('badge-not-started')).toBeNull();
    });

    describe('Shortened Recommended Action Badge across locales', () => {
        it('renders concise "Siguiente acción" in Spanish', () => {
            renderCard({
                moduleNumber: 1,
                title: 'Sedes',
                description: 'Desc',
                status: 'NOT_STARTED',
                isActionable: true,
                isRecommended: true,
            }, 'es');

            expect(screen.getByText('Siguiente acción')).toBeInTheDocument();
        });

        it('renders concise "Next action" in English', () => {
            renderCard({
                moduleNumber: 1,
                title: 'Sites',
                description: 'Desc',
                status: 'NOT_STARTED',
                isActionable: true,
                isRecommended: true,
            }, 'en');

            expect(screen.getByText('Next action')).toBeInTheDocument();
        });

        it('renders concise "Nächste Aktion" in German', () => {
            renderCard({
                moduleNumber: 1,
                title: 'Standorte',
                description: 'Desc',
                status: 'NOT_STARTED',
                isActionable: true,
                isRecommended: true,
            }, 'de');

            expect(screen.getByText('Nächste Aktion')).toBeInTheDocument();
        });
    });
});
