import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getGameMeta } from '@bg/shared';
import type { BetDetailResponse, MemberPublic, MemberBetListResponse, MemberBetEntry } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { useTranslation } from '@/i18n/useTranslation';
import { BetResultDetailModal } from '@/components/shared/BetResultDetailModal';

export function MemberBetRecordsPage(): JSX.Element {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const [member, setMember] = useState<MemberPublic | null>(null);
  const [items, setItems] = useState<MemberBetEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [gameFilter, setGameFilter] = useState('');
  const [detailBetId, setDetailBetId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BetDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setItems([]);
      setNextCursor(null);
      try {
        const [mRes, bRes] = await Promise.all([
          adminApi.get<MemberPublic>(`/members/${id}`),
          adminApi.get<MemberBetListResponse>(`/members/${id}/bets`, { params: buildParams(gameFilter) }),
        ]);
        if (!cancel) {
          setMember(mRes.data);
          setItems(bRes.data.items);
          setNextCursor(bRes.data.nextCursor);
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
  }, [id, gameFilter]);

  const loadMore = async () => {
    if (!id || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await adminApi.get<MemberBetListResponse>(`/members/${id}/bets`, {
        params: buildParams(gameFilter, nextCursor),
      });
      setItems((current) => [...current, ...res.data.items]);
      setNextCursor(res.data.nextCursor);
    } catch (e) {
      setError(extractApiError(e).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const openDetail = (betId: string) => {
    if (!id) return;
    setDetailBetId(betId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    adminApi
      .get<BetDetailResponse>(`/members/${id}/bets/${betId}`)
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

  const columns: Column<MemberBetEntry>[] = [
    {
      key: 'time',
      label: t.bets.time,
      render: (r) => (
        <span className="data-num text-[10px] text-ink-500">
          {new Date(r.createdAt).toLocaleString('en-GB')}
        </span>
      ),
    },
    {
      key: 'game',
      label: t.bets.game,
      render: (r) => (
        <span className="font-mono text-ink-900">
          {getGameMeta(r.gameId)?.nameZh ?? r.gameId}
        </span>
      ),
    },
    { key: 'amt', label: t.bets.amount, align: 'right', render: (r) => <span className="data-num">{fmt(r.amount)}</span> },
    { key: 'mult', label: t.bets.multiplier, align: 'right', render: (r) => <span className="data-num">{r.multiplier}x</span> },
    { key: 'payout', label: t.bets.payout, align: 'right', render: (r) => <span className="data-num">{fmt(r.payout)}</span> },
    {
      key: 'profit',
      label: t.bets.profit,
      align: 'right',
      render: (r) => {
        const n = Number.parseFloat(r.profit);
        return (
          <span className={`data-num ${n >= 0 ? 'text-win' : 'text-[#D4574A]'}`}>
            {n >= 0 ? '+' : ''}
            {fmt(r.profit)}
          </span>
        );
      },
    },
    {
      key: 'detail',
      label: '开奖',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openDetail(r.id);
          }}
          className="btn-teal-outline px-2 py-1 text-[10px]"
        >
          查看
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        section="§ 后台 03"
        breadcrumb={`${t.members.title} / ${member?.username ?? id} / ${t.members.bets}`}
        title={t.members.bets}
        titleSuffix={member?.username ?? ''}
        titleSuffixColor="acid"
        rightSlot={
          <Link to="/admin/accounts" className="btn-teal-outline text-[11px]">
            [← {t.common.back}]
          </Link>
        }
      />

      <div className="admin-mobile-stack mb-4 flex items-center gap-3">
        <input
          type="text"
          value={gameFilter}
          onChange={(e) => setGameFilter(e.target.value)}
          placeholder="按游戏 ID 过滤（例如 dice）"
          className="term-input max-w-xs"
        />
      </div>

      {error && (
        <div className="mb-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {error.toUpperCase()}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">{t.common.loading}…</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(r) => `${r.createdAt}-${r.id}`}
            empty={t.bets.empty}
          />
          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="btn-teal-outline text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? `${t.common.loading}…` : '加载更多'}
              </button>
            </div>
          )}
        </>
      )}

      <BetResultDetailModal
        open={Boolean(detailBetId)}
        detail={detail}
        error={detailError}
        loading={detailLoading}
        onClose={closeDetail}
      />
    </div>
  );
}

function buildParams(gameFilter: string, cursor?: string): Record<string, string | number> {
  const params: Record<string, string | number> = { limit: 50 };
  if (gameFilter) params.gameId = gameFilter;
  if (cursor) params.cursor = cursor;
  return params;
}

function fmt(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
