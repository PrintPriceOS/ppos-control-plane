import React from 'react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '../src/ui/i18n';
import { SoftProofingViewer3D, SoftProofBookGeometry } from '../src/ui/components/publisher/SoftProofingViewer3D';
import { LivePriceCalibratorModal } from '../src/ui/components/pricing/LivePriceCalibratorModal';
import { MaterialSpecificationDrawer } from '../src/ui/components/materials/MaterialSpecificationDrawer';

const mockSampleBook: SoftProofBookGeometry = {
    orderId: 'PUB-ORD-2026-101',
    isbn: '978-0-123456-47-2',
    title: 'Atlas of Architecture & Print Heritage',
    trimWidthMm: 148,
    trimHeightMm: 210,
    spineThicknessMm: 16.88,
    bleedMarginMm: 3.0,
    hardcoverOverhangMm: 3.0,
    bindingType: 'SOFTCOVER_PUR',
    surfaceFinish: 'MATTE_LAMINATION',
    paperSpecification: 'Munken Print White 1.5 90g',
    proofStatus: 'AWAITING_APPROVAL'
};

describe('Zero-Spanish Residuals Audit in Modals & Drawers (EN and DE locales)', () => {
    const SPANISH_FORBIDDEN_REGEX = /\b(Cancelar|Cerrar|Guardar|Atención|Error al|Cubierta|Lomo|Pliego|Bobina|Cartoncillo|Guardas|Laminado|Estucado|Ahuesado|Tirada|Páginas|Encuadernación|Gramaje)\b/i;

    describe('1. SoftProofingViewer3D Component', () => {
        it('renders cleanly in English (EN) without Spanish residuals', () => {
            const { container } = render(
                <LocaleProvider initialLocale="en">
                    <SoftProofingViewer3D book={mockSampleBook} />
                </LocaleProvider>
            );

            expect(screen.getByText('APPROVE FOR PRESS')).toBeInTheDocument();
            expect(screen.getByText(/Finish & Materiality/)).toBeInTheDocument();
            expect(screen.getByText('360° Turntable Rotation')).toBeInTheDocument();
            expect(screen.getAllByText('SOFTCOVER PUR').length).toBeGreaterThanOrEqual(1);
            expect(container.textContent).not.toMatch(SPANISH_FORBIDDEN_REGEX);
        });

        it('renders cleanly in German (DE) without Spanish residuals', () => {
            const { container } = render(
                <LocaleProvider initialLocale="de">
                    <SoftProofingViewer3D book={mockSampleBook} />
                </LocaleProvider>
            );

            expect(screen.getByText('360°-Drehung (Orbital)')).toBeInTheDocument();
            expect(screen.getByText(/Veredelung & Materialität/)).toBeInTheDocument();
            expect(screen.getAllByText('SOFTCOVER PUR').length).toBeGreaterThanOrEqual(1);
            expect(container.textContent).not.toMatch(SPANISH_FORBIDDEN_REGEX);
        });
    });

    describe('2. LivePriceCalibratorModal Component', () => {
        it('renders substrate categories and actions in English (EN) without Spanish residuals', () => {
            const { container } = render(
                <LocaleProvider initialLocale="en">
                    <LivePriceCalibratorModal
                        isOpen={true}
                        embedded={true}
                        onClose={vi.fn()}
                        profiles={[]}
                        papers={[]}
                    />
                </LocaleProvider>
            );

            expect(screen.getByText('+ Add new paper to catalog')).toBeInTheDocument();
            expect(screen.getByText('SAVE CALIBRATED RATES TO PROFILE')).toBeInTheDocument();
            expect(screen.getByText('Softcover PUR Perfect Bound')).toBeInTheDocument();
            expect(screen.getAllByText('Hardcover / Case Bound').length).toBeGreaterThanOrEqual(1);
            expect(container.textContent).not.toMatch(SPANISH_FORBIDDEN_REGEX);
        });

        it('renders substrate categories and actions in German (DE) without Spanish residuals', () => {
            const { container } = render(
                <LocaleProvider initialLocale="de">
                    <LivePriceCalibratorModal
                        isOpen={true}
                        embedded={true}
                        onClose={vi.fn()}
                        profiles={[]}
                        papers={[]}
                    />
                </LocaleProvider>
            );

            expect(screen.getByText('+ Neues Papier zum Katalog hinzufügen')).toBeInTheDocument();
            expect(screen.getByText('KALIBRIERTE TARIFE IM PROFIL SPEICHERN')).toBeInTheDocument();
            expect(screen.getByText('Softcover PUR-Klebebindung')).toBeInTheDocument();
            expect(screen.getAllByText('Hardcover / Feste Buchdecke').length).toBeGreaterThanOrEqual(1);
            expect(container.textContent).not.toMatch(SPANISH_FORBIDDEN_REGEX);
        });
    });

    describe('3. MaterialSpecificationDrawer Component', () => {
        it('renders material types and surface categories in English (EN) without Spanish residuals', () => {
            const { container } = render(
                <LocaleProvider initialLocale="en">
                    <MaterialSpecificationDrawer
                        isOpen={true}
                        onClose={vi.fn()}
                        onSave={vi.fn()}
                    />
                </LocaleProvider>
            );

            expect(screen.getByText('Sheet (Sheetfed)')).toBeInTheDocument();
            expect(screen.getByText('Reel (Web Reel)')).toBeInTheDocument();
            expect(screen.getByText('Board / Case Cover')).toBeInTheDocument();
            expect(screen.getByText('Endpapers')).toBeInTheDocument();
            expect(screen.getByText('Lamination Foil')).toBeInTheDocument();
            expect(screen.getByText('Uncoated White Offset')).toBeInTheDocument();
            expect(screen.getByText('Register Substrate in Catalog')).toBeInTheDocument();
            expect(container.textContent).not.toMatch(SPANISH_FORBIDDEN_REGEX);
        });

        it('renders material types and surface categories in German (DE) without Spanish residuals', () => {
            const { container } = render(
                <LocaleProvider initialLocale="de">
                    <MaterialSpecificationDrawer
                        isOpen={true}
                        onClose={vi.fn()}
                        onSave={vi.fn()}
                    />
                </LocaleProvider>
            );

            expect(screen.getByText('Bogen (Bogenoffset)')).toBeInTheDocument();
            expect(screen.getByText('Rolle (Rollenoffset)')).toBeInTheDocument();
            expect(screen.getByText('Karton / Buchdecke')).toBeInTheDocument();
            expect(screen.getByText('Vorsatzpapier')).toBeInTheDocument();
            expect(screen.getByText('Kaschierfolie')).toBeInTheDocument();
            expect(screen.getByText('Offset Weiß Ungestrichen (Uncoated)')).toBeInTheDocument();
            expect(screen.getByText('Substrat im Katalog registrieren')).toBeInTheDocument();
            expect(container.textContent).not.toMatch(SPANISH_FORBIDDEN_REGEX);
        });
    });
});
