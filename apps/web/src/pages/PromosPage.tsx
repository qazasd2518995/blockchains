import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Crown,
  Flame,
  Gift,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { SectionHeading } from '@/components/layout/SectionHeading';

const HERO_METRICS = [
  { label: '本周焦点', value: '4 档', detail: '热门活动同时进行' },
  { label: '最高亮点', value: '100×', detail: 'Crash 爆池触发门槛' },
  { label: '适用范围', value: '19 款', detail: '全馆热门玩法同步覆盖' },
];

const PROMO_CARDS = [
  {
    id: 'week',
    badge: '热门档期',
    title: '每周倍率王',
    summary: '周一至周日累计倍率排名，前 10 名共享奖励池，越到周末竞争越热。',
    image: '/games/rocket.jpg',
    accent: 'teal',
    stats: [
      { label: '统计周期', value: '周一 07:00 - 周日 06:59' },
      { label: '结算方式', value: '按最终排名派奖' },
      { label: '重点玩法', value: 'Crash / Dice / Plinko' },
    ],
  },
  {
    id: 'vip',
    badge: '等级制度',
    title: 'VIP 等级制度',
    summary: '依游戏量自动升等，等级越高，专属返水与活动档期越完整，维持条件一页看清。',
    image: '/banners/hero-welcome-dealer.png',
    accent: 'gold',
    stats: [
      { label: '升级依据', value: '近 30 日游戏量' },
      { label: '权益内容', value: '返水 / 专属档期 / 身份识别' },
      { label: '适用馆别', value: '经典 / Crash / 策略 / 牌桌' },
    ],
  },
  {
    id: 'jackpot',
    badge: '彩池加码',
    title: 'Crash 彩池',
    summary: 'JetX3 全馆累计，任意局触发 100× 即爆池，彩池状态会跟着大厅热度持续推高。',
    image: '/games/jetx3.jpg',
    accent: 'ember',
    stats: [
      { label: '触发条件', value: '任意局达成 100×' },
      { label: '彩池来源', value: '全馆实时累积' },
      { label: '推荐时段', value: '晚间高峰最热' },
    ],
  },
  {
    id: 'friend',
    badge: '推广活动',
    title: '邀请好友',
    summary: '好友游戏量越稳定，回馈越高。适合已有固定玩家群的代理线一起冲活动强度。',
    image: '/games/hotline.jpg',
    accent: 'violet',
    stats: [
      { label: '计算方式', value: '依有效游戏量回馈' },
      { label: '观察区间', value: '每周更新一次' },
      { label: '适合对象', value: '稳定活跃代理线' },
    ],
  },
];

const WEEKLY_WINDOWS = [
  {
    title: '周一 - 周三',
    subtitle: '冲量预热',
    description: '适合先把大厅热度拉起来，累积倍率榜与 VIP 升级量。',
    accent: 'text-[#186073]',
    bg: 'bg-[#E7F3F6]',
  },
  {
    title: '周四 - 周五',
    subtitle: '彩池加温',
    description: 'Crash 彩池与策略馆活动开始升温，适合集中做高倍冲刺。',
    accent: 'text-[#B94538]',
    bg: 'bg-[#FBEDEA]',
  },
  {
    title: '周末档期',
    subtitle: '全馆高峰',
    description: '倍率榜结算前竞争最激烈，活动曝光与战报热度都会明显拉高。',
    accent: 'text-[#AE8B35]',
    bg: 'bg-[#FBF4DE]',
  },
];

const RULES = [
  {
    icon: ShieldCheck,
    title: '活动以游戏日计算',
    description: '所有统计统一按台北时间早上 07:00 切日，避免结算时间认知不一致。',
  },
  {
    icon: Clock3,
    title: '档期同步更新',
    description: '大厅与活动页会同步展示当前档期，热门活动切换后不需要重新找入口。',
  },
  {
    icon: Sparkles,
    title: '视觉焦点集中',
    description: '热门活动、彩池和 VIP 制度分开陈列，方便玩家快速判断今晚重点。',
  },
];

