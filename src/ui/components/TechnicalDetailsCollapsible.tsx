import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, ClipboardDocumentIcon, CheckIcon, WrenchScrewdriverIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { useLocale } from '../i18n';

export interface TechnicalDetailItem {
  label: string;
  value: string | number | boolean | null | undefined;
  copyable?: boolean;
  hint?: string;
}

export interface TechnicalDetailsCollapsibleProps {
  title?: string;
  defaultOpen?: boolean;
  items?: TechnicalDetailItem[];
  fields?: Array<{ label: string; value: string | number | boolean | null | undefined; copyable?: boolean; hint?: string }>;
  jsonPayload?: any;
  data?: any;
  missingEndpointNotice?: {
    missingEntity: string;
    requiredEndpointProposal: string;
    fieldNotice: string;
  };
  missingBackendNotes?: string[];
  children?: React.ReactNode;
  className?: string;
}

export const TechnicalDetailsCollapsible: React.FC<TechnicalDetailsCollapsibleProps> = ({
  title,
  defaultOpen = false,
  items,
  fields,
  jsonPayload,
  data,
  missingEndpointNotice,
  missingBackendNotes,
  children,
  className = ''
}) => {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const effectiveItems = items || fields || [];
  const effectivePayload = jsonPayload !== undefined ? jsonPayload : data;

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (e) {
      console.warn('Clipboard write error', e);
    }
  };

  const defaultTitle = title || t('technicalDetails.title') || 'Detalles Técnicos y Diagnóstico';

  return (
    <div className={`border ppos-border rounded bg-zinc-500/5 transition-colors overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-zinc-500/10 transition-colors"
        aria-expanded={isOpen}
      >
        <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-zinc-200 flex items-center gap-2">
          <WrenchScrewdriverIcon className="w-3.5 h-3.5 text-zinc-400" />
          {defaultTitle}
        </span>
        <span className="text-zinc-400 flex items-center gap-1 text-[11px]">
          {isOpen ? (
            <>
              <span>{t('technicalDetails.hide') || 'Ocultar'}</span>
              <ChevronUpIcon className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              <span>{t('technicalDetails.show') || 'Ver'}</span>
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </>
          )}
        </span>
      </button>

      {isOpen && (
        <div className="p-4 pt-2 border-t ppos-border space-y-3.5">
          {/* Missing Backend Endpoint Notice */}
          {missingEndpointNotice && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-blue-500 uppercase text-[10px]">
                <InformationCircleIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{t('technicalDetails.backendNoticeTitle') || 'Carencia de API / Entrada Manual Asistida'}</span>
              </div>
              <p className="text-slate-700 dark:text-zinc-300 text-[11px] leading-relaxed">
                {missingEndpointNotice.fieldNotice}
              </p>
              <div className="pt-1 text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                <span className="font-bold">Propuesta API Mínima:</span> {missingEndpointNotice.requiredEndpointProposal}
              </div>
            </div>
          )}

          {/* Missing Backend Notes List */}
          {missingBackendNotes && missingBackendNotes.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400 uppercase text-[10px]">
                <InformationCircleIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Propuesta de Endpoints Faltantes (Backend Gaps)</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px] font-mono text-slate-700 dark:text-zinc-300">
                {missingBackendNotes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Key-Value Items */}
          {effectiveItems.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {effectiveItems.map((item, idx) => {
                const itemKey = `item-${idx}-${item.label}`;
                const valStr = item.value != null ? String(item.value) : '---';
                const isCopied = copiedKey === itemKey;

                return (
                  <div key={itemKey} className="p-2 border ppos-border rounded bg-white dark:bg-zinc-900/60 flex flex-col justify-between gap-1">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">
                      {item.label}
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-slate-800 dark:text-zinc-200 truncate select-all">
                        {valStr}
                      </span>
                      {item.copyable && item.value && (
                        <button
                          type="button"
                          onClick={() => handleCopy(valStr, itemKey)}
                          title={isCopied ? '¡Copiado!' : 'Copiar'}
                          className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-100 transition-colors shrink-0"
                        >
                          {isCopied ? (
                            <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                    {item.hint && (
                      <span className="text-[9px] text-zinc-400 italic">
                        {item.hint}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Children nodes */}
          {children}

          {/* JSON Payload viewer */}
          {effectivePayload && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500 uppercase">
                <span>{t('technicalDetails.jsonPayload') || 'Payload / Diagnóstico JSON'}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(JSON.stringify(effectivePayload, null, 2), 'json-payload')}
                  className="text-blue-500 hover:text-blue-400 flex items-center gap-1 font-mono text-[10px]"
                >
                  {copiedKey === 'json-payload' ? (
                    <>
                      <CheckIcon className="w-3 h-3 text-emerald-500" />
                      <span>{t('technicalDetails.copied') || 'Copiado'}</span>
                    </>
                  ) : (
                    <>
                      <ClipboardDocumentIcon className="w-3 h-3" />
                      <span>{t('technicalDetails.copyJson') || 'Copiar JSON'}</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 bg-zinc-900 text-zinc-200 rounded text-[10px] font-mono overflow-x-auto max-h-56 custom-scrollbar">
                {JSON.stringify(effectivePayload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
