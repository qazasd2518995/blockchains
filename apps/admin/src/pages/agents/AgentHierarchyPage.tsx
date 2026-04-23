import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { HierarchyResponse, HierarchyItem, MemberPublic } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { HierarchyBreadcrumb } from '@/components/shared/HierarchyBreadcrumb';
import { CreateMemberModal } from '@/components/shared/CreateMemberModal';
import { CreateAgentModal } from '@/components/shared/CreateAgentModal';
import { TransferModal } from '@/components/shared/TransferModal';
import { RebateSettingModal } from '@/components/shared/RebateSettingModal';
import { BettingLimitModal } from '@/components/shared/BettingLimitModal';
import { AgentTransferModal } from '@/components/shared/AgentTransferModal';
import { Modal } from '@/components/shared/Modal';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
import { useTranslation } from '@/i18n/useTranslation';

type AccountStatus = 'ACTIVE' | 'FROZEN' | 'DISABLED';

const ACCOUNT_TABLE_COLUMNS = '72px minmax(170px, 1fr) 64px 118px 112px minmax(360px, 0.95fr)';
const ACCOUNT_TABLE_GRID_STYLE = { gridTemplateColumns: ACCOUNT_TABLE_COLUMNS };

/**
 * 账号管理（混合阶层）
 *   - 呈现某 parent 的「直属代理 + 直属会员」
 *   - 点代理 row → 下钻到该代理
 *   - 点会员 row → 切到该会员下注纪录页
 *   - breadcrumb 可回到上层
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
  const [status, setStatus] = useState<'' | AccountStatus>('');
  const [reloadKey, setReloadKey] = useState(0);

  const [openCreateMember, setOpenCreateMember] = useState(false);
  const [openCreateAgent, setOpenCreateAgent] = useState(false);
  const [transferFor, setTransferFor] = useState<MemberPublic | null>(null);
  const [rebateFor, setRebateFor] = useState<{ id: string; username: string } | null>(null);
  const [bettingLimitFor, setBettingLimitFor] = useState<
    { targetType: 'agent' | 'member'; id: string; username: string; currentLevel: string } | null
  >(null);
  const [agentTransferFor, setAgentTransferFor] = useState<{ id: string; username: string; balance: string } | null>(null);
  const [notesFor, setNotesFor] = useState<{ kind: 'agent' | 'member'; id: string; username: string; notes: string | null } | null>(null);
  const [resetPasswordFor, setResetPasswordFor] = useState<{ kind: 'agent' | 'member'; id: string; username: string } | null>(null);

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

  const handleAgentStatus = async (id: string, username: string, next: AccountStatus) => {
    if (next === 'FROZEN' && !confirm(t.agents.confirmFreezeAgentTpl.replace('{name}', username))) return;
    if (next === 'DISABLED' && !confirm(t.agents.confirmDisableAgentTpl.replace('{name}', username))) return;
    try {
      await adminApi.patch(`/agents/${id}/status`, { status: next });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const handleMemberStatus = async (id: string, next: AccountStatus) => {
    if (next === 'FROZEN' && !confirm(t.agents.confirmFreezeMemberShort)) return;
    if (next === 'DISABLED' && !confirm(t.agents.confirmDisableMemberShort)) return;
    try {
      await adminApi.patch(`/members/${id}/status`, { status: next });
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
      disabledAt: row.disabledAt,
      notes: row.notes,
      lastLoginAt: null,
      createdAt: row.createdAt,
    };
  };

  const currentLayerAgent = data?.parent ?? null;
  const createTarget = currentLayerAgent
    ? {
        id: currentLayerAgent.id,
        username: currentLayerAgent.username,
        level: currentLayerAgent.level,
        marketType: currentLayerAgent.marketType,
        rebateMode: currentLayerAgent.rebateMode,
        rebatePercentage: currentLayerAgent.rebatePercentage,
        maxRebatePercentage: currentLayerAgent.maxRebatePercentage,
        bettingLimitLevel: currentLayerAgent.bettingLimitLevel,
      }
    : undefined;
  const canCreateSubAgent = currentLayerAgent ? currentLayerAgent.level < 15 : false;
  const previousCrumb = data && data.breadcrumb.length > 1
    ? data.breadcrumb[data.breadcrumb.length - 2]
    : null;

  return (
    <div>
      <PageHeader
        section="§ 后台 02"
        breadcrumb={t.agents.mixedHierarchyBreadcrumb}
        title={t.agents.title}
        titleSuffix={t.agents.mixedHierarchySuffix}
        titleSuffixColor="acid"
        description={t.agents.description}
        rightSlot={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {data && (
              <span className="rounded-full border border-white/18 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/82">
                共 {data.items.length} 个下级（{data.stats.agentCount} 代理 + {data.stats.memberCount} 会员）
              </span>
            )}
            <button
              type="button"
              disabled={!currentLayerAgent}
              onClick={() => setOpenCreateMember(true)}
              className="btn-acid text-[11px] disabled:cursor-not-allowed disabled:opacity-45"
            >
              + 新增会员
            </button>
            {canCreateSubAgent && (
              <button
                type="button"
                disabled={!currentLayerAgent}
                onClick={() => setOpenCreateAgent(true)}
                className="btn-teal-outline text-[11px] disabled:cursor-not-allowed disabled:opacity-45"
              >
                + 新增代理
              </button>
            )}
          </div>
        }
      />

      {data && (
        <HierarchyBreadcrumb
          items={data.breadcrumb}
          onSelect={selectParent}
          onBack={previousCrumb ? () => selectParent(previousCrumb.id) : undefined}
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
              </div>
            </div>
            <Stat k={t.agents.bal} v={fmt(data.parent.balance)} accent="acid" />
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
          <option value="DISABLED">{t.agent.status.DISABLED}</option>
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
        <div className="crt-panel overflow-x-auto">
          <div
            className="grid min-w-[960px] gap-2 border-b border-ink-200 bg-ink-100/40 px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-ink-500"
            style={ACCOUNT_TABLE_GRID_STYLE}
          >
            <span>{t.agents.type}</span>
            <span>{t.agents.account}</span>
            <span className="text-center">{t.shell.level}</span>
            <span className="text-right">{t.agents.bal}</span>
            <span className="text-center">{t.common.status}</span>
            <span className="text-left">{t.common.actions}</span>
          </div>
          {data?.items.map((row) => (
            <div
              key={`${row.kind}-${row.id}`}
              onClick={() => onRowClick(row)}
              className="grid min-w-[960px] cursor-pointer items-center gap-2 border-b border-ink-100 px-4 py-3 text-[12px] transition hover:bg-[#FAF2D7]/60"
              style={ACCOUNT_TABLE_GRID_STYLE}
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

              <span className="text-center data-num text-ink-700">
                {row.kind === 'agent' ? `L${row.level}` : '—'}
              </span>
              <span className="text-right data-num text-[#186073]">{fmt(row.balance)}</span>
              <span className="text-center">
                {row.status === 'DISABLED' ? (
                  <span className="tag tag-ember">{t.agent.status.DISABLED}</span>
                ) : row.status === 'FROZEN' ? (
                  <span className="tag tag-ember">{t.agent.status.FROZEN}</span>
                ) : (
                  <span className="tag tag-toxic">
                    <span className="dot-online dot-online" />
                    {t.agent.status.ACTIVE}
                  </span>
                )}
              </span>

              <div className="flex flex-wrap items-center justify-start gap-1.5" onClick={(e) => e.stopPropagation()}>
                {row.kind === 'agent' ? (
                  <>
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
                    <button
                      type="button"
                      onClick={() => setResetPasswordFor({ kind: 'agent', id: row.id, username: row.username })}
                      className="btn-chip"
                    >
                      {t.agents.resetPassword}
                    </button>
                    <StatusDropdown
                      current={row.status === 'DELETED' ? 'DISABLED' : row.status}
                      onChange={(next) => handleAgentStatus(row.id, row.username, next)}
                    />
                    <button
                      type="button"
                      onClick={() => setNotesFor({ kind: 'agent', id: row.id, username: row.username, notes: row.notes })}
                      className="btn-chip"
                    >
                      {t.agents.notesBtn}
                    </button>
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
                    <button
                      type="button"
                      onClick={() => setResetPasswordFor({ kind: 'member', id: row.id, username: row.username })}
                      className="btn-chip"
                    >
                      {t.agents.resetPassword}
                    </button>
                    <StatusDropdown
                      current={row.status}
                      onChange={(next) => handleMemberStatus(row.id, next)}
                    />
                    <button
                      type="button"
                      onClick={() => setNotesFor({ kind: 'member', id: row.id, username: row.username, notes: row.notes })}
                      className="btn-chip"
                    >
                      {t.agents.notesBtn}
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
        defaultAgentId={createTarget?.id ?? currentParent}
        lockedAgent={createTarget ? { id: createTarget.id, username: createTarget.username, level: createTarget.level } : undefined}
      />
      <CreateAgentModal
        open={openCreateAgent}
        onClose={() => setOpenCreateAgent(false)}
        onCreated={() => setReloadKey((k) => k + 1)}
        defaultParentId={createTarget?.id ?? currentParent}
        lockedParent={createTarget}
      />
      {transferFor && (
        <TransferModal
          open
          onClose={() => setTransferFor(null)}
          member={transferFor}
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
      {notesFor && (
        <NotesModal
          target={notesFor}
          onClose={() => setNotesFor(null)}
          onDone={() => {
            setNotesFor(null);
            setReloadKey((k) => k + 1);
          }}
          onError={setError}
        />
      )}
      {resetPasswordFor && (
        <ResetPasswordModal
          target={resetPasswordFor}
          onClose={() => setResetPasswordFor(null)}
          onDone={() => {
            setResetPasswordFor(null);
            setReloadKey((k) => k + 1);
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function NotesModal({
  target,
  onClose,
  onDone,
  onError,
}: {
  target: { kind: 'agent' | 'member'; id: string; username: string; notes: string | null };
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(target.notes ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      if (target.kind === 'agent') {
        await adminApi.put(`/agents/${target.id}`, { notes: notes.trim() || null });
      } else {
        await adminApi.put(`/members/${target.id}/notes`, { notes: notes.trim() || null });
      }
      onDone();
    } catch (e) {
      onError(extractApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t.agents.notesBtn}
      subtitle={`${target.kind === 'agent' ? t.agents.typeAgent : t.agents.typeMember} · ${target.username}`}
      width="md"
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <div className="label mb-2">备注内容</div>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, 500))}
            className="term-input min-h-[150px] resize-y"
            placeholder="输入内部备注，最多 500 字"
          />
          <div className="mt-2 text-right text-[10px] tracking-[0.16em] text-ink-400">
            {notes.length}/500
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-ink-200 pt-4">
          <button type="button" onClick={onClose} className="btn-teal-outline">
            {t.common.cancel}
          </button>
          <button type="submit" disabled={busy} className="btn-acid">
            {busy ? t.common.loading : t.common.save}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  target,
  onClose,
  onDone,
  onError,
}: {
  target: { kind: 'agent' | 'member'; id: string; username: string };
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
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
      const path =
        target.kind === 'agent'
          ? `/agents/${target.id}/reset-password`
          : `/members/${target.id}/reset-password`;
      await adminApi.post(path, { newPassword: password });
      onDone();
    } catch (e) {
      onError(extractApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t.agents.resetPassword}
      subtitle={`${target.kind === 'agent' ? t.agents.typeAgent : t.agents.typeMember} · ${target.username}`}
      width="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="border border-[#D4AF37]/35 bg-[#FFF8DA] px-3 py-2 text-[12px] text-ink-700">
          重设后原有登录凭证会失效，账号需要使用新密码重新登录。
        </div>
        <div>
          <div className="label mb-2">新密码</div>
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
            {t.common.cancel}
          </button>
          <button type="submit" disabled={busy} className="btn-acid">
            {busy ? t.common.loading : t.agents.resetPassword}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StatusDropdown({
  current,
  onChange,
}: {
  current: AccountStatus;
  onChange: (next: AccountStatus) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number } | null>(null);
  const options: { value: AccountStatus; label: string; style: string }[] = [
    { value: 'ACTIVE', label: t.agents.enable, style: 'text-win' },
    { value: 'FROZEN', label: t.agents.freezeAction, style: 'text-[#B45309]' },
    { value: 'DISABLED', label: t.agents.disableAction, style: 'text-[#D4574A] font-bold' },
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
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const menuWidth = 128;
      setMenuRect({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
      });
    }
    setOpen((value) => !value);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className="btn-chip"
      >
        {t.agents.statusMenu} ▾
      </button>
      {open && menuRect && createPortal(
        <>
          <div className="fixed inset-0 z-[1200]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[1201] w-32 border border-ink-200 bg-white shadow-xl"
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
