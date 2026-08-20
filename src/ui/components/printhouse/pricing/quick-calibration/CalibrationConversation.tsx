/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationConversation.tsx
 *
 * Phase 193F — Assistive Conversational Interface
 * Note: assistant/chat is strictly zero-write. Proposal changes require explicit Apply.
 */
import React, { useState } from 'react';
import { Sparkles, Send, Loader2, Bot, User, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import { CalibrationClarificationPanel } from './CalibrationClarificationPanel';

interface Message {
    role: 'user' | 'assistant' | 'system';
    text: string;
    timestamp?: string;
    proposal?: any;
}

interface CalibrationConversationProps {
    messages: Message[];
    onSendMessage: (text: string) => Promise<void>;
    sending: boolean;
    activeProposal: any | null;
    onApplyProposal: (proposal: any) => void;
    onClarificationAnswer: (field: string, answer: any) => void;
    aiUnavailable?: boolean;
}

export const CalibrationConversation: React.FC<CalibrationConversationProps> = ({
    messages,
    onSendMessage,
    sending,
    activeProposal,
    onApplyProposal,
    onClarificationAnswer,
    aiUnavailable = false
}) => {
    const [input, setInput] = useState('');

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || sending) return;
        const msg = input.trim();
        setInput('');
        await onSendMessage(msg);
    };

    const starterPrompts = [
        "1,000 copies, 170x240mm, 128p 4/4 on 80g offset, 300g cover, perfect bound for €2,450",
        "500 copies of 210x297mm A4, 64 pages 4/4 coated 130g, saddle stitched for €1,200",
        "Hardcover photo book, 250 copies, 200p 4/4 150g coated, sewn binding for €4,800"
    ];

    return (
        <div className="flex flex-col h-[560px] bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900/70 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-[#dc0000]" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                        Calibration Assistant
                    </span>
                </div>
                <span className="text-[11px] text-zinc-500">
                    Conversational Spec Extraction
                </span>
            </div>

            {/* AI Offline Banner (F2.10) */}
            {aiUnavailable && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                    <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                    <span>AI Assistant is currently offline. You can continue configuring your reference book directly in the structured form.</span>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-4">
                        <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30 text-[#dc0000] flex items-center justify-center">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h5 className="text-sm font-bold text-zinc-900 dark:text-white">Describe Your Reference Book</h5>
                            <p className="text-xs text-zinc-500 max-w-sm mt-1">
                                Tell us the format, pages, paper stock, binding, and known cost. The assistant will extract the specifications for calibration.
                            </p>
                        </div>

                        {/* Starter Prompts */}
                        <div className="w-full max-w-md space-y-1.5 pt-2">
                            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Try an example:</div>
                            {starterPrompts.map((p, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setInput(p)}
                                    className="w-full text-left p-2 rounded-lg bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 transition-colors"
                                >
                                    "{p}"
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map((m, idx) => (
                        <div
                            key={idx}
                            className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {m.role !== 'user' && (
                                <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-950/50 text-[#dc0000] flex items-center justify-center shrink-0 mt-0.5">
                                    <Bot size={13} />
                                </div>
                            )}
                            <div
                                className={`p-3 rounded-xl text-xs max-w-[85%] leading-relaxed ${
                                    m.role === 'user'
                                        ? 'bg-[#dc0000] text-white rounded-br-none'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-none border border-zinc-200 dark:border-zinc-700/60'
                                }`}
                            >
                                <p className="m-0 whitespace-pre-wrap">{m.text}</p>
                            </div>
                            {m.role === 'user' && (
                                <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center justify-center shrink-0 mt-0.5">
                                    <User size={13} />
                                </div>
                            )}
                        </div>
                    ))
                )}

                {/* Clarification Questions */}
                {activeProposal?.clarificationQuestions && activeProposal.clarificationQuestions.length > 0 && (
                    <CalibrationClarificationPanel
                        questions={activeProposal.clarificationQuestions}
                        onAnswer={onClarificationAnswer}
                    />
                )}

                {/* Pending Proposal Preview Banner (F2.9 Explicit Apply) */}
                {activeProposal && Object.keys(activeProposal.specPatch || {}).length > 0 && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                                <Sparkles size={14} className="text-blue-600" />
                                Proposed Book Updates Ready
                            </span>
                            <span className="text-[10px] text-blue-700 dark:text-blue-300">
                                Requires Confirmation
                            </span>
                        </div>
                        <p className="text-xs text-blue-800 dark:text-blue-300 m-0">
                            The assistant extracted details from your message. Review the structured summary on the right and confirm to apply.
                        </p>
                        <button
                            type="button"
                            onClick={() => onApplyProposal(activeProposal)}
                            className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                        >
                            <span>Apply Extracted Details</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>
                )}

                {sending && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500 p-2">
                        <Loader2 size={14} className="animate-spin text-[#dc0000]" />
                        <span>Analyzing specifications...</span>
                    </div>
                )}
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSend} className="p-3 bg-zinc-50 dark:bg-zinc-900/80 border-t border-zinc-200 dark:border-zinc-800 flex gap-2">
                <input
                    type="text"
                    placeholder="Describe book format, paper, pages, price..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    disabled={sending || aiUnavailable}
                    className="flex-1 text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#dc0000] disabled:opacity-50"
                />
                <button
                    type="submit"
                    disabled={!input.trim() || sending || aiUnavailable}
                    className="px-3.5 py-2 bg-[#dc0000] hover:bg-[#b00000] disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                    <span>Send</span>
                    <Send size={12} />
                </button>
            </form>
        </div>
    );
};
