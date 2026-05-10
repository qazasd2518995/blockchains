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
import type { Dict } from '@/i18n/types';
import { useTranslation } from '@/i18n/useTranslation';

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
  const { t } = useTranslation();
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

  const steps = useMemo(() => getInstallSteps(platform, t.install), [platform, t.install]);
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
    <div
      className="a2hs-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby="a2hs-prompt-title"
    >
      <div className="a2hs-prompt__sheet">
        <button
          type="button"
          className="a2hs-prompt__close"
          onClick={closeForSession}
          aria-label={t.install.closePrompt}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="a2hs-prompt__hero">
          <div className="a2hs-prompt__icon" aria-hidden="true">
            <Smartphone className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="a2hs-prompt__eyebrow">{t.install.eyebrow}</div>
            <h2 id="a2hs-prompt-title" className="a2hs-prompt__title">
              {t.install.title}
            </h2>
          </div>
        </div>

        <p className="a2hs-prompt__copy">{t.install.copy}</p>

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
            <button
              type="button"
              className="a2hs-prompt__primary"
              onClick={() => void installDirectly()}
            >
              {t.install.directInstall}
            </button>
          ) : (
            <button type="button" className="a2hs-prompt__primary" onClick={closeForSession}>
              {t.install.gotIt}
            </button>
          )}
          <button type="button" className="a2hs-prompt__secondary" onClick={closeForSession}>
            {t.install.later}
          </button>
        </div>
      </div>
    </div>
  );
}

function getInstallSteps(platform: MobileInstallPlatform, labels: Dict['install']): InstallStep[] {
  if (platform === 'ios') {
    return [
      createInstallStep(Share2, labels.iosSteps[0]),
      createInstallStep(SquarePlus, labels.iosSteps[1]),
      createInstallStep(Home, labels.iosSteps[2]),
    ];
  }

  if (platform === 'android') {
    return [
      createInstallStep(MoreHorizontal, labels.androidSteps[0]),
      createInstallStep(Download, labels.androidSteps[1]),
      createInstallStep(Home, labels.androidSteps[2]),
    ];
  }

  return [
    createInstallStep(MoreHorizontal, labels.otherSteps[0]),
    createInstallStep(SquarePlus, labels.otherSteps[1]),
    createInstallStep(Home, labels.otherSteps[2]),
  ];
}

function createInstallStep(
  icon: ComponentType<LucideProps>,
  labels: { title: string; text: string } | undefined,
): InstallStep {
  return {
    icon,
    title: labels?.title ?? '',
    text: labels?.text ?? '',
  };
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
  const nav = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
    maxTouchPoints?: number;
  };
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
  if (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1)
  )
    return 'ios';
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
