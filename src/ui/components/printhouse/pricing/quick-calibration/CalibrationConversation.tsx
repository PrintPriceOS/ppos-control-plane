/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationConversation.tsx
 *
 * Phase 194F — Assistive Conversational Interface with PDF File Upload & Structured Quote Review
 */
import React, { useState, useRef } from 'react';
import { Sparkles, Send, Loader2, Bot, User, AlertTriangle, ArrowRight, Paperclip, X, FileText, CheckCircle2 } from 'lucide-react';
import { CalibrationClarificationPanel } from './CalibrationClarificationPanel';
import { StructuredQuoteReviewCard } from './StructuredQuoteReviewCard';
import { printhouseCalibrationApi } from '../../../../lib/printhouseCalibrationApi';
import { useLocale } from '../../../../i18n';

interface Message {
    role: 'user' | 'assistant' | 'system';
    text: string;
    timestamp?: string;
    proposal?: any;
    quoteEvidence?: any;
}

interface CalibrationConversationProps {
    messages: Message[];
    onSendMessage: (text: string, evidenceId?: string, selectedVariantId?: string) => Promise<void>;
    sending: boolean;
    activeProposal: any | null;
    onApplyProposal: (proposal: any) => void;
    onApplyClarifications?: (answers: Record<string, string>) => void;
    aiUnavailable?: boolean;
}

