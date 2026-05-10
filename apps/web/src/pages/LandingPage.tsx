import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, LogIn, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { AnnouncementTicker } from '@/components/home/AnnouncementTicker';
import { HeroBanner } from '@/components/home/HeroBanner';
import { GuestHallEntrances } from '@/components/home/GuestHallEntrances';
import { BrandMark } from '@/components/layout/BrandMark';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { useTranslation } from '@/i18n/useTranslation';

export function LandingPage() {
  const { accessToken } = useAuthStore();
  const { t } = useTranslation();
  if (accessToken) return <Navigate to="/lobby" replace />;

  return (
    <div className="relative flex min-h-[100svh] flex-col overflow-x-hidden bg-[#E9ECEF]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(24,96,115,0.18),transparent_72%)]" />

      <header className="sticky top-0 z-40 border-b border-[#162238] bg-[linear-gradient(180deg,rgba(8,15,27,0.98),rgba(15,23,42,0.96))] pt-[env(safe-area-inset-top)] text-white shadow-[0_18px_40px_rgba(2,6,23,0.34)]">
        <div className="border-b border-white/8">
          <div className="mx-auto grid w-full max-w-[1920px] gap-2 px-3 py-2 text-[11px] text-white/80 sm:px-6 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center xl:px-8 2xl:px-12">
            <div className="flex items-center gap-2">
              <span className="dot-online" />
              <span>{t.common.invitationOnly}</span>
            </div>
            <AnnouncementTicker />
            <span className="hidden whitespace-nowrap text-white/55 lg:inline">
              {t.landing.hotAllOpen}
            </span>
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
              {t.common.gameGuide}
            </Link>
            <LanguageSwitcher variant="dark" compact />
            <Link to="/login" className="btn-teal text-[13px]">
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {t.auth.authenticate}
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
                {t.landing.highlights.map((item) => (
                  <article
                    key={item.label}
                    className="rounded-[16px] border border-white/[0.65] bg-white/[0.92] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:rounded-[22px] sm:p-5"
                  >
                    <div className="label">{item.label}</div>
                    <div className="mt-3 data-num text-[30px] font-bold text-[#186073]">
                      {item.value}
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#4A5568]">{item.detail}</p>
                  </article>
                ))}
              </div>
            </div>

            <aside className="rounded-[18px] border border-white/[0.65] bg-white/[0.92] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:rounded-[28px] sm:p-6">
              <div className="label">{t.landing.inviteAccess}</div>
              <h1 className="mt-3 text-pretty text-[24px] font-bold leading-tight text-[#0F172A] sm:text-[30px]">
                {t.landing.accessTitle}
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-[#4A5568]">
                {t.landing.accessDescription}
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-[#E5E7EB] px-4 py-3 text-[13px] font-semibold text-[#0F172A] transition hover:border-[#186073]/30 hover:bg-[#F5F7FA]"
                >
                  {t.landing.alreadyMember}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>

              <div className="mt-6 rounded-[22px] bg-[#F5F7FA] p-4">
                <div className="label">{t.landing.accessFlow}</div>
                <div className="mt-4 space-y-3">
                  {t.landing.accessSteps.map((step, index) => (
                    <div key={step.title} className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#186073] text-[12px] font-bold text-white">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[#0F172A]">{step.title}</div>
                        <p className="mt-1 text-[12px] leading-relaxed text-[#4A5568]">
                          {step.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </section>

          <section className="space-y-5">
            <SectionHeading
              eyebrow={t.landing.gameFloorsEyebrow}
              title={t.landing.gameFloorsTitle}
              description={t.landing.gameFloorsDescription}
              rightSlot={
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#186073] transition hover:text-[#0E4555]"
                >
                  {t.landing.memberDirectLogin}
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
