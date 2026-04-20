import { useEffect, useState } from 'react';
import type { AuditEntry, AuditListResponse } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { useTranslation } from '@/i18n/useTranslation';

export function AuditLogPage(): JSX.Element {
  const { t } = useTranslation();
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
        breadcrumb={`${t.nav.audit} / 记录`}
        title={t.nav.audit}
        titleSuffix="不可篡改轨迹"
        titleSuffixColor="ember"
      />

      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          placeholder="过滤操作名（例如 agent.create）"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="term-input max-w-xs"
        />
      </div>

      {error && (
        <div className="mb-4 border border-wine-400/55 bg-wine-50 p-3 text-[12px] text-wine-500">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">{t.common.loading}…</div>
      ) : items.length === 0 ? (
        <div className="crt-panel p-8 text-center text-ink-400">— 暂无记录 —</div>
      ) : (
        <div className="space-y-1">
          {items.map((r) => (
            <div key={r.id} className="crt-panel overflow-hidden">
              <div
                className="grid cursor-pointer grid-cols-[150px_130px_1fr_130px_auto] items-center gap-3 px-4 py-3 text-[11px] transition hover:bg-brass-50/60"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <span className="data-num text-[10px] text-ink-500">
                  {new Date(r.createdAt).toLocaleString('en-GB')}
                </span>
                <span className="font-mono text-ink-700">{r.actorUsername}</span>
                <span className="font-mono tracking-[0.1em] text-brass-700">{r.action}</span>
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
                      <div className="label">{t.audit.oldValues}</div>
                      <pre className="mt-1 overflow-x-auto font-mono text-[10px] text-ink-700">
                        {JSON.stringify(r.oldValues, null, 2) ?? '—'}
                      </pre>
                    </div>
                    <div>
                      <div className="label">{t.audit.newValues}</div>
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
