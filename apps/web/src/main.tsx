import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Sfx } from '@bg/game-engine';
import { router } from './router';
import { AddToHomeScreenPrompt } from './components/layout/AddToHomeScreenPrompt';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { PlatformBgm } from './lib/platformBgm';
import {
  clearRuntimeRecoveryFlag,
  reloadAfterRuntimeFailure,
} from './lib/runtimeRecovery';
import {
  installSlotDebugProbe,
  probeSlotDebugBackend,
  slotDebug,
  SLOT_DEBUG_BUILD,
} from './lib/slotDebug';
import { I18nProvider } from './i18n/useTranslation';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

installSlotDebugProbe('app');
probeSlotDebugBackend();

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const preloadEvent = event as unknown as { payload?: unknown; detail?: unknown };
  slotDebug('runtime:preload-error', preloadEvent.payload ?? preloadEvent.detail, 'warn');
  reloadAfterRuntimeFailure(preloadEvent.payload ?? preloadEvent.detail);
});

window.addEventListener('unhandledrejection', (event) => {
  slotDebug('runtime:unhandled-rejection', event.reason, 'warn');
  reloadAfterRuntimeFailure(event.reason);
});

window.setTimeout(clearRuntimeRecoveryFlag, 12_000);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = `/sw.js?v=${encodeURIComponent(SLOT_DEBUG_BUILD)}`;
    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        slotDebug('sw:registered', {
          swUrl,
          scope: registration.scope,
          active: registration.active?.scriptURL ?? null,
          waiting: registration.waiting?.scriptURL ?? null,
          installing: registration.installing?.scriptURL ?? null,
        });
      })
      .catch((error) => {
        slotDebug('sw:registration-failed', error, 'warn');
        console.error('Service worker registration failed', error);
      });
  });
}

function AudioUnlocker(): null {
  React.useEffect(() => {
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown'];
    const unlock = () => {
      Sfx.unlock();
      PlatformBgm.unlockFromGesture();
      events.forEach((eventName) => window.removeEventListener(eventName, unlock));
    };
    events.forEach((eventName) => window.addEventListener(eventName, unlock, { passive: true }));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, unlock));
    };
  }, []);
  return null;
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <I18nProvider>
      <AudioUnlocker />
      <ErrorBoundary>
        <RouterProvider router={router} />
        <AddToHomeScreenPrompt />
      </ErrorBoundary>
    </I18nProvider>
  </React.StrictMode>,
);
