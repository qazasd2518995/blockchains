import { useEffect, useMemo, useState } from 'react';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { ImageBanner } from '@/components/shared/ImageBanner';
import { StatCard } from '@/components/shared/StatCard';
import { useTranslation } from '@/i18n/useTranslation';
import { getGameMeta, type AuditListResponse, type DashboardSummaryResponse } from '@bg/shared';

const EMPTY_TREND: DashboardSummaryResponse['trend'] = [];
const EMPTY_GAMES: DashboardSummaryResponse['gameBreakdown'] = [];

export function AdminDashboardPage(): JSX.Element {
  const { agent } = useAdminAuthStore();
  const { t } = useTranslation();
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [recentAudit, setRecentAudit] = useState<AuditListResponse['items']>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const [dashboard, audit] = await Promise.all([
          adminApi.get<DashboardSummaryResponse>('/reports/dashboard'),
          adminApi.get<AuditListResponse>('/audit', { params: { limit: 8 } }),
        ]);
        setSummary(dashboard.data);
        setRecentAudit(audit.data.items);
      } catch (err) {
        setError(extractApiError(err).message);
      }
    };
    void load();
  }, []);

  const totals = summary?.totals;
  const activeRate = useMemo(() => {
    if (!totals || totals.memberCount === 0) return 0;
    return Math.min(99, Math.round((totals.activeMembers7d / totals.memberCount) * 100));
  }, [totals]);

  return (
    <div>
      <PageHeader
        section="§ OPS 01"
        breadcrumb={t.nav.dashboard}
        title={t.dashboard.title}
        titleSuffix={t.dashboard.subtitle}
        description={`欢迎回来,${agent?.displayName ?? agent?.username} · ${agent?.marketType}盘`}
      />

      <ImageBanner
        image="/banners/dashboard-agent-host.png"
        eyebrow="Operations Overview"
        title="今日代理線、下注熱度與活躍會員，先在這裡看全局。"
        description="7 日投注量、派彩、遊戲分布與會員活躍集中呈現。先看哪條線最熱、哪款遊戲最會跑量，再往下處理代理與風控動作。"
        imagePosition="object-[73%_28%]"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="7日下注量"
          value={totals ? formatMoneyShort(totals.betAmount7d) : '--'}
          accent="acid"
        />
        <StatCard
          label="7日下注筆數"
          value={totals ? totals.betCount7d.toLocaleString('en-US') : '--'}
          accent="toxic"
        />
        <StatCard
          label="會員總數"
          value={totals ? totals.memberCount.toLocaleString('en-US') : '--'}
          accent="amber"
        />
        <StatCard
          label="24H活躍會員"
          value={totals ? totals.activeMembers24h.toLocaleString('en-US') : '--'}
          accent="ice"
        />
      </div>

      {error && (
        <div className="mt-6 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {error}
        </div>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,0.9fr)]">
        <section className="crt-panel overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#186073]">
                Weekly Handle
              </div>
              <h2 className="mt-2 text-[22px] font-black tracking-[0.03em] text-ink-900">
                下注量統計一週
              </h2>
            </div>
            <div className="grid min-w-[260px] grid-cols-2 gap-2 text-right text-[11px]">
              <MiniMetric label="平均注額" value={totals ? formatDec(totals.avgBetAmount7d) : '--'} />
              <MiniMetric label="7日派彩" value={totals ? formatMoneyShort(totals.payout7d) : '--'} />
            </div>
          </div>
          <BetTrendChart points={summary?.trend ?? EMPTY_TREND} />
        </section>

        <section className="crt-panel overflow-hidden">
          <div className="border-b border-ink-200 px-5 py-4">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#D4AF37]">
              Live Activity
            </div>
            <h2 className="mt-2 text-[22px] font-black tracking-[0.03em] text-ink-900">
              大廳活躍熱度
            </h2>
          </div>
          <div className="px-5 py-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="data-num text-[44px] font-black leading-none text-[#186073]">
                  {activeRate}
                  <span className="text-[18px]">%</span>
                </div>
                <div className="mt-2 text-[11px] tracking-[0.18em] text-ink-500">7日活躍率</div>
              </div>
              <div className="min-w-[130px] text-right text-[11px] text-ink-500">
                <div>活躍會員 {totals?.activeMembers7d.toLocaleString('en-US') ?? '--'}</div>
                <div className="mt-1">新增會員 {totals?.newMembers7d.toLocaleString('en-US') ?? '--'}</div>
              </div>
            </div>
            <div className="mt-5 h-3 overflow-hidden border border-[#186073]/20 bg-white">
              <div
                className="h-full bg-[linear-gradient(90deg,#186073,#6EB7C8,#D4AF37)] transition-all"
                style={{ width: `${activeRate}%` }}
              />
            </div>
            <ActiveMemberBars points={summary?.trend ?? EMPTY_TREND} />
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.35fr)]">
        <section className="crt-panel overflow-hidden">
          <div className="border-b border-ink-200 px-5 py-4">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#8B5CF6]">
              Game Mix
            </div>
            <h2 className="mt-2 text-[22px] font-black tracking-[0.03em] text-ink-900">
              熱門遊戲跑量排行
            </h2>
          </div>
          <GameBreakdownChart games={summary?.gameBreakdown ?? EMPTY_GAMES} />
        </section>

        <section className="crt-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4 text-[10px] tracking-[0.25em]">
            <span className="text-ink-500">§ {t.dashboard.recentActivity}</span>
            <span className="text-ink-600">{recentAudit.length} 条记录</span>
          </div>
          <div className="space-y-1 px-4 py-3">
            {recentAudit.length === 0 && (
              <div className="py-8 text-center text-ink-400">— 暂无动态 —</div>
            )}
            {recentAudit.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[92px_minmax(90px,130px)_1fr_auto] items-center gap-3 border-b border-ink-100 px-2 py-2 text-[11px]"
              >
                <span className="data-num text-ink-500">
                  {new Date(r.createdAt).toLocaleTimeString('en-GB')}
                </span>
                <span className="truncate font-mono text-ink-700">{r.actorUsername}</span>
                <span className="truncate font-mono tracking-[0.1em] text-[#186073]">{r.action}</span>
                <span className="text-[10px] text-ink-500">{r.ipAddress ?? ''}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <StatCard
          label="下級代理"
          value={totals ? totals.downlineAgentCount.toLocaleString('en-US') : '--'}
          accent="acid"
        />
        <StatCard
          label="7日平台淨流量"
          value={totals ? formatMoneyShort(totals.platformNet7d) : '--'}
          accent="amber"
        />
        <StatCard
          label={t.dashboard.balance}
          value={formatDec(agent?.balance ?? '0')}
          accent="ice"
        />
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="border border-ink-200 bg-white/80 px-3 py-2">
      <div className="text-[10px] tracking-[0.18em] text-ink-400">{label}</div>
      <div className="data-num mt-1 text-[15px] font-black text-ink-900">{value}</div>
    </div>
  );
}

