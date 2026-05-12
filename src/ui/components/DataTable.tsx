import React, { useState, useMemo } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';

import { toDisplayText, safeArray } from '../lib/display';

interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  sortKey?: keyof T; // Optional key to sort by if accessor is a function
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  isLoading?: boolean;
  compact?: boolean;
  rowClassName?: (item: T) => string;
}

export function DataTable<T>({ columns, data, onRowClick, isLoading, compact, rowClassName }: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = useState<{ key: keyof T | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });

  const sortedData = useMemo(() => {
    let sortableItems = [...safeArray(data)];
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
  }, [data, sortConfig]);

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
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-slate-200 dark:border-white/10 border-t-primary rounded-none animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white/50 dark:bg-[#131314] overflow-hidden rounded-none border border-slate-100 dark:border-white/[0.07]">
      <table className="min-w-full divide-y divide-slate-100 dark:divide-white/[0.05] italic-text-off">
        <thead className="bg-slate-50/50 dark:bg-[#131314]/[0.03] uppercase tracking-widest text-[9px] font-black text-slate-400 dark:text-zinc-500">
          <tr>
            {columns.map((col, i) => {
              const sortable = !!col.sortKey || typeof col.accessor !== 'function';
              const activeSort = (col.sortKey || (typeof col.accessor !== 'function' ? col.accessor : null)) === sortConfig.key;

              return (
                <th 
                  key={i} 
                  onClick={() => sortable && requestSort(col)}
                  className={`${compact ? 'px-3 py-2' : 'px-6 py-4'} text-left ${col.className || ''} ${sortable ? 'cursor-pointer hover:bg-slate-100/50 dark:hover:bg-[#1a1a1b]/[0.04] transition-colors group' : ''}`}
                >
                  <div className="flex items-center gap-1.5">
                    {col.header}
                    {sortable && (
                      <div className={`flex flex-col opacity-0 group-hover:opacity-100 transition-opacity ${activeSort ? 'opacity-100' : ''}`}>
                         <ChevronUpIcon className={`w-2 h-2 ${activeSort && sortConfig.direction === 'asc' ? 'text-primary' : 'text-slate-300 dark:text-slate-600'}`} />
                         <ChevronDownIcon className={`w-2 h-2 ${activeSort && sortConfig.direction === 'desc' ? 'text-primary' : 'text-slate-300 dark:text-slate-600'}`} />
                      </div>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05] bg-white/50 dark:bg-transparent">
          {sortedData.map((item, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(item)}
              className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-slate-50/80 dark:hover:bg-[#1a1a1b]/[0.04]' : ''} ${rowClassName ? rowClassName(item) : ''}`}
            >
              {columns.map((col, j) => (
                <td key={j} className={`${compact ? 'px-3 py-2 text-xs' : 'px-6 py-4 text-sm'} font-medium text-slate-900 dark:text-[#ECECF1] ${col.className || ''}`}>
                  {(() => {
                    if (typeof col.accessor === 'function') {
                      const res = col.accessor(item);
                      if (res !== null && typeof res === 'object' && !React.isValidElement(res)) {
                        return <span className="font-mono text-[10px] text-zinc-500">{toDisplayText(res, '[OBJECT]')}</span>;
                      }
                      return res;
                    }
                    const val = item[col.accessor] as any;
                    if (val === null || val === undefined) return '';
                    if (React.isValidElement(val)) return val;
                    if (typeof val === 'object') {
                      return <span className="font-mono text-[10px] text-zinc-500">{toDisplayText(val, '[OBJECT]')}</span>;
                    }
                    return String(val);
                  })()}
                </td>
              ))}
            </tr>
          ))}
          {sortedData.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-6 py-20 text-center text-slate-400 dark:text-zinc-600 font-bold">
                No data available in this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
