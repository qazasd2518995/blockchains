import { useEffect, useState } from 'react';
import type { AuditEntry, AuditListResponse } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';

export function AuditLogPage(): JSX.Element {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      setLoading(true);
      try {
        const params: Record<string, string> = { limit: '100' };
        if (actionFilter) params.action = actionFilter;
        const res = await adminApi.get<AuditListResponse>('/audit', { params });
        if (!cancel) setItems(res.data.items);
      } catch (e) {
        if (!cancel) setError(extractApiError(e).message);
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    void load();
    return () => {
      cancel = true;
    };
  }, [actionFilter]);

  return (
    <div>
      <PageHeader
        section="§ OPS 07"
        breadcrumb="AUDIT / LOG"
        title="审计日志"
        titleSuffix="IMMUTABLE TRAIL"
        titleSuffixColor="ember"
      />

      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          placeholder="action filter (e.g. agent.create)"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="term-input max-w-xs"
        />
      </div>

      {error && (
        <div className="mb-4 border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
          ⚠ {error.toUpperCase()}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="crt-panel p-8 text-center text-ink-400">— 无纪录 —</div>
      ) : (
        <div className="space-y-1">
          {items.map((r) => (
            <div key={r.id} className="crt-panel overflow-hidden">
              <div
                className="grid cursor-pointer grid-cols-[150px_130px_1fr_130px_auto] items-center gap-3 px-4 py-3 text-[11px] transition hover:bg-neon-acid/5"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <span className="data-num text-[10px] text-ink-500">
                  {new Date(r.createdAt).toLocaleString('en-GB')}
                </span>
                <span className="font-mono text-ink-700">{r.actorUsername}</span>
                <span className="font-mono tracking-[0.1em] text-neon-acid">{r.action}</span>
                <span className="font-mono text-[10px] text-ink-500">
                  {r.targetType ? `${r.targetType}:${r.targetId?.slice(-8) ?? ''}` : '—'}
                </span>
                <span className="text-[10px] text-ink-400">
                  {expanded === r.id ? '▼' : '▶'}
                </span>
              </div>
              {expanded === r.id && (
                <div className="border-t border-ink-200 bg-ink-100/40 px-4 py-3">
                  <div className="grid gap-2 text-[10px] md:grid-cols-2">
                    <div>
                      <div className="label">OLD VALUES</div>
                      <pre className="mt-1 overflow-x-auto font-mono text-[10px] text-ink-700">
                        {JSON.stringify(r.oldValues, null, 2) ?? '—'}
                      </pre>
                    </div>
                    <div>
                      <div className="label">NEW VALUES</div>
                      <pre className="mt-1 overflow-x-auto font-mono text-[10px] text-ink-700">
                        {JSON.stringify(r.newValues, null, 2) ?? '—'}
                      </pre>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-4 text-[10px] text-ink-500">
                    <span>IP: {r.ipAddress ?? '—'}</span>
                    <span>ACTOR: {r.actorType}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
