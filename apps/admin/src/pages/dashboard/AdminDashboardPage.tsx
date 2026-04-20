import { useEffect, useState } from 'react';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { useTranslation } from '@/i18n/useTranslation';
import type { AgentTreeResponse, MemberListResponse, AuditListResponse } from '@bg/shared';

export function AdminDashboardPage(): JSX.Element {
  const { agent } = useAdminAuthStore();
  const { t } = useTranslation();
  const [downlineAgents, setDownlineAgents] = useState<number>(0);
  const [downlineMembers, setDownlineMembers] = useState<number>(0);
  const [recentAudit, setRecentAudit] = useState<AuditListResponse['items']>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const tree = await adminApi.get<AgentTreeResponse>('/agents/tree');
        const { root } = tree.data;
        let a = 0;
        let m = 0;
        const walk = (n: typeof root) => {
          a += n.childCount;
          m += n.memberCount;
          for (const c of n.children) walk(c);
        };
        walk(root);
        setDownlineAgents(a);
        setDownlineMembers(m);

        const members = await adminApi.get<MemberListResponse>('/members', {
          params: { limit: 1 },
        });
        void members;

        const audit = await adminApi.get<AuditListResponse>('/audit', { params: { limit: 8 } });
        setRecentAudit(audit.data.items);
      } catch (err) {
        setError(extractApiError(err).message);
      }
    };
    void load();
  }, []);

  return (
    <div>
      <PageHeader
        section="§ OPS 01"
        breadcrumb="DASHBOARD"
        title={t.dashboard.title}
        titleSuffix={t.dashboard.subtitle}
        description={`Welcome ${agent?.displayName ?? agent?.username} · LVL ${agent?.level} · ${agent?.marketType}-盤`}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.dashboard.totalAgents} value={downlineAgents.toString()} accent="acid" />
        <StatCard label={t.dashboard.totalMembers} value={downlineMembers.toString()} accent="toxic" />
        <StatCard
          label={t.dashboard.balance}
          value={formatDec(agent?.balance ?? '0')}
          accent="amber"
        />
        <StatCard
          label={t.dashboard.commission}
          value={formatDec(agent?.commissionBalance ?? '0')}
          accent="ice"
        />
      </div>

      {error && (
        <div className="mt-6 border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
          ⚠ {error.toUpperCase()}
        </div>
      )}

      <div className="mt-8 crt-panel p-6">
        <div className="flex items-center justify-between border-b border-ink-200 pb-3 text-[10px] tracking-[0.25em]">
          <span className="text-ink-500">§ {t.dashboard.recentActivity}</span>
          <span className="text-ink-600">{recentAudit.length} entries</span>
        </div>
        <div className="mt-3 space-y-1">
          {recentAudit.length === 0 && (
            <div className="py-6 text-center text-ink-400">— no activity —</div>
          )}
          {recentAudit.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[110px_110px_1fr_auto] gap-3 border-b border-ink-100 px-2 py-2 text-[11px]"
            >
              <span className="data-num text-ink-500">
                {new Date(r.createdAt).toLocaleTimeString('en-GB')}
              </span>
              <span className="font-mono text-ink-700">{r.actorUsername}</span>
              <span className="font-mono tracking-[0.1em] text-neon-acid">{r.action}</span>
              <span className="text-[10px] text-ink-500">{r.ipAddress ?? ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDec(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
