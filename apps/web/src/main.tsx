import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Sfx } from '@bg/game-engine';
import { router } from './router';
import { AddToHomeScreenPrompt } from './components/layout/AddToHomeScreenPrompt';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { PlatformBgm } from './lib/platformBgm';
import { I18nProvider } from './i18n/useTranslation';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const MODULE_RELOAD_KEY = 'yachiyo:module-reload-attempted';
const MODULE_ERROR_PATTERNS = [
  'Importing a module script failed',
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Unable to preload CSS',
];

function isModuleLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error ?? '');
  return MODULE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

async function clearRuntimeCaches(): Promise<void> {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.update()));
  }
}

function reloadAfterModuleFailure(error: unknown): void {
  if (!isModuleLoadError(error)) return;
  if (sessionStorage.getItem(MODULE_RELOAD_KEY) === '1') return;
  sessionStorage.setItem(MODULE_RELOAD_KEY, '1');
  void clearRuntimeCaches().finally(() => {
    window.location.reload();
  });
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const preloadEvent = event as unknown as { payload?: unknown; detail?: unknown };
  reloadAfterModuleFailure(preloadEvent.payload ?? preloadEvent.detail);
});

window.addEventListener('unhandledrejection', (event) => {
  reloadAfterModuleFailure(event.reason);
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=20260520').catch((error) => {
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
