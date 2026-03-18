import React, { useState, useMemo } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';

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
}

export function DataTable<T>({ columns, data, onRowClick, isLoading }: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = useState<{ key: keyof T | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });

  const sortedData = useMemo(() => {
    let sortableItems = [...data];
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
        <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden rounded-2xl border border-white">
      <table className="min-w-full divide-y divide-slate-100 italic-text-off">
        <thead className="bg-slate-50/50 uppercase tracking-widest text-[10px] font-black text-slate-400">
          <tr>
            {columns.map((col, i) => {
              const sortable = !!col.sortKey || typeof col.accessor !== 'function';
              const activeSort = (col.sortKey || (typeof col.accessor !== 'function' ? col.accessor : null)) === sortConfig.key;

              return (
                <th 
                  key={i} 
                  onClick={() => sortable && requestSort(col)}
                  className={`px-6 py-4 text-left ${col.className || ''} ${sortable ? 'cursor-pointer hover:bg-slate-100/50 transition-colors group' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    {col.header}
                    {sortable && (
                      <div className={`flex flex-col opacity-0 group-hover:opacity-100 transition-opacity ${activeSort ? 'opacity-100' : ''}`}>
                         <ChevronUpIcon className={`w-2 h-2 ${activeSort && sortConfig.direction === 'asc' ? 'text-primary' : 'text-slate-300'}`} />
                         <ChevronDownIcon className={`w-2 h-2 ${activeSort && sortConfig.direction === 'desc' ? 'text-primary' : 'text-slate-300'}`} />
                      </div>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white/50">
          {sortedData.map((item, i) => (
            <tr 
              key={i} 
              onClick={() => onRowClick?.(item)}
              className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-slate-50/80' : ''}`}
            >
              {columns.map((col, j) => (
                <td key={j} className={`px-6 py-4 text-sm font-medium text-slate-900 ${col.className || ''}`}>
                  {typeof col.accessor === 'function' ? col.accessor(item) : (item[col.accessor] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
          {sortedData.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-6 py-20 text-center text-slate-400 font-bold">
                No data available in this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
