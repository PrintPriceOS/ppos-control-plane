import React from 'react';

interface Column<T> {
  header: string;
  render: (item: T) => React.ReactNode;
}

interface BetaDataTableShellProps<T> {
  data: T[];
  columns: Column<T>[];
  emptyMessage?: string;
}

export function BetaDataTableShell<T>({
  data,
  columns,
  emptyMessage = "No records found"
}: BetaDataTableShellProps<T>) {
  return (
    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-left text-sm text-slate-900 dark:text-slate-100">
        <thead className="bg-slate-50 dark:bg-slate-950">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                scope="col"
                className="px-6 py-3.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-6 py-10 text-center text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/20"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, rowIdx) => (
              <tr
                key={rowIdx}
                className="hover:bg-slate-50/70 dark:hover:bg-slate-950/40 transition-colors duration-150"
              >
                {columns.map((col, colIdx) => (
                  <td key={colIdx} className="px-6 py-4 whitespace-nowrap">
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
