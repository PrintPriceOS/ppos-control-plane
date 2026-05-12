import React, { useState, useMemo } from 'react';
import { ChevronUpIcon, ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { toDisplayText, safeArray } from '../lib/display';
import { TABLES } from '../design-system/tokens';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  sortKey?: keyof T; // Optional key to sort by if accessor is a function
  className?: string;
  align?: 'left' | 'right' | 'center';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  isLoading?: boolean;
  compact?: boolean;
  rowClassName?: (item: T) => string;
  // Canonical extensions
  title?: string;
  searchPlaceholder?: string;
  enableSearch?: boolean;
  enablePagination?: boolean;
  pageSize?: number;
  toolbarActions?: React.ReactNode;
  filtersRow?: React.ReactNode;
}

export function DataTable<T>({ 
  columns, 
  data, 
  onRowClick, 
  isLoading, 
  compact, 
  rowClassName,
  title,
  searchPlaceholder = "Search records...",
  enableSearch,
  enablePagination,
  pageSize = 10,
  toolbarActions,
  filtersRow
}: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = useState<{ key: keyof T | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Filter data if search is enabled
  const filteredData = useMemo(() => {
    const list = safeArray(data);
    if (!enableSearch || !searchQuery.trim()) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(item => {
      return columns.some(col => {
        if (typeof col.accessor !== 'function') {
          const val = item[col.accessor];
          return val !== null && val !== undefined && String(val).toLowerCase().includes(query);
        }
        return false;
      });
    });
  }, [data, columns, enableSearch, searchQuery]);

  // Sort data
  const sortedData = useMemo(() => {
    let sortableItems = [...filteredData];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  // Paginate data
  const paginatedData = useMemo(() => {
    if (!enablePagination) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, enablePagination, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const requestSort = (column: Column<T>) => {
    let key: keyof T | null = null;
    if (column.sortKey) {
      key = column.sortKey;
    } else if (typeof column.accessor !== 'function') {
      key = column.accessor;
    }

    if (!key) return; // Cannot sort by function accessor without explicit sortKey

    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
        <div className="w-10 h-10 border-4 border-zinc-200 dark:border-zinc-800 border-t-[#dc0000] rounded-none animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex flex-col rounded-none">
      {/* Canonical TableToolbar */}
      {(title || enableSearch || toolbarActions) && (
        <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {title && (
            <span className="font-manrope text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              {title}
            </span>
          )}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-1">
            {enableSearch && (
              <div className="relative w-full sm:w-64">
                <MagnifyingGlassIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-manrope text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#dc0000] rounded-none"
                />
              </div>
            )}
            {toolbarActions}
          </div>
        </div>
      )}

      {/* Canonical FiltersRow */}
      {filtersRow && (
        <div className="px-4 py-2 bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 overflow-x-auto">
          {filtersRow}
        </div>
      )}

      {/* Main Table */}
      <div className="w-full overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 border-collapse">
          <thead>
            <tr className={TABLES.header.className}>
              {columns.map((col, i) => {
                const sortable = !!col.sortKey || typeof col.accessor !== 'function';
                const activeSort = (col.sortKey || (typeof col.accessor !== 'function' ? col.accessor : null)) === sortConfig.key;
                const alignClass = col.align === 'right' ? 'text-right justify-end' : col.align === 'center' ? 'text-center justify-center' : 'text-left justify-start';

                return (
                  <th 
                    key={i} 
                    onClick={() => sortable && requestSort(col)}
                    className={`font-manrope text-[13px] font-semibold tracking-[0.4px] uppercase text-zinc-600 dark:text-zinc-400 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'} border-b border-zinc-200 dark:border-zinc-800 ${col.className || ''} ${sortable ? 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group' : ''}`}
                    style={{ letterSpacing: '0.4px' }}
                  >
                    <div className={`flex items-center gap-1.5 ${alignClass}`}>
                      <span>{col.header}</span>
                      {sortable && (
                        <div className={`flex flex-col opacity-0 group-hover:opacity-100 transition-opacity ${activeSort ? 'opacity-100' : ''}`}>
                           <ChevronUpIcon className={`w-2 h-2 ${activeSort && sortConfig.direction === 'asc' ? 'text-[#dc0000]' : 'text-zinc-400'}`} />
                           <ChevronDownIcon className={`w-2 h-2 ${activeSort && sortConfig.direction === 'desc' ? 'text-[#dc0000]' : 'text-zinc-400'}`} />
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-transparent">
            {paginatedData.map((item, i) => (
              <tr
                key={i}
                onClick={() => onRowClick?.(item)}
                className={`min-h-[48px] bg-white dark:bg-zinc-950 even:bg-zinc-50 dark:even:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors border-b border-zinc-200 dark:border-zinc-800 ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName ? rowClassName(item) : ''}`}
              >
                {columns.map((col, j) => {
                  const alignClass = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                  return (
                    <td key={j} className={`font-manrope text-[13px] font-normal leading-[18px] text-zinc-900 dark:text-zinc-100 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'} border-b border-zinc-200 dark:border-zinc-800 ${alignClass} ${col.className || ''}`}>
                      {(() => {
                        if (typeof col.accessor === 'function') {
                          const res = col.accessor(item);
                          if (res !== null && typeof res === 'object' && !React.isValidElement(res)) {
                            return <span className="font-mono text-[11px] text-zinc-400">{toDisplayText(res, '[OBJECT]')}</span>;
                          }
                          return res;
                        }
                        const val = item[col.accessor] as any;
                        if (val === null || val === undefined) return '';
                        if (React.isValidElement(val)) return val;
                        if (typeof val === 'object') {
                          return <span className="font-mono text-[11px] text-zinc-400">{toDisplayText(val, '[OBJECT]')}</span>;
                        }
                        return String(val);
                      })()}
                    </td>
                  );
                })}
              </tr>
            ))}
            {paginatedData.length === 0 && (
              <tr className="bg-white dark:bg-zinc-950">
                <td colSpan={columns.length} className="px-4 py-16 text-center text-zinc-400 font-manrope text-[13px] border-b border-zinc-200 dark:border-zinc-800">
                  No data available in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Canonical Pagination */}
      {enablePagination && totalPages > 1 && (
        <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <span className="font-manrope text-xs text-zinc-500 dark:text-zinc-400">
            Showing page <strong className="text-zinc-900 dark:text-zinc-100">{currentPage}</strong> of <strong className="text-zinc-900 dark:text-zinc-100">{totalPages}</strong>
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              className="px-2.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-manrope font-bold text-zinc-900 dark:text-zinc-100 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              PREV
            </button>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              className="px-2.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-manrope font-bold text-zinc-900 dark:text-zinc-100 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              NEXT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
