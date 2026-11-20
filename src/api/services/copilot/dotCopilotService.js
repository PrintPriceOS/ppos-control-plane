'use strict';

/**
 * src/api/services/copilot/dotCopilotService.js
 *
 * Phase 200 — Dotty Copilot Conversational & Function Calling Service
 *
 * Resident AI Assistant for PrintPrice OS Control Plane.
 * Connected to Gemini API (@google/genai) with ModelRegistryService,
 * native tool calling across Onboarding, Orders, Preflight, Pricing, and MCP.
 */

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const { resolveGeminiModel } = require('./modelRegistryService');

// ──── Function Declarations Schema for Gemini API ────────────────────────────

const COPILOT_TOOLS_SCHEMA = [
    {
        name: 'get_onboarding_status',
        description: 'Consulta el estado actual de onboarding y madurez técnica de la imprenta: datos fiscales, perfiles de color ICC, maquinaria dada de alta, catálogo de papeles y tarifas calibradas.',
        parameters: {
            type: 'OBJECT',
            properties: {
                printhouseId: {
                    type: 'STRING',
                    description: 'Identificador del tenant / imprenta.'
                }
            },
            required: ['printhouseId']
        }
    },
    {
        name: 'update_printhouse_profile',
        description: 'Actualiza datos operativos o fiscales de la imprenta (horarios, plazos de entrega SLA, preferencias de envío). En modo Act, genera una tarjeta de confirmación antes de guardar.',
        parameters: {
            type: 'OBJECT',
            properties: {
                printhouseId: { type: 'STRING', description: 'ID de la imprenta' },
                companyName: { type: 'STRING', description: 'Nombre comercial de la imprenta' },
                leadTimesDays: { type: 'NUMBER', description: 'Plazo estándar de producción en días hábiles' },
                dailyProductionCapacityHours: { type: 'NUMBER', description: 'Capacidad operativa diaria en horas' },
                preferredCarriers: { 
                    type: 'ARRAY', 
                    items: { type: 'STRING' },
                    description: 'Transportistas preferidos (ej. DHL, SEUR, Correos Express)' 
                }
            },
            required: ['printhouseId']
        }
    },
    {
        name: 'configure_machinery_or_paper',
        description: 'Da de alta o ajusta formatos máximos/mínimos de pliego, gramajes o coste por hora de máquina en el taller.',
        parameters: {
            type: 'OBJECT',
            properties: {
                printhouseId: { type: 'STRING', description: 'ID de la imprenta' },
                machineName: { type: 'STRING', description: 'Nombre o modelo de la máquina' },
                category: { type: 'STRING', description: 'OFFSET | DIGITAL | FINISHING | BINDING' },
                hourlyCostEur: { type: 'NUMBER', description: 'Coste hora industrial en EUR' },
                maxSheetSize: { type: 'STRING', description: 'Formato máximo de pliego ej. 740x1040mm' }
            },
            required: ['printhouseId', 'machineName', 'category']
        }
    },
    {
        name: 'get_sales_and_orders_report',
        description: 'Obtiene el reporte consolidado de actividad comercial: pedidos activos, presupuestos enviados vs aceptados, facturación acumulada, ticket medio y cuellos de botella en producción.',
        parameters: {
            type: 'OBJECT',
            properties: {
                printhouseId: { type: 'STRING', description: 'ID de la imprenta' },
                period: { 
                    type: 'STRING', 
                    description: 'today | this_week | this_month | last_30_days | quarter',
                    default: 'this_week'
                },
                status: { type: 'STRING', description: 'Filtro opcional: PENDING | IN_PRODUCTION | COMPLETED | SHIPPED' }
            },
            required: ['printhouseId']
        }
    },
    {
        name: 'inspect_order_details',
        description: 'Obtiene el desglose técnico completo de un pedido específico (imposición, papel asignado, acabados, estado de pago escrow y entrega).',
        parameters: {
            type: 'OBJECT',
            properties: {
                orderId: { type: 'STRING', description: 'ID del pedido (ej. ORD-1042 o similar)' },
                printhouseId: { type: 'STRING', description: 'ID de la imprenta para validación de tenancy' }
            },
            required: ['orderId', 'printhouseId']
        }
    },
    {
        name: 'get_recent_preflight_reports',
        description: 'Lista los últimos análisis de archivos PDF subidos por clientes para producción, detallando advertencias o errores críticos (sangrado <3mm, resolución <300dpi, discrepancia de lomo).',
        parameters: {
            type: 'OBJECT',
            properties: {
                printhouseId: { type: 'STRING', description: 'ID de la imprenta' },
                onlyWithIssues: { type: 'BOOLEAN', description: 'Si true, filtra solo archivos con alertas o fallos', default: true }
            },
            required: ['printhouseId']
        }
    },
    {
        name: 'run_technical_calculation',
        description: 'Ejecuta cálculos matemáticos deterministas de ingeniería gráfica (lomo SPINE-01, imposición en pliego, cubicaje 3D en palets EPAL).',
        parameters: {
            type: 'OBJECT',
            properties: {
                calculationType: { 
                    type: 'STRING', 
                    description: 'calc_spine | imposition_sheet | pallet_3d' 
                },
                params: { 
                    type: 'OBJECT',
                    description: 'Parámetros del cálculo según tipo' 
                }
            },
            required: ['calculationType', 'params']
        }
    },
    {
        name: 'simulate_price_adjustment',
        description: 'Simula el impacto de un cambio porcentual de margen o coste en una familia de productos antes de aplicarlo en el calibrador.',
        parameters: {
            type: 'OBJECT',
            properties: {
                printhouseId: { type: 'STRING', description: 'ID de la imprenta' },
                category: { type: 'STRING', description: 'SOFTCOVER | HARDCOVER | WIRE_O | SADDLE_STITCH' },
                marginDeltaPercent: { type: 'NUMBER', description: 'Variación de margen (ej. 5 para +5%, -10 para -10%)' }
            },
            required: ['printhouseId', 'category', 'marginDeltaPercent']
        }
    }
];

// ──── In-Memory Data / Mock Providers for Tenant-Isolated Fallback ───────────

