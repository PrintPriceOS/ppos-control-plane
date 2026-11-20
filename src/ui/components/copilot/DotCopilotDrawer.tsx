import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useDotCopilot } from './DotCopilotProvider';
import { DotInteractiveHero, DotChatAvatar } from '../mascot';
import { 
    ContextualQuickAction, 
    PrinthouseEntity 
} from './types';
import { CopilotKpiSummaryCard } from './cards/CopilotKpiSummaryCard';
import { CopilotPreflightAlertCard } from './cards/CopilotPreflightAlertCard';
import { CopilotActionConfirmCard } from './cards/CopilotActionConfirmCard';
import { 
    X, 
    Plus, 
    Maximize2, 
    Minimize2, 
    Send, 
    AtSign, 
    ChevronDown, 
    Clock, 
    Sparkles, 
    Zap, 
    Shield, 
    FileText, 
    SlidersHorizontal, 
    HelpCircle,
    Check
} from 'lucide-react';
import { getAuthUser } from '../../lib/authStore';

export const DotCopilotDrawer: React.FC = () => {
    const {
        isOpen,
        closeDrawer,
        width,
        setWidth,
        isExpanded,
        toggleExpand,
        mode,
        setMode,
        globalDotState,
        setGlobalDotState,
        activeToolPill,
        currentRoute,
        sessions,
        activeSessionId,
        selectSession,
        createNewSession,
        messages,
        sendMessage,
        isStreaming,
        searchableEntities
    } = useDotCopilot();

    const [inputValue, setInputValue] = useState('');
    const [historyOpen, setHistoryOpen] = useState(false);
    const [mentionSearch, setMentionSearch] = useState<string | null>(null);
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const historyRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);

    const authUser = getAuthUser();
    const printhouseName = authUser?.name || 'Gráficas Industriales';

    // Auto-scroll to bottom of messages
    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen, isStreaming]);

    // Focus textarea on drawer open
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                textareaRef.current?.focus();
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Close session dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
                setHistoryOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Drag-to-resize sidecar width (360px - 580px)
    const handleMouseDownResize = (e: React.MouseEvent) => {
        e.preventDefault();
        isDraggingRef.current = true;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!isDraggingRef.current) return;
            const newWidth = window.innerWidth - moveEvent.clientX;
            if (newWidth >= 360 && newWidth <= 580) {
                setWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            isDraggingRef.current = false;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    // Greeting according to time of day
    const greetingText = useMemo(() => {
        const hour = new Date().getHours();
        const prefix = hour >= 6 && hour < 13
            ? 'Buenos días'
            : hour >= 13 && hour < 20
                ? 'Buenas tardes'
                : 'Buenas noches';
        return `${prefix}, ${printhouseName}. ¿Qué configuramos o revisamos hoy?`;
    }, [printhouseName]);

    // 5 Contextual Quick Actions based on route
    const contextualActions = useMemo((): ContextualQuickAction[] => {
        if (currentRoute.includes('pricing') || currentRoute.includes('calibrat')) {
            return [
                { id: 'p1', title: 'Calibrar márgenes y tarifas', subtitle: 'Simula un escalado de tirada o ajuste de margen', prompt: 'Simula un ajuste de margen de +5% en la familia Rústica (Softcover) y compáralo.' },
                { id: 'p2', title: 'Calcular lomo SPINE-01', subtitle: 'Calcula el lomo con encuadernación cosida', prompt: 'Calcula las cotas de lomo y cubierta abierta SPINE-01 para un libro de 192 páginas en estucado 115g.' },
                { id: 'p3', title: 'Cruce Digital vs Offset', subtitle: 'Halla el punto de inflexión económico Q*', prompt: 'Calcula la curva de cruce y punto Q* entre Digital y Offset para formato A5 en papel offset 90g.' },
                { id: 'p4', title: 'Revisar matrices de papel', subtitle: 'Comprueba el coste por kilogramo de sustratos', prompt: 'Muéstrame el resumen de papeles configurados y costes de plancha en taller.' },
                { id: 'p5', title: 'Auditoría de salud de tarifas', subtitle: 'Detecta familias sin calibrar o reglas incompletas', prompt: '¿Qué familias de producto tienen pendientes matrices o escalados en el calibrador?' }
            ];
        }

        if (currentRoute.includes('order') || currentRoute.includes('queue')) {
            return [
                { id: 'o1', title: 'Reporte de ventas y pedidos', subtitle: 'Resumen de facturación y pedidos aceptados', prompt: 'Genera el reporte ejecutivo de ventas y pedidos de esta semana con ticket medio.' },
                { id: 'o2', title: 'Inspeccionar @Pedido-1043', subtitle: 'Ver detalles técnicos y archivo PDF', prompt: 'Inspecciona las especificaciones técnicas completas del pedido @ORD-1043.' },
                { id: 'o3', title: 'Pedidos en producción', subtitle: 'Identifica órdenes activas en máquina', prompt: '¿Cuántos pedidos tenemos actualmente en fase de impresión y encuadernación?' },
                { id: 'o4', title: 'Estado de pagos Escrow', subtitle: 'Comprueba fondos garantizados contra POD', prompt: 'Revisa el estado de custodia de fondos en Escrow de los pedidos listos para expedición.' },
                { id: 'o5', title: 'Cubicaje en palets EPAL', subtitle: 'Calcula peso y bultos para el transportista', prompt: 'Calcula el cubicaje 3D en palet Euro-EPAL para 2.500 ejemplares de 420g por libro.' }
            ];
        }

        if (currentRoute.includes('preflight')) {
            return [
                { id: 'pf1', title: 'Revisar estado de Preflights', subtitle: 'Analiza los últimos PDFs con advertencias', prompt: 'Revisa las alertas de preflight recientes e indica si hay errores de sangrado o resolución.' },
                { id: 'pf2', title: 'Corregir sangrado con Auto-Fix', subtitle: 'Aplica compensación reflejada en PDFs', prompt: '¿Cómo puedo autorreparar la falta de sangrado en los interiores del pedido @ORD-1043?' },
                { id: 'pf3', title: 'Auditoría de resolución DPI', subtitle: 'Detecta imágenes por debajo de 300 DPI', prompt: '¿Qué páginas presentan imágenes a baja resolución en los últimos archivos subidos?' },
                { id: 'pf4', title: 'Desviación de lomo vs cubierta', subtitle: 'Contrasta cota calculada con el PDF', prompt: 'Audita la deriva de lomo detectada en la maqueta de cubierta frente a las 288 páginas.' },
                { id: 'pf5', title: 'Perfiles de color e ICC', subtitle: 'Verifica conversión CMYK y tintas planas', prompt: 'Comprueba la cobertura total de tinta (TAC) y perfil Fogra51 en los pedidos activos.' }
            ];
        }

        if (currentRoute.includes('onboarding') || currentRoute.includes('setup')) {
            return [
                { id: 's1', title: 'Configurar mi imprenta', subtitle: 'Completa datos fiscales, maquinaria y formatos', prompt: '¿Cuál es el estado de completitud de mi imprenta y qué pasos me faltan para terminar?' },
                { id: 's2', title: 'Dar de alta una máquina', subtitle: 'Ajusta pliego máximo y coste por hora', prompt: 'Ayúdame a dar de alta una nueva prensa Offset B2 de 5 colores a 95€/h.' },
                { id: 's3', title: 'Configurar catálogo de papeles', subtitle: 'Vincula sustratos y gramajes base', prompt: '¿Cuántos papeles tengo configurados y cuáles faltan por definir en el taller?' },
                { id: 's4', title: 'Configurar SLAs de transporte', subtitle: 'Establece plazos y transportistas preferidos', prompt: 'Configura un plazo estándar de entrega de 5 días con transportistas DHL y SEUR.' },
                { id: 's5', title: 'Activar modo producción', subtitle: 'Comprueba requisitos para recibir pedidos', prompt: '¿Cumple mi imprenta todos los requisitos para recibir pedidos en el Marketplace?' }
            ];
        }

        // Default General / Home Cards
        return [
            { id: 'g1', title: 'Configurar mi imprenta', subtitle: 'Completa datos fiscales, maquinaria y formatos base', prompt: '¿Cuál es el estado del onboarding de mi imprenta y qué pasos me faltan para estar al 100%?' },
            { id: 'g2', title: 'Revisar estado de Preflights', subtitle: 'Analiza los últimos PDFs con advertencias o errores', prompt: 'Revisa las alertas de preflight recientes y dime qué archivos requieren atención.' },
            { id: 'g3', title: 'Reporte de ventas y pedidos', subtitle: 'Resumen de presupuestos aceptados esta semana', prompt: 'Genera el reporte ejecutivo de ventas y facturación de pedidos de esta semana.' },
            { id: 'g4', title: 'Calibrar márgenes y tarifas', subtitle: 'Ajusta escalados de tirada o precios de papel', prompt: 'Simula un incremento del 5% en la tarifa de Rústica (Softcover) y muéstrame el impacto.' },
            { id: 'g5', title: 'Auditoría de salud del catálogo', subtitle: 'Detecta productos sin tarifa o reglas incompletas', prompt: 'Ejecuta una auditoría de salud del catálogo e identifica sustratos o familias sin tarifa activa.' }
        ];
    }, [currentRoute]);

    // Handle typing and '@' autocomplete triggers
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setInputValue(value);

        // Mascot listening state while typing
        if (value.trim()) {
            setGlobalDotState('listening');
        } else {
            setGlobalDotState('idle');
        }

        // Auto-resize textarea
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }

        // Check for '@' mention
        const cursor = e.target.selectionStart;
        const textBeforeCursor = value.slice(0, cursor);
        const lastAtMatch = textBeforeCursor.match(/@([a-zA-Z0-9_\-]*)$/);

        if (lastAtMatch) {
            setMentionSearch(lastAtMatch[1].toLowerCase());
            setSelectedMentionIndex(0);
        } else {
            setMentionSearch(null);
        }
    };

    // Filtered entities for '@' autocomplete
    const filteredEntities = useMemo(() => {
        if (mentionSearch === null) return [];
        return searchableEntities.filter(ent => 
            ent.label.toLowerCase().includes(mentionSearch) ||
            ent.detail.toLowerCase().includes(mentionSearch)
        ).slice(0, 6);
    }, [searchableEntities, mentionSearch]);

    // Select an entity from autocomplete popover
    const handleSelectEntity = (entity: PrinthouseEntity) => {
        if (!textareaRef.current) return;
        const cursor = textareaRef.current.selectionStart;
        const textBefore = inputValue.slice(0, cursor);
        const textAfter = inputValue.slice(cursor);

        const newBefore = textBefore.replace(/@([a-zA-Z0-9_\-]*)$/, `${entity.label} `);
        const newValue = newBefore + textAfter;
        setInputValue(newValue);
        setMentionSearch(null);

        setTimeout(() => {
            textareaRef.current?.focus();
            const newCursorPos = newBefore.length;
            textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        }, 50);
    };

    // Handle form submit
    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!inputValue.trim() || isStreaming) return;

        const textToSend = inputValue.trim();
        setInputValue('');
        setMentionSearch(null);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // Extract mentions
        const mentions = (textToSend.match(/@[a-zA-Z0-9_\-]+/g) || []);

        await sendMessage(textToSend, mentions);
    };

    // Keyboard navigation in composer
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionSearch !== null && filteredEntities.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedMentionIndex(prev => (prev + 1) % filteredEntities.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedMentionIndex(prev => (prev - 1 + filteredEntities.length) % filteredEntities.length);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                handleSelectEntity(filteredEntities[selectedMentionIndex]);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setMentionSearch(null);
                return;
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    if (!isOpen) return null;

    const currentWidth = isExpanded ? 'min(720px, 95vw)' : `${width}px`;

    return (
        <aside
            id="dot-copilot-drawer"
            style={{ width: currentWidth }}
            className="fixed right-0 top-0 bottom-0 h-screen z-50 flex flex-col bg-white dark:bg-[#131314] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl transition-all duration-200 select-none"
            aria-label="DOT Copilot Sidecar Drawer"
        >
            {/* Draggable resize handle on left edge */}
            <div
                onMouseDown={handleMouseDownResize}
                className="absolute left-0 top-0 bottom-0 w-1.5 hover:w-2 hover:bg-[#dc0000] cursor-ew-resize transition-all z-10 -ml-1"
                title="Arrastra para cambiar el ancho del panel"
            />

            {/* ──── 1. HEADER ──────────────────────────────────────────────── */}
            <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/70 dark:bg-[#18181b]/70 backdrop-blur-md">
                <div className="relative flex items-center gap-2 min-w-0" ref={historyRef}>
                    <button
                        type="button"
                        onClick={() => setHistoryOpen(prev => !prev)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer truncate max-w-[210px]"
                        title="Historial de conversaciones de la imprenta"
                    >
                        <DotChatAvatar size={18} state={globalDotState} />
                        <span className="truncate">
                            {sessions.find(s => s.id === activeSessionId)?.title || 'Nueva conversación'}
                        </span>
                        <ChevronDown size={13} className={`text-zinc-400 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Session Dropdown Menu */}
                    {historyOpen && (
                        <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 shadow-xl p-1.5 z-50 space-y-1">
                            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                Sesiones Recientes
                            </div>
                            <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1">
                                {sessions.map(s => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => {
                                            selectSession(s.id);
                                            setHistoryOpen(false);
                                        }}
                                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                                            s.id === activeSessionId
                                                ? 'bg-red-500/10 text-[#dc0000] font-bold'
                                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                        }`}
                                    >
                                        <span className="truncate pr-2">{s.title}</span>
                                        {s.id === activeSessionId && <Check size={12} className="shrink-0" />}
                                    </button>
                                ))}
                            </div>
                            <div className="pt-1 border-t border-zinc-100 dark:border-zinc-800">
                                <button
                                    type="button"
                                    onClick={() => {
                                        createNewSession();
                                        setHistoryOpen(false);
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#dc0000] hover:bg-red-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Plus size={13} />
                                    Nueva conversación
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Action Icons: New Chat, Expand, Close */}
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={createNewSession}
                        title="Nueva conversación (+)"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={toggleExpand}
                        title={isExpanded ? 'Contraer ancho' : 'Expandir ancho'}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                        {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </button>
                    <button
                        type="button"
                        onClick={closeDrawer}
                        title="Cerrar panel (Esc)"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                        <X size={16} />
                    </button>
                </div>
            </header>

            {/* ──── 2. BODY CONTENT (ZERO-STATE OR MESSAGE THREAD) ─────────── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 select-text">
                {messages.length === 0 ? (
                    /* ZERO-STATE INTELIGENTE CON DOT INTERACTIVE HERO */
                    <div className="py-4 flex flex-col items-center text-center">
                        <div className="mb-3">
                            <DotInteractiveHero
                                size={110}
                                enableEyeTracking={true}
                                interactiveTags={false}
                                glow={true}
                            />
                        </div>

                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[#dc0000] text-[11px] font-bold tracking-wider uppercase mb-2">
                            <Sparkles size={11} />
                            <span>DOT COPILOT · RESIDENT AI</span>
                        </div>

                        <h2 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 max-w-[340px] leading-snug m-0">
                            {greetingText}
                        </h2>

                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[320px]">
                            Conectado a los motores de producción, tarifas, imposición y preflight de PrintPrice OS.
                        </p>

                        {/* 5 Tarjetas de Acción Rápida Contextuales */}
                        <div className="w-full mt-6 space-y-2 text-left">
                            <span className="text-[10px] uppercase font-bold text-zinc-400 px-1 tracking-wider block">
                                Acciones rápidas contextuales
                            </span>
                            {contextualActions.map((act) => (
                                <button
                                    key={act.id}
                                    type="button"
                                    onClick={() => sendMessage(act.prompt)}
                                    className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:border-red-500/30 transition-all text-left cursor-pointer group flex items-start gap-3"
                                >
                                    <div className="w-2 h-2 rounded-full bg-[#dc0000] mt-1.5 shrink-0 group-hover:scale-125 transition-transform" />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-[#dc0000] transition-colors">
                                            {act.title}
                                        </div>
                                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-tight">
                                            {act.subtitle}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* MESSAGE THREAD */
                    <div className="space-y-4">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                            >
                                {msg.role === 'user' ? (
                                    <div className="max-w-[85%] rounded-2xl rounded-tr-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3.5 py-2.5 text-xs font-medium shadow-xs">
                                        <p className="m-0 whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                ) : (
                                    <div className="max-w-[95%] w-full">
                                        <div className="flex items-start gap-2.5">
                                            <div className="mt-0.5 shrink-0">
                                                <DotChatAvatar size={24} state="idle" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed prose dark:prose-invert max-w-none">
                                                    <p className="m-0 whitespace-pre-wrap">{msg.content}</p>
                                                </div>

                                                {/* Render Generative UI Cards */}
                                                {msg.cards && msg.cards.length > 0 && (
                                                    <div className="mt-2 space-y-2">
                                                        {msg.cards.map((card, cIdx) => {
                                                            if (card.type === 'KPI_SUMMARY') {
                                                                return <CopilotKpiSummaryCard key={cIdx} payload={card} />;
                                                            }
                                                            if (card.type === 'PREFLIGHT_ALERTS') {
                                                                return <CopilotPreflightAlertCard key={cIdx} payload={card} />;
                                                            }
                                                            if (card.type === 'ACTION_CONFIRM') {
                                                                return <CopilotActionConfirmCard key={cIdx} payload={card} />;
                                                            }
                                                            return null;
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Active Thinking Tool Pill */}
                        {isStreaming && (
                            <div className="flex items-center gap-2 p-2 rounded-xl bg-zinc-100/80 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 max-w-max text-xs font-semibold text-zinc-700 dark:text-zinc-300 animate-pulse">
                                <DotChatAvatar size={18} state="thinking" />
                                <span>{activeToolPill || 'Dot está procesando...'}</span>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* ──── 3. COMPOSER CON MENCIONES (@) Y SELECTOR DE MODO ───────── */}
            <footer className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#18181b]/50">
                {/* Autocomplete Popover for '@' mentions */}
                {mentionSearch !== null && filteredEntities.length > 0 && (
                    <div className="mb-2 rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-700 shadow-xl p-1.5 space-y-1">
                        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            Entidades disponibles para etiquetar
                        </div>
                        {filteredEntities.map((ent, idx) => (
                            <button
                                key={ent.id}
                                type="button"
                                onClick={() => handleSelectEntity(ent)}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                                    idx === selectedMentionIndex
                                        ? 'bg-red-500/10 text-[#dc0000] font-bold'
                                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                }`}
                            >
                                <span className="font-mono font-bold">{ent.label}</span>
                                <span className="text-[11px] text-zinc-500 truncate max-w-[200px]">{ent.detail}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Mode Selector Pill: Ask vs Act */}
                <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-200/70 dark:bg-zinc-800 text-[11px] font-bold">
                        <button
                            type="button"
                            onClick={() => setMode('ask')}
                            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                mode === 'ask'
                                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xs'
                                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                            }`}
                        >
                            Ask
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('act')}
                            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                                mode === 'act'
                                    ? 'bg-[#dc0000] text-white shadow-2xs'
                                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                            }`}
                        >
                            <Zap size={10} />
                            Act
                        </button>
                    </div>

                    <span className="text-[10px] text-zinc-400">
                        {mode === 'act' ? 'Modo asistido con tarjetas de confirmación' : 'Modo consultas y reportes de solo lectura'}
                    </span>
                </div>

                {/* Textarea Form */}
                <form onSubmit={handleSubmit} className="relative rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#18181b] p-2 focus-within:border-[#dc0000] transition-colors shadow-xs">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Escribe @ para etiquetar un pedido, máquina o tarifa..."
                        className="w-full bg-transparent border-0 outline-none resize-none text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 p-1 min-h-[32px] max-h-[120px] custom-scrollbar"
                    />

                    <div className="flex items-center justify-between pt-1 mt-1 border-t border-zinc-100 dark:border-zinc-800/80">
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setInputValue(prev => prev + '@');
                                    setMentionSearch('');
                                    textareaRef.current?.focus();
                                }}
                                title="Etiquetar entidad (@)"
                                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                            >
                                <AtSign size={13} />
                            </button>
                            <span className="text-[10px] text-zinc-400 hidden sm:inline">
                                ⌘I para alternar panel
                            </span>
                        </div>

                        <button
                            type="submit"
                            disabled={!inputValue.trim() || isStreaming}
                            className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                                inputValue.trim() && !isStreaming
                                    ? 'bg-[#dc0000] text-white hover:bg-red-700 shadow-2xs'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                            }`}
                        >
                            <Send size={13} />
                        </button>
                    </div>
                </form>
            </footer>
        </aside>
    );
};
