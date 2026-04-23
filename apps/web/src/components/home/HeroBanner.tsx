import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Slide {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  imagePosition: string;
}

const SLIDES: Slide[] = [
  {
    id: 'welcome',
    eyebrow: 'Main Floor',
    title: '今晚主場已開，熱門遊戲直接上桌',
    subtitle: '18 款人氣玩法 · 三大主題館別 · 一進場就能開玩',
    image: '/banners/hero-welcome.png',
    imagePosition: 'object-[76%_center]',
  },
  {
    id: 'crash',
    eyebrow: 'Crash Hall',
    title: 'Crash 飛行館 · 倍率一路拉滿',
    subtitle: 'JetX / Aviator / Rocket · 看準時機一鍵收分',
    image: '/banners/hero-crash.png',
    imagePosition: 'object-[74%_center]',
  },
  {
    id: 'strategy',
    eyebrow: 'Strategy Hall',
    title: '策略電子館 · 讀局勢再放大獎',
    subtitle: 'Mines / Plinko / Tower · 拆選擇、拚高倍、越玩越上頭',
    image: '/banners/hero-strategy.png',
    imagePosition: 'object-[72%_center]',
  },
];

export function HeroBanner() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) return undefined;

    const id = window.setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 5000);
    return () => window.clearInterval(id);
  }, []);

  const slide = SLIDES[idx];
  if (!slide) return null;

  const prev = () => setIdx((i) => (i - 1 + SLIDES.length) % SLIDES.length);
  const next = () => setIdx((i) => (i + 1) % SLIDES.length);

  return (
    <section className="group relative w-full overflow-hidden rounded-[10px] border border-[#16324A]/18 shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
      <div className="absolute inset-0">
        <img
          src={slide.image}
          alt=""
          aria-hidden="true"
          className={`h-full w-full object-cover ${slide.imagePosition}`}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,11,22,0.94)_0%,rgba(5,18,34,0.88)_34%,rgba(5,18,34,0.52)_60%,rgba(5,18,34,0.22)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_48%,rgba(201,162,71,0.18),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
      </div>

      <div className="relative flex h-[320px] items-center px-8 transition-all duration-500 md:h-[407px] md:px-16 xl:h-[450px] xl:px-20 2xl:h-[500px] 2xl:px-24">
        <div className="relative z-10 max-w-[620px] xl:max-w-[720px] 2xl:max-w-[800px]">
          <span className="inline-flex items-center rounded-full border border-white/28 bg-[#071523]/72 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white shadow-[0_10px_24px_rgba(2,6,23,0.22)] backdrop-blur-md">
            {slide.eyebrow}
          </span>
          <h1 className="mt-5 text-[28px] font-bold leading-tight text-white md:text-[42px] xl:text-[48px] 2xl:text-[54px]">
            {slide.title}
          </h1>
          <p className="mt-4 max-w-[520px] text-[14px] text-white/[0.86] md:text-[18px] xl:max-w-[620px] xl:text-[20px]">
            {slide.subtitle}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="inline-flex items-center rounded-full border border-[#C9A247]/42 bg-[#1E1A12]/74 px-4 py-2 text-[12px] font-semibold text-[#F3DE8D] shadow-[0_10px_24px_rgba(2,6,23,0.24),inset_0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-md">
              即時開玩
            </span>
            <span className="inline-flex items-center rounded-full border border-white/28 bg-[#071523]/72 px-4 py-2 text-[12px] font-semibold text-white shadow-[0_10px_24px_rgba(2,6,23,0.22)] backdrop-blur-md">
              24 小時不打烊
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={prev}
        className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/[0.25] p-2 text-white opacity-0 transition hover:bg-black/[0.45] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 group-hover:opacity-100"
        aria-label="上一張"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={next}
        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/[0.25] p-2 text-white opacity-0 transition hover:bg-black/[0.45] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 group-hover:opacity-100"
        aria-label="下一張"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`slide ${i + 1}`}
            className={`h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
              i === idx ? 'w-8 bg-[#C9A247]' : 'w-2 bg-white/40 hover:bg-white/70'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
