import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { canAccessLocalTableBeta } from '@bg/shared';
import { ResponsiveImage } from '@/lib/optimizedImages';
import { useTranslation } from '@/i18n/useTranslation';
import { useAuthStore } from '@/stores/authStore';

interface Slide {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  imagePosition: string;
}

export function HeroBanner() {
  const { t } = useTranslation();
  const username = useAuthStore((state) => state.user?.username ?? null);
  const canSeeLocalTables = canAccessLocalTableBeta(username);
  const [idx, setIdx] = useState(0);
  const slides: Slide[] = useMemo(
    () => [
      {
        id: 'welcome',
        eyebrow: t.hero.welcomeEyebrow,
        title: t.hero.welcomeTitle,
        subtitle: t.hero.welcomeSubtitle,
        image: '/banners/hero-welcome-dealer.png',
        imagePosition: 'object-[74%_center]',
      },
      {
        id: 'crash',
        eyebrow: t.hero.crashEyebrow,
        title: t.hero.crashTitle,
        subtitle: t.hero.crashSubtitle,
        image: '/banners/hero-crash-dealer.png',
        imagePosition: 'object-[72%_center]',
      },
      {
        id: 'strategy',
        eyebrow: t.hero.strategyEyebrow,
        title: t.hero.strategyTitle,
        subtitle: t.hero.strategySubtitle,
        image: '/banners/hero-strategy-dealer.png',
        imagePosition: 'object-[72%_center]',
      },
      ...(canSeeLocalTables
        ? [
            {
              id: 'tables',
              eyebrow: t.hero.tablesEyebrow,
              title: t.hero.tablesTitle,
              subtitle: t.hero.tablesSubtitle,
              image: '/halls/tables-card.png',
              imagePosition: 'object-[78%_center]',
            },
          ]
        : []),
    ],
    [canSeeLocalTables, t.hero],
  );

  useEffect(() => {
    if (idx >= slides.length) setIdx(0);
  }, [idx, slides.length]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) return undefined;

    const id = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 5000);
    return () => window.clearInterval(id);
  }, [slides.length]);

  const slide = slides[idx];
  if (!slide) return null;

  const prev = () => setIdx((i) => (i - 1 + slides.length) % slides.length);
  const next = () => setIdx((i) => (i + 1) % slides.length);

  return (
    <section className="group relative w-full overflow-hidden rounded-[10px] border border-[#16324A]/18 shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
      <div className="absolute inset-0">
        <ResponsiveImage
          src={slide.image}
          alt=""
          aria-hidden="true"
          preset="hero"
          sizes="100vw"
          className={`h-full w-full object-cover ${slide.imagePosition}`}
          loading={idx === 0 ? 'eager' : 'lazy'}
          fetchPriority={idx === 0 ? 'high' : 'auto'}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,11,22,0.94)_0%,rgba(5,18,34,0.88)_34%,rgba(5,18,34,0.52)_60%,rgba(5,18,34,0.22)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_48%,rgba(201,162,71,0.18),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
      </div>

      <div className="relative flex h-[300px] items-center px-4 transition-all duration-500 sm:h-[320px] sm:px-8 md:h-[407px] md:px-16 xl:h-[450px] xl:px-20 2xl:h-[500px] 2xl:px-24">
        <div className="relative z-10 max-w-[620px] xl:max-w-[720px] 2xl:max-w-[800px]">
          <span className="inline-flex items-center rounded-full border border-white/28 bg-[#071523]/72 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_10px_24px_rgba(2,6,23,0.22)] backdrop-blur-md sm:tracking-[0.3em]">
            {slide.eyebrow}
          </span>
          <h1 className="mt-5 text-[25px] font-bold leading-tight text-white sm:text-[28px] md:text-[42px] xl:text-[48px] 2xl:text-[54px]">
            {slide.title}
          </h1>
          <p className="mt-4 max-w-[520px] text-[14px] text-white/[0.86] md:text-[18px] xl:max-w-[620px] xl:text-[20px]">
            {slide.subtitle}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="inline-flex items-center rounded-full border border-[#C9A247]/42 bg-[#1E1A12]/74 px-4 py-2 text-[12px] font-semibold text-[#F3DE8D] shadow-[0_10px_24px_rgba(2,6,23,0.24),inset_0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-md">
              {t.hero.playNow}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/28 bg-[#071523]/72 px-4 py-2 text-[12px] font-semibold text-white shadow-[0_10px_24px_rgba(2,6,23,0.22)] backdrop-blur-md">
              {t.hero.open247}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={prev}
        className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/[0.25] text-white opacity-100 transition hover:bg-black/[0.45] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:left-4 md:opacity-0 md:group-hover:opacity-100"
        aria-label={t.hero.previous}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={next}
        className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/[0.25] text-white opacity-100 transition hover:bg-black/[0.45] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:right-4 md:opacity-0 md:group-hover:opacity-100"
        aria-label={t.hero.next}
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`slide ${i + 1}`}
            className="group grid h-11 w-11 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span
              aria-hidden="true"
              className={`h-2 rounded-full transition-all ${
                i === idx ? 'w-8 bg-[#C9A247]' : 'w-2 bg-white/40 group-hover:bg-white/70'
              }`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
