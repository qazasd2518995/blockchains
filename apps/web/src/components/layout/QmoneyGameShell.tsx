import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { House } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import { GAMES_REGISTRY, type GameIdType } from '@bg/shared';
import { useGameReturnTarget } from '@/hooks/useGameReturnTarget';
import { getLocalizedGameTitle } from '@/i18n/gameLabels';
import { useTranslation } from '@/i18n/useTranslation';

const MEGA_SLOT_GAME_IDS = new Set([
  'thunder-slot',
  'dragon-mega-slot',
  'nebula-slot',
  'jungle-slot',
  'vampire-slot',
]);

interface FloatingPosition {
  x: number;
  y: number;
}

interface DragState extends FloatingPosition {
  pointerId: number;
  moved: boolean;
}

function clampPosition(position: FloatingPosition): FloatingPosition {
  const buttonSize = 50;
  return {
    x: Math.max(0, Math.min(position.x, window.innerWidth - buttonSize)),
    y: Math.max(0, Math.min(position.y, window.innerHeight - buttonSize)),
  };
}

function initialFloatingPosition(): FloatingPosition {
  if (typeof window === 'undefined') return { x: 0, y: 260 };
  return clampPosition({
    x: window.innerWidth - 60,
    y: Math.max(12, (window.innerHeight - 50) / 2),
  });
}

export function QmoneyGameShell() {
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const location = useLocation();
  const returnTarget = useGameReturnTarget();
  const { locale } = useTranslation();
  const [floatingPosition, setFloatingPosition] = useState(initialFloatingPosition);

  const game = useMemo(() => {
    const id = location.pathname.replace(/^\/games\//, '').split('/')[0] ?? '';
    const registryEntry = GAMES_REGISTRY[id as GameIdType];
    return {
      id,
      title: getLocalizedGameTitle(id, locale, registryEntry?.nameZh ?? '遊戲'),
    };
  }, [locale, location.pathname]);

  const slotLayout = MEGA_SLOT_GAME_IDS.has(game.id) ? 'mega' : 'standard';

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const root = document.documentElement;
    let rafId = 0;
    const applyViewportHeight = () => {
      rafId = 0;
      const height = Math.max(1, Math.round(window.visualViewport?.height ?? window.innerHeight));
      const value = `${height}px`;
      shell.style.setProperty('--game-shell-height', value);
      root.style.setProperty('--game-shell-height', value);
    };
    const scheduleViewportHeight = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(applyViewportHeight);
    };

    applyViewportHeight();
    window.addEventListener('resize', scheduleViewportHeight);
    window.addEventListener('orientationchange', scheduleViewportHeight);
    window.visualViewport?.addEventListener('resize', scheduleViewportHeight);
    window.visualViewport?.addEventListener('scroll', scheduleViewportHeight);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleViewportHeight);
      window.removeEventListener('orientationchange', scheduleViewportHeight);
      window.visualViewport?.removeEventListener('resize', scheduleViewportHeight);
      window.visualViewport?.removeEventListener('scroll', scheduleViewportHeight);
      shell.style.removeProperty('--game-shell-height');
      root.style.removeProperty('--game-shell-height');
    };
  }, []);

  useLayoutEffect(() => {
    const previousTitle = document.title;
    const previousRootRealm = document.documentElement.dataset.platformRealm;
    const previousBodyRealm = document.body.dataset.platformRealm;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const appleTitle = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]',
    );
    const previousThemeColor = themeColor?.content;
    const previousAppleTitle = appleTitle?.content;

    document.title = `錢女友｜${game.title}`;
    document.documentElement.lang = 'zh-Hant';
    document.documentElement.dataset.platformRealm = 'qmoney';
    document.body.dataset.platformRealm = 'qmoney';
    themeColor?.setAttribute('content', '#000000');
    appleTitle?.setAttribute('content', '錢女友');

    return () => {
      document.title = previousTitle;
      if (previousRootRealm === undefined) delete document.documentElement.dataset.platformRealm;
      else document.documentElement.dataset.platformRealm = previousRootRealm;
      if (previousBodyRealm === undefined) delete document.body.dataset.platformRealm;
      else document.body.dataset.platformRealm = previousBodyRealm;
      if (previousThemeColor !== undefined) themeColor?.setAttribute('content', previousThemeColor);
      if (previousAppleTitle !== undefined) appleTitle?.setAttribute('content', previousAppleTitle);
    };
  }, [game.title]);

  useEffect(() => {
    const keepButtonInViewport = () => {
      setFloatingPosition((position) => clampPosition(position));
    };
    window.addEventListener('resize', keepButtonInViewport);
    return () => window.removeEventListener('resize', keepButtonInViewport);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLAnchorElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      moved: false,
    };
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLAnchorElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = clampPosition({ x: event.clientX - drag.x, y: event.clientY - drag.y });
    if (Math.abs(next.x - floatingPosition.x) > 3 || Math.abs(next.y - floatingPosition.y) > 3) {
      drag.moved = true;
      suppressClickRef.current = true;
    }
    setFloatingPosition(next);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLAnchorElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  return (
    <div
      ref={shellRef}
      className="game-fullscreen-shell qmoney-game-shell relative overflow-hidden bg-black text-white"
      data-game-id={game.id}
      data-slot-layout={slotLayout}
      data-platform-realm="qmoney"
    >
      <main className="qmoney-game-stage">
        <Outlet />
      </main>

      <a
        href={returnTarget.to}
        className="qmoney-game-home"
        style={{ left: floatingPosition.x, top: floatingPosition.y }}
        aria-label={`回到${returnTarget.label}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={(event) => {
          if (!suppressClickRef.current) return;
          event.preventDefault();
          suppressClickRef.current = false;
        }}
      >
        <House aria-hidden="true" />
        <span>回大廳</span>
      </a>
    </div>
  );
}
