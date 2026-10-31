import React, { useState } from 'react';
import { ProductionActivationGateFinding } from '../../types/financialOperationsProductionActivationReview';
import { ExclamationTriangleIcon, ChatBubbleBottomCenterTextIcon, CheckIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface FindingsPanelProps {
  findings: ProductionActivationGateFinding[];
  blockers: string[];
  warnings: string[];
  loading: boolean;
  onResolveFinding: (findingCode: string) => Promise<void>;
  onDismissWarning: (warningText: string) => Promise<void>;
  onAddNote: (noteType: string, noteText: string) => Promise<void>;
}

export const FinancialOperationsProductionActivationReviewFindingsPanel: React.FC<FindingsPanelProps> = ({
  findings,
  blockers,
  warnings,
  loading,
  onResolveFinding,
  onDismissWarning,
  onAddNote
}) => {
  const [resolvingCode, setResolvingCode] = useState<string | null>(null);
  const [dismissingText, setDismissingText] = useState<string | null>(null);
  const [noteType, setNoteType] = useState('SECURITY');
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const handleResolve = async (code: string) => {
    setResolvingCode(code);
    try {
      await onResolveFinding(code);
    } finally {
      setResolvingCode(null);
    }
  };

  const handleDismiss = async (text: string) => {
    setDismissingText(text);
    try {
      await onDismissWarning(text);
    } finally {
      setDismissingText(null);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await onAddNote(noteType, noteText);
      setNoteText('');
    } finally {
      setAddingNote(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Blockers and Warnings list */}
      <div className="lg:col-span-2 space-y-6">
        {/* Blockers */}
        <div className="bg-[#141416] border border-rose-500/20 p-5 space-y-4">
          <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest border-b border-rose-500/10 pb-2 flex items-center gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-rose-500 animate-pulse" />
            Hard Gate Blockers ({blockers.length})
          </h3>
          <div className="space-y-2 font-mono text-xs">
            {blockers.length === 0 ? (
              <p className="text-slate-500 italic">No configuration blockers detected. System ready.</p>
            ) : (
              blockers.map((b) => (
                <div key={b} className="p-3 bg-rose-500/5 border border-rose-500/10 flex justify-between items-center text-rose-400">
                  <span>{b}</span>
                  <button
                    onClick={() => handleResolve(b)}
                    disabled={resolvingCode === b}
                    className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-white font-bold uppercase text-[9px] flex items-center gap-1 transition-all"
                  >
                    {resolvingCode === b ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <CheckIcon className="w-3 h-3" />}
                    Resolve
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Warnings */}
        <div className="bg-[#141416] border border-amber-500/20 p-5 space-y-4">
          <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest border-b border-amber-500/10 pb-2 flex items-center gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
            Operational Warnings ({warnings.length})
          </h3>
          <div className="space-y-2 font-mono text-xs">
            {warnings.length === 0 ? (
              <p className="text-slate-500 italic">No active warnings.</p>
            ) : (
              warnings.map((w) => (
                <div key={w} className="p-3 bg-amber-500/5 border border-amber-500/10 flex justify-between items-center text-amber-400">
                  <span>{w}</span>
                  <button
                    onClick={() => handleDismiss(w)}
                    disabled={dismissingText === w}
                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-white font-bold uppercase text-[9px] flex items-center gap-1 transition-all"
                  >
                    {dismissingText === w ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <CheckIcon className="w-3 h-3" />}
                    Dismiss
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Review Notes Form */}
      <div className="lg:col-span-1">
        <div className="bg-[#141416] border border-white/10 p-5 space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
            <ChatBubbleBottomCenterTextIcon className="w-4 h-4 text-indigo-400" />
            Add Audit / Review Note
          </h3>
          
          <form onSubmit={handleAddNote} className="space-y-4 font-mono text-xs">
            <div>
              <label className="text-[9px] text-slate-500 block mb-1">NOTE CATEGORY</label>
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
                className="w-full bg-[#1e1e24] border border-white/10 p-2 text-slate-200 outline-none focus:border-indigo-500 transition-all font-bold"
              >
                <option value="SECURITY">SECURITY</option>
                <option value="COMPLIANCE">COMPLIANCE</option>
                <option value="OPERATIONS">OPERATIONS</option>
                <option value="GENERAL">GENERAL</option>
              </select>
            </div>

            <div>
              <label className="text-[9px] text-slate-500 block mb-1">AUDIT EVIDENCE / REMARKS</label>
              <textarea
                rows={4}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Describe validation note..."
                className="w-full bg-[#1e1e24] border border-white/10 p-2 text-slate-200 outline-none focus:border-indigo-500 transition-all resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={addingNote || !noteText.trim()}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800/20 disabled:text-slate-600 font-bold uppercase transition-all flex items-center justify-center gap-1.5"
            >
              {addingNote && <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />}
              Save Audit Note
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default FinancialOperationsProductionActivationReviewFindingsPanel;
