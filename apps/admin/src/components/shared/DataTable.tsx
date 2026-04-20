import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  width?: string;
  align?: 'left' | 'right' | 'center';
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ columns, rows, rowKey, empty, onRowClick }: Props<T>): JSX.Element {
  return (
    <div className="crt-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-100/40">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500 ${
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''
                  }`}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-ink-400">
                  — {empty ?? 'no data'} —
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={rowKey(r)}
                className={`border-b border-ink-100 transition ${
                  onRowClick ? 'cursor-pointer hover:bg-neon-acid/5' : ''
                }`}
                onClick={() => onRowClick?.(r)}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-3 ${
                      c.align === 'right'
                        ? 'text-right'
                        : c.align === 'center'
                          ? 'text-center'
                          : ''
                    }`}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