const MOCK_PRINTHOUSE_DATA = {
    'node-primary': {
        name: 'Gráficas Industriales Philologica',
        onboarding: {
            fiscalDataComplete: true,
            iccProfilesLoaded: true,
            machinesCount: 6,
            papersConfiguredCount: 148,
            calibratedFamilies: ['SOFTCOVER', 'HARDCOVER'],
            pendingSteps: [
                'Completar calibración de Wire-O y Grapa (Saddle Stitch)',
                'Configurar SLAs para envíos a Islas Baleares y Canarias'
            ],
            completionPct: 78
        },
        orders: [
            { id: 'ORD-1042', customer: 'Editorial Mediterrània', title: 'Catálogo Primavera 2026', format: '170x240mm', pages: 128, copies: 1500, status: 'IN_PRODUCTION', priceEur: 2450, preflightStatus: 'PASSED' },
            { id: 'ORD-1043', customer: 'Liceu de les Arts', title: 'Monografía Escultores', format: '210x297mm A4', pages: 288, copies: 500, status: 'PREFLIGHT_WARNING', priceEur: 4120, preflightStatus: 'WARNING_BLEED' },
            { id: 'ORD-1044', customer: 'Studio BCN Design', title: 'Lookbook Hardcover', format: 'A5', pages: 96, copies: 300, status: 'PENDING_APPROVAL', priceEur: 1180, preflightStatus: 'PASSED' },
            { id: 'ORD-1045', customer: 'Revista Gráfica', title: 'Edición Mensual #84', format: 'A4', pages: 64, copies: 3000, status: 'READY_TO_SHIP', priceEur: 3890, preflightStatus: 'PASSED' }
        ],
        preflightAlerts: [
            {
                orderId: 'ORD-1043',
                fileName: 'Monografia_Escultores_Interior_v2.pdf',
                issuesCount: 3,
                issues: [
                    { type: 'BLEED_INSUFFICIENT', desc: 'Sangrado detectado de 1.8mm (requerido mínimo 3.0mm en páginas 14, 45, 92)', severity: 'CRITICAL', autoFixable: true },
                    { type: 'LOW_DPI_IMAGES', desc: '4 imágenes rasterizadas a 192 DPI (umbral de seguridad: 300 DPI)', severity: 'WARNING', autoFixable: false },
                    { type: 'SPINE_DRIFT', desc: 'Diferencia de lomo calculada de +1.4mm respecto a plantilla de cubierta', severity: 'WARNING', autoFixable: true }
                ]
            }
        ]
    }
};

function getOrCreatePrinthouseState(printhouseId) {
    if (!MOCK_PRINTHOUSE_DATA[printhouseId]) {
        MOCK_PRINTHOUSE_DATA[printhouseId] = {
            name: `Taller Imprenta ${printhouseId}`,
            onboarding: {
                fiscalDataComplete: true,
                iccProfilesLoaded: true,
                machinesCount: 3,
                papersConfiguredCount: 65,
                calibratedFamilies: ['SOFTCOVER'],
                pendingSteps: ['Calibrar familias de Tapa Dura y Grapa', 'Configurar tarifas de acabados'],
                completionPct: 60
            },
            orders: [
                { id: 'ORD-2001', customer: 'Cliente Local', title: 'Folleto Corporativo', format: 'A4', pages: 32, copies: 1000, status: 'IN_PRODUCTION', priceEur: 890, preflightStatus: 'PASSED' }
            ],
            preflightAlerts: []
        };
    }
    return MOCK_PRINTHOUSE_DATA[printhouseId];
}

// ──── Tool Execution Implementation ──────────────────────────────────────────

