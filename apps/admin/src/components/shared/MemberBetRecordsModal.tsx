import { useEffect, useMemo, useState } from 'react';
import { getGameMeta } from '@bg/shared';
import type { BetDetailResponse, MemberBetEntry, MemberBetListResponse } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';
import { BetResultDetailModal } from './BetResultDetailModal';

type SettlementStatus = '' | 'settled' | 'unsettled';

interface Props {
  open: boolean;
  onClose: () => void;
  member: {
    id: string;
    username: string;
  };
  filters: {
    startDate?: string;
    endDate?: string;
    gameId?: string;
    settlementStatus?: string;
  };
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const PAGE_LIMIT_OPTIONS = [25, 50, 100, 200];

export function MemberBetRecordsModal({ open, onClose, member, filters }: Props): JSX.Element {
  const [items, setItems] = useState<MemberBetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [reloadKey, setReloadKey] = useState(0);
  const [detailBetId, setDetailBetId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BetDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  const settlementStatus: SettlementStatus =
    filters.settlementStatus === 'settled' || filters.settlementStatus === 'unsettled'
      ? filters.settlementStatus
      : '';
  const startDate = filters.startDate ?? '';
  const endDate = filters.endDate ?? '';
  const gameId = filters.gameId ?? '';

  useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [endDate, gameId, member.id, open, settlementStatus, startDate]);

  const params = useMemo(() => {
    const q: Record<string, string | number> = { page, limit };
    if (startDate) q.startDate = startDate;
    if (endDate) q.endDate = endDate;
    if (gameId) q.gameId = gameId;
    if (settlementStatus) q.settlementStatus = settlementStatus;
    return q;
  }, [endDate, gameId, limit, page, settlementStatus, startDate]);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setItems([]);
      try {
        const res = await adminApi.get<MemberBetListResponse>(`/members/${member.id}/bets`, { params });
        if (cancel) return;
        setItems(res.data.items);
        setPagination(res.data.pagination ?? {
          page,
          limit,
          total: res.data.items.length,
          totalPages: res.data.items.length > 0 ? 1 : 0,
        });
      } catch (e) {
        if (!cancel) {
          setItems([]);
          setPagination({ page, limit, total: 0, totalPages: 0 });
          setError(extractApiError(e).message);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    void load();
    return () => {
      cancel = true;
    };
  }, [limit, member.id, open, page, params, reloadKey]);

  const pageRange = useMemo(() => getPageRange(pagination.page, pagination.totalPages), [pagination.page, pagination.totalPages]);
  const dateLabel = startDate || endDate ? `${startDate || '不限'} 至 ${endDate || '不限'}` : '全部日期';
  const gameLabel = gameId ? (getGameMeta(gameId)?.nameZh ?? gameId) : '全部游戏';

  const openDetail = (betId: string) => {
    setDetailBetId(betId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    adminApi
      .get<BetDetailResponse>(`/members/${member.id}/bets/${betId}`)
      .then((res) => setDetail(res.data))
      .catch((e) => setDetailError(extractApiError(e).message))
      .finally(() => setDetailLoading(false));
  };

  const closeDetail = () => {
    setDetailBetId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="会员下注记录"
        subtitle={member.username}
        width="xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
              <span className="font-semibold text-[#186073]">沿用外层报表条件</span>
              <span className="tag tag-acid">{dateLabel}</span>
              <span className="tag tag-toxic">{gameLabel}</span>
              {settlementStatus && (
                <span className="tag tag-gold">{settlementStatus === 'settled' ? '已结算' : '未结算'}</span>
              )}
              <span>
                共 <span className="data-num text-ink-900">{pagination.total.toLocaleString()}</span> 笔
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] text-ink-500">
                每页
                <select
                  value={limit}
                  onChange={(event) => {
                    setLimit(Number.parseInt(event.target.value, 10));
                    setPage(1);
                  }}
                  className="term-input max-w-[92px]"
                >
                  {PAGE_LIMIT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="btn-teal-outline text-[11px]">
                [刷新]
              </button>
            </div>
          </div>

        {error && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] px-3 py-2 text-[12px] text-[#D4574A]">
            ⚠ {error}
          </div>
        )}

        <div className="max-h-[62svh] overflow-auto border border-ink-200 bg-white">
          <table className="w-full min-w-[980px] text-[12px]">
            <thead className="sticky top-0 z-[1] bg-[#0F172A] text-[10px] uppercase tracking-[0.16em] text-white">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">单号</th>
                <th className="px-3 py-2 text-left font-semibold">投注时间</th>
                <th className="px-3 py-2 text-left font-semibold">游戏</th>
                <th className="px-3 py-2 text-right font-semibold">下注</th>
                <th className="px-3 py-2 text-right font-semibold">倍率</th>
                <th className="px-3 py-2 text-right font-semibold">派彩</th>
                <th className="px-3 py-2 text-right font-semibold">盈亏</th>
                <th className="px-3 py-2 text-right font-semibold">开奖</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-ink-500">
                    载入中…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-ink-400">
                    — 查询期间内无下注记录 —
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <BetRow key={`${item.createdAt}-${item.id}`} item={item} onOpenDetail={openDetail} />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-3">
          <div className="text-[11px] text-ink-500">
            第 <span className="data-num text-ink-900">{pagination.page}</span> /{' '}
            <span className="data-num text-ink-900">{Math.max(pagination.totalPages, 1)}</span> 页
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <PageButton disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              上一页
            </PageButton>
            {pageRange.map((pageNumber) => (
              <PageButton
                key={pageNumber}
                active={pageNumber === pagination.page}
                disabled={loading}
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </PageButton>
            ))}
            <PageButton
              disabled={loading || pagination.totalPages === 0 || page >= pagination.totalPages}
              onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
            >
              下一页
            </PageButton>
          </div>
        </div>
        </div>
      </Modal>

      <BetResultDetailModal
        open={Boolean(detailBetId)}
        detail={detail}
        error={detailError}
        loading={detailLoading}
        onClose={closeDetail}
      />
    </>
  );
}

function BetRow({ item, onOpenDetail }: { item: MemberBetEntry; onOpenDetail: (betId: string) => void }): JSX.Element {
  const profit = Number.parseFloat(item.profit);
  return (
    <tr className="border-b border-ink-100 transition hover:bg-[#FAF2D7]/50">
      <td className="px-3 py-2 font-mono text-[10px] text-ink-500">{shortId(item.id)}</td>
      <td className="px-3 py-2 data-num text-[11px] text-ink-600">{formatTime(item.createdAt)}</td>
      <td className="px-3 py-2 font-semibold text-ink-900">
        {getGameMeta(item.gameId)?.nameZh ?? item.gameId}
        <div className="font-mono text-[10px] font-normal text-ink-400">{item.gameId}</div>
      </td>
      <td className="px-3 py-2 text-right data-num">{formatAmount(item.amount)}</td>
      <td className="px-3 py-2 text-right data-num">{formatMultiplier(item.multiplier)}x</td>
      <td className="px-3 py-2 text-right data-num">{formatAmount(item.payout)}</td>
      <td className={`px-3 py-2 text-right data-num font-bold ${profit >= 0 ? 'text-win' : 'text-[#D4574A]'}`}>
        {profit >= 0 ? '+' : ''}
        {formatAmount(item.profit)}
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={() => onOpenDetail(item.id)}
          className="btn-teal-outline px-2 py-1 text-[10px]"
        >
          查看
        </button>
      </td>
    </tr>
  );
}

function PageButton({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled || active}
      onClick={onClick}
      className={`min-w-9 border px-3 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed ${
        active
          ? 'border-[#186073] bg-[#186073] text-white'
          : 'border-ink-200 bg-white text-ink-600 hover:border-[#186073] hover:text-[#186073] disabled:opacity-45'
      }`}
    >
      {children}
    </button>
  );
}

function getPageRange(page: number, totalPages: number): number[] {
  if (totalPages <= 0) return [];
  const visible = 5;
  let start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + visible - 1);
  start = Math.max(1, end - visible + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('en-GB');
}

function formatAmount(value: string): string {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMultiplier(value: string): string {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return '0.0000';
  return n.toFixed(4);
}
