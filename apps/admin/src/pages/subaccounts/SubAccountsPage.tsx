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
  const [resetFor, setResetFor] = useState<AgentPublic | null>(null);

  const isSuperAdmin = agent?.role === 'SUPER_ADMIN';
  const isSubAccount = agent?.role === 'SUB_ACCOUNT';

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      setLoading(true);
      try {
        const params: Record<string, string> = {};
        if (isSuperAdmin && targetParentId) {
          params.parentAgentId = targetParentId;
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
  }, [reloadKey, isSuperAdmin, targetParentId]);

  const handleStatus = async (row: AgentPublic, next: 'ACTIVE' | 'FROZEN' | 'DISABLED') => {
    if (next === 'FROZEN' && !confirm(`確定凍結子帳號 ${row.username}？`)) return;
    if (next === 'DISABLED' && !confirm(`確定停用子帳號 ${row.username}？停用後將無法登入。`)) return;
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
        label: '帳號',
        render: (r) => (
          <div>
            <div className="font-mono text-ink-900">{r.username}</div>
            {r.displayName && <div className="text-[10px] text-ink-500">{r.displayName}</div>}
          </div>
        ),
      },
      {
        key: 'status',
        label: '狀態',
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
        label: '建立時間',
        render: (r) => (
          <span className="font-mono text-[10px] text-ink-500">
            {new Date(r.createdAt).toLocaleString('en-GB')}
          </span>
        ),
      },
      {
        key: 'lastLogin',
        label: '最後登入',
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
            <span className="text-[10px] text-ink-400">— 唯讀 —</span>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setResetFor(r)}
                className="btn-chip"
                disabled={r.status === 'DELETED'}
              >
                重設密碼
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
        breadcrumb="子帳號 / 唯讀員工帳號"
        title="子帳號"
        titleSuffix="讀取權限 · 員工帳號"
        titleSuffixColor="amber"
        description="子帳號可以查看該代理線下的報表、注單、會員列表,但無法執行任何管理操作(加減餘額、建立帳號、改退水等)。"
        rightSlot={
          !isSubAccount && (
            <button
              type="button"
              onClick={() => setOpenCreate(true)}
              className="btn-acid text-[11px]"
              disabled={isSuperAdmin && !targetParentId}
            >
              + 新增子帳號
            </button>
          )
        }
      />

      {isSuperAdmin && (
        <div className="mb-4 flex flex-wrap items-center gap-3 crt-panel p-4">
          <span className="text-[11px] font-semibold tracking-[0.2em] text-ink-600">目標代理 ID</span>
          <input
            type="text"
            value={targetParentId}
            onChange={(e) => setTargetParentId(e.target.value)}
            placeholder="填入代理 id 以查詢其子帳號"
            className="term-input max-w-md font-mono"
          />
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="btn-teal-outline text-[11px]"
          >
            ↻ {t.common.refresh}
          </button>
        </div>
      )}

      {parentUsername && (
        <div className="mb-4 text-[12px] text-ink-600">
          代理：
          <span className="ml-1 font-mono font-semibold text-[#186073]">{parentUsername}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">{t.common.loading}…</div>
      ) : (
        <DataTable columns={columns} rows={items} rowKey={(r) => r.id} empty="暫無子帳號" />
      )}

      <CreateSubAccountModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={() => setReloadKey((k) => k + 1)}
        parentUsername={parentUsername ?? (isSuperAdmin ? targetParentId : agent?.username ?? null)}
        parentAgentId={isSuperAdmin ? targetParentId || undefined : undefined}
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
      setLocalError('密碼至少 8 字，且必須包含英文字母與數字。');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('兩次輸入的密碼不一致。');
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
    <Modal open onClose={onClose} title="重設密碼" subtitle={`子帳號 · ${target.username}`} width="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="border border-[#D4AF37]/35 bg-[#FFF8DA] px-3 py-2 text-[12px] text-ink-700">
          重設後原有登入憑證會失效，子帳號需要使用新密碼重新登入。
        </div>
        <div>
          <div className="label mb-2">新密碼</div>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="term-input"
            placeholder="至少 8 字，含英數"
            autoComplete="new-password"
          />
        </div>
        <div>
          <div className="label mb-2">再次輸入</div>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="term-input"
            placeholder="確認新密碼"
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
            {busy ? '處理中' : '重設密碼'}
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
  const options: { value: 'ACTIVE' | 'FROZEN' | 'DISABLED'; label: string; style: string }[] = [
    { value: 'ACTIVE', label: '啟用', style: 'text-win' },
    { value: 'FROZEN', label: '凍結', style: 'text-[#B45309]' },
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
        狀態 ▾
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
