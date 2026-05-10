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
import { MobilePageHeader } from '@/components/layout/MobilePageHeader';

const HERO_METRICS = [
  { label: '本週焦點', value: '4 檔', detail: '熱門活動同時進行' },
  { label: '最高亮點', value: '100×', detail: 'Crash 爆池觸發門檻' },
  { label: '適用範圍', value: '全館', detail: '全館熱門玩法同步覆蓋' },
];

const PROMO_CARDS = [
  {
    id: 'week',
    badge: '熱門檔期',
    title: '每週倍率王',
    summary: '週一至週日累計倍率排名，前 10 名共享獎勵池，越到週末競爭越熱。',
    image: '/promos/weekly-multiplier-king.jpg',
    accent: 'teal',
    stats: [
      { label: '統計週期', value: '週一 07:00 - 週日 06:59' },
      { label: '結算方式', value: '按最終排名派獎' },
      { label: '重點玩法', value: 'Crash / Dice / Plinko' },
    ],
  },
  {
    id: 'vip',
    badge: '等級制度',
    title: 'VIP 等級制度',
    summary: '依遊戲量自動升等，等級越高，專屬返水與活動檔期越完整，維持條件一頁看清。',
    image: '/banners/hero-welcome-dealer.png',
    accent: 'gold',
    stats: [
      { label: '升級依據', value: '近 30 日遊戲量' },
      { label: '權益內容', value: '返水 / 專屬檔期 / 身分識別' },
      { label: '適用館別', value: '經典 / Crash / 策略 / 牌桌' },
    ],
  },
  {
    id: 'jackpot',
    badge: '彩池加碼',
    title: 'Crash 彩池',
    summary: 'JetX3 全館累計，任意局觸發 100× 即爆池，彩池狀態會跟著大廳熱度持續推高。',
    image: '/promos/crash-jackpot-pool.jpg',
    accent: 'ember',
    stats: [
      { label: '觸發條件', value: '任意局達成 100×' },
      { label: '彩池來源', value: '全館即時累積' },
      { label: '推薦時段', value: '晚間高峰最熱' },
    ],
  },
  {
    id: 'friend',
    badge: '推廣活動',
    title: '邀請好友',
    summary: '好友遊戲量越穩定，回饋越高。適合已有固定玩家群的代理線一起衝活動強度。',
    image: '/games/hotline.jpg',
    accent: 'violet',
    stats: [
      { label: '計算方式', value: '依有效遊戲量回饋' },
      { label: '觀察區間', value: '每週更新一次' },
      { label: '適合對象', value: '穩定活躍代理線' },
    ],
  },
];

const WEEKLY_WINDOWS = [
  {
    title: '週一 - 週三',
    subtitle: '衝量預熱',
    description: '適合先把大廳熱度拉起來，累積倍率榜與 VIP 升級量。',
    accent: 'text-[#186073]',
    bg: 'bg-[#E7F3F6]',
  },
  {
    title: '週四 - 週五',
    subtitle: '彩池加溫',
    description: 'Crash 彩池與策略館活動開始升溫，適合集中做高倍衝刺。',
    accent: 'text-[#B94538]',
    bg: 'bg-[#FBEDEA]',
  },
  {
    title: '週末檔期',
    subtitle: '全館高峰',
    description: '倍率榜結算前競爭最激烈，活動曝光與戰報熱度都會明顯拉高。',
    accent: 'text-[#AE8B35]',
    bg: 'bg-[#FBF4DE]',
  },
];

const RULES = [
  {
    icon: ShieldCheck,
    title: '活動以遊戲日計算',
    description: '所有統計統一按台北時間早上 07:00 切日，避免結算時間認知不一致。',
  },
  {
    icon: Clock3,
    title: '檔期同步更新',
    description: '大廳與活動頁會同步展示目前檔期，熱門活動切換後不需要重新找入口。',
  },
  {
    icon: Sparkles,
    title: '視覺焦點集中',
    description: '熱門活動、彩池和 VIP 制度分開陳列，方便玩家快速判斷今晚重點。',
  },
];

