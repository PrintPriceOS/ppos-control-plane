/**
 * src/ui/components/common/IndustrialTable.tsx
 *
 * Canonical Dark Industrial Telemetry Table:
 * - Surface `#14161a` with border `1px solid #1f2228`
 * - No heavy vertical borders
 * - Attenuated uppercase headers (`text-xs text-slate-400`)
 * - Hoverable rows (`hover:bg-[#181b20]`)
 * - Centered empty state (`NO [ENTITIES] DEFINED`)
 * - Integrated industrial pagination
 */
import React, { useState, useMemo } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export interface IndustrialColumn<T> {
    key: string;
    header: string;
    align?: 'left' | 'center' | 'right';
    className?: string;
    render?: (row: T, index: number) => React.ReactNode;
}

export interface IndustrialTableProps<T> {
    title?: string;
    columns: IndustrialColumn<T>[];
    data: T[];
    loading?: boolean;
    onRefresh?: () => void;
    onRowClick?: (row: T) => void;
    emptyEntityName?: string;
    emptyMessage?: string;
    pageSize?: number;
    enablePagination?: boolean;
    headerRight?: React.ReactNode;
}

export function IndustrialTable<T extends Record<string, any>>({
    title,
    columns,
    data,
    loading = false,
    onRefresh,
    onRowClick,
    emptyEntityName = 'RECORDS',
    emptyMessage,
    pageSize = 10,
    enablePagination = true,
    headerRight
}: IndustrialTableProps<T>) {
    const [page, setPage] = useState(1);
    const safeData = Array.isArray(data) ? data : [];
    const totalPages = Math.max(1, Math.ceil(safeData.length / pageSize));

    const visibleRows = useMemo(() => {
        if (!enablePagination) return safeData;
        const start = (page - 1) * pageSize;
        return safeData.slice(start, start + pageSize);
    }, [safeData, enablePagination, page, pageSize]);

    const resolvedEmptyText = emptyMessage || `NO ${emptyEntityName.toUpperCase()} DEFINED`;

    return (
        <div
            data-testid="industrial-table"
            className="rounded-xl bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#1f2228] overflow-hidden transition-all shadow-2xs"
        >
            {(title || onRefresh || headerRight) && (
                <div className="px-6 py-4 border-b border-slate-200 dark:border-[#1f2228] flex items-center justify-between bg-slate-50/50 dark:bg-[#0f1013]/60">
                    {title ? (
                        <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white m-0">
                            {title}
                        </h3>
                    ) : (
                        <span />
                    )}
                    <div className="flex items-center gap-3">
                        {headerRight}
                        {onRefresh && (
                            <button
                                type="button"
                                onClick={onRefresh}
                                aria-label="Refresh table"
                                className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                            >
                                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-[#1f2228] bg-slate-50/40 dark:bg-[#0f1013]/40">
                            {columns.map(col => {
                                const alignCls =
                                    col.align === 'right'
                                        ? 'text-right'
                                        : col.align === 'center'
                                        ? 'text-center'
                                        : 'text-left';
                                return (
                                    <th key={col.key} className={`px-6 py-3.5 ${alignCls} ${col.className || ''}`}>
                                        {col.header}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#1f2228]">
                        {visibleRows.map((row, idx) => (
                            <tr
                                key={row.id || row._id || idx}
                                onClick={() => onRowClick?.(row)}
                                className={`transition-colors hover:bg-slate-50 dark:hover:bg-[#181b20] ${
                                    onRowClick ? 'cursor-pointer' : ''
                                }`}
                            >
                                {columns.map(col => {
                                    const alignCls =
                                        col.align === 'right'
                                            ? 'text-right'
                                            : col.align === 'center'
                                            ? 'text-center'
                                            : 'text-left';
                                    return (
                                        <td
                                            key={col.key}
                                            className={`px-6 py-4 text-xs text-slate-900 dark:text-slate-200 ${alignCls} ${
                                                col.className || ''
                                            }`}
                                        >
                                            {col.render ? col.render(row, idx) : row[col.key] ?? '—'}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}

                        {visibleRows.length === 0 && !loading && (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    data-testid="industrial-table-empty"
                                    className="px-6 py-12 text-center uppercase font-black text-xs tracking-widest text-slate-400"
                                >
                                    {resolvedEmptyText}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {enablePagination && totalPages > 1 && (
                <div className="px-6 py-3 border-t border-slate-200 dark:border-[#1f2228] bg-slate-50/40 dark:bg-[#0f1013]/40 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono">
                        PAGE <strong className="text-slate-900 dark:text-white">{page}</strong> /{' '}
                        <strong className="text-slate-900 dark:text-white">{totalPages}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="px-3 py-1 rounded-md border border-slate-200 dark:border-[#1f2228] bg-white dark:bg-[#14161a] text-slate-900 dark:text-white font-bold disabled:opacity-40 cursor-pointer"
                        >
                            PREV
                        </button>
                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            className="px-3 py-1 rounded-md border border-slate-200 dark:border-[#1f2228] bg-white dark:bg-[#14161a] text-slate-900 dark:text-white font-bold disabled:opacity-40 cursor-pointer"
                        >
                            NEXT
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

