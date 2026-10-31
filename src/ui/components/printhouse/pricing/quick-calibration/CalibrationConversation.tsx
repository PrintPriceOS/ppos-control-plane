/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationConversation.tsx
 *
 * Phase 194F — Assistive Conversational Interface with PDF File Upload & Structured Quote Review
 */
import React, { useState, useRef } from 'react';
import { Sparkles, Send, Loader2, Bot, User, AlertTriangle, ArrowRight, Paperclip, X, FileText, CheckCircle2 } from 'lucide-react';
import { CalibrationClarificationPanel } from './CalibrationClarificationPanel';
import { StructuredQuoteReviewCard } from './StructuredQuoteReviewCard';
import { SetupDrawer } from '../../setup/SetupDrawer';
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
    activeQuoteEvidence?: any;
    setActiveQuoteEvidence?: React.Dispatch<React.SetStateAction<any>>;
    selectedVariantId?: string;
    setSelectedVariantId?: React.Dispatch<React.SetStateAction<string | undefined>>;
}

export const CalibrationConversation: React.FC<CalibrationConversationProps> = ({
    messages,
    onSendMessage,
    sending,
    activeProposal,
    onApplyProposal,
    onApplyClarifications,
    aiUnavailable = false,
    activeQuoteEvidence: externalQuoteEvidence,
    setActiveQuoteEvidence: externalSetActiveQuoteEvidence,
    selectedVariantId: externalSelectedVariantId,
    setSelectedVariantId: externalSetSelectedVariantId
}) => {
    const { t } = useLocale();
    const [input, setInput] = useState('');
    const [uploadState, setUploadState] = useState<'IDLE' | 'FILE_SELECTED' | 'UPLOADING' | 'PROCESSING' | 'EXTRACTED' | 'ERROR'>('IDLE');
    const [uploadStatusText, setUploadStatusText] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [internalQuoteEvidence, setInternalQuoteEvidence] = useState<any | null>(null);
    const [internalSelectedVariantId, setInternalSelectedVariantId] = useState<string | undefined>(undefined);
    const [isEvidenceDrawerOpen, setIsEvidenceDrawerOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const activeQuoteEvidence = externalQuoteEvidence !== undefined ? externalQuoteEvidence : internalQuoteEvidence;
    const setActiveQuoteEvidence = externalSetActiveQuoteEvidence || setInternalQuoteEvidence;
    const selectedVariantId = externalSelectedVariantId !== undefined ? externalSelectedVariantId : internalSelectedVariantId;
    const setSelectedVariantId = externalSetSelectedVariantId || setInternalSelectedVariantId;

    const lastMsgWithEvidence = [...messages].reverse().find(m => m.quoteEvidence);
    const effectiveEvidence = activeQuoteEvidence || lastMsgWithEvidence?.quoteEvidence;

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || sending) return;
        const msg = input.trim();
        setInput('');
        await onSendMessage(msg, effectiveEvidence?.evidenceId, selectedVariantId);
    };

    const processPdfFile = async (file: File) => {
        // Prevent simultaneous uploads
        if (uploadState === 'UPLOADING' || uploadState === 'PROCESSING') return;

        if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
            setUploadError(t('invalidFileType') || t('pdfOnlyError') || 'Only PDF documents are supported.');
            setUploadState('ERROR');
            return;
        }

        const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB effective server limit
        if (file.size > MAX_FILE_SIZE_BYTES) {
            setUploadError(t('fileTooLargeError') || 'File exceeds server size limit (10 MB). Please select a smaller PDF.');
            setUploadState('ERROR');
            return;
        }

        setSelectedFile(file);
        setUploadError(null);
        setUploadState('UPLOADING');
        setUploadStatusText(t('uploadingQuote') || 'Uploading quote document…');

        try {
            setUploadStatusText(t('analyzingPdfDocument') || 'Analyzing PDF…');
            setUploadState('PROCESSING');

            const result = await printhouseCalibrationApi.uploadQuoteEvidence(file);

            const langDisplay = result.detectedLanguage === 'de' ? 'German' : (result.detectedLanguage === 'es' ? 'Spanish' : 'English');
            setUploadStatusText(t('pdfDetectedLanguage', { language: langDisplay }) || `Document detected: ${langDisplay}`);
            setUploadState('EXTRACTED');

            // Store evidence DTO
            setActiveQuoteEvidence(result);

            await onSendMessage(t('pdfUploadedUserMsg', { filename: result.filename }) || `[Uploaded PDF]: ${result.filename}`, result.evidenceId);

            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err: any) {
            setUploadError(err.message || t('pdfUploadErrorMessage') || 'Error processing quote PDF.');
            setUploadState('ERROR');
            setSelectedFile(null);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await processPdfFile(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragOver) setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            await processPdfFile(file);
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
        t('pricing.example.prompt1') || "1,000 copies, 170x240mm, 128p 4/4 on 80g offset, 300g cover, perfect bound for €2,450",
        t('pricing.example.prompt2') || "500 copies of 210x297mm A4, 64 pages 4/4 coated 130g, saddle stitched for €1,200",
        t('pricing.example.prompt3') || "Hardcover photo book, 250 copies, 200p 4/4 150g coated, sewn binding for €4,800"
    ];

    return (
        <div id="assistant-chat-box" className="flex flex-col h-[calc(100vh-295px)] min-h-[350px] max-h-[calc(100vh-295px)] bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl overflow-hidden shadow-2xs">
            {/* Header */}
            <div className="px-3.5 py-2 bg-zinc-50 dark:bg-zinc-900/70 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-[#dc0000]" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                        {t('pricing.assistant.title')}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {effectiveEvidence && (
                        <button
                            id="view-evidence-drawer-btn"
                            type="button"
                            onClick={() => setIsEvidenceDrawerOpen(true)}
                            className="px-2 py-0.5 rounded-md bg-red-50 hover:bg-red-100 dark:bg-red-950/60 text-[#dc0000] dark:text-red-400 border border-red-200 dark:border-red-800 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                            <FileText size={12} />
                            <span>{t('pricing.assistant.inspectEvidence')}</span>
                        </button>
                    )}
                    <span className="text-[11px] text-zinc-500 font-medium">
                        {t('pricing.assistant.headerTag')}
                    </span>
                </div>
            </div>

            {/* AI Offline / Busy Banner */}
            {aiUnavailable && (
                <div 
                    aria-label="AI Assistant is currently offline"
                    className="p-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-xs space-y-1"
                >
                    <div className="flex items-start gap-2">
                        <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-bold text-amber-900 dark:text-amber-100">
                                {t('pricing.assistant.busyTitle')}
                            </p>
                            <p className="text-amber-800 dark:text-amber-300">
                                {t('pricing.assistant.busyDesc')}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Progress Status Banner */}
            {(uploadState === 'UPLOADING' || uploadState === 'PROCESSING') && (
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 flex items-center gap-2 font-medium">
                    <Loader2 size={13} className="animate-spin text-blue-600 shrink-0" />
                    <span>{uploadStatusText}</span>
                </div>
            )}

            {uploadState === 'EXTRACTED' && (
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between font-medium">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                        <span>{t('pdfExtractionComplete')}</span>
                    </div>
                    <button type="button" onClick={() => setUploadState('IDLE')} className="text-emerald-600 hover:text-emerald-800">
                        <X size={13} />
                    </button>
                </div>
            )}

            {uploadError && (
                <div id="quote-upload-error-banner" className="p-2.5 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-center justify-between font-medium">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={13} className="text-red-600 shrink-0" />
                        <span>{uploadError}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => {
                                setUploadError(null);
                                setUploadState('IDLE');
                                triggerFilePicker();
                            }}
                            className="px-2 py-0.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/50 dark:hover:bg-red-800 text-red-800 dark:text-red-200 rounded text-[11px] font-bold transition-colors cursor-pointer"
                        >
                            {t('pricing.assistant.retryBtn')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setUploadError(null);
                                setUploadState('IDLE');
                            }}
                            aria-label={t('pricing.action.dismissError') || 'Dismiss error'}
                            title={t('pricing.action.dismissError') || 'Dismiss error'}
                            className="p-0.5 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200 rounded cursor-pointer"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Compact Dropzone Bar when conversation has started */}
            {messages.length > 0 && uploadState === 'IDLE' && (
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={triggerFilePicker}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            triggerFilePicker();
                        }
                    }}
                    aria-label={t('pricing.dropzone.compactTitle') || 'Attach another PDF quote'}
                    className={`px-3 py-1.5 border-b text-[11px] font-medium flex items-center justify-between transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#dc0000] ${
                        isDragOver
                            ? 'bg-red-50 dark:bg-red-950/40 border-[#dc0000] text-[#dc0000]'
                            : 'bg-zinc-50/60 dark:bg-zinc-900/40 border-zinc-200/80 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/60'
                    }`}
                >
                    <div className="flex items-center gap-1.5">
                        <Paperclip size={12} className="text-[#dc0000]" />
                        <span>{isDragOver ? (t('pricing.dropzone.dragOver') || 'Release to analyze PDF quotation') : (t('pricing.dropzone.compactTitle') || 'Attach another PDF quote')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 underline">
                        {t('pricing.dropzone.compactAction') || 'Upload new PDF'}
                    </span>
                </div>
            )}

            {/* Messages Area - Internally scrollable */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-2 text-zinc-500 space-y-2">
                        <div className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-950/30 text-[#dc0000] flex items-center justify-center">
                            <Sparkles size={15} />
                        </div>
                        <div>
                            <h5 className="text-xs font-bold text-zinc-900 dark:text-white">{t('pricing.assistant.header')}</h5>
                            <p className="text-[11px] text-zinc-500 max-w-sm mt-0.5">
                                {t('pricing.assistant.subtitle')}
                            </p>
                        </div>

                        {/* Explicit Drag & Drop Zone */}
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={triggerFilePicker}
                            role="region"
                            aria-label={t('pricing.dropzone.title') || 'Drop your quotation PDF here'}
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    triggerFilePicker();
                                }
                            }}
                            className={`w-full max-w-md p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center focus:outline-none focus:ring-2 focus:ring-[#dc0000] ${
                                isDragOver 
                                    ? 'border-[#dc0000] bg-red-50/70 dark:bg-red-950/40 scale-[1.01]' 
                                    : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50/80 hover:bg-zinc-100/80 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/80'
                            }`}
                        >
                            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-950/60 text-[#dc0000] flex items-center justify-center mb-1.5">
                                <Paperclip size={16} />
                            </div>
                            <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                {isDragOver ? (t('pricing.dropzone.dragOver') || 'Release to analyze PDF quotation') : (t('pricing.dropzone.title') || 'Drop your quotation PDF here')}
                            </span>
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                {t('pricing.dropzone.subtitle') || 'or browse your files (PDF · max. ~10 MB)'}
                            </span>
                        </div>

                        {/* Starting Alternative: Describe or Manual */}
                        <div className="w-full max-w-md grid grid-cols-2 gap-2 text-left pt-0.5">
                            <button
                                type="button"
                                onClick={() => setInput(starterPrompts[0])}
                                className="p-2 rounded-lg bg-zinc-50 hover:bg-red-50/50 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-red-200 transition-all cursor-pointer group"
                            >
                                <div className="flex items-center gap-1.5">
                                    <Sparkles size={12} className="text-[#dc0000] shrink-0" />
                                    <span className="text-[11px] font-bold text-zinc-900 dark:text-white truncate">
                                        {t('onboarding.startOption.describe') || 'Describe a product'}
                                    </span>
                                </div>
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 m-0 leading-tight line-clamp-2">
                                    {t('onboarding.startOption.describeDesc') || 'Tell the assistant about a book you previously produced.'}
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    const manualToggle = document.getElementById('pricing-mode-manual-btn');
                                    if (manualToggle) manualToggle.click();
                                }}
                                className="p-2 rounded-lg bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 transition-all cursor-pointer group"
                            >
                                <div className="flex items-center gap-1.5">
                                    <FileText size={12} className="text-zinc-500 shrink-0" />
                                    <span className="text-[11px] font-bold text-zinc-900 dark:text-white truncate">
                                        {t('onboarding.startOption.manual') || 'Enter details manually'}
                                    </span>
                                </div>
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 m-0 leading-tight line-clamp-2">
                                    {t('onboarding.startOption.manualDesc') || 'Open manual rates editor to fill values directly.'}
                                </p>
                            </button>
                        </div>

                        {/* Starter Prompts - Chips for quick insertion without auto-submitting */}
                        <div className="w-full max-w-md space-y-1.5 pt-0.5">
                            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider text-left">
                                {t('pricing.assistant.orExample')}
                            </div>
                            <div className="flex flex-col gap-1 text-left">
                                {starterPrompts.map((pText, pIdx) => (
                                    <button
                                        key={pIdx}
                                        type="button"
                                        onClick={() => setInput(pText)}
                                        className="text-left p-1.5 rounded-lg bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-700 dark:text-zinc-300 transition-colors truncate cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700"
                                        title={pText}
                                    >
                                        "{pText}"
                                    </button>
                                ))}
                            </div>
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
                        selectedVariantId={selectedVariantId}
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
                                {t('pricing.assistant.proposedTitle')}
                            </span>
                            <span className="text-[10px] text-blue-700 dark:text-blue-300">
                                {t('pricing.assistant.requiresConfirmation')}
                            </span>
                        </div>
                        <p className="text-xs text-blue-800 dark:text-blue-300 m-0">
                            {t('pricing.assistant.proposedDesc')}
                        </p>
                        <button
                            type="button"
                            onClick={() => onApplyProposal(activeProposal)}
                            className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                        >
                            <span>{t('pricing.assistant.applyBtn')}</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>
                )}

                {sending && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500 p-2">
                        <Loader2 size={14} className="animate-spin text-[#dc0000]" />
                        <span>{t('pricing.assistant.analyzing')}</span>
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

            {/* Input Bar - Non-shrinking pinned row */}
            <form onSubmit={handleSend} className="p-2.5 sm:p-3 bg-zinc-50 dark:bg-zinc-900/80 border-t border-zinc-200 dark:border-zinc-800 flex gap-2 items-center shrink-0">
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
                    <span>{t('pricing.assistant.sendBtn')}</span>
                    <Send size={12} />
                </button>
            </form>

            {/* Evidence & Selected Offer Detail Drawer */}
            <SetupDrawer
                isOpen={isEvidenceDrawerOpen}
                onClose={() => setIsEvidenceDrawerOpen(false)}
                title={t('pricing.assistant.drawerTitle')}
                subtitle={t('pricing.assistant.drawerSubtitle')}
                widthClass="max-w-lg"
            >
                {effectiveEvidence ? (() => {
                    const offers: any[] = effectiveEvidence.offers || [];
                    let selectedOffer: any = null;
                    if (selectedVariantId) {
                        // 1. Exact canonical ID or name match FIRST
                        selectedOffer = offers.find((o) =>
                            o.variantId === selectedVariantId ||
                            o.id === selectedVariantId ||
                            o.variantName === selectedVariantId
                        ) || null;

                        // 2. Positional fallback ONLY if no exact canonical ID matched
                        if (!selectedOffer) {
                            const idxMatch = String(selectedVariantId).match(/^variant-(\d+)$/);
                            if (idxMatch) {
                                const targetIdx = parseInt(idxMatch[1], 10);
                                if (targetIdx >= 0 && targetIdx < offers.length) {
                                    selectedOffer = offers[targetIdx];
                                }
                            } else if (/^\d+$/.test(String(selectedVariantId))) {
                                const targetIdx = parseInt(String(selectedVariantId), 10);
                                if (targetIdx >= 0 && targetIdx < offers.length) {
                                    selectedOffer = offers[targetIdx];
                                }
                            }
                        }
                    }

                    return (
                        <div id="evidence-drawer-content" className="space-y-4 text-xs">
                            {/* Document Meta */}
                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                                <span className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                                    <FileText size={14} className="text-[#dc0000]" />
                                    <span>{t('pricing.assistant.activeExtractedDoc')}</span>
                                </span>
                                <div className="grid grid-cols-2 gap-2 text-zinc-600 dark:text-zinc-400 pt-1">
                                    <div><span className="text-zinc-400">{t('pricing.assistant.fileLabel')}</span> <strong className="text-zinc-800 dark:text-zinc-200">{effectiveEvidence.filename || 'Unknown'}</strong></div>
                                    <div><span className="text-zinc-400">{t('pricing.assistant.evidenceIdLabel')}</span> <span className="font-mono text-zinc-800 dark:text-zinc-200">{effectiveEvidence.evidenceId || '—'}</span></div>
                                    <div><span className="text-zinc-400">{t('pricing.assistant.languageLabel')}</span> <strong className="text-zinc-800 dark:text-zinc-200">{(effectiveEvidence.detectedLanguage || 'unknown').toUpperCase()}</strong></div>
                                    <div><span className="text-zinc-400">{t('pricing.assistant.pageCountLabel')}</span> <strong className="text-zinc-800 dark:text-zinc-200">{effectiveEvidence.pageCount != null ? t('quoteReview.pagesExtracted', { count: effectiveEvidence.pageCount }) : t('quoteReview.notSpecified')}</strong></div>
                                    <div className="col-span-2"><span className="text-zinc-400">{t('pricing.assistant.printhouseLabel')}</span> <strong className="text-zinc-800 dark:text-zinc-200">{effectiveEvidence.printhouseName || t('quoteReview.notSpecified')}</strong></div>
                                </div>
                            </div>

                            {/* Selected Variant Commercial Details */}
                            {selectedOffer ? (
                                <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                                            <CheckCircle2 size={14} className="text-emerald-600" />
                                            <span>{t('pricing.assistant.selectedOfferTitle')}</span>
                                        </span>
                                        <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                                            {selectedOffer.variantId || selectedVariantId || 'variant-0'}
                                        </span>
                                    </div>
                                    <p className="font-semibold text-zinc-900 dark:text-white m-0">
                                        {selectedOffer.variantName || t('quoteReview.unitsLabel', { count: selectedOffer.quantity })}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-200/60 dark:border-emerald-800/60 text-zinc-700 dark:text-zinc-300">
                                        <div><span className="text-zinc-500">{t('pricing.assistant.quantityLabel')}</span> <strong className="text-zinc-900 dark:text-white font-mono">{selectedOffer.quantity ?? t('quoteReview.notSpecified')}</strong></div>
                                        <div><span className="text-zinc-500">{t('pricing.assistant.manufacturingLabel')}</span> <strong className="text-zinc-900 dark:text-white font-mono">{selectedOffer.manufacturingPrice != null ? `€${selectedOffer.manufacturingPrice}` : t('quoteReview.notSpecified')}</strong></div>
                                        <div><span className="text-zinc-500">{t('pricing.assistant.transportLabel')}</span> <strong className="text-zinc-900 dark:text-white font-mono">{selectedOffer.transportPrice != null ? `€${selectedOffer.transportPrice}` : t('quoteReview.notSpecified')}</strong></div>
                                        <div><span className="text-zinc-500">{t('pricing.assistant.quotedTotalLabel')}</span> <strong className="text-emerald-700 dark:text-emerald-400 font-mono">{selectedOffer.quotedTotalPrice != null ? `€${selectedOffer.quotedTotalPrice}` : t('quoteReview.notSpecified')}</strong></div>
                                        <div><span className="text-zinc-500">{t('pricing.assistant.quotedUnitLabel')}</span> <strong className="text-zinc-900 dark:text-white font-mono">{selectedOffer.quotedUnitPrice != null ? `€${Number(selectedOffer.quotedUnitPrice).toFixed(2)}` : t('quoteReview.notSpecified')}</strong></div>
                                        <div><span className="text-zinc-500">{t('pricing.assistant.validationLabel')}</span> <strong className={selectedOffer.validationStatus === 'CONSISTENT' ? 'text-emerald-600' : 'text-amber-600'}>{selectedOffer.validationStatus === 'CONSISTENT' ? t('quoteReview.consistent') : t('quoteReview.inconsistent')}</strong></div>
                                    </div>
                                    {selectedOffer.sourceText && (
                                        <div className="pt-1.5 border-t border-emerald-200/60 dark:border-emerald-800/60 text-[11px] text-zinc-500">
                                            <span className="font-medium text-zinc-600 dark:text-zinc-400">{t('pricing.assistant.sourceTextLabel')}</span>
                                            <p className="font-mono text-[10px] mt-0.5 p-1.5 bg-white/70 dark:bg-black/30 rounded border border-emerald-100 dark:border-emerald-900 overflow-x-auto m-0">
                                                {selectedOffer.sourceText}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-3 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl text-zinc-500 text-center border border-zinc-200 dark:border-zinc-700">
                                    {selectedVariantId ? `Variant '${selectedVariantId}' could not be resolved from document offers.` : t('pricing.assistant.noOfferSelected')}
                                </div>
                            )}

                            {/* Extracted Specifications */}
                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                                <span className="font-bold text-zinc-900 dark:text-white">{t('pricing.assistant.physicalSpecs')}</span>
                                <div className="grid grid-cols-2 gap-2 text-zinc-600 dark:text-zinc-400 pt-1">
                                    <div><span className="text-zinc-400">{t('pricing.assistant.formatLabel')}</span> <strong className="text-zinc-800 dark:text-zinc-200">{effectiveEvidence.format || t('quoteReview.notSpecified')}</strong></div>
                                    <div><span className="text-zinc-400">{t('pricing.assistant.bindingLabel')}</span> <strong className="text-zinc-800 dark:text-zinc-200">{effectiveEvidence.binding || effectiveEvidence.binding_method || t('quoteReview.notSpecified')}</strong></div>
                                    <div><span className="text-zinc-400">{t('pricing.assistant.finishingLabel')}</span> <strong className="text-zinc-800 dark:text-zinc-200">{effectiveEvidence.finishing || effectiveEvidence.lamination || t('quoteReview.notSpecified')}</strong></div>
                                    <div><span className="text-zinc-400">{t('pricing.assistant.interiorPagesLabel')}</span> <strong className="text-zinc-800 dark:text-zinc-200">{effectiveEvidence.interior_pages != null ? `${effectiveEvidence.interior_pages} pages` : t('quoteReview.notSpecified')}</strong></div>
                                </div>
                            </div>
                        </div>
                    );
                })() : (
                    <div className="p-6 text-center text-zinc-500 text-xs">
                        {t('pricing.assistant.noEvidenceAttached')}
                    </div>
                )}
            </SetupDrawer>
        </div>
    );
};