export function PromosPage() {
  return (
    <div className="space-y-10 pb-6">
      <section className="relative overflow-hidden rounded-[28px] border border-[#162238] bg-[#0D1728] shadow-[0_24px_60px_rgba(2,6,23,0.28)]">
        <img
          src="/banners/hero-crash-dealer.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-[center_28%] opacity-30"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,15,27,0.92)_0%,rgba(10,20,34,0.84)_42%,rgba(14,69,85,0.28)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(232,212,138,0.16),transparent_32%)]" />

        <div className="relative grid gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1.2fr)_420px] lg:px-8 lg:py-10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="tag tag-goldOnDark">
                <Gift className="h-4 w-4" aria-hidden="true" />
                活动优惠
              </span>
              <span className="tag tag-onDark">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                本周活动看板
              </span>
            </div>

            <h1 className="mt-5 max-w-3xl text-balance text-[34px] font-bold leading-[1.04] text-white md:text-[46px]">
              今晚先看哪一档最热，再决定你要把量跑去哪里。
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-8 text-white/74">
              把倍率榜、Crash 彩池、VIP 制度和推广活动集中在同一页。你不用到处翻入口，
              先看清楚本周档期，再回大厅选最适合今晚节奏的玩法。
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/lobby" className="btn-teal text-[13px]">
                直接进大厅
              </Link>
              <Link
                to="/verify"
                className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.05] px-4 py-2 text-[13px] font-semibold text-white/88 transition hover:border-white/24 hover:bg-white/[0.08] hover:text-white"
              >
                查看游戏说明
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {HERO_METRICS.map((item) => (
              <article
                key={item.label}
                className="rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09)_0%,rgba(255,255,255,0.04)_100%)] px-4 py-4 backdrop-blur"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/52">
                  {item.label}
                </div>
                <div className="mt-3 data-num text-[30px] font-black text-[#E8D48A]">
                  {item.value}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-white/72">{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading
          eyebrow="Campaign Board"
          title="当前活动重点"
          description="用不同主题把奖励结构拆开。想冲排名、看彩池、做等级、跑推广，都能先从这一页判断。"
        />

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PROMO_CARDS.map((promo) => (
            <article
              key={promo.id}
              className="overflow-hidden rounded-[22px] border border-[#DCE3EA] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_52px_rgba(15,23,42,0.12)]"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <img
                  src={promo.image}
                  alt={promo.title}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,15,28,0.08)_0%,rgba(10,15,28,0.72)_100%)]" />
                <div className="absolute left-4 top-4">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-white ${
                      promo.accent === 'teal'
                        ? 'bg-[#186073]'
                        : promo.accent === 'ember'
                          ? 'bg-[#B94538]'
                          : promo.accent === 'gold'
                            ? 'bg-[#AE8B35]'
                            : 'bg-[#6E56CF]'
                    }`}
                  >
                    {promo.badge}
                  </span>
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <h3 className="text-[24px] font-bold text-white">{promo.title}</h3>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <p className="text-[13px] leading-7 text-[#4A5568]">{promo.summary}</p>

                <div className="space-y-2">
                  {promo.stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="flex items-start justify-between gap-3 border-b border-[#EEF2F6] pb-2 last:border-0 last:pb-0"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
                        {stat.label}
                      </span>
                      <span className="text-right text-[12px] font-semibold text-[#0F172A]">
                        {stat.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading
          eyebrow="Weekly Rhythm"
          title="活动节奏"
          description="把整周档期拆成三个阶段，玩家进入活动页时就知道当前热度集中在哪一段。"
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4 md:grid-cols-3">
            {WEEKLY_WINDOWS.map((item) => (
              <article
                key={item.title}
                className={`rounded-[20px] border border-[#E5E7EB] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${item.bg}`}
              >
                <div className="label">{item.title}</div>
                <h3 className={`mt-3 text-[22px] font-bold ${item.accent}`}>{item.subtitle}</h3>
                <p className="mt-3 text-[13px] leading-7 text-[#4A5568]">{item.description}</p>
              </article>
            ))}
          </div>

          <div className="rounded-[22px] border border-[#D8C081] bg-[linear-gradient(135deg,#F9E7A8_0%,#E8D48A_100%)] px-5 py-5 text-[#5A471A] shadow-[0_18px_40px_rgba(174,139,53,0.18)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/60">
                <Trophy className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A5E1C]">
                  Focus Tonight
                </div>
                <div className="mt-1 text-[24px] font-black">倍率榜 + Crash 彩池</div>
              </div>
            </div>
            <p className="mt-4 text-[13px] leading-7 text-[#6A5320]">
              想把活动页做得更有压迫感，重点不是塞更多字，而是让玩家一眼看懂今晚哪一档最值得进。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="tag tag-gold">排行热度</span>
              <span className="tag tag-wine">高倍爆点</span>
              <span className="tag tag-acid">大厅导流</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {RULES.map((rule) => {
            const Icon = rule.icon;
            return (
              <article
                key={rule.title}
                className="rounded-[20px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E7F3F6] text-[#186073]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[17px] font-bold text-[#0F172A]">{rule.title}</h3>
                    <p className="mt-2 text-[13px] leading-7 text-[#4A5568]">{rule.description}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[20px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E7F3F6] text-[#186073]">
                <Flame className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="label">热点玩法</div>
                <div className="mt-1 text-[18px] font-bold text-[#0F172A]">Crash / Plinko / Dice</div>
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FBF4DE] text-[#AE8B35]">
                <Crown className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="label">等级看板</div>
                <div className="mt-1 text-[18px] font-bold text-[#0F172A]">VIP 升级条件集中展示</div>
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FBEDEA] text-[#B94538]">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="label">活动呈现</div>
                <div className="mt-1 text-[18px] font-bold text-[#0F172A]">主视觉、档期、规则一页收齐</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