export const CalibrationConversation: React.FC<CalibrationConversationProps> = ({
    messages,
    onSendMessage,
    sending,
    activeProposal,
    onApplyProposal,
    onApplyClarifications,
    aiUnavailable = false
}) => {
    const { t } = useLocale();
    const [input, setInput] = useState('');
    const [uploadState, setUploadState] = useState<'IDLE' | 'FILE_SELECTED' | 'UPLOADING' | 'PROCESSING' | 'EXTRACTED' | 'ERROR'>('IDLE');
    const [uploadStatusText, setUploadStatusText] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [activeQuoteEvidence, setActiveQuoteEvidence] = useState<any | null>(null);
    const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const lastMsgWithEvidence = [...messages].reverse().find(m => m.quoteEvidence);
    const effectiveEvidence = activeQuoteEvidence || lastMsgWithEvidence?.quoteEvidence;

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || sending) return;
        const msg = input.trim();
        setInput('');
        await onSendMessage(msg, effectiveEvidence?.evidenceId, selectedVariantId);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
            setUploadError('Únicamente se admiten archivos en formato PDF.');
            setUploadState('ERROR');
            return;
        }

        setSelectedFile(file);
        setUploadError(null);
        setUploadState('UPLOADING');
        setUploadStatusText('Subiendo presupuesto…');

        try {
            setUploadStatusText('Analizando PDF…');
            setUploadState('PROCESSING');

            const result = await printhouseCalibrationApi.uploadQuoteEvidence(file);

            setUploadStatusText(`Documento detectado: ${result.detectedLanguage || 'alemán'}`);
            setUploadState('EXTRACTED');

            // Store evidence DTO
            setActiveQuoteEvidence(result);

            // Add assistant message with summary
            const langNotice = result.detectedLanguage === 'de' ? 'alemán' : (result.detectedLanguage === 'es' ? 'español' : 'inglés');
            const summaryMsg = `He analizado el documento PDF "${result.filename}" (Idioma detectado: ${langNotice}).\nEncontré ${result.offers?.length || 0} tirada(s).`;
            
            await onSendMessage(`[PDF subido]: ${result.filename}`, result.evidenceId);

            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err: any) {
            setUploadError(err.message || 'Error al procesar el presupuesto PDF.');
            setUploadState('ERROR');
            setSelectedFile(null);
        }
    };

    const triggerFilePicker = () => {
        fileInputRef.current?.click();
    };

    const handlePaperclipKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            triggerFilePicker();
        }
    };

    const starterPrompts = [
        "1,000 copies, 170x240mm, 128p 4/4 on 80g offset, 300g cover, perfect bound for €2,450",
        "500 copies of 210x297mm A4, 64 pages 4/4 coated 130g, saddle stitched for €1,200",
        "Hardcover photo book, 250 copies, 200p 4/4 150g coated, sewn binding for €4,800"
    ];

    return (
        <div className="flex flex-col h-[580px] bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900/70 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-[#dc0000]" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                        Multilingual Pricing Assistant
                    </span>
                </div>
                <span className="text-[11px] text-zinc-500 font-medium">
                    Multilingual PDF Intake & Calibration
                </span>
            </div>

            {/* AI Offline / Busy Banner */}
            {aiUnavailable && (
                <div 
                    aria-label="AI Assistant is currently offline"
                    className="p-4 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-xs space-y-2"
                >
                    <div className="flex items-start gap-2.5">
                        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-bold text-amber-900 dark:text-amber-100">
                                AI assistant is busy right now
                            </p>
                            <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                                Your setup is safe and nothing has been saved. You can try again or enter the job details manually.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Progress Status Banner */}
            {(uploadState === 'UPLOADING' || uploadState === 'PROCESSING') && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 flex items-center gap-2 font-medium">
                    <Loader2 size={14} className="animate-spin text-blue-600 shrink-0" />
                    <span>{uploadStatusText}</span>
                </div>
            )}

            {uploadState === 'EXTRACTED' && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between font-medium">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                        <span>Extracción completada. Presupuesto listo para revisión.</span>
                    </div>
                    <button type="button" onClick={() => setUploadState('IDLE')} className="text-emerald-600 hover:text-emerald-800">
                        <X size={14} />
                    </button>
                </div>
            )}

            {uploadError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-center justify-between font-medium">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={14} className="text-red-600 shrink-0" />
                        <span>{uploadError}</span>
                    </div>
                    <button type="button" onClick={() => setUploadError(null)} className="text-red-600 hover:text-red-800">
                        <X size={14} />
                    </button>
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
                            <h5 className="text-sm font-bold text-zinc-900 dark:text-white">Multilingual Pricing Assistant</h5>
                            <p className="text-xs text-zinc-500 max-w-sm mt-1">
                                Chat in Spanish, English, or German, or upload a quote PDF document.
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
                                className={`p-3 rounded-xl text-xs max-w-[88%] leading-relaxed ${
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

                {/* Structured Quote Evidence Review Card */}
                {effectiveEvidence && (
                    <StructuredQuoteReviewCard
                        evidenceId={effectiveEvidence.evidenceId}
                        filename={effectiveEvidence.filename}
                        documentLanguage={effectiveEvidence.detectedLanguage}
                        printhouseName={effectiveEvidence.printhouseName}
                        format={effectiveEvidence.format || (effectiveEvidence.width_mm && effectiveEvidence.height_mm ? `${effectiveEvidence.width_mm} × ${effectiveEvidence.height_mm} mm` : undefined)}
                        binding={effectiveEvidence.binding || effectiveEvidence.binding_method}
                        finishing={effectiveEvidence.finishing || effectiveEvidence.lamination}
                        offers={effectiveEvidence.offers || []}
                        normalizedTerms={effectiveEvidence.normalizedTerms || []}
                        validationStatus={effectiveEvidence.hasInconsistentOffers ? 'INCONSISTENT_UNIT_PRICE' : 'CONSISTENT'}
                        onSelectVariant={(off, variantId) => {
                            setSelectedVariantId(variantId);
                            onSendMessage(`[Variante seleccionada]: ${off.variantName || `Variante ${variantId}`}`, effectiveEvidence.evidenceId, variantId);
                        }}
                    />
                )}

                {/* Clarification Questions */}
                {activeProposal?.clarificationQuestions && activeProposal.clarificationQuestions.length > 0 && onApplyClarifications && (
                    <CalibrationClarificationPanel
                        questions={activeProposal.clarificationQuestions}
                        onApplyAnswers={onApplyClarifications}
                    />
                )}

                {/* Pending Proposal Preview Banner */}
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

            {/* Hidden File Input */}
            <input
                type="file"
                ref={fileInputRef}
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
                className="hidden"
                id="quote-pdf-upload-input"
            />

            {/* Input Bar */}
            <form onSubmit={handleSend} className="p-3 bg-zinc-50 dark:bg-zinc-900/80 border-t border-zinc-200 dark:border-zinc-800 flex gap-2 items-center">
                {/* Accessible Attachment / Paperclip Control */}
                <button
                    type="button"
                    onClick={triggerFilePicker}
                    onKeyDown={handlePaperclipKeyDown}
                    aria-label={t('attachPdfTooltip')}
                    title={t('attachPdfTooltip')}
                    disabled={sending || uploadState === 'UPLOADING' || uploadState === 'PROCESSING'}
                    className="w-[44px] h-[44px] shrink-0 rounded-lg bg-[#dc0000] hover:bg-[#b00000] disabled:opacity-50 text-white flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#dc0000] focus:ring-offset-1 transition-colors"
                >
                    {uploadState === 'UPLOADING' || uploadState === 'PROCESSING' ? (
                        <Loader2 size={20} className="animate-spin text-white" />
                    ) : (
                        <Paperclip size={20} className="text-white" />
                    )}
                </button>

                <input
                    type="text"
                    placeholder={t('chatInputPlaceholder')}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    disabled={sending || aiUnavailable || uploadState === 'UPLOADING'}
                    className="flex-1 min-w-0 text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#dc0000] disabled:opacity-50"
                />

                <button
                    type="submit"
                    disabled={!input.trim() || sending || aiUnavailable}
                    className="px-3.5 py-2.5 bg-[#dc0000] hover:bg-[#b00000] disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0"
                >
                    <span>Send</span>
                    <Send size={12} />
                </button>
            </form>
        </div>
    );
};
