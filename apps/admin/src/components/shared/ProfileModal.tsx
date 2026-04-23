import { useEffect, useState } from 'react';
import type { AgentPublic } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
import { useTranslation } from '@/i18n/useTranslation';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
}

function formatDec(s: string | null | undefined): string {
  const n = Number.parseFloat(s ?? '0');
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-Hans', { hour12: false });
}

function formatRole(role: AgentPublic['role']): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return '超级管理员';
    case 'AGENT':
      return '代理';
    case 'SUB_ACCOUNT':
      return '子账号';
    default:
      return role;
  }
}

export function ProfileModal({ open, onClose }: Props): JSX.Element {
  const { agent, setAgent } = useAdminAuthStore();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setLoading(true);
    (async () => {
      try {
        const res = await adminApi.get<AgentPublic>('/auth/me');
        setAgent(res.data);
      } catch (e) {
        setErr(extractApiError(e).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, setAgent]);

  return (
    <Modal open={open} onClose={onClose} title="个人资料" subtitle={agent?.displayName ?? agent?.username ?? '—'} width="md">
      {loading && (
        <div className="mb-3 text-[12px] text-ink-500">{t.common.loading}…</div>
      )}
      {err && (
        <div className="mb-3 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {err}
        </div>
      )}

      {agent && (
        <div className="space-y-4">
          <Section title="基本资料">
            <Row label="ID" value={<span className="font-mono text-[12px] text-ink-700">{agent.id}</span>} />
            <Row label="账号" value={<span className="font-mono">{agent.username}</span>} />
            <Row label="显示名称" value={agent.displayName ?? '—'} />
            <Row label="角色" value={formatRole(agent.role)} />
            <Row label="下注额度" value={<span className="font-mono">{agent.bettingLimitLevel}</span>} />
          </Section>

          <Section title="财务">
            <Row
              label="账户余额"
              value={<span className="data-num text-[#186073]">{formatDec(agent.balance)}</span>}
            />
          </Section>

          <Section title="登录">
            <Row label="最后登录" value={<span className="font-mono text-[12px]">{formatDateTime(agent.lastLoginAt)}</span>} />
            <Row label="创建时间" value={<span className="font-mono text-[12px]">{formatDateTime(agent.createdAt)}</span>} />
          </Section>
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button type="button" onClick={onClose} className="btn-teal-outline">
          [关闭]
        </button>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="border border-ink-200 bg-ink-100/40 p-3">
      <div className="label mb-2 text-[#186073]">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between text-[12px]">
      <span className="text-ink-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}