export function PromosPage() {
  return (
    <>
      <div className="min-h-[100svh] bg-[#EDF4F7] pb-[calc(env(safe-area-inset-bottom)+18px)] lg:hidden">
        <MobilePageHeader title="優惠活動" subtitle="PROMOTIONS" active="promos" />

        <section className="border-b border-[#D1E0E7] bg-white">
          <div className="relative min-h-[132px] overflow-hidden bg-[#1B2030]">
            <img
              src="/banners/hero-crash-dealer.png"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover object-[72%_center] opacity-[0.82]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,18,34,0.92)_0%,rgba(5,18,34,0.72)_47%,rgba(5,18,34,0.12)_100%)]" />
            <div className="relative z-10 flex min-h-[132px] flex-col justify-center px-4 py-3">
              <span className="inline-flex w-fit items-center gap-1 rounded-[8px] bg-[#F7D568] px-2 py-1 text-[10px] font-black text-[#4B3600] shadow-sm">
                <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                本週活動看板
              </span>
              <h1 className="mt-2 max-w-[250px] text-[26px] font-black leading-tight text-white">
                熱門優惠集中看
              </h1>
              <p className="mt-1 max-w-[270px] text-[12px] font-semibold leading-5 text-white/78">
                倍率榜、Crash 彩池、VIP 等級與邀請活動，跟大廳同一套入口節奏。
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-2 px-2 py-2">
          <div className="flex h-9 items-center justify-between rounded-[10px] border border-[#D6E5EC] bg-white px-2.5 shadow-[0_6px_14px_rgba(15,23,42,0.06)]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="h-4 w-1 rounded-full bg-[#1DA6D2]" />
              <span className="truncate text-[14px] font-black text-[#12333E]">當前活動重點</span>
            </div>
            <span className="rounded-full bg-[#ECFDF5] px-2 py-1 text-[11px] font-bold text-[#15803D]">
              {PROMO_CARDS.length} 檔
            </span>
          </div>

          <div className="grid gap-2">
            {PROMO_CARDS.map((promo) => (
              <article
                key={promo.id}
                className="overflow-hidden rounded-[13px] border border-[#D6E5EC] bg-white shadow-[0_6px_14px_rgba(15,23,42,0.08)]"
              >
                <div className="relative min-h-[112px] overflow-hidden">
                  <img
                    src={promo.image}
                    alt={promo.title}
                    className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.88]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.78)_50%,rgba(255,255,255,0.2)_100%)]" />
                  <div className="relative z-10 flex min-h-[112px] flex-col justify-between p-3">
                    <div>
                      <span className="inline-flex rounded-[8px] bg-[#E9F8F8] px-2 py-1 text-[10px] font-black text-[#0E7189]">
                        {promo.badge}
                      </span>
                      <h2 className="mt-2 text-[20px] font-black leading-tight text-[#12333E]">
                        {promo.title}
                      </h2>
                    </div>
                    <p className="max-w-[260px] text-[12px] font-semibold leading-5 text-[#315967]">
                      {promo.summary}
                    </p>
                  </div>
                </div>

                <div className="grid gap-1.5 border-t border-[#E6F0F5] bg-[#F7FCFE] p-2">
                  {promo.stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="flex items-start justify-between gap-3 rounded-[9px] bg-white px-2.5 py-2"
                    >
                      <span className="shrink-0 text-[11px] font-black text-[#1D6B83]">
                        {stat.label}
                      </span>
                      <span className="min-w-0 text-right text-[12px] font-bold leading-5 text-[#12333E]">
                        {stat.value}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-2 px-2 pb-3">
          <div className="flex h-9 items-center justify-between rounded-[10px] border border-[#D6E5EC] bg-white px-2.5 shadow-[0_6px_14px_rgba(15,23,42,0.06)]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="h-4 w-1 rounded-full bg-[#F7B733]" />
              <span className="truncate text-[14px] font-black text-[#12333E]">活動節奏</span>
            </div>
            <CalendarDays className="h-4 w-4 text-[#1D6B83]" aria-hidden="true" />
          </div>
          <div className="grid gap-2">
            {WEEKLY_WINDOWS.map((item) => (
              <article
                key={item.title}
                className="rounded-[13px] border border-[#D6E5EC] bg-white p-3 shadow-[0_6px_14px_rgba(15,23,42,0.07)]"
              >
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7A8B97]">
                  {item.title}
                </div>
                <h3 className="mt-1 text-[17px] font-black text-[#12333E]">{item.subtitle}</h3>
                <p className="mt-1 text-[12px] font-semibold leading-5 text-[#516976]">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="hidden space-y-10 pb-6 lg:block">
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
                  活動優惠
                </span>
                <span className="tag tag-onDark">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  本週活動看板
                </span>
              </div>

              <h1 className="mt-5 max-w-3xl text-balance text-[34px] font-bold leading-[1.04] text-white md:text-[46px]">
                今晚先看哪一檔最熱，再決定你要把量跑去哪裡。
              </h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-8 text-white/74">
                把倍率榜、Crash 彩池、VIP 制度和推廣活動集中在同一頁。你不用到處翻入口，
                先看清楚本週檔期，再回大廳選最適合今晚節奏的玩法。
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/lobby" className="btn-teal text-[13px]">
                  直接進大廳
                </Link>
                <Link
                  to="/verify"
                  className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.05] px-4 py-2 text-[13px] font-semibold text-white/88 transition hover:border-white/24 hover:bg-white/[0.08] hover:text-white"
                >
                  查看遊戲說明
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
            title="當前活動重點"
            description="用不同主題把獎勵結構拆開。想衝排名、看彩池、做等級、跑推廣，都能先從這一頁判斷。"
          />

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {PROMO_CARDS.map((promo) => (
              <article
                key={promo.id}
                className="overflow-hidden rounded-[22px] border border-[#DCE3EA] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_52px_rgba(15,23,42,0.12)]"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img src={promo.image} alt={promo.title} className="h-full w-full object-cover" />
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
            title="活動節奏"
            description="把整週檔期拆成三個階段，玩家進入活動頁時就知道當前熱度集中在哪一段。"
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
                想把活動頁做得更有壓迫感，重點不是塞更多字，而是讓玩家一眼看懂今晚哪一檔最值得進。
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="tag tag-gold">排行熱度</span>
                <span className="tag tag-wine">高倍爆點</span>
                <span className="tag tag-acid">大廳導流</span>
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
                      <p className="mt-2 text-[13px] leading-7 text-[#4A5568]">
                        {rule.description}
                      </p>
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
                  <div className="label">熱點玩法</div>
                  <div className="mt-1 text-[18px] font-bold text-[#0F172A]">
                    Crash / Plinko / Dice
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FBF4DE] text-[#AE8B35]">
                  <Crown className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="label">等級看板</div>
                  <div className="mt-1 text-[18px] font-bold text-[#0F172A]">
                    VIP 升級條件集中展示
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FBEDEA] text-[#B94538]">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="label">活動呈現</div>
                  <div className="mt-1 text-[18px] font-bold text-[#0F172A]">
                    主視覺、檔期、規則一頁收齊
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
