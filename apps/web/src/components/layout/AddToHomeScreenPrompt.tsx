import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  Download,
  Home,
  MoreHorizontal,
  Share2,
  Smartphone,
  SquarePlus,
  X,
  type LucideProps,
} from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type MobileInstallPlatform = 'ios' | 'android' | 'other';

interface InstallStep {
  icon: ComponentType<LucideProps>;
  title: string;
  text: string;
}

const SESSION_SEEN_KEY = 'bg.mobileA2hsPrompt.seen.v1';
const INSTALLED_KEY = 'bg.mobileA2hsPrompt.installed.v1';

export function AddToHomeScreenPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<MobileInstallPlatform>('other');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setStoredValue('local', INSTALLED_KEY, '1');
      setVisible(false);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  useEffect(() => {
    let timer = 0;

    const evaluate = () => {
      window.clearTimeout(timer);
      if (!shouldShowInstallPrompt()) {
        setVisible(false);
        return;
      }
      setPlatform(detectMobilePlatform());
      timer = window.setTimeout(() => setVisible(true), 650);
    };

    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const fullscreenQuery = window.matchMedia('(display-mode: fullscreen)');
    const mobileQuery = window.matchMedia('(pointer: coarse)');

    evaluate();
    standaloneQuery.addEventListener('change', evaluate);
    fullscreenQuery.addEventListener('change', evaluate);
    mobileQuery.addEventListener('change', evaluate);
    window.addEventListener('orientationchange', evaluate);
    window.addEventListener('resize', evaluate);

    return () => {
      window.clearTimeout(timer);
      standaloneQuery.removeEventListener('change', evaluate);
      fullscreenQuery.removeEventListener('change', evaluate);
      mobileQuery.removeEventListener('change', evaluate);
      window.removeEventListener('orientationchange', evaluate);
      window.removeEventListener('resize', evaluate);
    };
  }, []);

  const steps = useMemo(() => getInstallSteps(platform), [platform]);
  const canInstallDirectly = Boolean(installPrompt);

  const closeForSession = () => {
    setStoredValue('session', SESSION_SEEN_KEY, '1');
    setVisible(false);
  };

  const installDirectly = async () => {
    if (!installPrompt) {
      closeForSession();
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setStoredValue('local', INSTALLED_KEY, '1');
      } else {
        setStoredValue('session', SESSION_SEEN_KEY, '1');
      }
    } catch {
      setStoredValue('session', SESSION_SEEN_KEY, '1');
    } finally {
      setInstallPrompt(null);
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="a2hs-prompt" role="dialog" aria-modal="true" aria-labelledby="a2hs-prompt-title">
      <div className="a2hs-prompt__sheet">
        <button type="button" className="a2hs-prompt__close" onClick={closeForSession} aria-label="關閉加入主畫面提示">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="a2hs-prompt__hero">
          <div className="a2hs-prompt__icon" aria-hidden="true">
            <Smartphone className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="a2hs-prompt__eyebrow">手機遊玩建議</div>
            <h2 id="a2hs-prompt-title" className="a2hs-prompt__title">
              加到主畫面，遊戲畫面更完整
            </h2>
          </div>
        </div>

        <p className="a2hs-prompt__copy">
          從主畫面 BG 圖示開啟時，網址列、分頁列會少很多，橫向遊玩 Mega slot 會更接近全螢幕。
        </p>

        <div className="a2hs-prompt__steps">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="a2hs-prompt__step">
                <div className="a2hs-prompt__step-icon" aria-hidden="true">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="a2hs-prompt__step-title">{step.title}</div>
                  <div className="a2hs-prompt__step-text">{step.text}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="a2hs-prompt__actions">
          {canInstallDirectly ? (
            <button type="button" className="a2hs-prompt__primary" onClick={() => void installDirectly()}>
              直接安裝
            </button>
          ) : (
            <button type="button" className="a2hs-prompt__primary" onClick={closeForSession}>
              我知道了
            </button>
          )}
          <button type="button" className="a2hs-prompt__secondary" onClick={closeForSession}>
            稍後
          </button>
        </div>
      </div>
    </div>
  );
}

function getInstallSteps(platform: MobileInstallPlatform): InstallStep[] {
  if (platform === 'ios') {
    return [
      { icon: Share2, title: '點 Safari 分享', text: '點底部或上方的分享按鈕。' },
      { icon: SquarePlus, title: '加入主畫面', text: '選擇「加入主畫面」。' },
      { icon: Home, title: '從 BG 圖示開啟', text: '之後用主畫面圖示進入平台。' },
    ];
  }

  if (platform === 'android') {
    return [
      { icon: MoreHorizontal, title: '開啟瀏覽器選單', text: '點右上角選單或安裝提示。' },
      { icon: Download, title: '安裝應用程式', text: '選擇「安裝」或「加入主畫面」。' },
      { icon: Home, title: '從 BG 圖示開啟', text: '之後用主畫面圖示進入平台。' },
    ];
  }

  return [
    { icon: MoreHorizontal, title: '開啟瀏覽器選單', text: '找到分享、選單或更多設定。' },
    { icon: SquarePlus, title: '加入主畫面', text: '選擇加入主畫面或安裝。' },
    { icon: Home, title: '從 BG 圖示開啟', text: '之後用主畫面圖示進入平台。' },
  ];
}

function shouldShowInstallPrompt(): boolean {
  return (
    isLikelyMobileDevice() &&
    !isStandaloneDisplayMode() &&
    getStoredValue('local', INSTALLED_KEY) !== '1' &&
    getStoredValue('session', SESSION_SEEN_KEY) !== '1'
  );
}

function isLikelyMobileDevice(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean }; maxTouchPoints?: number };
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return (
    Boolean(nav.userAgentData?.mobile) ||
    mobileUserAgent ||
    window.matchMedia('(pointer: coarse)').matches ||
    (nav.maxTouchPoints ?? 0) > 1
  );
}

function isStandaloneDisplayMode(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true ||
    Boolean(document.fullscreenElement)
  );
}

function detectMobilePlatform(): MobileInstallPlatform {
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

function getStoredValue(type: 'local' | 'session', key: string): string | null {
  try {
    return type === 'local' ? window.localStorage.getItem(key) : window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredValue(type: 'local' | 'session', key: string, value: string): void {
  try {
    const storage = type === 'local' ? window.localStorage : window.sessionStorage;
    storage.setItem(key, value);
  } catch {
    // Private browsing may block storage writes; the prompt can still be closed with state.
  }
}
