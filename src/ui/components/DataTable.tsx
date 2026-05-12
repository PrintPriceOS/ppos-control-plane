import React, { useState, useMemo } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
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
      <div className="flex items-center justify-center py-20 bg-[#0B0F14] border border-[#1F2430]">
        <div className="w-10 h-10 border-4 border-[#1F2430] border-t-[#dc0000] rounded-none animate-spin" />
      </div>
    );
  }

  return (
    <div className={TABLES.wrapperClassName}>
      <table className="min-w-full divide-y divide-[#1F2430] border-collapse">
        <thead>
          <tr className="bg-[#0B0F14] border-b border-[#1F2430]">
            {columns.map((col, i) => {
              const sortable = !!col.sortKey || typeof col.accessor !== 'function';
              const activeSort = (col.sortKey || (typeof col.accessor !== 'function' ? col.accessor : null)) === sortConfig.key;
              const alignClass = col.align === 'right' ? 'text-right justify-end' : col.align === 'center' ? 'text-center justify-center' : 'text-left justify-start';

              return (
                <th 
                  key={i} 
                  onClick={() => sortable && requestSort(col)}
                  className={`font-manrope text-[13px] font-semibold tracking-[0.4px] uppercase text-[#8F96A3] ${compact ? 'px-3 py-2.5' : 'px-4 py-3'} border-b border-[#1F2430] ${col.className || ''} ${sortable ? 'cursor-pointer hover:bg-[#11161D] transition-colors group' : ''}`}
                  style={{ letterSpacing: '0.4px' }}
                >
                  <div className={`flex items-center gap-1.5 ${alignClass}`}>
                    <span>{col.header}</span>
                    {sortable && (
                      <div className={`flex flex-col opacity-0 group-hover:opacity-100 transition-opacity ${activeSort ? 'opacity-100' : ''}`}>
                         <ChevronUpIcon className={`w-2 h-2 ${activeSort && sortConfig.direction === 'asc' ? 'text-[#dc0000]' : 'text-[#8F96A3]'}`} />
                         <ChevronDownIcon className={`w-2 h-2 ${activeSort && sortConfig.direction === 'desc' ? 'text-[#dc0000]' : 'text-[#8F96A3]'}`} />
                      </div>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1F2430] bg-transparent">
          {sortedData.map((item, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(item)}
              className={`min-h-[48px] odd:bg-[#0F1319] even:bg-[#0B0F14] hover:bg-[#11161D] transition-colors border-b border-[#1F2430] ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName ? rowClassName(item) : ''}`}
            >
              {columns.map((col, j) => {
                const alignClass = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                return (
                  <td key={j} className={`font-manrope text-[13px] font-normal leading-[18px] text-[#E6E6EB] ${compact ? 'px-3 py-2.5' : 'px-4 py-3'} border-b border-[#1F2430] ${alignClass} ${col.className || ''}`}>
                    {(() => {
                      if (typeof col.accessor === 'function') {
                        const res = col.accessor(item);
                        if (res !== null && typeof res === 'object' && !React.isValidElement(res)) {
                          return <span className="font-mono text-[11px] text-[#8F96A3]">{toDisplayText(res, '[OBJECT]')}</span>;
                        }
                        return res;
                      }
                      const val = item[col.accessor] as any;
                      if (val === null || val === undefined) return '';
                      if (React.isValidElement(val)) return val;
                      if (typeof val === 'object') {
                        return <span className="font-mono text-[11px] text-[#8F96A3]">{toDisplayText(val, '[OBJECT]')}</span>;
                      }
                      return String(val);
                    })()}
                  </td>
                );
              })}
            </tr>
          ))}
          {sortedData.length === 0 && (
            <tr className="bg-[#0B0F14]">
              <td colSpan={columns.length} className="px-4 py-16 text-center text-[#8F96A3] font-manrope text-[13px] border-b border-[#1F2430]">
                No data available in this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
