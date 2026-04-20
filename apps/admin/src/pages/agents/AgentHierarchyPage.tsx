import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { HierarchyResponse, HierarchyItem, MemberPublic } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { HierarchyBreadcrumb } from '@/components/shared/HierarchyBreadcrumb';
import { CreateMemberModal } from '@/components/shared/CreateMemberModal';
import { TransferModal } from '@/components/shared/TransferModal';
import { AdjustBalanceModal } from '@/components/shared/AdjustBalanceModal';
import { useAdminAuthStore } from '@/stores/adminAuthStore';

/**
 * 帳號管理（混合階層）
 *   - 呈現某 parent 的「直屬代理 + 直屬會員」
 *   - 點代理 row → 下鑽到該代理
 *   - 點會員 row → 切到該會員下注紀錄頁
 *   - breadcrumb 可回到上層
 */
export function AgentHierarchyPage(): JSX.Element {
  const navigate = useNavigate();
  const { agent: me } = useAdminAuthStore();
  const [params, setParams] = useSearchParams();
  const currentParent = params.get('parent') ?? me?.id ?? '';

  const [data, setData] = useState<HierarchyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'FROZEN'>('');
  const [reloadKey, setReloadKey] = useState(0);

  const [openCreateMember, setOpenCreateMember] = useState(false);
  const [transferFor, setTransferFor] = useState<MemberPublic | null>(null);
  const [adjustFor, setAdjustFor] = useState<MemberPublic | null>(null);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      setLoading(true);
      try {
        const q: Record<string, string> = {};
        if (currentParent) q.parentId = currentParent;
        if (keyword) q.keyword = keyword;
        if (status) q.status = status;
        const res = await adminApi.get<HierarchyResponse>('/hierarchy', { params: q });
        if (!cancel) setData(res.data);
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
  }, [currentParent, keyword, status, reloadKey]);

  const selectParent = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('parent', id);
    else next.delete('parent');
    setParams(next);
  };

  const onRowClick = (row: HierarchyItem) => {
    if (row.kind === 'agent') {
      selectParent(row.id);
    } else {
      navigate(`/admin/members/${row.id}/bets`);
    }
  };

  const handleFreezeMember = async (m: HierarchyItem, evt: React.MouseEvent) => {
    evt.stopPropagation();
    if (m.kind !== 'member') return;
    const next = m.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN';
    if (next === 'FROZEN' && !confirm('冻结此会员？冻结后将无法下注登入。')) return;
    try {
      await adminApi.patch(`/members/${m.id}/status`, { status: next });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const handleFreezeAgent = async (row: HierarchyItem, evt: React.MouseEvent) => {
    evt.stopPropagation();
    if (row.kind !== 'agent') return;
    const next = row.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN';
    if (next === 'FROZEN' && !confirm(`冻结代理 ${row.username}？下级将无法下注。`)) return;
    try {
      await adminApi.patch(`/agents/${row.id}/status`, { status: next });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const handleAgentStatus = async (id: string, next: 'ACTIVE' | 'FROZEN' | 'DELETED') => {
    if (next === 'DELETED' && !confirm('删除此代理？不可逆。')) return;
    try {
      await adminApi.patch(`/agents/${id}/status`, { status: next });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const handleMemberStatus = async (id: string, next: 'ACTIVE' | 'FROZEN') => {
    if (next === 'FROZEN' && !confirm('冻结此会员？将无法下注登入。')) return;
    try {
      await adminApi.patch(`/members/${id}/status`, { status: next });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const handleResetPassword = async (id: string, kind: 'agent' | 'member', name: string) => {
    const pwd = prompt(`为 ${name} 设置新密码（至少 8 字，须含英数）：`);
    if (!pwd) return;
    try {
      const path = kind === 'agent' ? `/agents/${id}/reset-password` : `/members/${id}/reset-password`;
      await adminApi.post(path, { newPassword: pwd });
      alert('密码已重设');
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const handleEditNotes = async (id: string, current: string | null) => {
    const next = prompt('编辑备注：', current ?? '');
    if (next === null) return;
    try {
      await adminApi.put(`/members/${id}/notes`, { notes: next || null });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const asMemberForModal = (row: HierarchyItem): MemberPublic | null => {
    if (row.kind !== 'member') return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      agentId: data?.parent?.id ?? null,
      agentUsername: data?.parent?.username ?? null,
      balance: row.balance,
      marketType: row.marketType,
      status: row.status,
      frozenAt: row.frozenAt,
      notes: row.notes,
      lastLoginAt: null,
      createdAt: row.createdAt,
    };
  };

  return (
    <div>
      <PageHeader
        section="§ OPS 02"
        breadcrumb="ACCOUNTS / MIXED HIERARCHY"
        title="账号管理"
        titleSuffix="MIXED HIERARCHY"
        titleSuffixColor="acid"
        description="点击代理 row 下钻；点击会员 row 查看下注纪录。"
        rightSlot={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setOpenCreateMember(true)} className="btn-acid text-[11px]">
              + 建立会员
            </button>
          </div>
        }
      />

      {data && (
        <HierarchyBreadcrumb
          items={data.breadcrumb}
          onSelect={selectParent}
          terminalLabel={`直属 ${data.stats.agentCount}代理 + ${data.stats.memberCount}会员`}
        />
      )}

      {data?.parent && (
        <div className="mb-4 crt-panel scanlines p-4">
          <div className="flex flex-wrap items-baseline gap-4">
            <div>
              <div className="label">CURRENT</div>
              <div className="mt-1 flex items-baseline gap-2 font-display text-xl text-ink-900">
                {data.parent.username}
                {data.parent.role === 'SUPER_ADMIN' && <span className="tag tag-gold">SUPER</span>}
                <span className="tag tag-acid">LVL {data.parent.level}</span>
                <span className="tag tag-acid">{data.parent.marketType}-盤</span>
              </div>
            </div>
            <Stat k="BAL" v={fmt(data.parent.balance)} accent="acid" />
            <Stat k="REBATE" v={pct(data.parent.rebatePercentage)} accent="toxic" />
            <Stat k="直属代理" v={data.stats.agentCount.toString()} />
            <Stat k="直属会员" v={data.stats.memberCount.toString()} />
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜寻帐号/昵称"
          className="term-input max-w-xs"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="term-input max-w-[160px]"
        >
          <option value="">ALL STATUS</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="FROZEN">FROZEN</option>
        </select>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="btn-ghost text-[11px]">
          ↻ REFRESH
        </button>
      </div>

      {error && (
        <div className="mb-4 border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
          ⚠ {error.toUpperCase()}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">Loading…</div>
      ) : data?.items.length === 0 ? (
        <div className="crt-panel p-8 text-center text-ink-400">— 此层级为空 —</div>
      ) : (
        <div className="crt-panel overflow-hidden">
          <div className="grid grid-cols-[80px_minmax(180px,1.3fr)_80px_100px_110px_110px_minmax(320px,auto)] border-b border-ink-200 bg-ink-100/40 px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-ink-500">
            <span>TYPE</span>
            <span>ACCOUNT</span>
            <span className="text-right">LVL</span>
            <span className="text-right">REBATE</span>
            <span className="text-right">BAL</span>
            <span className="text-center">STATUS</span>
            <span className="text-right">ACTIONS</span>
          </div>
          {data?.items.map((row) => (
            <div
              key={`${row.kind}-${row.id}`}
              onClick={() => onRowClick(row)}
              className="grid cursor-pointer grid-cols-[80px_minmax(180px,1.3fr)_80px_100px_110px_110px_minmax(320px,auto)] items-center gap-2 border-b border-ink-100 px-4 py-3 text-[12px] transition hover:bg-neon-acid/5"
            >
              {row.kind === 'agent' ? (
                <span className="tag tag-acid">代理</span>
              ) : (
                <span className="tag tag-toxic">会员</span>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-ink-900">
                  <span className="truncate">{row.kind === 'agent' ? row.username : row.email}</span>
                  {row.kind === 'agent' && row.role === 'SUPER_ADMIN' && <span className="tag tag-gold">SUPER</span>}
                </div>
                <div className="mt-0.5 flex gap-3 text-[10px] text-ink-500">
                  {row.displayName && <span>{row.displayName}</span>}
                  {row.kind === 'agent' && (
                    <>
                      <span>子代理 <span className="data-num text-ink-700">{row.childCount}</span></span>
                      <span>会员 <span className="data-num text-ink-700">{row.memberCount}</span></span>
                    </>
                  )}
                </div>
              </div>

              <span className="text-right data-num text-ink-700">
                {row.kind === 'agent' ? `L${row.level}` : '—'}
              </span>
              <span className="text-right data-num text-neon-toxic">
                {row.kind === 'agent' ? pct(row.rebatePercentage) : '—'}
              </span>
              <span className="text-right data-num text-neon-acid">{fmt(row.balance)}</span>
              <span className="text-center">
                {row.status === 'FROZEN' ? (
                  <span className="tag tag-ember">FROZEN</span>
                ) : (
                  <span className="tag tag-toxic">
                    <span className="status-dot status-dot-live" />
                    ACTIVE
                  </span>
                )}
              </span>

              <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                {row.kind === 'agent' ? (
                  <>
                    <button type="button" onClick={(e) => { e.stopPropagation(); selectParent(row.id); }} className="btn-chip">
                      下级账号
                    </button>
                    <button type="button" onClick={() => navigate(`/admin/reports?parent=${row.id}`)} className="btn-chip">
                      报表
                    </button>
                    <button type="button" onClick={() => navigate(`/admin/audit?targetId=${row.id}`)} className="btn-chip">
                      日志
                    </button>
                    <button type="button" onClick={() => alert('点数转移：请至「点数转帐」页面')} className="btn-chip">
                      点数转移
                    </button>
                    <button type="button" onClick={() => alert('退水设定：请透过 API /agents/:id/rebate')} className="btn-chip">
                      退水设定
                    </button>
                    <button type="button" onClick={() => handleResetPassword(row.id, 'agent', row.username)} className="btn-chip">
                      重设密码
                    </button>
                    <StatusDropdown
                      current={row.status}
                      onChange={(next) => handleAgentStatus(row.id, next)}
                    />
                  </>
                ) : (
                  <>
                    <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/admin/members/${row.id}/bets`); }} className="btn-chip">
                      下注纪录
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); const m = asMemberForModal(row); if (m) setTransferFor(m); }}
                      className="btn-chip"
                    >
                      点数转移
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); const m = asMemberForModal(row); if (m) setAdjustFor(m); }}
                      className="btn-chip"
                    >
                      调整余额
                    </button>
                    <button type="button" onClick={() => handleEditNotes(row.id, row.notes)} className="btn-chip">
                      备注
                    </button>
                    <button type="button" onClick={() => handleResetPassword(row.id, 'member', row.email)} className="btn-chip">
                      重设密码
                    </button>
                    <StatusDropdown
                      current={row.status === 'FROZEN' ? 'FROZEN' : 'ACTIVE'}
                      onChange={(next) => handleMemberStatus(row.id, next === 'FROZEN' ? 'FROZEN' : 'ACTIVE')}
                      memberOnly
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateMemberModal
        open={openCreateMember}
        onClose={() => setOpenCreateMember(false)}
        onCreated={() => setReloadKey((k) => k + 1)}
        defaultAgentId={currentParent}
      />
      {transferFor && (
        <TransferModal
          open
          onClose={() => setTransferFor(null)}
          member={transferFor}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}
      {adjustFor && (
        <AdjustBalanceModal
          open
          onClose={() => setAdjustFor(null)}
          member={adjustFor}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function StatusDropdown({
  current,
  onChange,
  memberOnly,
}: {
  current: 'ACTIVE' | 'FROZEN' | 'DELETED';
  onChange: (next: 'ACTIVE' | 'FROZEN' | 'DELETED') => void;
  memberOnly?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const options: { value: 'ACTIVE' | 'FROZEN' | 'DELETED'; label: string; style: string }[] = memberOnly
    ? [
        { value: 'ACTIVE', label: '启用', style: 'text-neon-toxic' },
        { value: 'FROZEN', label: '冻结', style: 'text-neon-ember' },
      ]
    : [
        { value: 'ACTIVE', label: '启用', style: 'text-neon-toxic' },
        { value: 'FROZEN', label: '冻结', style: 'text-neon-ember' },
        { value: 'DELETED', label: '删除', style: 'text-neon-ember font-bold' },
      ];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="btn-chip"
      >
        状态 ▾
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
                className={`block w-full px-3 py-2 text-left text-[11px] font-mono transition hover:bg-neon-acid/10 ${o.style} ${
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

function Stat({ k, v, accent }: { k: string; v: string; accent?: 'acid' | 'toxic' }) {
  const color = accent === 'acid' ? 'text-neon-acid' : accent === 'toxic' ? 'text-neon-toxic' : 'text-ink-900';
  return (
    <div>
      <div className="label">{k}</div>
      <div className={`mt-0.5 data-num font-bold ${color}`}>{v}</div>
    </div>
  );
}

function fmt(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(s: string): string {
  return `${(Number.parseFloat(s) * 100).toFixed(2)}%`;
}