function BetTrendChart({ points }: { points: DashboardSummaryResponse['trend'] }): JSX.Element {
  if (points.length === 0) {
    return <EmptyChart label="載入下注趨勢中" />;
  }

  const maxAmount = Math.max(1, ...points.map((point) => Number.parseFloat(point.betAmount)));
  const width = 420;
  const height = 220;
  const left = 34;
  const right = 18;
  const top = 24;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
  const coords = points.map((point, index) => {
    const amount = Number.parseFloat(point.betAmount);
    return {
      x: left + index * step,
      y: top + plotHeight - (amount / maxAmount) * plotHeight,
      point,
    };
  });
  const first = coords[0];
  const last = coords[coords.length - 1];
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const areaPath =
    first && last
      ? `${linePath} L ${last.x.toFixed(1)} ${height - bottom} L ${first.x.toFixed(1)} ${height - bottom} Z`
      : '';

  return (
    <div className="px-4 pb-5 pt-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[280px] w-full" role="img">
        <defs>
          <linearGradient id="handleArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#186073" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#186073" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="handleLine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#186073" />
            <stop offset="55%" stopColor="#6EB7C8" />
            <stop offset="100%" stopColor="#D4AF37" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => {
          const y = top + (plotHeight / 3) * line;
          return <line key={line} x1={left} x2={width - right} y1={y} y2={y} stroke="#DFE5EA" strokeWidth="1" />;
        })}
        <path d={areaPath} fill="url(#handleArea)" />
        <path d={linePath} fill="none" stroke="url(#handleLine)" strokeLinecap="round" strokeWidth="4" />
        {coords.map(({ x, y, point }) => (
          <g key={point.date}>
            <circle cx={x} cy={y} r="5" fill="#F8FBFC" stroke="#186073" strokeWidth="3" />
            <text x={x} y={height - 18} textAnchor="middle" className="fill-ink-500 text-[10px]">
              {point.label}
            </text>
          </g>
        ))}
        <text x={left} y="16" className="fill-ink-500 text-[10px]">
          {formatMoneyShort(String(maxAmount))}
        </text>
      </svg>
    </div>
  );
}