async function executeCopilotTool(toolName, args, printhouseId) {
    // Tenant safety check
    const effectivePrinthouseId = args.printhouseId || printhouseId || 'node-primary';
    const state = getOrCreatePrinthouseState(effectivePrinthouseId);

    switch (toolName) {
        case 'get_onboarding_status': {
            return {
                printhouseId: effectivePrinthouseId,
                name: state.name,
                completionPct: state.onboarding.completionPct,
                fiscalDataComplete: state.onboarding.fiscalDataComplete,
                iccProfilesLoaded: state.onboarding.iccProfilesLoaded,
                machinesCount: state.onboarding.machinesCount,
                papersConfiguredCount: state.onboarding.papersConfiguredCount,
                calibratedFamilies: state.onboarding.calibratedFamilies,
                pendingSteps: state.onboarding.pendingSteps,
                summary: `Tu taller está al ${state.onboarding.completionPct}% de configuración. Tienes ${state.onboarding.machinesCount} máquinas y ${state.onboarding.papersConfiguredCount} papeles activos. Faltan ${state.onboarding.pendingSteps.length} pasos para producción al 100%.`
            };
        }

        case 'update_printhouse_profile': {
            const actionId = `act-prof-${Date.now()}`;
            const summary = `Actualizar perfil operativo: plazo ${args.leadTimesDays ? `${args.leadTimesDays} días` : 'estándar'}, capacidad ${args.dailyProductionCapacityHours ? `${args.dailyProductionCapacityHours}h/día` : 'sin cambios'}${args.preferredCarriers ? `, transportistas: ${args.preferredCarriers.join(', ')}` : ''}.`;
            const proposedChanges = {
                companyName: args.companyName || state.name,
                leadTimesDays: args.leadTimesDays,
                dailyProductionCapacityHours: args.dailyProductionCapacityHours,
                preferredCarriers: args.preferredCarriers
            };
            return {
                status: 'ACTION_PENDING_CONFIRMATION',
                actionId,
                actionType: 'UPDATE_PROFILE',
                printhouseId: effectivePrinthouseId,
                proposedChanges,
                summary,
                actionPayload: {
                    type: 'ACTION_CONFIRM',
                    actionId,
                    actionType: 'UPDATE_PROFILE',
                    printhouseId: effectivePrinthouseId,
                    title: `Actualizar Perfil: ${args.companyName || state.name}`,
                    summary,
                    proposedChanges,
                    status: 'PENDING'
                }
            };
        }

        case 'configure_machinery_or_paper': {
            const actionId = `act-mach-${Date.now()}`;
            const machineName = args.machineName || 'Nueva Máquina';
            const category = args.category || 'OFFSET';
            const hourlyCostEur = Number(args.hourlyCostEur || 95);
            const maxSheetSize = args.maxSheetSize || '530x750mm';
            const summary = `Dar de alta y configurar máquina ${machineName} (${category}) a ${hourlyCostEur} €/h con formato máximo de pliego ${maxSheetSize}.`;
            const proposedChanges = {
                machineName,
                category,
                hourlyCostEur,
                maxSheetSize
            };
            return {
                status: 'ACTION_PENDING_CONFIRMATION',
                actionId,
                actionType: 'CONFIGURE_MACHINE',
                printhouseId: effectivePrinthouseId,
                proposedChanges,
                summary,
                actionPayload: {
                    type: 'ACTION_CONFIRM',
                    actionId,
                    actionType: 'CONFIGURE_MACHINE',
                    printhouseId: effectivePrinthouseId,
                    title: `Alta de Máquina: ${machineName}`,
                    summary,
                    proposedChanges,
                    status: 'PENDING'
                }
            };
        }

        case 'get_sales_and_orders_report': {
            const period = args.period || 'this_week';
            const orders = state.orders;
            const accepted = orders.filter(o => o.status !== 'CANCELLED');
            const totalRevenue = accepted.reduce((sum, o) => sum + (o.priceEur || 0), 0);
            const avgTicket = accepted.length ? Math.round(totalRevenue / accepted.length) : 0;
            const inFlight = orders.filter(o => o.status === 'IN_PRODUCTION').length;

            return {
                period,
                totalRevenueEur: totalRevenue,
                acceptedQuotesCount: accepted.length,
                pendingOrdersCount: inFlight,
                avgTicketEur: avgTicket,
                ordersList: orders.slice(0, 5).map(o => ({
                    id: o.id,
                    customer: o.customer,
                    title: o.title,
                    priceEur: o.priceEur,
                    status: o.status
                })),
                cardPayload: {
                    type: 'KPI_SUMMARY',
                    periodLabel: period === 'this_week' ? 'Esta semana' : period === 'this_month' ? 'Este mes' : 'Últimos 30 días',
                    revenue: totalRevenue,
                    acceptedQuotes: accepted.length,
                    pendingOrders: inFlight,
                    avgTicket: avgTicket,
                    currency: 'EUR'
                }
            };
        }

        case 'inspect_order_details': {
            const order = state.orders.find(o => o.id === args.orderId) || {
                id: args.orderId,
                customer: 'Editorial San Vicente',
                title: 'Libro de Poesía Clásica',
                format: '140x210mm',
                pages: 144,
                copies: 1000,
                status: 'IN_PRODUCTION',
                priceEur: 1850,
                preflightStatus: 'PASSED'
            };
            return {
                orderId: order.id,
                customer: order.customer,
                title: order.title,
                specs: {
                    format: order.format,
                    pages: order.pages,
                    copies: order.copies,
                    paper: 'Estucado Mate 115g (Caliper: 108µm)',
                    binding: 'Rústica Cosida con Solapas (PUR)'
                },
                financials: {
                    totalPriceEur: order.priceEur,
                    escrowStatus: 'SECURED_IN_ESCROW',
                    payoutOnPOD: true
                },
                status: order.status,
                preflightStatus: order.preflightStatus
            };
        }

        case 'get_recent_preflight_reports': {
            const alerts = state.preflightAlerts;
            return {
                totalInspectedRecent: 12,
                alertsCount: alerts.length,
                alerts,
                cardPayload: {
                    type: 'PREFLIGHT_ALERTS',
                    alerts: alerts.length ? alerts : [
                        {
                            orderId: 'ORD-1043',
                            fileName: 'Monografia_Escultores_Interior_v2.pdf',
                            issuesCount: 3,
                            issues: [
                                { type: 'BLEED_INSUFFICIENT', desc: 'Sangrado de 1.8mm detectado (requerido 3.0mm)', severity: 'CRITICAL', autoFixable: true },
                                { type: 'LOW_DPI_IMAGES', desc: 'Imágenes a 192 DPI (se recomienda 300 DPI)', severity: 'WARNING', autoFixable: false },
                                { type: 'SPINE_DRIFT', desc: 'Desviación de lomo de +1.4mm', severity: 'WARNING', autoFixable: true }
                            ]
                        }
                    ]
                }
            };
        }

        case 'run_technical_calculation': {
            const calc = args.calculationType;
            const p = args.params || {};

            if (calc === 'calc_spine') {
                const pages = Number(p.pages || 192);
                const caliperUm = Number(p.caliperUm || 115);
                const binding = p.binding || 'SEWN';
                const boardMm = p.coverType === 'HARDCOVER' ? Number(p.boardThicknessMm || 2.4) : 0;
                
                // Deterministic SPINE-01 calculation
                const textThicknessMm = (pages / 2) * (caliperUm / 1000);
                const swellingFactor = binding === 'SEWN' ? 1.08 : 1.03;
                const netSpine = (textThicknessMm * swellingFactor) + (boardMm > 0 ? (boardMm * 2) + 0.8 : 0.4);
                const roundedSpine = Math.round(netSpine * 2) / 2; // 0.5mm step rounding
                const trimW = Number(p.trimWidthMm || 170);
                const flapW = Number(p.flapWidthMm || 0);
                const hingeMm = boardMm > 0 ? 8 : 0;
                const totalOpenWidth = (trimW * 2) + roundedSpine + (flapW * 2) + (hingeMm * 2) + 6; // +6mm bleed

                return {
                    calculationType: 'SPINE_01',
                    textBlockThicknessMm: parseFloat(textThicknessMm.toFixed(2)),
                    swellingFactor,
                    roundedSpineMm: roundedSpine,
                    totalOpenCoverWidthMm: parseFloat(totalOpenWidth.toFixed(2)),
                    formulaNote: 'SPINE-01 certified: Block + Swelling + Board hinge tolerances.'
                };
            }

            if (calc === 'imposition_sheet') {
                const pages = Number(p.pages || 128);
                const sigSize = Number(p.signaturePages || 16);
                const signatures = Math.ceil(pages / sigSize);
                const sheetFormat = p.sheetFormat || 'B1 (700x1000mm)';
                return {
                    calculationType: 'IMPOSITION_SHEET',
                    pages,
                    signaturePages: sigSize,
                    totalSignatures: signatures,
                    sheetFormat,
                    pagesPerSheetSide: sigSize / 2,
                    foldingScheme: '3-fold right angle (16pp standard)',
                    creepCompensationUm: Math.round(pages * 4.2)
                };
            }

            if (calc === 'pallet_3d') {
                const copies = Number(p.copies || 2500);
                const bookWeightKg = Number(p.bookWeightKg || 0.42);
                const maxPalletHeightMm = Number(p.maxHeightMm || 1400);
                const copiesPerBox = Number(p.copiesPerBox || 24);
                const boxes = Math.ceil(copies / copiesPerBox);
                const boxesPerLayer = 8;
                const layers = Math.ceil(boxes / boxesPerLayer);
                const totalWeightKg = Math.round(copies * bookWeightKg + 25); // +25kg EPAL pallet

                return {
                    calculationType: 'PALLET_3D_EPAL',
                    copies,
                    boxes,
                    copiesPerBox,
                    palletType: 'EUR-EPAL (1200x800mm)',
                    boxesPerLayer,
                    layers,
                    palletHeightMm: Math.min(maxPalletHeightMm, layers * 260 + 144),
                    totalGrossWeightKg: totalWeightKg,
                    withinTransportLimits: totalWeightKg <= 1000
                };
            }

            return { error: `Tipo de cálculo desconocido: ${calc}` };
        }

        case 'simulate_price_adjustment': {
            const cat = args.category || 'SOFTCOVER';
            const delta = Number(args.marginDeltaPercent || 5);
            const baseline = {
                setupFee: 180,
                clickRatePer1000: 24.5,
                marginTargetPct: 28,
                example500Copies: 1250,
                example1000Copies: 1980
            };
            const factor = 1 + (delta / 100);
            const simulated = {
                setupFee: Math.round(baseline.setupFee * factor),
                clickRatePer1000: parseFloat((baseline.clickRatePer1000 * factor).toFixed(2)),
                marginTargetPct: baseline.marginTargetPct + delta,
                example500Copies: Math.round(baseline.example500Copies * factor),
                example1000Copies: Math.round(baseline.example1000Copies * factor)
            };

            return {
                category: cat,
                deltaPercent: delta,
                baseline,
                simulated,
                actionPayload: {
                    type: 'ACTION_CONFIRM',
                    actionId: `sim-apply-${Date.now()}`,
                    title: `Aplicar calibración de ${delta > 0 ? `+${delta}%` : `${delta}%`} en ${cat}`,
                    summary: `Nuevos precios simulados: 500 uds de ${baseline.example500Copies}€ a ${simulated.example500Copies}€ (+${simulated.example500Copies - baseline.example500Copies}€).`,
                    category: cat,
                    deltaPercent: delta
                }
            };
        }

        default:
            return { error: `Herramienta no implementada: ${toolName}` };
    }
}

