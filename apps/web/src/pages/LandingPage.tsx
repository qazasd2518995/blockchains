import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, LogIn, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { AnnouncementTicker } from '@/components/home/AnnouncementTicker';
import { WinTicker } from '@/components/home/WinTicker';
import { HeroBanner } from '@/components/home/HeroBanner';
import { GuestHallEntrances } from '@/components/home/GuestHallEntrances';
import { FeaturesStrip } from '@/components/home/FeaturesStrip';
import { PartnerLogos } from '@/components/home/PartnerLogos';
import { FloatingSupport } from '@/components/layout/FloatingSupport';
import { BrandMark } from '@/components/layout/BrandMark';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SectionHeading } from '@/components/layout/SectionHeading';

const LANDING_HIGHLIGHTS = [
  { value: '18', label: '精選遊戲', detail: 'Crash、策略、經典玩法一次到位' },
  { value: '3', label: '遊戲館別', detail: '依節奏切分，不再把所有遊戲塞成一頁' },
  { value: '100%', label: '瀏覽器驗證', detail: 'Server Seed、Client Seed、Nonce 都能重算' },
];

const ACCESS_STEPS = [
  { title: '聯絡客服', detail: '先走 LINE 或 Telegram，由客服確認代理來源。' },
  { title: '開通會員', detail: '後台建立帳號後，再用會員帳密進入平台。' },
  { title: '進站驗證', detail: '登入後可直接查看遊戲記錄與公平驗證工具。' },
];

export function LandingPage() {
  const { accessToken } = useAuthStore();
  if (accessToken) return <Navigate to="/lobby" replace />;

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#E9ECEF]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(24,96,115,0.18),transparent_72%)]" />

      <header className="sticky top-0 z-40 border-b border-[#162238] bg-[linear-gradient(180deg,rgba(8,15,27,0.98),rgba(15,23,42,0.96))] text-white shadow-[0_18px_40px_rgba(2,6,23,0.34)]">
        <div className="border-b border-white/8">
          <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center justify-between gap-3 px-4 py-2 text-[11px] text-white/80 sm:px-6 xl:px-8 2xl:px-12">
            <div className="flex items-center gap-2">
              <span className="dot-online" />
              <span>演示點數平台 · 邀請開通</span>
            </div>
            <div className="flex items-center gap-4">
              <a href="https://line.me/ti/p/~@aaa1788" target="_blank" rel="noreferrer" className="transition hover:text-white" translate="no">
                LINE
              </a>
              <a href="https://t.me/aaawin1788_bot" target="_blank" rel="noreferrer" className="transition hover:text-white" translate="no">
                Telegram
              </a>
            </div>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between xl:px-8 2xl:px-12">
          <BrandMark to="/" tone="dark" subtitle="Provably Fair · Invite Only" />

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/verify"
              className="btn-chip border-white/12 bg-[#162338] text-white/84 hover:border-white/24 hover:bg-[#1A2A41] hover:text-white"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              公平驗證
            </Link>
            <Link to="/login" className="btn-teal text-[13px]">
              <LogIn className="h-4 w-4" aria-hidden="true" />
              會員登入
            </Link>
          </div>
        </div>
      </header>

      <AnnouncementTicker />
      <WinTicker />

      <main className="relative z-10 flex-1">
        <div className="mx-auto w-full max-w-[1920px] space-y-8 px-4 py-6 sm:px-6 xl:px-8 2xl:px-12">
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_320px]">
            <div className="space-y-6">
              <HeroBanner />

              <div className="grid gap-4 md:grid-cols-3">
                {LANDING_HIGHLIGHTS.map((item) => (
                  <article
                    key={item.label}
                    className="rounded-[22px] border border-white/[0.65] bg-white/[0.92] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur"
                  >
                    <div className="label">{item.label}</div>
                    <div className="mt-3 data-num text-[30px] font-bold text-[#186073]">{item.value}</div>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#4A5568]">{item.detail}</p>
                  </article>
                ))}
              </div>
            </div>

            <aside className="rounded-[28px] border border-white/[0.65] bg-white/[0.92] p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="label">Invite Access</div>
              <h1 className="mt-3 text-pretty text-[30px] font-bold leading-tight text-[#0F172A]">
                代理邀請制，先聯絡客服再開通
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-[#4A5568]">
                公開註冊目前關閉。玩家需要先由客服或代理開通帳號，再登入大廳、查看遊戲記錄與公平驗證。
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <a
                  href="https://line.me/ti/p/~@aaa1788"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-teal w-full justify-center text-[14px]"
                  translate="no"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  聯絡 LINE 客服
                </a>
                <a
                  href="https://t.me/aaawin1788_bot"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-chip w-full justify-center border-[#0F172A]/10 bg-[#0F172A] text-white hover:border-[#0F172A] hover:bg-[#1A2530]"
                  translate="no"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  聯絡 Telegram 客服
                </a>
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
              title="三大遊戲館，先看節奏再進場"
              description="Crash 館主打倍率拉升，經典館適合短局高頻，策略館則偏向拆解與取捨。首頁先把路徑分乾淨，再進去看單一遊戲。"
              rightSlot={
                <Link
                  to="/verify"
                  className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#186073] transition hover:text-[#0E4555]"
                >
                  查看公平驗證
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              }
            />
            <GuestHallEntrances showHeading={false} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <SectionHeading
                eyebrow="Platform Rhythm"
                title="同一套前端語言，覆蓋首頁到遊戲前台"
                description="這一輪先收斂入口頁與主殼層的版型、配色與互動節奏，避免大廳、驗證、客服和 CTA 各說各話。"
              />
              <FeaturesStrip />
              <PartnerLogos />
            </div>

            <aside className="rounded-[28px] bg-[#0F172A] p-6 text-white shadow-[0_18px_38px_rgba(15,23,42,0.24)]">
              <div className="label !text-white/[0.55]">Why BG</div>
              <h2 className="mt-3 text-pretty text-[24px] font-bold leading-tight">
                結果先能驗，再談輸贏。
              </h2>
              <p className="mt-3 text-[13px] leading-relaxed text-white/[0.75]">
                平台把公平驗證做成獨立頁面，讓玩家不用呼叫 API，就能用公開 seed 與 nonce 在瀏覽器內重算結果。
              </p>
              <Link
                to="/verify"
                className="btn-chip mt-6 border-white/15 bg-white/[0.05] text-white hover:border-white/30 hover:bg-white/[0.1]"
              >
                打開驗證工具
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </aside>
          </section>
        </div>
      </main>

      <SiteFooter />
      <FloatingSupport />
    </div>
  );
}
