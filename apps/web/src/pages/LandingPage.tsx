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
    <div className="relative min-h-screen">
      <div className="relative z-10 border-b border-white/5 bg-ink-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-2 text-[10px] uppercase tracking-[0.25em] text-ink-400">
          <div className="flex items-center gap-6">
            <span>
              <span className="status-dot status-dot-live" />
              {t.landing.systemOnline}
            </span>
            <span className="hidden md:inline">NODE 03 / OREGON-US</span>
            <span className="hidden lg:inline">{t.landing.lastBlock} 2,384,921</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="data-num text-neon-acid">{time}</span>
            <span className="hidden sm:inline">RTP 96–99%</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 overflow-hidden border-b border-white/5 bg-ink-900/40 py-2">
        <div className="flex animate-ticker whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-300">
          {[...LIVE_FEED, ...LIVE_FEED, ...LIVE_FEED, ...LIVE_FEED].map((f, i) => (
            <span key={i} className="mx-8 flex items-center gap-3">
              <span className="text-ink-500">{f.player}</span>
              <span className="text-ink-400">▸</span>
              <span className="text-bone">{f.game}</span>
              <span className="text-neon-acid">{f.multi}</span>
              <span className="text-neon-toxic">{f.win}</span>
              <span className="text-ink-600">◈</span>
            </span>
          ))}
        </div>
      </div>

      <header className="relative z-10 mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5">
        <Link to="/" className="group flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center border border-neon-acid bg-neon-acid/10 text-neon-acid shadow-acid-glow">
            <span className="font-display text-lg">BG</span>
          </div>
          <div>
            <div className="font-display text-xl leading-none tracking-widest text-bone">
              BLOCKCHAIN<span className="text-neon-acid">.</span>GAME
            </div>
            <div className="label mt-1 text-[9px]">{t.landing.crypto}</div>
          </div>
        </Link>
        <nav className="flex items-center gap-3">
          <LocaleToggle />
          <Link to="/login" className="btn-ghost">
            [{t.common.login.toUpperCase()}]
          </Link>
          <Link to="/register" className="btn-acid">
            → {t.common.register.toUpperCase()}
          </Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto max-w-[1600px] px-6 pb-20 pt-10">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="flex items-center gap-3 text-[11px] tracking-[0.3em] text-ink-400">
              <span className="tag tag-acid">
                <span className="status-dot status-dot-live" />
                LIVE
              </span>
              <span>{t.landing.deployment}</span>
            </div>

            <h1 className="mt-6 font-serif text-[clamp(3rem,9vw,8rem)] font-black leading-[0.88] tracking-[-0.04em]">
              <span className="block animate-reveal text-bone">{t.landing.heroLine1}</span>
              <span
                className="block animate-reveal text-neon-acid"
                style={{ animationDelay: '0.15s' }}
              >
                {t.landing.heroLine2}
              </span>
              <span
                className="block animate-reveal italic text-bone"
                style={{ animationDelay: '0.3s' }}
              >
                {t.landing.heroLine3}
              </span>
            </h1>

            <p className="mt-8 max-w-xl font-mono text-sm leading-relaxed text-ink-300">
              {t.landing.heroDesc}
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link to="/register" className="btn-acid">
                {t.landing.ctaGet}
              </Link>
              <Link to="/login" className="btn-ghost">
                {t.landing.ctaExisting}
              </Link>
              <span className="text-[10px] uppercase tracking-[0.3em] text-ink-500">
                {t.landing.freeNoDeposit}
              </span>
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="crt-panel scanlines p-5">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="label">{t.landing.liveFeed}</div>
                <div className="tag tag-toxic text-[10px]">
                  <span className="status-dot status-dot-live" />
                  {t.common.syncing.toUpperCase()}
                </div>
              </div>
              <ul className="mt-4 space-y-3 text-[12px]">
                {LIVE_FEED.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <div className="text-bone">{f.player}</div>
                      <div className="text-[10px] tracking-[0.25em] text-ink-500">{f.game}</div>
                    </div>
                    <div className="text-right">
                      <div className="data-num text-neon-acid">{f.multi}</div>
                      <div className="data-num text-[11px] text-neon-toxic">{f.win}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 crt-panel p-5">
              <div className="label">{t.landing.netStats}</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Stat k="BETS" v="184,291" />
                <Stat k="WAGERED" v="4.2M" />
                <Stat k="PAYOUTS" v="4.08M" />
                <Stat k="EDGE" v="3.2%" accent="ember" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-y border-white/5 bg-ink-900/30 py-6">
        <div className="flex animate-ticker whitespace-nowrap">
          {[...GAMES_TICKER, ...GAMES_TICKER, ...GAMES_TICKER].map((g, i) => (
            <span
              key={i}
              className="mx-10 font-display text-5xl tracking-[0.1em] text-ink-700"
            >
              {g} <span className="text-neon-acid">◆</span>
            </span>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-[1600px] px-6 py-20">
        <div className="mb-12 flex items-center gap-6">
          <div className="label">§ 01</div>
          <h2 className="font-serif text-4xl italic text-bone">{t.landing.section1}</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Feature num="01" title={t.landing.feat.f1Title} desc={t.landing.feat.f1Desc} accent="acid" />
          <Feature num="02" title={t.landing.feat.f2Title} desc={t.landing.feat.f2Desc} accent="toxic" />
          <Feature num="03" title={t.landing.feat.f3Title} desc={t.landing.feat.f3Desc} accent="ember" />
          <Feature num="04" title={t.landing.feat.f4Title} desc={t.landing.feat.f4Desc} accent="ice" />
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/5 bg-ink-950/60 py-10">
        <div className="mx-auto max-w-[1600px] px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <span className="label">// EOF</span>
              <span className="text-[11px] text-ink-500">{t.landing.footer}</span>
            </div>
            <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.3em] text-ink-500">
              <span>{t.landing.noReal}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: string; accent?: 'ember' }) {
  return (
    <div className="border border-white/5 bg-ink-950/50 p-3">
      <div className="text-[9px] tracking-[0.25em] text-ink-500">{k}</div>
      <div
        className={`mt-1 font-display text-2xl tracking-tight ${
          accent === 'ember' ? 'text-neon-ember' : 'text-bone'
        }`}
      >
        {v}
      </div>
    </div>
  );
}

function Feature({
  num,
  title,
  desc,
  accent,
}: {
  num: string;
  title: string;
  desc: string;
  accent: 'acid' | 'ember' | 'toxic' | 'ice';
}) {
  const colors = {
    acid: 'text-neon-acid border-neon-acid/30 hover:border-neon-acid',
    ember: 'text-neon-ember border-neon-ember/30 hover:border-neon-ember',
    toxic: 'text-neon-toxic border-neon-toxic/30 hover:border-neon-toxic',
    ice: 'text-neon-ice border-neon-ice/30 hover:border-neon-ice',
  }[accent];

  return (
    <div className={`crt-panel-hot p-6 ${colors}`}>
      <div className="flex items-baseline justify-between border-b border-white/5 pb-3">
        <div className="label">FEATURE_{num}</div>
        <div className={`font-display text-4xl leading-none`}>{num}</div>
      </div>
      <h3 className="mt-4 font-serif text-2xl font-bold text-bone">{title}</h3>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-300">{desc}</p>
    </div>
  );
}