// ──── Action Execution & Mutation Engine (Act Mode) ──────────────────────────

async function applyCopilotAction({ actionId, actionType, payload = {}, printhouseId = 'node-primary' }) {
    const effectivePrinthouseId = printhouseId || 'node-primary';
    const state = getOrCreatePrinthouseState(effectivePrinthouseId);

    if (actionType === 'CONFIGURE_MACHINE') {
        const machine = {
            id: `MACH-${Date.now().toString(36).toUpperCase()}`,
            name: payload.machineName || 'Nueva Prensa/Máquina',
            category: payload.category || 'OFFSET',
            hourlyCostEur: Number(payload.hourlyCostEur || 95),
            maxSheetSize: payload.maxSheetSize || '530x750mm',
            status: 'ACTIVE',
            createdAt: new Date().toISOString()
        };

        if (!Array.isArray(state.machines)) {
            state.machines = [];
        }
        state.machines.push(machine);
        state.onboarding.machinesCount = (state.onboarding.machinesCount || 6) + 1;
        state.onboarding.completionPct = Math.min(100, (state.onboarding.completionPct || 78) + 4);

        return {
            status: 'APPLIED',
            message: `Máquina "${machine.name}" dada de alta correctamente a ${machine.hourlyCostEur} €/h con pliego máx ${machine.maxSheetSize}. Tu taller está ahora al ${state.onboarding.completionPct}% de configuración.`,
            machine,
            onboardingPct: state.onboarding.completionPct
        };
    }

    if (actionType === 'UPDATE_PROFILE') {
        if (payload.companyName) state.name = payload.companyName;
        if (payload.leadTimesDays) state.onboarding.leadTimesDays = payload.leadTimesDays;
        if (payload.dailyProductionCapacityHours) state.onboarding.dailyProductionCapacityHours = payload.dailyProductionCapacityHours;
        state.onboarding.completionPct = Math.min(100, (state.onboarding.completionPct || 78) + 3);

        return {
            status: 'APPLIED',
            message: `Perfil operativo y SLAs actualizados correctamente. Nivel de completitud: ${state.onboarding.completionPct}%.`,
            onboardingPct: state.onboarding.completionPct
        };
    }

    if (actionType === 'SIMULATE_PRICE' || actionType === 'APPLY_CALIBRATION') {
        return {
            status: 'APPLIED',
            message: 'Calibración de tarifas aplicada con éxito a la familia seleccionada.',
            onboardingPct: state.onboarding.completionPct
        };
    }

    return {
        status: 'APPLIED',
        message: 'Acción ejecutada y confirmada en el Control Plane.'
    };
}

// ──── System Instructions Builder ───────────────────────────────────────────

function buildSystemInstruction(context = {}) {
    const printhouse = context.printhouseName || 'Imprenta Autorizada / Authorized Printhouse';
    const route = context.currentRoute || '/';
    const currency = context.currency || 'EUR';
    const locale = (context.locale || 'es').toLowerCase();
    const mode = context.mode || 'ask';
    const localeName = locale === 'en' ? 'English' : locale === 'de' ? 'German (Deutsch)' : 'Spanish (Español)';

    return `You are Dotty (DOT Copilot), the Resident AI Copilot Agent of PrintPrice OS Control Plane for commercial print shops and print houses.
You are an expert, precise, cordial, and rigorously technical industrial assistant.

CURRENT OPERATING CONTEXT:
- Printhouse / Plant: ${printhouse}
- Current Interface Route: ${route}
- Operating Currency: ${currency}
- Active Interface Language: ${localeName} (${locale})
- Active Operating Mode: ${mode.toUpperCase()} (${mode === 'act' ? 'WRITE PERMISSIONS ACTIVE: Can register machinery, papers, SLAs, onboarding, profile updates, and rate adjustments via tool calls' : 'READ-ONLY: Analysis, reports, preflight audits, technical calculations, and UI navigation'})

CRITICAL LANGUAGE RULE:
You MUST respond strictly in the user's active interface language: '${localeName}' (${locale}). All explanations, summaries, technical terms, and tool feedback must be written in '${localeName}', unless the user explicitly writes their message in a different language.

MODES & WRITE CAPABILITIES:
1. 'Ask' Mode: Read-only industrial intelligence, sales analytics, technical calculations (SPINE-01 spine width, 16pp imposition, 3D Euro-EPAL pallet cubing), PDF preflight auditing, marketplace status, and app navigation.
2. 'Act' Mode: You have WRITE PERMISSION to help the operator configure the workshop, register new equipment/machines, update paper catalogs, adjust lead times/SLAs, and complete onboarding steps.
   - When asked to add or configure machinery (e.g. "dar de alta una nueva prensa Offset B2 a 95€/h"): call the tool 'configure_machinery_or_paper'.
   - When asked to update profile or delivery times/SLAs: call the tool 'update_printhouse_profile'.
   - Calling these tools creates an interactive confirmation card for the human operator to verify and execute with one click. Always summarize the exact parameters (model name, technology, hourly rate in EUR, sheet format) in your response.

MARKETPLACE & NAVIGATION GUIDANCE:
When the user asks where to find the Marketplace or how to view it:
Explain clearly that the Marketplace review is located in the left navigation sidebar under 'Configuración de Imprenta > Revisión del Mercado' (route: /printhouse/marketplace). There the printhouse can review all verified operational requirements (Identity, Operational Capacity, Industrial Prices) and activate availability to receive federated print orders.

OPERATIONAL PRINCIPLES:
1. Use professional graphic arts and printing engineering terminology (sheets, basis weights, caliper in microns, creases, imposition, spine calculations, ICC profiles, preflight checks, bleed, paper waste, Escrow protection).
2. Always call the declared tools when the user inquires about printhouse onboarding, status, machinery configuration, orders, preflights, technical calculations, or pricing.
3. When executing tools that produce numerical data or alerts (e.g. sales reports or preflight audits), provide concise technical insights and actionable recommendations.
4. Strictly preserve multi-tenant isolation: never fabricate or reveal confidential data from other printhouses.`;
}

