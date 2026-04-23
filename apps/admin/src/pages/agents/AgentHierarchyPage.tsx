import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { HierarchyResponse, HierarchyItem, MemberPublic } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { HierarchyBreadcrumb } from '@/components/shared/HierarchyBreadcrumb';
import { CreateMemberModal } from '@/components/shared/CreateMemberModal';
import { CreateAgentModal } from '@/components/shared/CreateAgentModal';
import { TransferModal } from '@/components/shared/TransferModal';
import { AdjustBalanceModal } from '@/components/shared/AdjustBalanceModal';
import { RebateSettingModal } from '@/components/shared/RebateSettingModal';
import { BettingLimitModal } from '@/components/shared/BettingLimitModal';
import { AgentTransferModal } from '@/components/shared/AgentTransferModal';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
import { useTranslation } from '@/i18n/useTranslation';

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
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const currentParent = params.get('parent') ?? me?.id ?? '';

  const [data, setData] = useState<HierarchyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'FROZEN'>('');
  const [reloadKey, setReloadKey] = useState(0);

  const [openCreateMember, setOpenCreateMember] = useState(false);
  const [openCreateAgent, setOpenCreateAgent] = useState(false);
  const [transferFor, setTransferFor] = useState<MemberPublic | null>(null);
  const [adjustFor, setAdjustFor] = useState<MemberPublic | null>(null);
  const [rebateFor, setRebateFor] = useState<{ id: string; username: string } | null>(null);
  const [bettingLimitFor, setBettingLimitFor] = useState<
    { targetType: 'agent' | 'member'; id: string; username: string; currentLevel: string } | null
  >(null);
  const [agentTransferFor, setAgentTransferFor] = useState<{ id: string; username: string; balance: string } | null>(null);
  const [deleteMemberFor, setDeleteMemberFor] = useState<{ id: string; username: string } | null>(null);

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
    if (next === 'FROZEN' && !confirm(t.agents.confirmFreezeMember)) return;
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
    if (next === 'FROZEN' && !confirm(t.agents.confirmFreezeAgentTpl.replace('{name}', row.username))) return;
    try {
      await adminApi.patch(`/agents/${row.id}/status`, { status: next });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const handleAgentStatus = async (id: string, next: 'ACTIVE' | 'FROZEN' | 'DELETED') => {
    if (next === 'DELETED' && !confirm(t.agents.confirmDeleteAgent)) return;
    try {
      await adminApi.patch(`/agents/${id}/status`, { status: next });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const handleMemberStatus = async (id: string, next: 'ACTIVE' | 'FROZEN') => {
    if (next === 'FROZEN' && !confirm(t.agents.confirmFreezeMemberShort)) return;
    try {
      await adminApi.patch(`/members/${id}/status`, { status: next });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const handleResetPassword = async (id: string, kind: 'agent' | 'member', name: string) => {
    const pwd = prompt(t.agents.resetPasswordPromptTpl.replace('{name}', name));
    if (!pwd) return;
    try {
      const path = kind === 'agent' ? `/agents/${id}/reset-password` : `/members/${id}/reset-password`;
      await adminApi.post(path, { newPassword: pwd });
      alert(t.agents.passwordReset);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const handleEditNotes = async (id: string, current: string | null) => {
    const next = prompt(t.agents.editNotesPrompt, current ?? '');
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
      username: row.username,
      displayName: row.displayName,
      agentId: data?.parent?.id ?? null,
      agentUsername: data?.parent?.username ?? null,
      balance: row.balance,
      marketType: row.marketType,
      bettingLimitLevel: row.bettingLimitLevel,
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
        breadcrumb={t.agents.mixedHierarchyBreadcrumb}
        title={t.agents.title}
        titleSuffix={t.agents.mixedHierarchySuffix}
        titleSuffixColor="acid"
        description={t.agents.description}
        rightSlot={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setOpenCreateAgent(true)} className="btn-teal-outline text-[11px]">
              + {t.agents.createSub}
            </button>
            <button type="button" onClick={() => setOpenCreateMember(true)} className="btn-acid text-[11px]">
              + {t.agents.createMember}
            </button>
          </div>
        }
      />

      {data && (
        <HierarchyBreadcrumb
          items={data.breadcrumb}
          onSelect={selectParent}
          terminalLabel={t.agents.directSummaryTpl
            .replace('{agents}', data.stats.agentCount.toString())
            .replace('{members}', data.stats.memberCount.toString())}
        />
      )}

      {data?.parent && (
        <div className="mb-4 crt-panel scanlines p-4">
          <div className="flex flex-wrap items-baseline gap-4">
            <div>
              <div className="label">{t.agents.current}</div>
              <div className="mt-1 flex items-baseline gap-2 font-display text-xl text-ink-900">
                {data.parent.username}
                {data.parent.role === 'SUPER_ADMIN' && <span className="tag tag-gold">{t.shell.super}</span>}
                <span className="tag tag-acid">{t.shell.level} {data.parent.level}</span>
                <span className="tag tag-acid">{data.parent.marketType}{t.agents.marketSuffix}</span>
              </div>
            </div>
            <Stat k={t.agents.bal} v={fmt(data.parent.balance)} accent="acid" />
            <Stat k={t.agents.rebatePct} v={pct(data.parent.rebatePercentage)} accent="toxic" />
            <Stat k={t.agents.directAgents} v={data.stats.agentCount.toString()} />
            <Stat k={t.agents.directMembers} v={data.stats.memberCount.toString()} />
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t.agents.searchPlaceholder}
          className="term-input max-w-xs"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="term-input max-w-[160px]"
        >
          <option value="">{t.common.allStatus}</option>
          <option value="ACTIVE">{t.agent.status.ACTIVE}</option>
          <option value="FROZEN">{t.agent.status.FROZEN}</option>
        </select>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="btn-teal-outline text-[11px]">
          ↻ {t.common.refresh}
        </button>
      </div>

      {error && (
        <div className="mb-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">{t.common.loading}…</div>
      ) : data?.items.length === 0 ? (
        <div className="crt-panel p-8 text-center text-ink-400">{t.agents.emptyLevel}</div>
      ) : (
        <div className="crt-panel overflow-hidden">
          <div className="grid grid-cols-[80px_minmax(180px,1.3fr)_80px_100px_110px_110px_minmax(320px,auto)] border-b border-ink-200 bg-ink-100/40 px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-ink-500">
            <span>{t.agents.type}</span>
            <span>{t.agents.account}</span>
            <span className="text-right">{t.shell.level}</span>
            <span className="text-right">{t.agents.rebatePct}</span>
            <span className="text-right">{t.agents.bal}</span>
            <span className="text-center">{t.common.status}</span>
            <span className="text-right">{t.common.actions}</span>
          </div>
          {data?.items.map((row) => (
            <div
              key={`${row.kind}-${row.id}`}
              onClick={() => onRowClick(row)}
              className="grid cursor-pointer grid-cols-[80px_minmax(180px,1.3fr)_80px_100px_110px_110px_minmax(320px,auto)] items-center gap-2 border-b border-ink-100 px-4 py-3 text-[12px] transition hover:bg-[#FAF2D7]/60"
            >
              {row.kind === 'agent' ? (
                <span className="tag tag-acid">{t.agents.typeAgent}</span>
              ) : (
                <span className="tag tag-toxic">{t.agents.typeMember}</span>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-ink-900">
                  <span className="truncate">{row.username}</span>
                  {row.kind === 'agent' && row.role === 'SUPER_ADMIN' && <span className="tag tag-gold">{t.shell.super}</span>}
                </div>
                <div className="mt-0.5 flex gap-3 text-[10px] text-ink-500">
                  {row.displayName && <span>{row.displayName}</span>}
                  {row.kind === 'agent' && (
                    <>
                      <span>{t.agents.subAgents} <span className="data-num text-ink-700">{row.childCount}</span></span>
                      <span>{t.agents.membersLabel} <span className="data-num text-ink-700">{row.memberCount}</span></span>
                    </>
                  )}
                </div>
              </div>

              <span className="text-right data-num text-ink-700">
                {row.kind === 'agent' ? `L${row.level}` : '—'}
              </span>
              <span className="text-right data-num text-win">
                {row.kind === 'agent' ? pct(row.rebatePercentage) : '—'}
              </span>
              <span className="text-right data-num text-[#186073]">{fmt(row.balance)}</span>
              <span className="text-center">
                {row.status === 'FROZEN' ? (
                  <span className="tag tag-ember">{t.agent.status.FROZEN}</span>
                ) : (
                  <span className="tag tag-toxic">
                    <span className="dot-online dot-online" />
                    {t.agent.status.ACTIVE}
                  </span>
                )}
              </span>

              <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                {row.kind === 'agent' ? (
                  <>
                    <button type="button" onClick={(e) => { e.stopPropagation(); selectParent(row.id); }} className="btn-chip">
                      {t.agents.childAccounts}
                    </button>
                    <button type="button" onClick={() => navigate(`/admin/reports?parent=${row.id}`)} className="btn-chip">
                      {t.agents.reports}
                    </button>
                    <button type="button" onClick={() => navigate(`/admin/audit?targetId=${row.id}`)} className="btn-chip">
                      {t.agents.logs}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAgentTransferFor({ id: row.id, username: row.username, balance: row.balance })}
                      className="btn-chip"
                    >
                      {t.agents.pointTransfer}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRebateFor({ id: row.id, username: row.username })}
                      className="btn-chip"
                    >
                      {t.agents.rebateSetup}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBettingLimitFor({
                          targetType: 'agent',
                          id: row.id,
                          username: row.username,
                          currentLevel: row.bettingLimitLevel,
                        })
                      }
                      className="btn-chip"
                    >
                      限红
                    </button>
                    <button type="button" onClick={() => handleResetPassword(row.id, 'agent', row.username)} className="btn-chip">
                      {t.agents.resetPassword}
                    </button>
                    <StatusDropdown
                      current={row.status}
                      onChange={(next) => handleAgentStatus(row.id, next)}
                    />
                  </>
                ) : (
                  <>
                    <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/admin/members/${row.id}/bets`); }} className="btn-chip">
                      {t.agents.betRecords}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); const m = asMemberForModal(row); if (m) setTransferFor(m); }}
                      className="btn-chip"
                    >
                      {t.agents.pointTransfer}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); const m = asMemberForModal(row); if (m) setAdjustFor(m); }}
                      className="btn-chip"
                    >
                      {t.agents.adjustBalance}
                    </button>
                    <button type="button" onClick={() => handleEditNotes(row.id, row.notes)} className="btn-chip">
                      {t.agents.notesBtn}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBettingLimitFor({
                          targetType: 'member',
                          id: row.id,
                          username: row.username,
                          currentLevel: row.bettingLimitLevel,
                        });
                      }}
                      className="btn-chip"
                    >
                      限红
                    </button>
                    <button type="button" onClick={() => handleResetPassword(row.id, 'member', row.username)} className="btn-chip">
                      {t.agents.resetPassword}
                    </button>
                    <StatusDropdown
                      current={row.status === 'FROZEN' ? 'FROZEN' : 'ACTIVE'}
                      onChange={(next) => handleMemberStatus(row.id, next === 'FROZEN' ? 'FROZEN' : 'ACTIVE')}
                      memberOnly
                    />
                    <button
                      type="button"
                      onClick={() => setDeleteMemberFor({ id: row.id, username: row.username })}
                      className="btn-chip border-[#D4574A]/40 text-[#D4574A]"
                    >
                      刪除
                    </button>
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
      <CreateAgentModal
        open={openCreateAgent}
        onClose={() => setOpenCreateAgent(false)}
        onCreated={() => setReloadKey((k) => k + 1)}
        defaultParentId={currentParent}
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
      {rebateFor && (
        <RebateSettingModal
          open
          onClose={() => setRebateFor(null)}
          agentId={rebateFor.id}
          agentUsername={rebateFor.username}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}
      {bettingLimitFor && (
        <BettingLimitModal
          open
          onClose={() => setBettingLimitFor(null)}
          targetType={bettingLimitFor.targetType}
          targetId={bettingLimitFor.id}
          targetUsername={bettingLimitFor.username}
          currentLevel={bettingLimitFor.currentLevel}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}
      {agentTransferFor && (
        <AgentTransferModal
          open
          onClose={() => setAgentTransferFor(null)}
          fromAgent={agentTransferFor}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}
      {deleteMemberFor && (
        <ConfirmDeleteMemberDialog
          member={deleteMemberFor}
          onClose={() => setDeleteMemberFor(null)}
          onDone={() => {
            setDeleteMemberFor(null);
            setReloadKey((k) => k + 1);
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function ConfirmDeleteMemberDialog({
  member,
  onClose,
  onDone,
  onError,
}: {
  member: { id: string; username: string };
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const confirm = async (): Promise<void> => {
    setBusy(true);
    try {
      await adminApi.delete(`/members/${member.id}`);
      onDone();
    } catch (e) {
      onError(extractApiError(e).message);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#1A2530]/70 backdrop-blur">
      <div className="card-base w-full max-w-md p-6">
        <div className="text-[16px] font-semibold text-[#0F172A]">刪除會員</div>
        <p className="mt-2 text-[13px] text-[#4A5568]">
          確定刪除會員 <span className="font-mono text-[#D4574A]">{member.username}</span>？
          此操作會將帳號設為永久停用並保留歷史紀錄供審計。
        </p>
        <div className="mt-5 flex items-center gap-2">
          <button type="button" onClick={confirm} disabled={busy} className="btn-acid border-[#D4574A] bg-[#D4574A] text-white">
            → 確認刪除
          </button>
          <button type="button" onClick={onClose} className="btn-teal-outline">
            [取消]
          </button>
        </div>
      </div>
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const options: { value: 'ACTIVE' | 'FROZEN' | 'DELETED'; label: string; style: string }[] = memberOnly
    ? [
        { value: 'ACTIVE', label: t.agents.enable, style: 'text-win' },
        { value: 'FROZEN', label: t.agents.freezeAction, style: 'text-[#D4574A]' },
      ]
    : [
        { value: 'ACTIVE', label: t.agents.enable, style: 'text-win' },
        { value: 'FROZEN', label: t.agents.freezeAction, style: 'text-[#D4574A]' },
        { value: 'DELETED', label: t.agents.deleteAction, style: 'text-[#D4574A] font-bold' },
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
        {t.agents.statusMenu} ▾
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

function Stat({ k, v, accent }: { k: string; v: string; accent?: 'acid' | 'toxic' }) {
  const color = accent === 'acid' ? 'text-[#186073]' : accent === 'toxic' ? 'text-win' : 'text-ink-900';
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
