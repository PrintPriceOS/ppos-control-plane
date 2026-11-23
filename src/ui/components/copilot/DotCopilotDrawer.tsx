import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
    Check,
    Trash2
} from 'lucide-react';
import { getAuthUser } from '../../lib/authStore';
import { useLocale } from '../../i18n';

/**
 * Lightweight, zero-dependency Markdown renderer for inline bold, italic, code, and lists.
 */
export const FormattedMessageText: React.FC<{ content: string }> = ({ content }) => {
    const lines = content.split('\n');

    const parseInline = (text: string) => {
        const parts: React.ReactNode[] = [];
        const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        let pIdx = 0;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(text.slice(lastIndex, match.index));
            }

            const matchStr = match[0];
            if (matchStr.startsWith('`') && matchStr.endsWith('`')) {
                parts.push(
                    <code key={pIdx++} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-red-600 dark:text-red-400 font-mono text-[11px] font-semibold">
                        {matchStr.slice(1, -1)}
                    </code>
                );
            } else if (matchStr.startsWith('**') && matchStr.endsWith('**')) {
                parts.push(
                    <strong key={pIdx++} className="font-extrabold text-zinc-900 dark:text-zinc-100">
                        {matchStr.slice(2, -2)}
                    </strong>
                );
            } else if (matchStr.startsWith('*') && matchStr.endsWith('*')) {
                parts.push(
                    <em key={pIdx++} className="italic text-zinc-700 dark:text-zinc-300">
                        {matchStr.slice(1, -1)}
                    </em>
                );
            }

            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            parts.push(text.slice(lastIndex));
        }

        return parts.length > 0 ? parts : text;
    };

    return (
        <div className="space-y-1.5">
            {lines.map((line, lIdx) => {
                const trimmed = line.trim();
                if (!trimmed) {
                    return <div key={lIdx} className="h-1" />;
                }

                // Horizontal dividers (-- or --- or ***)
                if (/^[-*_]{2,}\s*$/.test(trimmed)) {
                    return <hr key={lIdx} className="my-2 border-zinc-200 dark:border-zinc-800" />;
                }

                // Markdown headings: strip #/##/### (and optional trailing hashes) and render as crisp, styled header
                const hMatch = line.match(/^\s*#{1,6}\s*(.*?)(?:\s*#+)?$/);
                if (hMatch && hMatch[1]) {
                    return (
                        <div key={lIdx} className="pt-2 pb-0.5 font-extrabold text-zinc-900 dark:text-zinc-100 text-xs tracking-tight">
                            {parseInline(hMatch[1])}
                        </div>
                    );
                }

                if (line.startsWith('• ') || line.startsWith('- ')) {
                    return (
                        <div key={lIdx} className="flex items-start gap-1.5 pl-1">
                            <span className="text-[#dc0000] font-bold shrink-0">•</span>
                            <span className="flex-1">{parseInline(line.slice(2))}</span>
                        </div>
                    );
                }

                const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
                if (numMatch) {
                    return (
                        <div key={lIdx} className="flex items-start gap-1.5 pl-1">
                            <span className="font-bold text-zinc-400 shrink-0">{numMatch[1]}.</span>
                            <span className="flex-1">{parseInline(numMatch[2])}</span>
                        </div>
                    );
                }

                return (
                    <p key={lIdx} className="m-0 leading-relaxed">
                        {parseInline(line)}
                    </p>
                );
            })}
        </div>
    );
};

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
        clearCurrentSession,
        deleteSession,
        messages,
        sendMessage,
        isStreaming,
        searchableEntities
    } = useDotCopilot();

    const { locale, t } = useLocale();
    const navigate = useNavigate();

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
        const greetingKey = hour >= 6 && hour < 13
            ? 'copilot.greetingMorning'
            : hour >= 13 && hour < 20
                ? 'copilot.greetingAfternoon'
                : 'copilot.greetingEvening';
        return t(greetingKey, { name: printhouseName });
    }, [printhouseName, t]);

    // 5 Contextual Quick Actions based on route
    const contextualActions = useMemo((): ContextualQuickAction[] => {
        if (currentRoute.includes('pricing') || currentRoute.includes('calibrat')) {
            return [
                { id: 'p1', title: t('copilot.action.pricing1.title'), subtitle: t('copilot.action.pricing1.subtitle'), prompt: t('copilot.action.pricing1.prompt') },
                { id: 'p2', title: t('copilot.action.pricing2.title'), subtitle: t('copilot.action.pricing2.subtitle'), prompt: t('copilot.action.pricing2.prompt') },
                { id: 'p3', title: t('copilot.action.pricing3.title'), subtitle: t('copilot.action.pricing3.subtitle'), prompt: t('copilot.action.pricing3.prompt') },
                { id: 'p4', title: t('copilot.action.pricing4.title'), subtitle: t('copilot.action.pricing4.subtitle'), prompt: t('copilot.action.pricing4.prompt') },
                { id: 'p5', title: t('copilot.action.pricing5.title'), subtitle: t('copilot.action.pricing5.subtitle'), prompt: t('copilot.action.pricing5.prompt') }
            ];
        }

        if (currentRoute.includes('order') || currentRoute.includes('queue')) {
            return [
                { id: 'o1', title: t('copilot.action.orders1.title'), subtitle: t('copilot.action.orders1.subtitle'), prompt: t('copilot.action.orders1.prompt') },
                { id: 'o2', title: t('copilot.action.orders2.title'), subtitle: t('copilot.action.orders2.subtitle'), prompt: t('copilot.action.orders2.prompt') },
                { id: 'o3', title: t('copilot.action.orders3.title'), subtitle: t('copilot.action.orders3.subtitle'), prompt: t('copilot.action.orders3.prompt') },
                { id: 'o4', title: t('copilot.action.orders4.title'), subtitle: t('copilot.action.orders4.subtitle'), prompt: t('copilot.action.orders4.prompt') },
                { id: 'o5', title: t('copilot.action.orders5.title'), subtitle: t('copilot.action.orders5.subtitle'), prompt: t('copilot.action.orders5.prompt') }
            ];
        }

        if (currentRoute.includes('preflight')) {
            return [
                { id: 'pf1', title: t('copilot.action.preflight1.title'), subtitle: t('copilot.action.preflight1.subtitle'), prompt: t('copilot.action.preflight1.prompt') },
                { id: 'pf2', title: t('copilot.action.preflight2.title'), subtitle: t('copilot.action.preflight2.subtitle'), prompt: t('copilot.action.preflight2.prompt') },
                { id: 'pf3', title: t('copilot.action.preflight3.title'), subtitle: t('copilot.action.preflight3.subtitle'), prompt: t('copilot.action.preflight3.prompt') },
                { id: 'pf4', title: t('copilot.action.preflight4.title'), subtitle: t('copilot.action.preflight4.subtitle'), prompt: t('copilot.action.preflight4.prompt') },
                { id: 'pf5', title: t('copilot.action.preflight5.title'), subtitle: t('copilot.action.preflight5.subtitle'), prompt: t('copilot.action.preflight5.prompt') }
            ];
        }

        if (currentRoute.includes('onboarding') || currentRoute.includes('setup')) {
            return [
                {
                    id: 's0',
                    title: '⚡ Kit de Alta Rápida (15 min) — Early Adopter',
                    subtitle: 'Preconfigura prensas Offset/Digital B2, 6 papeles maestros y tarifas 5-Axis al 100%',
                    prompt: 'Aplica el Kit de Onboarding Acelerado de 15 minutos para dejar mi imprenta lista al 100% para el Marketplace.'
                },
                { id: 's1', title: t('copilot.action.setup1.title'), subtitle: t('copilot.action.setup1.subtitle'), prompt: t('copilot.action.setup1.prompt') },
                { id: 's2', title: t('copilot.action.setup2.title'), subtitle: t('copilot.action.setup2.subtitle'), prompt: t('copilot.action.setup2.prompt') },
                { id: 's3', title: t('copilot.action.setup3.title'), subtitle: t('copilot.action.setup3.subtitle'), prompt: t('copilot.action.setup3.prompt') },
                { id: 's4', title: t('copilot.action.setup4.title'), subtitle: t('copilot.action.setup4.subtitle'), prompt: t('copilot.action.setup4.prompt') },
                { id: 's5', title: t('copilot.action.setup5.title'), subtitle: t('copilot.action.setup5.subtitle'), prompt: t('copilot.action.setup5.prompt') }
            ];
        }

        // Default General / Home Cards
        return [
            { id: 'g1', title: t('copilot.action.general1.title'), subtitle: t('copilot.action.general1.subtitle'), prompt: t('copilot.action.general1.prompt') },
            { id: 'g2', title: t('copilot.action.general2.title'), subtitle: t('copilot.action.general2.subtitle'), prompt: t('copilot.action.general2.prompt') },
            { id: 'g3', title: t('copilot.action.general3.title'), subtitle: t('copilot.action.general3.subtitle'), prompt: t('copilot.action.general3.prompt') },
            { id: 'g4', title: t('copilot.action.general4.title'), subtitle: t('copilot.action.general4.subtitle'), prompt: t('copilot.action.general4.prompt') },
            { id: 'g5', title: t('copilot.action.general5.title'), subtitle: t('copilot.action.general5.subtitle'), prompt: t('copilot.action.general5.prompt') },
            {
                id: 'g0',
                title: '⚡ Kit de Onboarding Acelerado (15 min)',
                subtitle: 'Activa parque base Offset/Digital, papeles certificados y tarifas en 1 clic',
                prompt: 'Aplica el Kit de Onboarding Acelerado de 15 minutos para dejar mi imprenta lista al 100% para el Marketplace.'
            }
        ];
    }, [currentRoute, t]);

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
                title={t('copilot.resizeHandleTitle') || 'Arrastra para cambiar el ancho del panel'}
            />

            {/* ──── 1. HEADER ──────────────────────────────────────────────── */}
            <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/70 dark:bg-[#18181b]/70 backdrop-blur-md">
                <div className="relative flex items-center gap-2 min-w-0" ref={historyRef}>
                    <button
                        type="button"
                        onClick={() => setHistoryOpen(prev => !prev)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer truncate max-w-[210px]"
                        title={t('copilot.historyTitle') || 'Historial de conversaciones de la imprenta'}
                    >
                        <DotChatAvatar size={18} state={globalDotState} />
                        <span className="truncate">
                            {(() => {
                                const currentSession = sessions.find(s => s.id === activeSessionId);
                                if (!currentSession || currentSession.title === 'Nueva conversación' || currentSession.title === 'New conversation') {
                                    return t('copilot.newConversation') || 'Nueva conversación';
                                }
                                return currentSession.title;
                            })()}
                        </span>
                        <ChevronDown size={13} className={`text-zinc-400 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Session Dropdown Menu */}
                    {historyOpen && (
                        <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 shadow-xl p-1.5 z-50 space-y-1">
                            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                {t('copilot.recentSessions') || 'Sesiones Recientes'}
                            </div>
                            <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1">
                                {sessions.map(s => {
                                    const displayTitle = (s.title === 'Nueva conversación' || s.title === 'New conversation')
                                        ? (t('copilot.newConversation') || 'Nueva conversación')
                                        : s.title;
                                    return (
                                        <div
                                            key={s.id}
                                            className={`group/session w-full flex items-center justify-between rounded-lg transition-colors ${s.id === activeSessionId
                                                    ? 'bg-red-500/10 text-[#dc0000] font-bold'
                                                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                                }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    selectSession(s.id);
                                                    setHistoryOpen(false);
                                                }}
                                                className="flex-1 text-left px-2.5 py-1.5 text-xs truncate cursor-pointer flex items-center justify-between min-w-0"
                                            >
                                                <span className="truncate pr-1">{displayTitle}</span>
                                                {s.id === activeSessionId && <Check size={12} className="shrink-0" />}
                                            </button>
                                            {sessions.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteSession(s.id);
                                                    }}
                                                    title={t('copilot.deleteSessionTooltip') || 'Eliminar conversación'}
                                                    className="p-1 mr-1 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover/session:opacity-100 transition-opacity cursor-pointer shrink-0"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
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
                                    {t('copilot.newConversation') || 'Nueva conversación'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Action Icons: Clear Chat, New Chat, Expand, Close */}
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={clearCurrentSession}
                        disabled={messages.length === 0}
                        title={t('copilot.clearChatTooltip') || 'Borrar conversación actual'}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                    >
                        <Trash2 size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={createNewSession}
                        title={t('copilot.newSessionTooltip') || 'Nueva conversación (+)'}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={toggleExpand}
                        title={isExpanded ? (t('copilot.collapseTooltip') || 'Contraer ancho') : (t('copilot.expandTooltip') || 'Expandir ancho')}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                        {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </button>
                    <button
                        type="button"
                        onClick={closeDrawer}
                        title={t('copilot.closeTooltip') || 'Cerrar panel (Esc)'}
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
                            <span>{t('copilot.residentAiBadge') || 'DOT COPILOT · RESIDENT AI'}</span>
                        </div>

                        <h2 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 max-w-[340px] leading-snug m-0">
                            {greetingText}
                        </h2>

                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[320px]">
                            {t('copilot.heroSubtitle') || 'Conectado a los motores de producción, tarifas, imposición y preflight de PrintPrice OS.'}
                        </p>

                        {/* 5 Tarjetas de Acción Rápida Contextuales */}
                        <div className="w-full mt-6 space-y-2 text-left">
                            <span className="text-[10px] uppercase font-bold text-zinc-400 px-1 tracking-wider block">
                                {t('copilot.contextualActionsHeader') || 'Acciones rápidas contextuales'}
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
                                                <div className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">
                                                    <FormattedMessageText content={msg.content} />
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
                                                            if (card.type === 'NAVIGATION') {
                                                                return (
                                                                    <button
                                                                        key={cIdx}
                                                                        type="button"
                                                                        data-testid="copilot-navigation-card"
                                                                        onClick={() => {
                                                                            if (card.route && card.route.startsWith('/')) {
                                                                                navigate(card.route);
                                                                            }
                                                                        }}
                                                                        className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:border-[#dc0000] hover:bg-red-50/40 dark:hover:bg-red-950/20 transition-all flex items-center justify-between gap-2 text-left cursor-pointer group"
                                                                    >
                                                                        <div className="min-w-0">
                                                                            <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-[#dc0000] truncate">
                                                                                {card.label}
                                                                            </div>
                                                                            {card.description && (
                                                                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                                                                    {card.description}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <span className="px-2.5 py-1 rounded-lg bg-[#dc0000] text-white text-[10px] font-bold shrink-0">
                                                                            {t('copilot.navigation.openBtn')} →
                                                                        </span>
                                                                    </button>
                                                                );
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
                                <span>{activeToolPill || (t('copilot.statusProcessing') || 'Dot está procesando...')}</span>
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
                            {t('copilot.mentionPopoverTitle') || 'Entidades disponibles para etiquetar'}
                        </div>
                        {filteredEntities.map((ent, idx) => (
                            <button
                                key={ent.id}
                                type="button"
                                onClick={() => handleSelectEntity(ent)}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${idx === selectedMentionIndex
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
                            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${mode === 'ask'
                                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xs'
                                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                                }`}
                        >
                            {t('copilot.modeAsk') || 'Ask'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('act')}
                            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-1 ${mode === 'act'
                                    ? 'bg-[#dc0000] text-white shadow-2xs'
                                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                                }`}
                        >
                            <Zap size={10} />
                            {t('copilot.modeAct') || 'Act'}
                        </button>
                    </div>

                    <span className="text-[10px] text-zinc-400">
                        {mode === 'act' ? (t('copilot.modeActDesc') || 'Modo asistido con tarjetas de confirmación') : (t('copilot.modeAskDesc') || 'Modo consultas y reportes de solo lectura')}
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
                        placeholder={t('copilot.inputPlaceholder') || 'Escribe @ para etiquetar un pedido, máquina o tarifa...'}
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
                                title={t('copilot.tagEntityTooltip') || 'Etiquetar entidad (@)'}
                                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                            >
                                <AtSign size={13} />
                            </button>
                            <span className="text-[10px] text-zinc-400 hidden sm:inline">
                                {t('copilot.toggleShortcut') || '⌘I para alternar panel'}
                            </span>
                        </div>

                        <button
                            type="submit"
                            disabled={!inputValue.trim() || isStreaming}
                            title={t('copilot.sendTooltip') || 'Enviar mensaje'}
                            className={`p-1.5 rounded-xl transition-all cursor-pointer ${inputValue.trim() && !isStreaming
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
