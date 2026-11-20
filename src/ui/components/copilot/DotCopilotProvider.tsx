import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { DotChatState } from '../mascot';
import { 
    CopilotMode, 
    CopilotMessage, 
    CopilotSession, 
    PrinthouseEntity,
    CopilotCardPayload 
} from './types';
import { getAuthToken } from '../../lib/authStore';
import { useLocale } from '../../i18n';

interface DotCopilotContextType {
    isOpen: boolean;
    openDrawer: () => void;
    closeDrawer: () => void;
    toggleDrawer: () => void;
    width: number;
    setWidth: (w: number) => void;
    isExpanded: boolean;
    toggleExpand: () => void;
    mode: CopilotMode;
    setMode: (m: CopilotMode) => void;
    globalDotState: DotChatState;
    setGlobalDotState: (s: DotChatState) => void;
    activeToolPill: string | null;
    currentRoute: string;
    sessions: CopilotSession[];
    activeSessionId: string;
    selectSession: (id: string) => void;
    createNewSession: () => void;
    messages: CopilotMessage[];
    sendMessage: (content: string, mentions?: string[]) => Promise<void>;
    isStreaming: boolean;
    searchableEntities: PrinthouseEntity[];
}

const DotCopilotContext = createContext<DotCopilotContextType | undefined>(undefined);

const SESSIONS_STORAGE_KEY = 'ppos_dot_copilot_sessions_v1';

function createDefaultSession(title = 'Nueva conversación'): CopilotSession {
    const id = `session-${Date.now()}`;
    return {
        id,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
    };
}

