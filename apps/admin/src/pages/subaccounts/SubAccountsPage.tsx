import { useEffect, useMemo, useState } from 'react';
import type { AgentPublic, SubAccountListResponse } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { CreateSubAccountModal } from '@/components/shared/CreateSubAccountModal';
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

  const handleStatus = async (row: AgentPublic, next: 'ACTIVE' | 'FROZEN') => {
    if (next === 'FROZEN' && !confirm(`確定凍結子帳號 ${row.username}？`)) return;
    try {
      await adminApi.patch(`/subaccounts/${row.id}/status`, { status: next });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const handleResetPassword = async (row: AgentPublic) => {
    const pwd = prompt(`為 ${row.username} 設置新密碼（至少 8 字,須含英數）:`);
    if (!pwd) return;
    try {
      await adminApi.post(`/subaccounts/${row.id}/reset-password`, { newPassword: pwd });
      alert('密碼已重設');
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const handleDelete = async (row: AgentPublic) => {
    if (!confirm(`確定刪除子帳號 ${row.username}？此操作不可逆（可審計保留）。`)) return;
    try {
      await adminApi.delete(`/subaccounts/${row.id}`);
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
                onClick={() => handleResetPassword(r)}
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
              <button
                type="button"
                onClick={() => handleDelete(r)}
                className="btn-chip border-[#D4574A]/40 text-[#D4574A]"
                disabled={r.status === 'DELETED'}
              >
                刪除
              </button>
            </div>
          ),
      },
    ],
    [t, isSubAccount],
  );

  return (
    <div>
      <PageHeader
        section="§ OPS 08"
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
    </div>
  );
}

function StatusToggle({
  current,
  onChange,
  disabled,
}: {
  current: AgentPublic['status'];
  onChange: (next: 'ACTIVE' | 'FROZEN') => void;
  disabled?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const options: { value: 'ACTIVE' | 'FROZEN'; label: string; style: string }[] = [
    { value: 'ACTIVE', label: '啟用', style: 'text-win' },
    { value: 'FROZEN', label: '凍結', style: 'text-[#D4574A]' },
  ];
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((o) => !o);
        }}
        className="btn-chip"
      >
        狀態 ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-24 border border-ink-200 bg-white shadow-lg">
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
        </>
      )}
    </div>
  );
}
