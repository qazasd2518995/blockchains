import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AgentPublic, SubAccountListResponse } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { CreateSubAccountModal } from '@/components/shared/CreateSubAccountModal';
import { Modal } from '@/components/shared/Modal';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
import { useTranslation } from '@/i18n/useTranslation';

const MAX_SUB_ACCOUNTS_PER_AGENT = 5;

export function SubAccountsPage(): JSX.Element {
  const { t } = useTranslation();
  const { agent } = useAdminAuthStore();
  const [items, setItems] = useState<AgentPublic[]>([]);
  const [parentUsername, setParentUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [openCreate, setOpenCreate] = useState(false);
  const [targetParentId, setTargetParentId] = useState<string>('');
  const [targetQuery, setTargetQuery] = useState<string>('');
  const [targetBusy, setTargetBusy] = useState(false);
  const [resetFor, setResetFor] = useState<AgentPublic | null>(null);

  const isSuperAdmin = agent?.role === 'SUPER_ADMIN';
  const isSubAccount = agent?.role === 'SUB_ACCOUNT';
  const selectedParentId = isSuperAdmin ? targetParentId || agent?.id || '' : undefined;
  const fallbackParentLabel = isSuperAdmin ? targetQuery || agent?.username || null : agent?.username ?? null;
  const selectedParentLabel = parentUsername ?? fallbackParentLabel;
  const isAtLimit = items.length >= MAX_SUB_ACCOUNTS_PER_AGENT;

  useEffect(() => {
    if (!isSuperAdmin || !agent) return;
    setTargetParentId((current) => current || agent.id);
    setTargetQuery((current) => current || agent.username);
  }, [agent, isSuperAdmin]);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (isSuperAdmin && !selectedParentId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const params: Record<string, string> = {};
        if (isSuperAdmin && selectedParentId) {
          params.parentAgentId = selectedParentId;
        }
        const res = await adminApi.get<SubAccountListResponse>('/subaccounts', { params });
        if (!cancel) {
          setItems(res.data.items);
          setParentUsername(res.data.parentUsername);
        }
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
  }, [reloadKey, isSuperAdmin, selectedParentId]);

  const applyTargetParent = async (): Promise<void> => {
    if (!isSuperAdmin || !agent) return;
    const query = targetQuery.trim();
    setError(null);
    if (!query) {
      setTargetParentId(agent.id);
      setTargetQuery(agent.username);
      setReloadKey((k) => k + 1);
      return;
    }

    setTargetBusy(true);
    try {
      let target: Pick<AgentPublic, 'id' | 'username'>;
      try {
        const lookup = await adminApi.get<Pick<AgentPublic, 'id' | 'username'>>('/agents/lookup', {
          params: { username: query },
        });
        target = lookup.data;
      } catch {
        const detail = await adminApi.get<AgentPublic>(`/agents/${query}`);
        target = { id: detail.data.id, username: detail.data.username };
      }
      setTargetParentId(target.id);
      setTargetQuery(target.username);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    } finally {
      setTargetBusy(false);
    }
  };

  const handleStatus = async (row: AgentPublic, next: 'ACTIVE' | 'FROZEN' | 'DISABLED') => {
    if (next === 'ACTIVE' && !confirm(`确定启用子账号 ${row.username}？`)) return;
    if (next === 'FROZEN' && !confirm(`确定冻结子账号 ${row.username}？`)) return;
    if (next === 'DISABLED' && !confirm(`确定停用子账号 ${row.username}？停用后将无法登入。`)) return;
    try {
      await adminApi.patch(`/subaccounts/${row.id}/status`, { status: next });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const columns: Column<AgentPublic>[] = useMemo(
    () => [
      {
        key: 'username',
        label: '账号',
        render: (r) => (
          <div>
            <div className="font-mono text-ink-900">{r.username}</div>
            {r.displayName && <div className="text-[10px] text-ink-500">{r.displayName}</div>}
          </div>
        ),
      },
      {
        key: 'status',
        label: '状态',
        render: (r) =>
          r.status === 'FROZEN' ? (
            <span className="tag tag-ember">{t.agent.status.FROZEN}</span>
          ) : r.status === 'DISABLED' ? (
            <span className="tag tag-ember">{t.agent.status.DISABLED}</span>
          ) : r.status === 'DELETED' ? (
            <span className="tag tag-ember">{t.agent.status.DELETED}</span>
          ) : (
            <span className="tag tag-toxic">
              <span className="dot-online dot-online" />
              {t.agent.status.ACTIVE}
            </span>
          ),
      },
      {
        key: 'createdAt',
        label: '创建时间',
        render: (r) => (
          <span className="font-mono text-[10px] text-ink-500">
            {new Date(r.createdAt).toLocaleString('en-GB')}
          </span>
        ),
      },
      {
        key: 'lastLogin',
        label: '最后登入',
        render: (r) => (
          <span className="font-mono text-[10px] text-ink-500">
            {r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString('en-GB') : '—'}
          </span>
        ),
      },
      {
        key: 'actions',
        label: t.common.actions,
        align: 'right',
        render: (r) =>
          isSubAccount ? (
            <span className="text-[10px] text-ink-400">— 只读 —</span>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setResetFor(r)}
                className="btn-chip"
                disabled={r.status === 'DELETED'}
              >
                重设密码
              </button>
              <StatusToggle
                current={r.status}
                onChange={(next) => handleStatus(r, next)}
                disabled={r.status === 'DELETED'}
              />
            </div>
          ),
      },
    ],
    [t, isSubAccount],
  );

  return (
    <div>
      <PageHeader
        section="§ 后台 08"
        breadcrumb="子账号 / 只读员工账号"
        title="子账号"
        titleSuffix="读取权限 · 员工账号"
        titleSuffixColor="amber"
        description="子账号可以查看该代理线下的报表、注单、会员列表，但无法执行任何管理操作。"
        rightSlot={
          !isSubAccount && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="rounded-full border border-white/18 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/82">
                {items.length}/{MAX_SUB_ACCOUNTS_PER_AGENT}
              </span>
              <button
                type="button"
                onClick={() => setOpenCreate(true)}
                className="btn-acid text-[11px]"
                disabled={loading || isAtLimit || !selectedParentLabel}
              >
                + 新增子账号
              </button>
            </div>
          )
        }
      />

      {isSuperAdmin && (
        <div className="admin-mobile-stack mb-4 flex flex-wrap items-center gap-3 crt-panel p-4">
          <span className="text-[11px] font-semibold tracking-[0.2em] text-ink-600">目标代理</span>
          <input
            type="text"
            value={targetQuery}
            onChange={(e) => setTargetQuery(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void applyTargetParent();
              }
            }}
            placeholder="输入代理账号或 ID，留空为自己"
            className="term-input max-w-md font-mono"
          />
          <button
            type="button"
            onClick={() => void applyTargetParent()}
            disabled={targetBusy}
            className="btn-teal-outline text-[11px]"
          >
            {targetBusy ? t.common.loading : '套用'}
          </button>
          {agent && (
            <button
              type="button"
              onClick={() => {
                setTargetParentId(agent.id);
                setTargetQuery(agent.username);
                setReloadKey((k) => k + 1);
              }}
              className="btn-teal-outline text-[11px]"
            >
              我的账号
            </button>
          )}
        </div>
      )}

      <div className="mb-4 rounded-md border border-[#186073]/20 bg-[#E8F4F8]/35 px-4 py-3 text-[12px] text-ink-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            当前代理：
            <span className="ml-1 font-mono font-semibold text-[#186073]">{selectedParentLabel ?? '—'}</span>
          </div>
          <div>
            子账号数量：
            <span className="ml-1 data-num font-bold text-[#186073]">
              {items.length}/{MAX_SUB_ACCOUNTS_PER_AGENT}
            </span>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-ink-500">
          每个代理最多可以创建 {MAX_SUB_ACCOUNTS_PER_AGENT} 个子账号。子账号只读，不提供删除功能，可停用或重设密码。
        </div>
        {isAtLimit && !isSubAccount && (
          <div className="mt-2 text-[11px] font-semibold text-[#D4574A]">
            已达到上限，无法继续新增。
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">{t.common.loading}…</div>
      ) : (
        <DataTable columns={columns} rows={items} rowKey={(r) => r.id} empty="暂无子账号" />
      )}

      <CreateSubAccountModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={() => setReloadKey((k) => k + 1)}
        parentUsername={selectedParentLabel}
        parentAgentId={isSuperAdmin ? selectedParentId || undefined : undefined}
      />
      {resetFor && (
        <ResetSubAccountPasswordModal
          target={resetFor}
          onClose={() => setResetFor(null)}
          onDone={() => {
            setResetFor(null);
            setReloadKey((k) => k + 1);
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function ResetSubAccountPasswordModal({
  target,
  onClose,
  onDone,
  onError,
}: {
  target: AgentPublic;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}): JSX.Element {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setLocalError('密码至少 8 字，且必须包含英文字母与数字。');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('两次输入的密码不一致。');
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      await adminApi.post(`/subaccounts/${target.id}/reset-password`, { newPassword: password });
      onDone();
    } catch (e) {
      onError(extractApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="重设密码" subtitle={`子账号 · ${target.username}`} width="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="border border-[#D4AF37]/35 bg-[#FFF8DA] px-3 py-2 text-[12px] text-ink-700">
          重设后原有登入凭证会失效，子账号需要使用新密码重新登入。
        </div>
        <div>
          <div className="label mb-2">新密码</div>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="term-input"
            placeholder="至少 8 字，含英数"
            autoComplete="new-password"
          />
        </div>
        <div>
          <div className="label mb-2">再次输入</div>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="term-input"
            placeholder="确认新密码"
            autoComplete="new-password"
          />
        </div>
        {localError && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] px-3 py-2 text-[12px] text-[#D4574A]">
            {localError}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-ink-200 pt-4">
          <button type="button" onClick={onClose} className="btn-teal-outline">
            取消
          </button>
          <button type="submit" disabled={busy} className="btn-acid">
            {busy ? '处理中' : '重设密码'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StatusToggle({
  current,
  onChange,
  disabled,
}: {
  current: AgentPublic['status'];
  onChange: (next: 'ACTIVE' | 'FROZEN' | 'DISABLED') => void;
  disabled?: boolean;
}): JSX.Element {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number } | null>(null);
  const options: { value: 'ACTIVE' | 'DISABLED'; label: string; style: string }[] = [
    { value: 'ACTIVE', label: '启用', style: 'text-win' },
    { value: 'DISABLED', label: '停用', style: 'text-[#D4574A] font-bold' },
  ];

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const menuWidth = 112;
      setMenuRect({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
      });
    }
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className="btn-chip"
      >
        状态 ▾
      </button>
      {open && menuRect && createPortal(
        <>
          <div className="fixed inset-0 z-[1200]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[1201] w-28 border border-ink-200 bg-white shadow-lg"
            style={{ top: menuRect.top, left: menuRect.left }}
            onClick={(event) => event.stopPropagation()}
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={o.value === current}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onChange(o.value);
                }}
                className={`block w-full px-3 py-2 text-left text-[11px] font-mono transition hover:bg-[#F3E5AE]/50 ${o.style} ${
                  o.value === current ? 'opacity-40' : ''
                }`}
              >
                {o.label}
                {o.value === current && <span className="ml-2 text-[9px]">✓</span>}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
