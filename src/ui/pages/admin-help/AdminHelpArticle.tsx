import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  HELP_ARTICLES,
  getHelpArticleById,
  HelpArticle,
  HelpArticleType,
} from '../../data/helpRegistry';
import { getHelpDocById } from '../../lib/helpSearch';
import { useLocale } from '../../i18n';
import { postHelpAnalytics } from '../../lib/adminApi';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowTopRightOnSquareIcon,
  BookOpenIcon,
  WrenchScrewdriverIcon,
  CodeBracketSquareIcon,
  ChartBarSquareIcon,
} from '@heroicons/react/24/outline';

const getTypeBadgeStyle = (type: HelpArticleType): string => {
  switch (type) {
    case 'GUIDE':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
    case 'RUNBOOK':
      return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40';
    case 'API_SPEC':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    case 'METRIC':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
  }
};

const getTypeIcon = (type: HelpArticleType) => {
  switch (type) {
    case 'GUIDE':
      return <BookOpenIcon className="w-3.5 h-3.5" />;
    case 'RUNBOOK':
      return <WrenchScrewdriverIcon className="w-3.5 h-3.5" />;
    case 'API_SPEC':
      return <CodeBracketSquareIcon className="w-3.5 h-3.5" />;
    case 'METRIC':
      return <ChartBarSquareIcon className="w-3.5 h-3.5" />;
  }
};

interface Props {
  docId: string;
}

