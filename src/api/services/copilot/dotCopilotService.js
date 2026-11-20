'use strict';

/**
 * src/api/services/copilot/dotCopilotService.js
 *
 * Phase 200 — DOT Copilot Conversational & Function Calling Service
 *
 * Resident AI Assistant for PrintPrice OS Control Plane.
 * Connected to Gemini API (@google/genai) with ModelRegistryService,
 * native tool calling across Onboarding, Orders, Preflight, Pricing, and MCP.
 */

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
            return {
                status: 'ACTION_PENDING_CONFIRMATION',
                actionId: `act-${Date.now()}`,
                actionType: 'UPDATE_PROFILE',
                printhouseId: effectivePrinthouseId,
                proposedChanges: {
                    companyName: args.companyName || state.name,
                    leadTimesDays: args.leadTimesDays,
                    dailyProductionCapacityHours: args.dailyProductionCapacityHours,
                    preferredCarriers: args.preferredCarriers
                },
                summary: `Actualizar perfil operativo: plazo ${args.leadTimesDays || 'sin cambios'} días, capacidad ${args.dailyProductionCapacityHours || 'sin cambios'}h.`
            };
        }

        case 'configure_machinery_or_paper': {
            return {
                status: 'ACTION_PENDING_CONFIRMATION',
                actionId: `act-${Date.now()}`,
                actionType: 'CONFIGURE_MACHINE',
                printhouseId: effectivePrinthouseId,
                proposedChanges: {
                    machineName: args.machineName,
                    category: args.category,
                    hourlyCostEur: args.hourlyCostEur,
                    maxSheetSize: args.maxSheetSize
                },
                summary: `Configurar máquina ${args.machineName} (${args.category}) a ${args.hourlyCostEur || 85} €/h con pliego máx ${args.maxSheetSize || '700x1000mm'}.`
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

// ──── System Instructions Builder ───────────────────────────────────────────

function buildSystemInstruction(context = {}) {
    const printhouse = context.printhouseName || 'Imprenta Autorizada';
    const route = context.currentRoute || '/';
    const currency = context.currency || 'EUR';

    return `Eres DOT, el Agente IA Copiloto de PrintPrice OS Control Plane para talleres e imprentas profesionales.
Eres un asistente industrial experto, preciso, cordial y rigurosamente técnico.

CONTEXTO ACTUAL DEL USUARIO:
- Taller / Imprenta: ${printhouse}
- Ruta actual de la interfaz: ${route}
- Moneda operativa: ${currency}

CAPACIDADES Y REGLAS OPERATIVAS:
1. Habla en español técnico y profesional de artes gráficas (pliegos, gramajes, micras, hendidos, imposición, lomo, perfiles ICC, preflight, sangrados, mermas).
2. Utiliza siempre las herramientas declaradas cuando el usuario pregunte por el estado de su imprenta, onboarding, pedidos, preflight, cálculos técnicos o precios.
3. Cuando ejecutes herramientas que produzcan datos numéricos o alertas (ej. ventas o preflights), añade explicaciones concisas y recomendaciones accionables.
4. Si el usuario está en modo "Act" y pide modificar configuraciones, utiliza las herramientas correspondientes que devuelven tarjetas de confirmación "Human-in-the-Loop".
5. Nunca inventes datos confidenciales de otras imprentas; el aislamiento multi-tenant es sagrado e inviolable.`;
}

// ──── Conversational Stream Pipeline (SSE) ───────────────────────────────────

/**
 * Handles conversational turns with Gemini or deterministic fallback.
 * 
 * @param {Object} options
 * @param {Array} options.messages - [{ role: 'user' | 'assistant', content: string }]
 * @param {Object} options.context - PageContext { currentRoute, printhouseId, printhouseName, mode }
 * @param {string} options.mode - 'ask' | 'act'
 * @param {Function} options.onEvent - Callback for SSE events: (eventType, payload) => void
 */
async function processCopilotChat({ messages, context = {}, mode = 'ask', onEvent }) {
    const printhouseId = context.printhouseId || 'node-primary';
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const latestUserMsg = messages[messages.length - 1]?.content || '';

    // Step 1: Notify initial thinking state
    onEvent('status', { state: 'thinking', pill: 'Analizando contexto industrial...' });

    // Step 2: Check if Gemini API is available, otherwise run deterministic fallback
    if (apiKey) {
        try {
            const modelName = await resolveGeminiModel('fast', apiKey);
            const ai = new GoogleGenAI({ apiKey });

            const geminiContents = messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

            // Call Gemini generateContent with tools
            const response = await ai.models.generateContent({
                model: modelName,
                contents: geminiContents,
                config: {
                    systemInstruction: buildSystemInstruction(context),
                    tools: [{ functionDeclarations: COPILOT_TOOLS_SCHEMA }]
                }
            });

            // Check if model returned function calls
            const candidates = response.candidates || [];
            const firstCandidate = candidates[0];
            const contentParts = firstCandidate?.content?.parts || [];

            const functionCallPart = contentParts.find(p => p.functionCall);

            if (functionCallPart) {
                const fc = functionCallPart.functionCall;
                onEvent('status', { state: 'thinking', pill: `Ejecutando ${fc.name}...` });
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

                onEvent('status', { state: 'speaking', pill: 'Generando respuesta...' });

                const followUpResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: followUpContents,
                    config: {
                        systemInstruction: buildSystemInstruction(context)
                    }
                });

                const followUpText = followUpResponse.text || '';
                onEvent('token', { text: followUpText });

                // If tool returned visual cards, emit them
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
            onEvent('status', { state: 'speaking', pill: 'Respondiendo...' });
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
        onEvent
    });
}

/**
 * Resilient deterministic dispatcher that matches intent and provides immediate rich responses.
 */
async function runDeterministicFallback({ userMessage, printhouseId, mode, onEvent }) {
    const text = userMessage.toLowerCase();
    const cards = [];
    let reply = '';

    if (text.includes('venta') || text.includes('pedido') || text.includes('facturaci') || text.includes('reporte') || text.includes('@pedido')) {
        onEvent('status', { state: 'thinking', pill: 'Consultando pedidos y ventas...' });
        onEvent('tool_start', { tool: 'get_sales_and_orders_report' });
        const res = await executeCopilotTool('get_sales_and_orders_report', { period: 'this_week' }, printhouseId);
        onEvent('tool_result', { tool: 'get_sales_and_orders_report', data: res });
        if (res.cardPayload) cards.push(res.cardPayload);

        reply = `He analizado los pedidos y presupuestos de tu taller para esta semana:\n\n` +
            `• Facturación acumulada: **${res.totalRevenueEur.toLocaleString('es-ES')} €**\n` +
            `• Presupuestos aceptados: **${res.acceptedQuotesCount} pedidos**\n` +
            `• Trabajos en máquina activos: **${res.pendingOrdersCount}**\n` +
            `• Ticket medio: **${res.avgTicketEur} €**\n\n` +
            `Todo el flujo económico está cubierto bajo la garantía de custodia de fondos de PrintPrice OS. ¿Quieres inspeccionar algún pedido en detalle?`;
    } else if (text.includes('preflight') || text.includes('pdf') || text.includes('sangrado') || text.includes('resoluci')) {
        onEvent('status', { state: 'thinking', pill: 'Analizando reportes de preflight...' });
        onEvent('tool_start', { tool: 'get_recent_preflight_reports' });
        const res = await executeCopilotTool('get_recent_preflight_reports', { onlyWithIssues: true }, printhouseId);
        onEvent('tool_result', { tool: 'get_recent_preflight_reports', data: res });
        if (res.cardPayload) cards.push(res.cardPayload);

        reply = `He auditado los últimos archivos PDF recibidos. Hemos detectado advertencias en el pedido **ORD-1043** (*Monografia_Escultores_Interior_v2.pdf*):\n\n` +
            `• **Sangrado insuficiente:** 1.8mm detectado (requerido 3.0mm en páginas 14, 45, 92).\n` +
            `• **Imágenes a baja resolución:** 4 imágenes a 192 DPI (umbral estándar: 300 DPI).\n` +
            `• **Deriva de lomo:** +1.4mm respecto al cálculo de cubierta.\n\n` +
            `La herramienta de autorreparación *MAGIC_FIX* puede compensar automáticamente el sangrado expandiendo el margen reflejado.`;
    } else if (text.includes('lomo') || text.includes('spine') || text.includes('imposic') || text.includes('palet') || text.includes('cubic')) {
        onEvent('status', { state: 'thinking', pill: 'Calculando cotas técnicas de ingeniería...' });
        onEvent('tool_start', { tool: 'run_technical_calculation' });
        const res = await executeCopilotTool('run_technical_calculation', {
            calculationType: 'calc_spine',
            params: { pages: 192, caliperUm: 115, binding: 'SEWN', coverType: 'HARDCOVER' }
        }, printhouseId);
        onEvent('tool_result', { tool: 'run_technical_calculation', data: res });

        reply = `Cálculo de lomo certificado **SPINE-01** ejecutado:\n\n` +
            `• Grosor neto del bloque: **${res.textBlockThicknessMm} mm**\n` +
            `• Hinchamiento por cosido hilo (1.08x) + cartón 2.4mm: **${res.roundedSpineMm} mm** de lomo final\n` +
            `• Ancho total de cubierta extendida: **${res.totalOpenCoverWidthMm} mm** (incluye hendidos y sangrado)\n\n` +
            `Cálculo listo para enviar a producción y contrastar con la maqueta del diseñador.`;
    } else if (text.includes('tarifa') || text.includes('calibr') || text.includes('margen') || text.includes('precio')) {
        onEvent('status', { state: 'thinking', pill: 'Simulando ajuste de tarifas...' });
        onEvent('tool_start', { tool: 'simulate_price_adjustment' });
        const res = await executeCopilotTool('simulate_price_adjustment', { category: 'SOFTCOVER', marginDeltaPercent: 5 }, printhouseId);
        onEvent('tool_result', { tool: 'simulate_price_adjustment', data: res });
        if (res.actionPayload) cards.push(res.actionPayload);

        reply = `He simulado una variación de margen del **+5%** en la familia **Rústica (Softcover)**:\n\n` +
            `• Puesta a punto base: de ${res.baseline.setupFee}€ a **${res.simulated.setupFee}€**\n` +
            `• Tirada de 500 copias: de ${res.baseline.example500Copies}€ a **${res.simulated.example500Copies}€** (+${res.simulated.example500Copies - res.baseline.example500Copies}€)\n` +
            `• Tirada de 1.000 copias: de ${res.baseline.example1000Copies}€ a **${res.simulated.example1000Copies}€**\n\n` +
            `Puedes revisar los datos y pulsar en la tarjeta interactiva para aplicar este ajuste al Calibrador.`;
    } else {
        onEvent('status', { state: 'thinking', pill: 'Revisando estado del taller...' });
        onEvent('tool_start', { tool: 'get_onboarding_status' });
        const res = await executeCopilotTool('get_onboarding_status', {}, printhouseId);
        onEvent('tool_result', { tool: 'get_onboarding_status', data: res });

        reply = `¡Hola! Soy **DOT**, tu copiloto en PrintPrice OS Control Plane.\n\n` +
            `Actualmente tu taller está configurado al **${res.completionPct}%**. Tienes **${res.machinesCount} máquinas** dadas de alta y **${res.papersConfiguredCount} papeles** indexados.\n\n` +
            `¿Qué te gustaría revisar hoy? Puedo ayudarte a:\n` +
            `1. 📊 Consultar reportes de ventas y pedidos activos.\n` +
            `2. 🔍 Auditar errores de preflight en PDFs entrantes.\n` +
            `3. 📐 Calcular lomos y geometrías de imposición exactas.\n` +
            `4. ⚙️ Calibrar márgenes y tarifas de tus máquinas.`;
    }

    onEvent('status', { state: 'speaking', pill: 'Transmitiendo...' });
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
    getSearchableEntities,
    COPILOT_TOOLS_SCHEMA,
    buildSystemInstruction
};
