import { Link, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/useTranslation';
import { LocaleToggle } from '@/components/layout/LocaleToggle';

const GAMES_TICKER = [
  'DICE',
  'MINES',
  'PLINKO',
  'AVIATOR',
  'ROCKET',
  'HI-LO',
  'KENO',
  'WHEEL',
  'JETX',
  'BALLOON',
  'TOWER',
  'HOTLINE',
];

const LIVE_FEED = [
  { player: '0x7a3f…92ef', game: 'AVIATOR', multi: '2.31×', win: '+18,420' },
  { player: '0xb18c…5d01', game: 'DICE', multi: '1.98×', win: '+980' },
  { player: '0x2f1e…a74b', game: 'MINES', multi: '14.22×', win: '+142,200' },
  { player: '0x9e4d…3210', game: 'JETX', multi: '3.40×', win: '+6,800' },
  { player: '0x1a8c…f00a', game: 'PLINKO', multi: '8.50×', win: '+42,500' },
];

export function LandingPage() {
  const { accessToken } = useAuthStore();
  const { t } = useTranslation();
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(
        d.toLocaleTimeString('en-US', {
          hour12: false,
          timeZone: 'UTC',
        }) + ' UTC',
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (accessToken) return <Navigate to="/lobby" replace />;

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Crystal chandelier glow */}
      <div className="crystal-overlay" />

      {/* ===== TOP BAR ===== */}
      <div className="relative z-10 border-b border-[#E5E7EB] bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-2.5 text-[10px] uppercase tracking-[0.3em] text-[#4A5568]">
          <div className="flex items-center gap-6">
            <span className="flex items-center">
              <span className="dot-online dot-online" />
              {t.landing.systemOnline}
            </span>
            <span className="hidden md:inline font-semibold normal-case tracking-normal text-[14px] text-[#186073]">
              Établi · Monte Carlo · MMXXVI
            </span>
          </div>
          <div className="flex items-center gap-6">
            <span className="font-mono data-num text-[#186073]">{time}</span>
            <span className="hidden sm:inline">RTP 96–99%</span>
          </div>
        </div>
      </div>

      {/* ===== TICKER BANNER ===== */}
      <div className="relative z-10 overflow-hidden border-b border-[#E5E7EB] bg-[#135566] py-3">
        <div className="flex animate-ticker whitespace-nowrap font-semibold text-[13px] tracking-[0.3em] text-[#E8D48A]">
          {[...LIVE_FEED, ...LIVE_FEED, ...LIVE_FEED, ...LIVE_FEED].map((f, i) => (
            <span key={i} className="mx-10 flex items-center gap-3">
              <span className="text-[#DEBE66]/70">{f.player}</span>
              <span className="text-[#D0AC4D]">◆</span>
              <span className="italic text-white">{f.game}</span>
              <span className="text-[#DEBE66]">{f.multi}</span>
              <span className="text-win">{f.win}</span>
              <span className="text-[#C9A247]">♠</span>
            </span>
          ))}
        </div>
      </div>

      {/* ===== HEADER ===== */}
      <header className="relative z-10 mx-auto flex max-w-[1600px] items-center justify-between px-6 py-6">
        <Link to="/" className="group flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#186073] bg-gradient-to-br from-ivory-100 to-ivory-200 shadow-lift">
            <span className="font-semibold text-xl italic text-[#186073]">B</span>
            <span className="absolute -right-1 -top-1 text-[#AE8B35] text-lg">♦</span>
          </div>
          <div>
            <div className="font-semibold text-2xl leading-none text-[#0F172A]">
              Blockchain<span className="italic text-[#186073]">.</span>Game
            </div>
            <div className="mt-1 font-semibold text-xs text-[#4A5568]">{t.landing.crypto}</div>
          </div>
        </Link>
        <nav className="flex items-center gap-3">
          <LocaleToggle />
          <Link to="/login" className="btn-teal">
            → {t.common.login}
          </Link>
        </nav>
      </header>

      {/* ===== HERO ===== */}
      <section className="relative z-10 mx-auto max-w-[1600px] px-6 pb-24 pt-12">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3 text-[11px] tracking-[0.3em] text-[#4A5568]">
              <span className="tag tag-wine">
                <span className="dot-online dot-online" />
                LIVE
              </span>
              <span className="font-semibold text-base normal-case tracking-normal text-[#186073]">
                — {t.landing.deployment}
              </span>
            </div>

            <h1 className="mt-8 font-semibold text-[clamp(3.5rem,10vw,9rem)] font-black leading-[0.88] tracking-[-0.02em] text-[#0F172A]">
              <span className="block animate-reveal">{t.landing.heroLine1}</span>
              <span
                className="block animate-reveal num-grad"
                style={{ animationDelay: '0.18s' }}
              >
                {t.landing.heroLine2}
              </span>
              <span
                className="block animate-reveal italic text-[#D4574A]"
                style={{ animationDelay: '0.36s' }}
              >
                {t.landing.heroLine3}
              </span>
            </h1>

            <p className="mt-10 max-w-2xl text-[15px] leading-relaxed text-[#0F172A]">
              {t.landing.heroDesc}
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-5">
              <Link to="/login" className="btn-teal">
                {t.landing.ctaExisting}
              </Link>
              <span className="flex items-center gap-2 font-semibold text-base text-[#186073]">
                <span className="text-lg">♠</span>
                {t.landing.accessManaged}
              </span>
            </div>
          </div>

          {/* Right column: Live feed (green felt) + Stats (ivory) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="panel-felt scanlines p-6">
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-lg text-[#DEBE66]">À la Table</span>
                  <span className="text-[#C9A247] text-xs">◆</span>
                  <span className="label text-[#D0AC4D]">{t.landing.liveFeed}</span>
                </div>
                <div className="hidden !h-8 !w-8 !text-[8px]">LIVE</div>
              </div>
              <ul className="mt-5 space-y-4 text-[12px]">
                {LIVE_FEED.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between border-b border-[#186073]/20 pb-4 last:border-0 last:pb-0"
                  >
                    <div>
                      <div className="font-mono text-white">{f.player}</div>
                      <div className="mt-0.5 font-semibold text-[13px] text-[#DEBE66]">{f.game}</div>
                    </div>
                    <div className="text-right">
                      <div className="data-num text-xl text-[#E8D48A]">{f.multi}</div>
                      <div className="data-num text-[11px] text-win">{f.win}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card-base p-6">
              <div className="flex items-baseline justify-between border-b border-[#E5E7EB] pb-2">
                <span className="font-semibold text-lg text-[#186073]">Salon Ledger</span>
                <span className="label text-[#186073]">{t.landing.netStats}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat k={t.landing.netStatBets} v="184,291" />
                <Stat k={t.landing.netStatWagered} v="4.2M" tone="brass" />
                <Stat k={t.landing.netStatPayouts} v="4.08M" tone="win" />
                <Stat k={t.landing.netStatEdge} v="3.2%" tone="wine" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== GAMES MARQUEE ===== */}
      <section className="relative z-10 border-y border-[#E5E7EB] bg-gradient-to-b from-ivory-100 to-ivory-200 py-8 overflow-hidden">
        <div className="flex animate-ticker whitespace-nowrap">
          {[...GAMES_TICKER, ...GAMES_TICKER, ...GAMES_TICKER].map((g, i) => (
            <span
              key={i}
              className="mx-12 flex items-baseline gap-4 font-semibold text-6xl italic text-[#9CA3AF]"
            >
              {g}
              <span className="text-[#C9A247] text-3xl not-italic">♦</span>
            </span>
          ))}
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="relative z-10 mx-auto max-w-[1600px] px-6 py-24">
        <div className="mb-14 flex items-end gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#186073] bg-gradient-to-br from-ivory-100 to-ivory-200 shadow-lift">
            <span className="font-semibold text-4xl italic text-[#186073]">§</span>
          </div>
          <div className="flex-1 border-b border-[#E5E7EB] pb-3">
            <div className="font-semibold text-lg text-[#186073]">Chapter I</div>
            <h2 className="mt-1 font-semibold text-5xl italic text-[#0F172A]">
              {t.landing.section1}
            </h2>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Feature num="I" label={t.landing.featureLabel} title={t.landing.feat.f1Title} desc={t.landing.feat.f1Desc} suit="♠" />
          <Feature num="II" label={t.landing.featureLabel} title={t.landing.feat.f2Title} desc={t.landing.feat.f2Desc} suit="♥" />
          <Feature num="III" label={t.landing.featureLabel} title={t.landing.feat.f3Title} desc={t.landing.feat.f3Desc} suit="♦" />
          <Feature num="IV" label={t.landing.featureLabel} title={t.landing.feat.f4Title} desc={t.landing.feat.f4Desc} suit="♣" />
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 border-t border-[#E5E7EB] bg-gradient-to-b from-ivory-100 to-ivory-200 py-12">
        <div className="mx-auto max-w-[1600px] px-6">
          <div className="border-t border-[#E5E7EB] mb-8"><span>♠ ◆ ♥ ◆ ♦ ◆ ♣</span></div>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-lg text-[#186073]">Fin.</span>
              <span className="font-mono text-[11px] text-[#4A5568]">{t.landing.footer}</span>
            </div>
            <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.3em] text-[#4A5568]">
              <span>{t.landing.noReal}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({
  k,
  v,
  tone = 'ink',
}: {
  k: string;
  v: string;
  tone?: 'ink' | 'brass' | 'win' | 'wine';
}) {
  const cls =
    tone === 'brass'
      ? 'num text-[#C9A247]'
      : tone === 'win'
        ? 'num-win'
        : tone === 'wine'
          ? 'num-wine'
          : 'text-[#0F172A]';
  return (
    <div className="border border-[#186073]/30 bg-gradient-to-b from-ivory-50 to-ivory-100 p-3">
      <div className="label text-[#186073] text-[9px]">{k}</div>
      <div className={`mt-1 font-semibold text-2xl tracking-tight ${cls}`}>{v}</div>
    </div>
  );
}

function Feature({
  num,
  label,
  title,
  desc,
  suit,
}: {
  num: string;
  label: string;
  title: string;
  desc: string;
  suit: string;
}) {
  return (
    <div className="panel-felt panel-felt-hot relative p-7">
      <div className="flex items-baseline justify-between border-b border-[#E5E7EB] pb-3">
        <div className="font-semibold text-sm text-[#DEBE66]">
          {label} № {num}
        </div>
        <div className="font-semibold text-4xl leading-none italic text-[#DEBE66]">{num}</div>
      </div>
      <div className="mt-5 flex items-start gap-3">
        <span className="font-semibold text-3xl text-[#D0AC4D]">{suit}</span>
        <h3 className="font-semibold text-2xl leading-tight text-white">{title}</h3>
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-[#E8D48A]/90">{desc}</p>
    </div>
  );
}
