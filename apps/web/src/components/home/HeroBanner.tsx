import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getHeroIcon } from '@/lib/platformIcons';

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  gradient: string;
  icon: LucideIcon;
}

const SLIDES: Slide[] = [
  {
    id: 'welcome',
    title: '全新改版 · 电子游戏殿堂',
    subtitle: '18 款精选游戏 · 公平可验证 · 即时派彩',
    gradient: 'linear-gradient(135deg, #051E2B 0%, #186073 60%, #C9A247 100%)',
    icon: getHeroIcon('welcome'),
  },
  {
    id: 'crash',
    title: 'Crash 飞行馆 · 倍率无上限',
    subtitle: 'JetX / Aviator / Rocket · 敢飞敢收',
    gradient: 'linear-gradient(135deg, #1A2530 0%, #135566 50%, #D4574A 100%)',
    icon: getHeroIcon('crash'),
  },
  {
    id: 'fair',
    title: 'Provably Fair · 每局可验',
    subtitle: 'HMAC-SHA256 算法 · 结果不可篡改',
    gradient: 'linear-gradient(135deg, #093040 0%, #186073 55%, #E8D48A 100%)',
    icon: getHeroIcon('fair'),
  },
  {
    id: 'strategy',
    title: '策略电子馆 · 拆弹解谜',
    subtitle: 'Mines / Plinko / Tower · 策略取胜',
    gradient: 'linear-gradient(135deg, #0E4555 0%, #266F85 50%, #09B826 100%)',
    icon: getHeroIcon('strategy'),
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
  const Icon = slide.icon;

  const prev = () => setIdx((i) => (i - 1 + SLIDES.length) % SLIDES.length);
  const next = () => setIdx((i) => (i + 1) % SLIDES.length);

  return (
    <section className="group relative w-full overflow-hidden rounded-[10px] shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
      <div
        className="relative flex h-[320px] items-center px-12 transition-all duration-500 md:h-[407px] md:px-20 xl:h-[450px] 2xl:h-[500px] 2xl:px-24"
        style={{ background: slide.gradient }}
      >
        <div className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 md:block xl:right-14 2xl:right-20">
          <div className="relative flex h-[220px] w-[220px] items-center justify-center rounded-full border border-white/20 bg-white/[0.08] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] xl:h-[260px] xl:w-[260px] 2xl:h-[300px] 2xl:w-[300px]">
            <div className="absolute inset-[18px] rounded-full border border-white/15" />
            <div className="absolute inset-[42px] rounded-full border border-white/10" />
            <Icon className="h-24 w-24 text-white/80 xl:h-28 xl:w-28 2xl:h-32 2xl:w-32" aria-hidden="true" strokeWidth={1.5} />
          </div>
        </div>
        <div className="relative z-10 max-w-[640px] xl:max-w-[760px] 2xl:max-w-[840px]">
          <h1 className="text-[28px] font-bold leading-tight text-white md:text-[42px] xl:text-[48px] 2xl:text-[54px]">
            {slide.title}
          </h1>
          <p className="mt-4 text-[14px] text-white/[0.85] md:text-[18px] xl:text-[20px]">
            {slide.subtitle}
          </p>
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
