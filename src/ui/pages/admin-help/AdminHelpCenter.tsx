import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  HelpArticle,
  HelpCategoryId,
  HelpArticleType,
} from '../../data/helpRegistry';
import { useLocale } from '../../i18n';
import { postHelpAnalytics } from '../../lib/adminApi';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  ArrowRightIcon,
  BookOpenIcon,
  WrenchScrewdriverIcon,
  CodeBracketSquareIcon,
  ChartBarSquareIcon,
  CpuChipIcon,
  SparklesIcon,
  BanknotesIcon,
  DocumentCheckIcon,
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

const getCategoryIcon = (category: HelpCategoryId) => {
  switch (category) {
    case 'preflight':
      return <DocumentCheckIcon className="w-4 h-4" />;
    case 'pricing':
      return <SparklesIcon className="w-4 h-4" />;
    case 'machinery':
      return <CpuChipIcon className="w-4 h-4" />;
    case 'integrations':
      return <CodeBracketSquareIcon className="w-4 h-4" />;
    case 'fintech':
      return <BanknotesIcon className="w-4 h-4" />;
    case 'runbooks':
      return <WrenchScrewdriverIcon className="w-4 h-4" />;
  }
};

export const AdminHelpCenter: React.FC = () => {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const initialCat = (searchParams.get('cat') as HelpCategoryId | null) || null;

  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<HelpCategoryId | null>(
    initialCat && HELP_CATEGORIES.some((c) => c.id === initialCat) ? initialCat : null
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced analytics for search
  useEffect(() => {
    if (!query || query.trim().length < 2) return;
    const timer = setTimeout(() => {
      postHelpAnalytics({ eventType: 'search', query: query.trim() });
    }, 800);
    return () => clearTimeout(timer);
  }, [query]);

  const filteredArticles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HELP_ARTICLES.filter((article) => {
      if (selectedCategory && article.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;

      const translatedTitle = t(article.titleKey).toLowerCase();
      const translatedSummary = t(article.summaryKey).toLowerCase();
      const categoryLabel = t(`helpConsole.categories.${article.category}`).toLowerCase();
      const tagMatch = article.tags.some((tag) => tag.toLowerCase().includes(q));
      const formulaMatch = article.formulaSpec ? article.formulaSpec.toLowerCase().includes(q) : false;

      return (
        translatedTitle.includes(q) ||
        translatedSummary.includes(q) ||
        categoryLabel.includes(q) ||
        article.id.toLowerCase().includes(q) ||
        article.type.toLowerCase().includes(q) ||
        tagMatch ||
        formulaMatch
      );
    });
  }, [query, selectedCategory, t]);

  const handleOpenArticle = (id: string) => {
    postHelpAnalytics({
      eventType: 'view',
      docId: id,
      query: query.trim() ? query.trim() : undefined,
    });
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('doc', id);
    setSearchParams(nextParams);
  };

  const handleSelectCategory = (catId: HelpCategoryId | null) => {
    setSelectedCategory(catId);
    const nextParams = new URLSearchParams(searchParams);
    if (catId) {
      nextParams.set('cat', catId);
    } else {
      nextParams.delete('cat');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    setQuery(tag);
    searchInputRef.current?.focus();
  };

  return (
    <div
      data-testid="admin-help-console"
      className="min-h-screen bg-[#f8fafc] dark:bg-[#09090b] text-slate-900 dark:text-[#f4f4f5] pb-20 transition-colors"
    >
      {/* Tactical HUD Top Header */}
      <div className="bg-white dark:bg-[#0e0e11] border-b border-slate-200 dark:border-[#27272a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] hover:text-[#dc0000] dark:hover:text-[#ef4444] transition-colors cursor-pointer"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              {t('helpConsole.backToCockpit')}
            </button>

            <div className="flex items-center gap-2">
              <a
                href="https://docs.printprice.pro/docs/api/overview"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-[#141418] text-slate-700 dark:text-[#e4e4e7] border border-slate-300 dark:border-[#27272a] hover:border-[#dc0000] dark:hover:border-[#dc0000] hover:text-[#dc0000] dark:hover:text-[#ef4444] transition-colors"
              >
                <span>OpenAPI 3.1 Portal</span>
                <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => navigate('/developers')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#dc0000] hover:bg-[#b90000] text-white border border-[#dc0000] transition-colors cursor-pointer"
              >
                <span>{t('nav.developers')}</span>
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <h1
            data-testid="help-console-title"
            className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#f4f4f5] tracking-tight"
          >
            {t('helpConsole.title')}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-[#a1a1aa] max-w-4xl leading-relaxed">
            {t('helpConsole.subtitle')}
          </p>

          {/* Instant Search Bar with '/' Shortcut */}
          <div className="mt-6 max-w-3xl relative">
            <div className="relative flex items-center">
              <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 dark:text-[#71717a] absolute left-4 pointer-events-none" />
              <input
                ref={searchInputRef}
                data-testid="help-console-search-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('helpConsole.searchPlaceholder')}
                className="w-full pl-12 pr-14 py-3.5 bg-slate-50 dark:bg-[#131316] border border-slate-300 dark:border-[#27272a] text-slate-900 dark:text-[#f4f4f5] placeholder-slate-400 dark:placeholder-[#71717a] text-sm font-medium focus:outline-none focus:border-[#dc0000] dark:focus:border-[#ef4444] focus:ring-1 focus:ring-[#dc0000] transition-all"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-3.5 p-1 text-slate-400 hover:text-slate-700 dark:text-[#a1a1aa] dark:hover:text-white cursor-pointer"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex items-center justify-center px-2 py-0.5 text-[11px] font-mono font-bold text-slate-500 dark:text-[#a1a1aa] bg-slate-200/70 dark:bg-[#1f1f24] border border-slate-300 dark:border-[#27272a] absolute right-3.5 pointer-events-none">
                  /
                </kbd>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area: Sidebar + Cards Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Domain Taxonomy Sidebar */}
          <aside className="w-full lg:w-72 flex-shrink-0">
            <div className="sticky top-6 bg-white dark:bg-[#0e0e11] border border-slate-200 dark:border-[#27272a] p-3">
              <nav aria-label="Operational Knowledge Domains" className="space-y-1">
                <button
                  type="button"
                  data-testid="help-cat-all"
                  onClick={() => handleSelectCategory(null)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                    selectedCategory === null
                      ? 'bg-[#dc0000]/10 dark:bg-[#dc0000]/15 text-[#dc0000] dark:text-[#ef4444] border-[#dc0000]/40'
                      : 'bg-transparent text-slate-600 dark:text-[#a1a1aa] border-transparent hover:bg-slate-100 dark:hover:bg-[#16161a] hover:text-slate-900 dark:hover:text-[#f4f4f5]'
                  }`}
                >
                  <span className="truncate">{t('helpConsole.allCategories')}</span>
                  <span
                    className={`ml-2 px-2 py-0.5 text-[11px] font-mono ${
                      selectedCategory === null
                        ? 'bg-[#dc0000] text-white'
                        : 'bg-slate-100 dark:bg-[#18181c] text-slate-600 dark:text-[#a1a1aa]'
                    }`}
                  >
                    {HELP_ARTICLES.length}
                  </span>
                </button>

                {HELP_CATEGORIES.map((cat) => {
                  const isActive = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      data-testid={`help-cat-${cat.id}`}
                      onClick={() => handleSelectCategory(cat.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold tracking-wide transition-colors cursor-pointer border ${
                        isActive
                          ? 'bg-[#dc0000]/10 dark:bg-[#dc0000]/15 text-[#dc0000] dark:text-[#ef4444] border-[#dc0000]/40'
                          : 'bg-transparent text-slate-600 dark:text-[#a1a1aa] border-transparent hover:bg-slate-100 dark:hover:bg-[#16161a] hover:text-slate-900 dark:hover:text-[#f4f4f5]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 text-left truncate">
                        <span className={isActive ? 'text-[#dc0000] dark:text-[#ef4444]' : 'text-slate-400 dark:text-[#71717a]'}>
                          {getCategoryIcon(cat.id)}
                        </span>
                        <span className="truncate">{t(cat.labelKey)}</span>
                      </span>
                      <span
                        className={`ml-2 px-2 py-0.5 text-[11px] font-mono ${
                          isActive
                            ? 'bg-[#dc0000] text-white'
                            : 'bg-slate-100 dark:bg-[#18181c] text-slate-600 dark:text-[#a1a1aa]'
                        }`}
                      >
                        {cat.count}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Right Cards Grid */}
          <div className="flex-1 min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-[#27272a]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[#dc0000]" />
                <span
                  data-testid="help-articles-count"
                  className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600 dark:text-[#a1a1aa]"
                >
                  {t('helpConsole.articlesFound', { count: filteredArticles.length })}
                </span>
              </div>
              {(query || selectedCategory) && (
                <button
                  type="button"
                  data-testid="help-reset-filters"
                  onClick={() => {
                    setQuery('');
                    handleSelectCategory(null);
                  }}
                  className="text-xs font-bold text-[#dc0000] dark:text-[#ef4444] hover:underline cursor-pointer"
                >
                  {t('helpConsole.resetFilters')}
                </button>
              )}
            </div>

            {filteredArticles.length === 0 ? (
              <div className="bg-white dark:bg-[#0e0e11] border border-slate-200 dark:border-[#27272a] p-12 text-center">
                <MagnifyingGlassIcon className="w-10 h-10 text-slate-400 dark:text-[#71717a] mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-900 dark:text-[#f4f4f5]">
                  {t('helpConsole.noResultsTitle')}
                </h3>
                <p className="text-sm text-slate-500 dark:text-[#a1a1aa] mt-1 max-w-md mx-auto">
                  {t('helpConsole.noResultsHint')}
                </p>
              </div>
            ) : (
              <div
                data-testid="help-articles-grid"
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {filteredArticles.map((article: HelpArticle) => (
                  <article
                    key={article.id}
                    data-testid={`help-card-${article.id}`}
                    onClick={() => handleOpenArticle(article.id)}
                    className="bg-white dark:bg-[#0e0e11] border border-slate-200 dark:border-[#27272a] hover:border-[#dc0000] dark:hover:border-[#ef4444] p-5 flex flex-col justify-between transition-colors cursor-pointer group"
                  >
                    <div>
                      {/* Card Top Meta Row: Type Badge + Category Pill */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider border ${getTypeBadgeStyle(
                            article.type
                          )}`}
                        >
                          {getTypeIcon(article.type)}
                          {t(`helpConsole.types.${article.type}`)}
                        </span>
                        <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-[#a1a1aa] truncate">
                          {t(`helpConsole.categories.${article.category}`)}
                        </span>
                      </div>

                      {/* Headline */}
                      <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f4f5] group-hover:text-[#dc0000] dark:group-hover:text-[#ef4444] transition-colors leading-snug mb-2">
                        {t(article.titleKey)}
                      </h2>

                      {/* 2-Sentence Operational Summary */}
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-[#a1a1aa] leading-relaxed mb-4">
                        {t(article.summaryKey)}
                      </p>

                      {/* Canonical Formula / Spec Strip */}
                      {article.formulaSpec && (
                        <div className="mb-4 px-3 py-2 bg-slate-100 dark:bg-[#141418] border border-slate-200 dark:border-[#27272a] font-mono text-[11px] text-slate-700 dark:text-[#e4e4e7] overflow-x-auto">
                          {article.formulaSpec}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-[#1f1f24] space-y-3">
                      {/* Interactive Tag Pills */}
                      <div className="flex flex-wrap gap-1.5">
                        {article.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={(e) => handleTagClick(e, tag)}
                            className="text-[11px] font-mono px-2 py-0.5 bg-slate-100 dark:bg-[#16161b] text-slate-600 dark:text-[#a1a1aa] border border-slate-200 dark:border-[#27272a] hover:border-[#dc0000] dark:hover:border-[#ef4444] hover:text-[#dc0000] dark:hover:text-[#ef4444] transition-colors cursor-pointer"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>

                      {/* Contextual Deep Action Buttons */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        {article.jumpToRoute ? (
                          <button
                            type="button"
                            data-testid={`help-jump-${article.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(article.jumpToRoute!);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-[#dc0000]/10 dark:bg-[#dc0000]/15 text-[#dc0000] dark:text-[#ef4444] border border-[#dc0000]/30 hover:bg-[#dc0000] hover:text-white dark:hover:bg-[#dc0000] dark:hover:text-white transition-colors cursor-pointer"
                          >
                            <span>{t('helpConsole.openSectionBtn')}</span>
                          </button>
                        ) : (
                          <span />
                        )}

                        {article.docsUrl && (
                          <a
                            href={article.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`help-docs-${article.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-slate-100 dark:bg-[#16161b] text-slate-700 dark:text-[#e4e4e7] border border-slate-300 dark:border-[#27272a] hover:border-[#dc0000] dark:hover:border-[#ef4444] hover:text-[#dc0000] dark:hover:text-[#ef4444] transition-colors"
                          >
                            <span>{t('helpConsole.docsReferenceBtn')}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