export const AdminHelpArticle: React.FC<Props> = ({ docId }) => {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const article = getHelpArticleById(docId);
  const legacyDoc = !article ? getHelpDocById(docId) : undefined;

  useEffect(() => {
    try {
      window.scrollTo?.(0, 0);
    } catch {
      // Ignore in non-browser/jsdom test environments
    }
    if (article) {
      postHelpAnalytics({ eventType: 'view', docId: article.id });
    } else if (legacyDoc) {
      postHelpAnalytics({ eventType: 'view', docId: legacyDoc.id });
    } else {
      postHelpAnalytics({ eventType: 'fallback_error', docId, errorCode: docId });
    }
  }, [docId, article, legacyDoc]);

  const handleBackToIndex = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('doc');
    setSearchParams(nextParams);
  };

  if (article) {
    const relatedArticles = HELP_ARTICLES.filter(
      (a) => a.category === article.category && a.id !== article.id
    ).slice(0, 4);

    return (
      <div
        data-testid={`help-article-view-${article.id}`}
        className="min-h-screen bg-[#f8fafc] dark:bg-[#09090b] text-slate-900 dark:text-[#f4f4f5] pb-20 transition-colors"
      >
        {/* Top Bar */}
        <div className="bg-white dark:bg-[#0e0e11] border-b border-slate-200 dark:border-[#27272a]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              data-testid="help-article-back-btn"
              onClick={handleBackToIndex}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-[#a1a1aa] hover:text-[#dc0000] dark:hover:text-[#ef4444] transition-colors cursor-pointer"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              {t('helpConsole.backToIndex')}
            </button>

            <div className="flex items-center gap-2">
              {article.jumpToRoute && (
                <button
                  type="button"
                  onClick={() => navigate(article.jumpToRoute!)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#dc0000] hover:bg-[#b90000] text-white border border-[#dc0000] transition-colors cursor-pointer"
                >
                  <span>{t('helpConsole.openSectionBtn')}</span>
                </button>
              )}
              {article.docsUrl && (
                <a
                  href={article.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-[#16161b] text-slate-700 dark:text-[#e4e4e7] border border-slate-300 dark:border-[#27272a] hover:border-[#dc0000] dark:hover:border-[#ef4444] transition-colors"
                >
                  <span>{t('helpConsole.docsReferenceBtn')}</span>
                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Main Article Container */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
          <div className="bg-white dark:bg-[#0e0e11] border border-slate-200 dark:border-[#27272a] p-6 sm:p-10">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2.5 mb-4">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-mono font-bold uppercase tracking-wider border ${getTypeBadgeStyle(
                  article.type
                )}`}
              >
                {getTypeIcon(article.type)}
                {t(`helpConsole.types.${article.type}`)}
              </span>
              <span className="px-2.5 py-0.5 text-xs font-mono font-bold bg-slate-100 dark:bg-[#16161b] text-slate-600 dark:text-[#a1a1aa] border border-slate-200 dark:border-[#27272a]">
                {t(`helpConsole.categories.${article.category}`)}
              </span>
              <span className="px-2.5 py-0.5 text-xs font-mono text-slate-500 dark:text-[#71717a]">
                ID: {article.id}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#f4f4f5] tracking-tight mb-4">
              {t(article.titleKey)}
            </h1>

            {/* Summary */}
            <p className="text-base sm:text-lg text-slate-600 dark:text-[#a1a1aa] leading-relaxed mb-8 pb-6 border-b border-slate-200 dark:border-[#27272a]">
              {t(article.summaryKey)}
            </p>

            {/* Canonical Formula / Specification Box */}
            {article.formulaSpec && (
              <div className="mb-8">
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] mb-2">
                  {t('helpConsole.formulaLabel')}
                </div>
                <div className="p-4 bg-slate-100 dark:bg-[#141418] border border-slate-300 dark:border-[#27272a] font-mono text-xs sm:text-sm text-slate-900 dark:text-[#f4f4f5] overflow-x-auto">
                  {article.formulaSpec}
                </div>
              </div>
            )}

            {/* Operating Thresholds Telemetry Grid */}
            {(article.normalRange || article.warningThreshold || article.criticalThreshold) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {article.normalRange && (
                  <div className="p-4 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/30">
                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-mono font-bold text-xs uppercase tracking-wider mb-1.5">
                      <CheckCircleIcon className="w-4 h-4" />
                      {t('helpConsole.normalRangeLabel')}
                    </div>
                    <div className="text-sm font-mono font-semibold text-slate-900 dark:text-[#f4f4f5]">
                      {article.normalRange}
                    </div>
                  </div>
                )}
                {article.warningThreshold && (
                  <div className="p-4 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/30">
                    <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-mono font-bold text-xs uppercase tracking-wider mb-1.5">
                      <ExclamationTriangleIcon className="w-4 h-4" />
                      {t('helpConsole.warningThresholdLabel')}
                    </div>
                    <div className="text-sm font-mono font-semibold text-slate-900 dark:text-[#f4f4f5]">
                      {article.warningThreshold}
                    </div>
                  </div>
                )}
                {article.criticalThreshold && (
                  <div className="p-4 bg-red-500/5 dark:bg-red-500/10 border border-red-500/30">
                    <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400 font-mono font-bold text-xs uppercase tracking-wider mb-1.5">
                      <XCircleIcon className="w-4 h-4" />
                      {t('helpConsole.criticalThresholdLabel')}
                    </div>
                    <div className="text-sm font-mono font-semibold text-slate-900 dark:text-[#f4f4f5]">
                      {article.criticalThreshold}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tags */}
            <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-200 dark:border-[#27272a]">
              {article.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const nextParams = new URLSearchParams();
                    nextParams.set('q', tag);
                    setSearchParams(nextParams);
                  }}
                  className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-[#16161b] text-slate-600 dark:text-[#a1a1aa] border border-slate-200 dark:border-[#27272a] hover:border-[#dc0000] dark:hover:border-[#ef4444] hover:text-[#dc0000] dark:hover:text-[#ef4444] transition-colors cursor-pointer"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Related Modules in Domain */}
          {relatedArticles.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-600 dark:text-[#a1a1aa] mb-4">
                {t('helpConsole.relatedArticlesTitle')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {relatedArticles.map((rel: HelpArticle) => (
                  <div
                    key={rel.id}
                    onClick={() => {
                      const nextParams = new URLSearchParams(searchParams);
                      nextParams.set('doc', rel.id);
                      setSearchParams(nextParams);
                    }}
                    className="p-4 bg-white dark:bg-[#0e0e11] border border-slate-200 dark:border-[#27272a] hover:border-[#dc0000] dark:hover:border-[#ef4444] transition-colors cursor-pointer"
                  >
                    <div className="text-[11px] font-mono font-bold text-[#dc0000] dark:text-[#ef4444] uppercase mb-1">
                      {t(`helpConsole.types.${rel.type}`)}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-[#f4f4f5] mb-1">
                      {t(rel.titleKey)}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-[#a1a1aa] line-clamp-2">
                      {t(rel.summaryKey)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback for legacy error links (e.g. /admin/help?doc=error-*)
  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#09090b] text-slate-900 dark:text-[#f4f4f5] pb-20">
      <div className="bg-white dark:bg-[#0e0e11] border-b border-slate-200 dark:border-[#27272a]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            type="button"
            onClick={handleBackToIndex}
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-[#a1a1aa] hover:text-[#dc0000] dark:hover:text-[#ef4444] cursor-pointer"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            {t('helpConsole.backToIndex')}
          </button>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="bg-white dark:bg-[#0e0e11] border border-slate-200 dark:border-[#27272a] p-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-[#f4f4f5] mb-2">
            {legacyDoc ? legacyDoc.title : docId}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#a1a1aa] mb-6">
            {legacyDoc ? legacyDoc.summary : t('helpConsole.noResultsHint')}
          </p>
          {legacyDoc?.body && (
            <div className="text-sm text-slate-700 dark:text-[#e4e4e7] whitespace-pre-line font-mono bg-slate-100 dark:bg-[#141418] p-4 border border-slate-200 dark:border-[#27272a]">
              {legacyDoc.body.trim()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
