import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Sfx } from '@bg/game-engine';
import { router } from './router';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { PlatformBgm } from './lib/platformBgm';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

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
    <AudioUnlocker />
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </React.StrictMode>,
);
