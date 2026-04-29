import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, LogIn, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { AnnouncementTicker } from '@/components/home/AnnouncementTicker';
import { HeroBanner } from '@/components/home/HeroBanner';
import { GuestHallEntrances } from '@/components/home/GuestHallEntrances';
import { BrandMark } from '@/components/layout/BrandMark';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SectionHeading } from '@/components/layout/SectionHeading';

const LANDING_HIGHLIGHTS = [
  { value: '19', label: '人氣玩法', detail: 'Crash、策略、經典與牌桌玩法一次排開' },
  { value: '4', label: '主題館別', detail: '快節奏、衝高倍、玩策略，或直接坐上牌桌，今晚都好選' },
  { value: '24/7', label: '全天候開放', detail: '任何時段都能登入挑桌、追熱門戰報' },
];

const ACCESS_STEPS = [
  { title: '代理開通', detail: '會員帳號由代理邀請建立，開通後就能直接準備進場。' },
  { title: '登入平台', detail: '拿到帳號後直接登入，熱門館別和遊戲一眼就到。' },
  { title: '挑館開玩', detail: '想衝倍數、拚節奏或玩策略，照心情直接切館。' },
];

export function LandingPage() {
  const { accessToken } = useAuthStore();
  if (accessToken) return <Navigate to="/lobby" replace />;

  return (
    <div className="relative flex min-h-[100svh] flex-col overflow-x-hidden bg-[#E9ECEF]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(24,96,115,0.18),transparent_72%)]" />

      <header className="sticky top-0 z-40 border-b border-[#162238] bg-[linear-gradient(180deg,rgba(8,15,27,0.98),rgba(15,23,42,0.96))] pt-[env(safe-area-inset-top)] text-white shadow-[0_18px_40px_rgba(2,6,23,0.34)]">
        <div className="border-b border-white/8">
          <div className="mx-auto grid w-full max-w-[1920px] gap-2 px-3 py-2 text-[11px] text-white/80 sm:px-6 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center xl:px-8 2xl:px-12">
            <div className="flex items-center gap-2">
              <span className="dot-online" />
              <span>會員制平台 · 邀請開通</span>
            </div>
            <AnnouncementTicker />
            <span className="hidden whitespace-nowrap text-white/55 lg:inline">28 款熱門玩法今晚全開</span>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3 px-3 py-3 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between xl:px-8 2xl:px-12">
          <BrandMark to="/" tone="dark" subtitle="Premium Gaming · Invite Only" />

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Link
              to="/verify"
              className="btn-chip border-white/12 bg-[#162338] text-white/84 hover:border-white/24 hover:bg-[#1A2A41] hover:text-white"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              遊戲說明
            </Link>
            <Link to="/login" className="btn-teal text-[13px]">
              <LogIn className="h-4 w-4" aria-hidden="true" />
              會員登入
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <div className="mx-auto w-full max-w-[1920px] space-y-6 px-3 py-4 sm:space-y-8 sm:px-6 sm:py-6 xl:px-8 2xl:px-12">
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_320px]">
            <div className="space-y-6">
              <HeroBanner />

              <div className="grid gap-4 md:grid-cols-3">
                {LANDING_HIGHLIGHTS.map((item) => (
                  <article
                    key={item.label}
                    className="rounded-[16px] border border-white/[0.65] bg-white/[0.92] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:rounded-[22px] sm:p-5"
                  >
                    <div className="label">{item.label}</div>
                    <div className="mt-3 data-num text-[30px] font-bold text-[#186073]">{item.value}</div>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#4A5568]">{item.detail}</p>
                  </article>
                ))}
              </div>
            </div>

            <aside className="rounded-[18px] border border-white/[0.65] bg-white/[0.92] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:rounded-[28px] sm:p-6">
              <div className="label">Invite Access</div>
              <h1 className="mt-3 text-pretty text-[24px] font-bold leading-tight text-[#0F172A] sm:text-[30px]">
                會員開通後，今晚就能直接進場
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-[#4A5568]">
                會員帳號採邀請制開通。登入後就能進館挑桌、追熱門戰報，找到今晚最順手的玩法。
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-[#E5E7EB] px-4 py-3 text-[13px] font-semibold text-[#0F172A] transition hover:border-[#186073]/30 hover:bg-[#F5F7FA]"
                >
                  已有會員帳號
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>

              <div className="mt-6 rounded-[22px] bg-[#F5F7FA] p-4">
                <div className="label">Access Flow</div>
                <div className="mt-4 space-y-3">
                  {ACCESS_STEPS.map((step, index) => (
                    <div key={step.title} className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#186073] text-[12px] font-bold text-white">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[#0F172A]">{step.title}</div>
                        <p className="mt-1 text-[12px] leading-relaxed text-[#4A5568]">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </section>

          <section className="space-y-5">
            <SectionHeading
              eyebrow="Game Floors"
              title="六大主題館，照你今天的手感進場"
              description="飛行、棋牌牌桌、拉霸、輪盤、即開電子、策略挑戰都已分好館別；想玩哪種節奏，直接進對應主場。"
              rightSlot={
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#186073] transition hover:text-[#0E4555]"
                >
                  已有會員，直接登入
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              }
            />
            <GuestHallEntrances showHeading={false} />
          </section>

        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