export const DotCopilotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const currentRoute = location.pathname;
    const { locale, t } = useLocale();

    const [isOpen, setIsOpen] = useState(false);
    const [width, setWidth] = useState(420);
    const [isExpanded, setIsExpanded] = useState(false);
    const [mode, setMode] = useState<CopilotMode>('ask');
    const [globalDotState, setGlobalDotState] = useState<DotChatState>('idle');
    const [activeToolPill, setActiveToolPill] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [searchableEntities, setSearchableEntities] = useState<PrinthouseEntity[]>([]);

    // Sessions management with localStorage persistence
    const [sessions, setSessions] = useState<CopilotSession[]>(() => {
        try {
            const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch {}
        return [createDefaultSession()];
    });

    const [activeSessionId, setActiveSessionId] = useState<string>(() => {
        return sessions[0]?.id || `session-${Date.now()}`;
    });

    // Save sessions to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
        } catch {}
    }, [sessions]);

    // Active session messages
    const activeSession = useMemo(() => {
        return sessions.find(s => s.id === activeSessionId) || sessions[0] || createDefaultSession();
    }, [sessions, activeSessionId]);

    const messages = activeSession.messages || [];

    // Fetch searchable entities for '@' autocomplete
    useEffect(() => {
        let isMounted = true;
        fetch('/api/copilot/entities', {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        })
            .then(res => res.json())
            .then(data => {
                if (isMounted && data?.ok && Array.isArray(data.entities)) {
                    setSearchableEntities(data.entities);
                }
            })
            .catch(() => {});
        return () => { isMounted = false; };
    }, []);

    // Drawer Open / Close Handlers with Mascot Welcome Animation
    const openDrawer = useCallback(() => {
        setIsOpen(true);
        // Mascot welcome jump (0.95s) -> idle
        setGlobalDotState('success');
        const timer = setTimeout(() => {
            setGlobalDotState('idle');
        }, 950);
        return () => clearTimeout(timer);
    }, []);

    const closeDrawer = useCallback(() => {
        setIsOpen(false);
        setActiveToolPill(null);
        setGlobalDotState('idle');
    }, []);

    const toggleDrawer = useCallback(() => {
        if (isOpen) closeDrawer();
        else openDrawer();
    }, [isOpen, openDrawer, closeDrawer]);

    const toggleExpand = useCallback(() => {
        setIsExpanded(prev => !prev);
    }, []);

    // Global Keyboard Shortcut: Cmd+I / Ctrl+I
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I')) {
                e.preventDefault();
                toggleDrawer();
            }
            if (e.key === 'Escape' && isOpen) {
                closeDrawer();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, toggleDrawer, closeDrawer]);

    // Create New Session
    const createNewSession = useCallback(() => {
        const defaultTitle = t('copilot.newConversation') || 'Nueva conversación';
        const newSession = createDefaultSession(defaultTitle);
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setActiveToolPill(null);
        setGlobalDotState('idle');
    }, [t]);

    const selectSession = useCallback((id: string) => {
        setActiveSessionId(id);
        setActiveToolPill(null);
        setGlobalDotState('idle');
    }, []);

    // Streaming Message Sender
    const sendMessage = useCallback(async (content: string, mentions: string[] = []) => {
        if (!content.trim() || isStreaming) return;

        const userMsg: CopilotMessage = {
            id: `msg-user-${Date.now()}`,
            role: 'user',
            content: content.trim(),
            timestamp: Date.now(),
            mentions
        };

        const updatedMessages = [...messages, userMsg];

        // Update session state with user message
        setSessions(prev => prev.map(s => {
            if (s.id === activeSessionId) {
                const title = s.messages.length === 0 ? content.slice(0, 32) : s.title;
                return {
                    ...s,
                    title,
                    updatedAt: Date.now(),
                    messages: updatedMessages
                };
            }
            return s;
        }));

        setIsStreaming(true);
        setGlobalDotState('thinking');
        setActiveToolPill(t('copilot.statusConsulting') || 'Consultando al asistente industrial...');

        // Placeholder for assistant response
        const assistantMsgId = `msg-dot-${Date.now()}`;
        let fullText = '';
        let cards: CopilotCardPayload[] = [];

        try {
            const response = await fetch('/api/copilot/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
                    context: {
                        locale,
                        currentRoute,
                        printhouseName: 'Gráficas Industriales Philologica',
                        currency: 'EUR'
                    },
                    mode,
                    sessionId: activeSessionId
                })
            });

            if (!response.ok || !response.body) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let currentEventType = 'message';

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEventType = line.slice(7).trim();
                    } else if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (currentEventType === 'status') {
                                if (data.state) setGlobalDotState(data.state);
                                if (data.pill) setActiveToolPill(data.pill);
                            } else if (currentEventType === 'tool_start') {
                                setGlobalDotState('thinking');
                                setActiveToolPill(t('copilot.statusExecutingTool', { tool: data.tool }) || `Ejecutando ${data.tool}...`);
                            } else if (currentEventType === 'token') {
                                fullText += (data.text || '');
                                setGlobalDotState('speaking');
                                // Progressively update UI with streaming text
                                setSessions(prev => prev.map(s => {
                                    if (s.id === activeSessionId) {
                                        const assistantMsg: CopilotMessage = {
                                            id: assistantMsgId,
                                            role: 'assistant',
                                            content: fullText,
                                            timestamp: Date.now(),
                                            cards
                                        };
                                        const exists = s.messages.some(m => m.id === assistantMsgId);
                                        return {
                                            ...s,
                                            messages: exists
                                                ? s.messages.map(m => m.id === assistantMsgId ? assistantMsg : m)
                                                : [...s.messages, assistantMsg]
                                        };
                                    }
                                    return s;
                                }));
                            } else if (currentEventType === 'done') {
                                if (Array.isArray(data.cards)) {
                                    cards = data.cards;
                                }
                                if (data.fullText && !fullText) {
                                    fullText = data.fullText;
                                }
                            }
                        } catch {}
                    }
                }
            }

            // Final message update with cards and success hop
            setSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
                    const finalMsg: CopilotMessage = {
                        id: assistantMsgId,
                        role: 'assistant',
                        content: fullText || t('copilot.statusCompleted') || 'Operación completada con éxito.',
                        timestamp: Date.now(),
                        cards
                    };
                    const exists = s.messages.some(m => m.id === assistantMsgId);
                    return {
                        ...s,
                        messages: exists
                            ? s.messages.map(m => m.id === assistantMsgId ? finalMsg : m)
                            : [...s.messages, finalMsg]
                    };
                }
                return s;
            }));

            setGlobalDotState('success');
            setTimeout(() => {
                setGlobalDotState('idle');
                setActiveToolPill(null);
            }, 1200);

        } catch (err: any) {
            console.error('[DotCopilot] Chat request failed:', err);
            setGlobalDotState('idle');
            setActiveToolPill(null);
            const errorMsg: CopilotMessage = {
                id: `msg-err-${Date.now()}`,
                role: 'assistant',
                content: t('copilot.errorConnection', { error: err.message || 'Error' }) || `No se pudo conectar con el servicio de Dot Copilot (${err.message || 'Error'}). Inténtalo de nuevo o comprueba tu conexión.`,
                timestamp: Date.now()
            };
            setSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
                    return { ...s, messages: [...s.messages, errorMsg] };
                }
                return s;
            }));
        } finally {
            setIsStreaming(false);
        }
    }, [messages, isStreaming, activeSessionId, currentRoute, mode, locale, t]);

    const contextValue = useMemo(() => ({
        isOpen,
        openDrawer,
        closeDrawer,
        toggleDrawer,
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
    }), [
        isOpen,
        openDrawer,
        closeDrawer,
        toggleDrawer,
        width,
        isExpanded,
        toggleExpand,
        mode,
        globalDotState,
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
    ]);

    return (
        <DotCopilotContext.Provider value={contextValue}>
            {children}
        </DotCopilotContext.Provider>
    );
};

export function useDotCopilot(): DotCopilotContextType {
    const context = useContext(DotCopilotContext);
    if (!context) {
        throw new Error('useDotCopilot must be used within a DotCopilotProvider');
    }
    return context;
}