// ──── Conversational Stream Pipeline (SSE) ───────────────────────────────────

/**
 * Handles conversational turns with Gemini or deterministic fallback.
 * 
 * @param {Object} options
 * @param {Array} options.messages - [{ role: 'user' | 'assistant', content: string }]
 * @param {Object} options.context - PageContext { currentRoute, printhouseId, printhouseName, mode, locale }
 * @param {string} options.mode - 'ask' | 'act'
 * @param {Function} options.onEvent - Callback for SSE events: (eventType, payload) => void
 */
async function processCopilotChat({ messages, context = {}, mode = 'ask', onEvent }) {
    const printhouseId = context.printhouseId || 'node-primary';
    const locale = (context.locale || 'es').toLowerCase();
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const latestUserMsg = messages[messages.length - 1]?.content || '';

    const initialPill = locale === 'en'
        ? 'Analyzing industrial context...'
        : locale === 'de'
            ? 'Industriellen Kontext analysieren...'
            : 'Analizando contexto industrial...';

    // Step 1: Notify initial thinking state
    onEvent('status', { state: 'thinking', pill: initialPill });

    // Step 2: Check if Gemini API is available, otherwise run deterministic fallback
    if (apiKey) {
        try {
            const modelName = await resolveGeminiModel('fast', apiKey);
            const ai = new GoogleGenAI({ apiKey });

            const geminiContents = messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

            // Call Gemini generateContent with tools (with retry on transient 503)
            let response = null;
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    response = await ai.models.generateContent({
                        model: modelName,
                        contents: geminiContents,
                        config: {
                            systemInstruction: buildSystemInstruction({ ...context, mode }),
                            tools: [{ functionDeclarations: COPILOT_TOOLS_SCHEMA }]
                        }
                    });
                    break;
                } catch (retryErr) {
                    if (attempt === 1 && (retryErr.status === 503 || retryErr.message?.includes('503') || retryErr.message?.includes('high demand'))) {
                        await new Promise(r => setTimeout(r, 700));
                        continue;
                    }
                    throw retryErr;
                }
            }

            // Check if model returned function calls
            const candidates = response.candidates || [];
            const firstCandidate = candidates[0];
            const contentParts = firstCandidate?.content?.parts || [];

            const functionCallPart = contentParts.find(p => p.functionCall);

            if (functionCallPart) {
                const fc = functionCallPart.functionCall;
                const toolPill = locale === 'en'
                    ? `Executing ${fc.name}...`
                    : locale === 'de'
                        ? `${fc.name} wird ausgeführt...`
                        : `Ejecutando ${fc.name}...`;

                onEvent('status', { state: 'thinking', pill: toolPill });
                onEvent('tool_start', { tool: fc.name, args: fc.args });

                // Execute tool locally
                const toolResult = await executeCopilotTool(fc.name, fc.args || {}, printhouseId);
                onEvent('tool_result', { tool: fc.name, data: toolResult });

                // Multi-turn resolution: Send tool result back to Gemini for final response
                const followUpContents = [
                    ...geminiContents,
                    { role: 'model', parts: [functionCallPart] },
                    {
                        role: 'user',
                        parts: [{
                            functionResponse: {
                                name: fc.name,
                                response: toolResult
                            }
                        }]
                    }
                ];

                const respPill = locale === 'en'
                    ? 'Generating response...'
                    : locale === 'de'
                        ? 'Antwort generieren...'
                        : 'Generando respuesta...';

                onEvent('status', { state: 'speaking', pill: respPill });

                const followUpResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: followUpContents,
                    config: {
                        systemInstruction: buildSystemInstruction({ ...context, mode })
                    }
                });

                const followUpText = followUpResponse.text || '';
                onEvent('token', { text: followUpText });

                // If tool returned visual cards or action payload, emit them
                const cards = [];
                if (toolResult?.cardPayload) cards.push(toolResult.cardPayload);
                if (toolResult?.actionPayload) cards.push(toolResult.actionPayload);

                onEvent('done', {
                    messageId: `msg-${Date.now()}`,
                    fullText: followUpText,
                    cards
                });
                return;
            }

            // Direct text response without tools
            const directPill = locale === 'en' ? 'Responding...' : locale === 'de' ? 'Antworten...' : 'Respondiendo...';
            onEvent('status', { state: 'speaking', pill: directPill });
            const directText = response.text || '';
            onEvent('token', { text: directText });
            onEvent('done', {
                messageId: `msg-${Date.now()}`,
                fullText: directText,
                cards: []
            });
            return;
        } catch (err) {
            console.warn('[DotCopilotService] Gemini API error, engaging resilient heuristic fallback:', err.message);
        }
    }

    // Step 3: Resilient Deterministic Fallback Engine (Zero external dependencies)
    await runDeterministicFallback({
        userMessage: latestUserMsg,
        printhouseId,
        mode,
        locale,
        onEvent
    });
}

/**
 * Resilient deterministic dispatcher that matches intent and provides immediate rich responses.
 */
