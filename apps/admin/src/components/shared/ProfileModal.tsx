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

function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale, { hour12: false });
}

function formatRole(role: AgentPublic['role'], t: ReturnType<typeof useTranslation>['t']): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return t.shell.super;
    case 'AGENT':
      return t.agents.typeAgent;
    case 'SUB_ACCOUNT':
      return t.nav.subAccounts;
    default:
      return role;
  }
}

export function ProfileModal({ open, onClose }: Props): JSX.Element {
  const { agent, setAgent } = useAdminAuthStore();
  const { t, locale } = useTranslation();
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
    <Modal
      open={open}
      onClose={onClose}
      title={t.shell.profile}
      subtitle={agent?.displayName ?? agent?.username ?? '—'}
      width="md"
    >
      {loading && <div className="mb-3 text-[12px] text-ink-500">{t.common.loading}…</div>}
      {err && (
        <div className="mb-3 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {err}
        </div>
      )}

      {agent && (
        <div className="space-y-4">
          <Section title={t.shell.profile}>
            <Row
              label="ID"
              value={<span className="font-mono text-[12px] text-ink-700">{agent.id}</span>}
            />
            <Row
              label={t.agents.account}
              value={<span className="font-mono">{agent.username}</span>}
            />
            <Row label={t.agents.displayName} value={agent.displayName ?? '—'} />
            <Row label={t.agents.type} value={formatRole(agent.role, t)} />
            <Row
              label={t.agents.bettingLimit}
              value={<span className="font-mono">{agent.bettingLimitLevel}</span>}
            />
          </Section>

          <Section title={t.shell.balance}>
            <Row
              label={t.dashboard.balance}
              value={<span className="data-num text-[#186073]">{formatDec(agent.balance)}</span>}
            />
          </Section>

          <Section title={t.auth.login}>
            <Row
              label={t.agents.lastLogin}
              value={
                <span className="font-mono text-[12px]">
                  {formatDateTime(agent.lastLoginAt, locale)}
                </span>
              }
            />
            <Row
              label={t.agents.createdAt}
              value={
                <span className="font-mono text-[12px]">
                  {formatDateTime(agent.createdAt, locale)}
                </span>
              }
            />
          </Section>
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button type="button" onClick={onClose} className="btn-teal-outline">
          [{t.common.close}]
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