function ActiveMemberBars({ points }: { points: DashboardSummaryResponse['trend'] }): JSX.Element {
  if (points.length === 0) {
    return <div className="mt-5 h-[118px] border border-dashed border-ink-200 bg-white/60" />;
  }

  const maxActive = Math.max(1, ...points.map((point) => point.activeMembers));
  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center justify-between text-[10px] tracking-[0.18em] text-ink-500">
        <span>每日活躍會員</span>
        <span>PEAK {maxActive.toLocaleString('en-US')}</span>
      </div>
      <div className="flex h-[120px] items-end gap-2 border-b border-ink-200">
        {points.map((point) => {
          const height = Math.max(8, (point.activeMembers / maxActive) * 112);
          return (
            <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="data-num text-[10px] text-ink-500">{point.activeMembers}</div>
              <div
                className="w-full bg-[linear-gradient(180deg,#6EB7C8,#186073)]"
                style={{ height: `${height}px` }}
              />
              <div className="text-[10px] text-ink-400">{point.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GameBreakdownChart({
  games,
}: {
  games: DashboardSummaryResponse['gameBreakdown'];
}): JSX.Element {
  if (games.length === 0) {
    return <EmptyChart label="暫無遊戲跑量資料" />;
  }

  const maxAmount = Math.max(1, ...games.map((game) => Number.parseFloat(game.betAmount)));
  return (
    <div className="space-y-4 px-5 py-5">
      {games.map((game, index) => {
        const amount = Number.parseFloat(game.betAmount);
        const width = Math.max(6, (amount / maxAmount) * 100);
        return (
          <div key={game.gameId}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-black text-ink-900">
                  {index + 1}. {gameLabel(game.gameId)}
                </div>
                <div className="data-num text-[10px] text-ink-500">
                  {game.betCount.toLocaleString('en-US')} bets
                </div>
              </div>
              <div className="data-num text-right text-[13px] font-black text-[#186073]">
                {formatMoneyShort(game.betAmount)}
              </div>
            </div>
            <div className="h-3 overflow-hidden border border-ink-200 bg-white">
              <div
                className="h-full bg-[linear-gradient(90deg,#8B5CF6,#E05263,#D4AF37)]"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyChart({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex h-[280px] items-center justify-center px-5 text-[12px] tracking-[0.18em] text-ink-400">
      {label}
    </div>
  );
}

function gameLabel(gameId: string): string {
  const meta = getGameMeta(gameId);
  return meta ? `${meta.nameZh} · ${meta.name}` : gameId;
}

function formatDec(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMoneyShort(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}億`;
  if (abs >= 10_000) return `${(n / 10_000).toFixed(1)}萬`;
  return formatDec(s);
}