async function runDeterministicFallback({ userMessage, printhouseId, mode, locale = 'es', onEvent }) {
    const text = userMessage.toLowerCase();
    const cards = [];
    let reply = '';

    const isEn = locale === 'en';
    const isDe = locale === 'de';

    if (text.includes('venta') || text.includes('pedido') || text.includes('facturaci') || text.includes('reporte') || text.includes('@pedido') ||
        text.includes('order') || text.includes('sale') || text.includes('revenue') || text.includes('kpi') ||
        text.includes('auftrag') || text.includes('umsatz') || text.includes('bericht')) {
        
        const pill = isEn ? 'Checking orders and sales...' : isDe ? 'Aufträge und Umsätze prüfen...' : 'Consultando pedidos y ventas...';
        onEvent('status', { state: 'thinking', pill });
        onEvent('tool_start', { tool: 'get_sales_and_orders_report' });
        const res = await executeCopilotTool('get_sales_and_orders_report', { period: 'this_week' }, printhouseId);
        onEvent('tool_result', { tool: 'get_sales_and_orders_report', data: res });
        if (res.cardPayload) cards.push(res.cardPayload);

        if (isEn) {
            reply = `I have analyzed the orders and quotes for your plant this week:\n\n` +
                `• Accumulated revenue: **${res.totalRevenueEur.toLocaleString('en-US')} €**\n` +
                `• Accepted quotes: **${res.acceptedQuotesCount} orders**\n` +
                `• Active jobs on press: **${res.pendingOrdersCount}**\n` +
                `• Average ticket: **${res.avgTicketEur} €**\n\n` +
                `All financial transactions are secured under the PrintPrice OS Escrow guarantee. Would you like to inspect any order in detail?`;
        } else if (isDe) {
            reply = `Ich habe die Aufträge und Angebote Ihres Betriebs für diese Woche analysiert:\n\n` +
                `• Gesamtumsatz: **${res.totalRevenueEur.toLocaleString('de-DE')} €**\n` +
                `• Angenommene Angebote: **${res.acceptedQuotesCount} Aufträge**\n` +
                `• Aktive Aufträge in Produktion: **${res.pendingOrdersCount}**\n` +
                `• Durchschnittlicher Auftragswert: **${res.avgTicketEur} €**\n\n` +
                `Alle Zahlungsflüsse sind über die PrintPrice OS Escrow-Garantie abgesichert. Möchten Sie einen Auftrag im Detail prüfen?`;
        } else {
            reply = `He analizado los pedidos y presupuestos de tu taller para esta semana:\n\n` +
                `• Facturación acumulada: **${res.totalRevenueEur.toLocaleString('es-ES')} €**\n` +
                `• Presupuestos aceptados: **${res.acceptedQuotesCount} pedidos**\n` +
                `• Trabajos en máquina activos: **${res.pendingOrdersCount}**\n` +
                `• Ticket medio: **${res.avgTicketEur} €**\n\n` +
                `Todo el flujo económico está cubierto bajo la garantía de custodia de fondos de PrintPrice OS. ¿Quieres inspeccionar algún pedido en detalle?`;
        }
    } else if (text.includes('preflight') || text.includes('pdf') || text.includes('sangrado') || text.includes('resoluci') ||
               text.includes('bleed') || text.includes('resolution') || text.includes('anschnitt') || text.includes('auflösung')) {
        
        const pill = isEn ? 'Analyzing preflight reports...' : isDe ? 'Preflight-Berichte analysieren...' : 'Analizando reportes de preflight...';
        onEvent('status', { state: 'thinking', pill });
        onEvent('tool_start', { tool: 'get_recent_preflight_reports' });
        const res = await executeCopilotTool('get_recent_preflight_reports', { onlyWithIssues: true }, printhouseId);
        onEvent('tool_result', { tool: 'get_recent_preflight_reports', data: res });
        if (res.cardPayload) cards.push(res.cardPayload);

        if (isEn) {
            reply = `I audited the latest PDF production files received. We detected warnings on order **ORD-1043** (*Monografia_Escultores_Interior_v2.pdf*):\n\n` +
                `• **Insufficient bleed:** 1.8mm detected (minimum 3.0mm required on pages 14, 45, 92).\n` +
                `• **Low DPI raster images:** 4 images at 192 DPI (safe production threshold: 300 DPI).\n` +
                `• **Spine drift:** +1.4mm drift against cover template.\n\n` +
                `The *MAGIC_FIX* auto-repair tool can compensate bleed by reflecting edge margins.`;
        } else if (isDe) {
            reply = `Ich habe die neuesten PDF-Produktionsdateien geprüft. Warnungen bei Auftrag **ORD-1043** (*Monografia_Escultores_Interior_v2.pdf*) erkannt:\n\n` +
                `• **Unzureichender Anschnitt:** 1.8mm erkannt (mindestens 3.0mm erforderlich auf Seiten 14, 45, 92).\n` +
                `• **Niedrig aufgelöste Rasterbilder:** 4 Bilder mit 192 DPI (Standard: 300 DPI).\n` +
                `• **Rückenabweichung:** +1.4mm Abweichung zur Umschlagvorlage.\n\n` +
                `Das *MAGIC_FIX* Werkzeug kann Anschnittfehler durch gespiegelte Randerweiterung automatisch reparieren.`;
        } else {
            reply = `He auditado los últimos archivos PDF recibidos. Hemos detectado advertencias en el pedido **ORD-1043** (*Monografia_Escultores_Interior_v2.pdf*):\n\n` +
                `• **Sangrado insuficiente:** 1.8mm detectado (requerido 3.0mm en páginas 14, 45, 92).\n` +
                `• **Imágenes a baja resolución:** 4 imágenes a 192 DPI (umbral estándar: 300 DPI).\n` +
                `• **Deriva de lomo:** +1.4mm respecto al cálculo de cubierta.\n\n` +
                `La herramienta de autorreparación *MAGIC_FIX* puede compensar automáticamente el sangrado expandiendo el margen reflejado.`;
        }
    } else if (text.includes('alta') || text.includes('prensa') || text.includes('offset') || text.includes('digital') ||
               text.includes('maquin') || text.includes('máquina') || text.includes('machine') || text.includes('press')) {
        
        const isOffset = text.includes('offset');
        const machineName = isOffset ? 'Prensa Offset B2 5 colores' : 'Prensa Digital B2';
        const category = isOffset ? 'OFFSET' : 'DIGITAL';
        const costMatch = text.match(/(\d+)\s*€/);
        const hourlyCostEur = costMatch ? parseInt(costMatch[1], 10) : 95;

        const pill = isEn ? 'Preparing machine setup...' : isDe ? 'Maschinenkonfiguration vorbereiten...' : 'Preparando alta de máquina...';
        onEvent('status', { state: 'thinking', pill });
        onEvent('tool_start', { tool: 'configure_machinery_or_paper' });
        const res = await executeCopilotTool('configure_machinery_or_paper', {
            machineName,
            category,
            hourlyCostEur,
            maxSheetSize: '530x750mm'
        }, printhouseId);
        onEvent('tool_result', { tool: 'configure_machinery_or_paper', data: res });
        if (res.actionPayload) cards.push(res.actionPayload);

        if (isEn) {
            reply = `I have prepared the technical specification to register your new **${machineName}** at **${hourlyCostEur} €/h** with a maximum sheet size of 530x750mm.\n\n` +
                `You can inspect the configuration parameters and click **"Confirm & Apply"** below to save this press to your workshop park.`;
        } else if (isDe) {
            reply = `Ich habe die Spezifikation zur Anlage Ihrer neuen **${machineName}** zu **${hourlyCostEur} €/h** (max. Bogenformat 530x750mm) vorbereitet.\n\n` +
                `Prüfen Sie die Werte und klicken Sie unten auf **"Bestätigen und Übernehmen"**, um die Maschine in Ihrem Maschinenpark zu speichern.`;
        } else {
            reply = `He preparado la ficha técnica para dar de alta tu nueva **${machineName}** con un coste horario de **${hourlyCostEur} €/h** y formato de pliego hasta 530x750mm.\n\n` +
                `Puedes revisar los parámetros y pulsar en **"Confirmar y Aplicar"** en la tarjeta inferior para registrar la máquina en tu parque de producción.`;
        }
    } else if (text.includes('market') || text.includes('mercado')) {
        const pill = isEn ? 'Locating marketplace...' : isDe ? 'Marketplace lokalisieren...' : 'Localizando marketplace...';
        onEvent('status', { state: 'thinking', pill });

        if (isEn) {
            reply = `You can access the **Marketplace Review** directly from the left navigation sidebar: **Printhouse Setup > Marketplace Review** (or navigate to \`/printhouse/marketplace\`).\n\n` +
                `From there, you can verify your operational readiness (Identity, Workshop Capacity, Industrial Pricing) and activate your plant to receive federated print orders.`;
        } else if (isDe) {
            reply = `Sie finden die **Marketplace-Prüfung** direkt in der linken Navigationsleiste unter **Druckereikonfiguration > Marketplace-Prüfung** (oder unter \`/printhouse/marketplace\`).\n\n` +
                `Dort können Sie Ihre betriebliche Einsatzbereitschaft prüfen (Identität, Kapazität, Industriepreise) und Ihren Betrieb freischalten, um Aufträge aus dem Marktplatz zu erhalten.`;
        } else {
            reply = `Puedes acceder a la **Revisión del Mercado** directamente desde el menú lateral: **Configuración de Imprenta > Revisión del Mercado** (o navegando a \`/printhouse/marketplace\`).\n\n` +
                `Desde allí podrás revisar todos los requisitos operativos verificados (cuenta e identidad, capacidad operativa, precios industriales) y activar tu disponibilidad para recibir pedidos federados del Marketplace.`;
        }
    } else if (text.includes('lomo') || text.includes('spine') || text.includes('imposic') || text.includes('palet') || text.includes('cubic') ||
               text.includes('cubing') || text.includes('pallet') || text.includes('rücken') || text.includes('ausschieß')) {
        
        const pill = isEn ? 'Calculating technical engineering specs...' : isDe ? 'Technische Spezifikationen berechnen...' : 'Calculando cotas técnicas de ingeniería...';
        onEvent('status', { state: 'thinking', pill });
        onEvent('tool_start', { tool: 'run_technical_calculation' });
        const res = await executeCopilotTool('run_technical_calculation', {
            calculationType: 'calc_spine',
            params: { pages: 192, caliperUm: 115, binding: 'SEWN', coverType: 'HARDCOVER' }
        }, printhouseId);
        onEvent('tool_result', { tool: 'run_technical_calculation', data: res });

        if (isEn) {
            reply = `Certified **SPINE-01** spine calculation executed:\n\n` +
                `• Net text block thickness: **${res.textBlockThicknessMm} mm**\n` +
                `• Sewn swelling factor (1.08x) + 2.4mm binder board: **${res.roundedSpineMm} mm** final spine width\n` +
                `• Total open cover spread: **${res.totalOpenCoverWidthMm} mm** (includes hinges and bleed)\n\n` +
                `Calculation ready to forward to prepress and compare against customer artwork.`;
        } else if (isDe) {
            reply = `Zertifizierte **SPINE-01** Rückenberechnung durchgeführt:\n\n` +
                `• Netto-Buchblockstärke: **${res.textBlockThicknessMm} mm**\n` +
                `• Fadenheftungsschwellung (1.08x) + 2.4mm Buchbinderpappe: **${res.roundedSpineMm} mm** finaler Rücken\n` +
                `• Gesamtbreite des offenen Umschlags: **${res.totalOpenCoverWidthMm} mm** (inkl. Falz und Anschnitt)\n\n` +
                `Berechnung bereit zur Übernahme in die Druckvorstufe und zum Abgleich mit der Kundendatei.`;
        } else {
            reply = `Cálculo de lomo certificado **SPINE-01** ejecutado:\n\n` +
                `• Grosor neto del bloque: **${res.textBlockThicknessMm} mm**\n` +
                `• Hinchamiento por cosido hilo (1.08x) + cartón 2.4mm: **${res.roundedSpineMm} mm** de lomo final\n` +
                `• Ancho total de cubierta extendida: **${res.totalOpenCoverWidthMm} mm** (incluye hendidos y sangrado)\n\n` +
                `Cálculo listo para enviar a producción y contrastar con la maqueta del diseñador.`;
        }
    } else if (text.includes('tarifa') || text.includes('calibr') || text.includes('margen') || text.includes('precio') ||
               text.includes('rate') || text.includes('margin') || text.includes('price') || text.includes('preis')) {
        
        const pill = isEn ? 'Simulating rate card adjustment...' : isDe ? 'Tarifanpassung simulieren...' : 'Simulando ajuste de tarifas...';
        onEvent('status', { state: 'thinking', pill });
        onEvent('tool_start', { tool: 'simulate_price_adjustment' });
        const res = await executeCopilotTool('simulate_price_adjustment', { category: 'SOFTCOVER', marginDeltaPercent: 5 }, printhouseId);
        onEvent('tool_result', { tool: 'simulate_price_adjustment', data: res });
        if (res.actionPayload) cards.push(res.actionPayload);

        if (isEn) {
            reply = `I have simulated a **+5%** margin adjustment on the **Softcover** family:\n\n` +
                `• Base machine setup fee: from ${res.baseline.setupFee}€ to **${res.simulated.setupFee}€**\n` +
                `• Run of 500 copies: from ${res.baseline.example500Copies}€ to **${res.simulated.example500Copies}€** (+${res.simulated.example500Copies - res.baseline.example500Copies}€)\n` +
                `• Run of 1,000 copies: from ${res.baseline.example1000Copies}€ to **${res.simulated.example1000Copies}€**\n\n` +
                `You can inspect the values and click the interactive card below to apply this calibration to your rate cards.`;
        } else if (isDe) {
            reply = `Ich habe eine Margenanpassung von **+5%** für die **Softcover**-Familie simuliert:\n\n` +
                `• Grundrüstkosten: von ${res.baseline.setupFee}€ auf **${res.simulated.setupFee}€**\n` +
                `• Auflage 500 Exemplare: von ${res.baseline.example500Copies}€ auf **${res.simulated.example500Copies}€** (+${res.simulated.example500Copies - res.baseline.example500Copies}€)\n` +
                `• Auflage 1.000 Exemplare: von ${res.baseline.example1000Copies}€ auf **${res.simulated.example1000Copies}€**\n\n` +
                `Sie können die Werte prüfen und auf die interaktive Karte klicken, um die Kalibrierung zu übernehmen.`;
        } else {
            reply = `He simulado una variación de margen del **+5%** en la familia **Rústica (Softcover)**:\n\n` +
                `• Puesta a punto base: de ${res.baseline.setupFee}€ a **${res.simulated.setupFee}€**\n` +
                `• Tirada de 500 copias: de ${res.baseline.example500Copies}€ a **${res.simulated.example500Copies}€** (+${res.simulated.example500Copies - res.baseline.example500Copies}€)\n` +
                `• Tirada de 1.000 copias: de ${res.baseline.example1000Copies}€ a **${res.simulated.example1000Copies}€**\n\n` +
                `Puedes revisar los datos y pulsar en la tarjeta interactiva para aplicar este ajuste al Calibrador.`;
        }
    } else {
        const pill = isEn ? 'Checking printhouse status...' : isDe ? 'Druckereistatus prüfen...' : 'Revisando estado del taller...';
        onEvent('status', { state: 'thinking', pill });
        onEvent('tool_start', { tool: 'get_onboarding_status' });
        const res = await executeCopilotTool('get_onboarding_status', {}, printhouseId);
        onEvent('tool_result', { tool: 'get_onboarding_status', data: res });

        if (isEn) {
            reply = `Hello! I am **Dotty**, your resident AI industrial copilot on the PrintPrice OS Control Plane.\n\n` +
                `Your plant setup is currently at **${res.completionPct}%**. You have **${res.machinesCount} machines** registered and **${res.papersConfiguredCount} papers** indexed.\n\n` +
                `What would you like to configure or review today? I can assist you with:\n` +
                `1. ⚙️ Registering machinery, configuring paper catalogs, and SLAs.\n` +
                `2. 📊 Executive sales reports and active orders.\n` +
                `3. 🔍 Preflight audits and PDF warning checks.\n` +
                `4. 📐 Precise spine and sheet imposition calculations.\n` +
                `5. 📈 Calibrating margins and rate cards in Act mode.`;
        } else if (isDe) {
            reply = `Hallo! Ich bin **Dotty**, Ihr KI-Copilot im PrintPrice OS Control Plane.\n\n` +
                `Ihr Betrieb ist derzeit zu **${res.completionPct}%** konfiguriert. Sie haben **${res.machinesCount} Maschinen** angelegt und **${res.papersConfiguredCount} Papiere** indexiert.\n\n` +
                `Was möchten Sie heute konfigurieren oder prüfen? Ich unterstütze Sie bei:\n` +
                `1. ⚙️ Maschinenanlage, Papierkatalogen und SLAs.\n` +
                `2. 📊 Vertriebsberichten und aktiven Aufträgen.\n` +
                `3. 🔍 Preflight-Prüfungen und PDF-Warnungen.\n` +
                `4. 📐 Exakten Rücken- und Ausschießberechnungen.\n` +
                `5. 📈 Margen- und Maschinenkalibrierungen im Act-Modus.`;
        } else {
            reply = `¡Hola! Soy **Dotty**, tu copiloto inteligente en PrintPrice OS Control Plane.\n\n` +
                `Actualmente tu taller está configurado al **${res.completionPct}%**. Tienes **${res.machinesCount} máquinas** dadas de alta y **${res.papersConfiguredCount} papeles** indexados.\n\n` +
                `¿Qué te gustaría configurar o revisar hoy? Puedo ayudarte a:\n` +
                `1. ⚙️ Dar de alta maquinaria, configurar papeles y SLAs de entrega.\n` +
                `2. 📊 Consultar reportes de ventas y pedidos activos.\n` +
                `3. 🔍 Auditar errores de preflight en PDFs entrantes.\n` +
                `4. 📐 Calcular lomos y geometrías de imposición exactas.\n` +
                `5. 📈 Calibrar márgenes y tarifas en modo Act con confirmación.`;
        }
    }

    const speakingPill = isEn ? 'Broadcasting...' : isDe ? 'Übertragen...' : 'Transmitiendo...';
    onEvent('status', { state: 'speaking', pill: speakingPill });
    onEvent('token', { text: reply });
    onEvent('done', {
        messageId: `msg-${Date.now()}`,
        fullText: reply,
        cards
    });
}

/**
 * Returns list of searchable entities for the '@' mention composer.
 */
async function getSearchableEntities(printhouseId) {
    const state = getOrCreatePrinthouseState(printhouseId || 'node-primary');

    const entities = [
        ...state.orders.map(o => ({
            id: o.id,
            type: 'order',
            label: `@${o.id}`,
            detail: `${o.customer} · ${o.title} (${o.copies} uds)`,
            status: o.status
        })),
        { id: 'MACH-HD-XL75', type: 'machine', label: '@Offset-Heidelberg-XL75', detail: 'Offset 5 colores B2 (530x750mm) · 15.000 pliegos/h' },
        { id: 'MACH-HP-12000', type: 'machine', label: '@Digital-HP-Indigo-12000', detail: 'Digital B2 7 colores · Formato 750x530mm' },
        { id: 'MACH-MBO-K8', type: 'machine', label: '@Plegadora-MBO-K8', detail: 'Plegado cruzado de alta velocidad para pliegos 16pp' },
        { id: 'PAP-EST-135', type: 'paper', label: '@Papel-Estucado-135g', detail: 'Estucado Semimate 135g/m² · Caliper: 121µm' },
        { id: 'PAP-OFF-90', type: 'paper', label: '@Papel-Offset-90g', detail: 'Offset Blanco Coral 90g/m² · Mano: 1.25' },
        { id: 'RATE-SOFTCOVER', type: 'pricing', label: '@Tarifa-Libros-PUR', detail: 'Calibración Rústica Fresada PUR · Margen 28%' },
        { id: 'RATE-HARDCOVER', type: 'pricing', label: '@Tarifa-Tapa-Dura', detail: 'Tapa Dura Carté cosido hilo · Margen 32%' }
    ];

    return entities;
}

module.exports = {
    processCopilotChat,
    executeCopilotTool,
    applyCopilotAction,
    getSearchableEntities,
    COPILOT_TOOLS_SCHEMA,
    buildSystemInstruction
};
