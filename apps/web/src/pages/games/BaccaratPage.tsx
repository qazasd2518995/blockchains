import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import type { UserPublic } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const FALLBACK_BACCARAT_URL = 'http://localhost:5174';

interface LauncherDiagnostics {
  currentUser: string;
  currentRole: string;
  serverUser: string;
  serverRole: string;
  apiBase: string;
  baccaratUrl: string;
  statusCode: string;
  errorCode: string;
  rawMessage: string;
}

export function BaccaratPage() {
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('正在建立百家樂進場憑證...');
  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<LauncherDiagnostics | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [frameLoaded, setFrameLoaded] = useState(false);

  const baccaratUrl = useMemo(() => {
    const raw = (import.meta.env.VITE_BACCARAT_URL as string | undefined)?.trim();
    return raw && /^https?:\/\//i.test(raw) ? raw : FALLBACK_BACCARAT_URL;
  }, []);
  const apiBase = useMemo(
    () => (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || window.location.origin,
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function launch() {
      try {
        setStatus('loading');
        setMessage('正在建立百家樂進場憑證...');
        setDiagnostics(null);
        setLaunchUrl(null);
        setFrameLoaded(false);

        const res = await api.post<{ launchToken: string }>('/auth/baccarat-launch');
        if (cancelled) return;

        const target = new URL('/login', baccaratUrl);
        target.searchParams.set('launchToken', res.data.launchToken);
        setLaunchUrl(target.toString());
        setMessage('正在載入百家樂遊戲大廳...');
        setStatus('ready');
      } catch (error) {
        if (cancelled) return;
        const apiError = extractApiError(error);
        let serverUser = '未知';
        let serverRole = '未知';
        try {
          const me = await api.get<UserPublic>('/auth/me');
          serverUser = me.data.username;
          serverRole = me.data.role;
        } catch {
          // ignore follow-up diagnostics failure
        }

        const axiosError = error as {
          response?: { status?: number; data?: { code?: string; message?: string } };
        };
        const nextDiagnostics: LauncherDiagnostics = {
          currentUser: user?.username ?? '未登入',
          currentRole: user?.role ?? '未知',
          serverUser,
          serverRole,
          apiBase,
          baccaratUrl,
          statusCode: String(axiosError.response?.status ?? 'n/a'),
          errorCode: apiError.code ?? 'INTERNAL',
          rawMessage: axiosError.response?.data?.message ?? apiError.message ?? '未知錯誤',
        };

        console.error('[baccarat-launch] failed', nextDiagnostics, error);

        setStatus('error');
        setMessage(apiError.message || '無法進入百家樂');
        setDiagnostics(nextDiagnostics);
      }
    }

    void launch();
    return () => {
      cancelled = true;
    };
  }, [apiBase, baccaratUrl, iframeKey, user?.role, user?.username]);

  const handleReload = () => {
    setFrameLoaded(false);
    setIframeKey((k) => k + 1);
  };

  const showLoadingCover = status === 'loading' || (status === 'ready' && launchUrl && !frameLoaded);

  return (
    <main className="fixed inset-0 z-[9999] overflow-hidden bg-[#050A13] text-white">
      {status === 'ready' && launchUrl ? (
        <iframe
          key={iframeKey}
          title="BG Baccarat"
          src={launchUrl}
          onLoad={() => setFrameLoaded(true)}
          className="absolute inset-0 h-full w-full border-0 bg-[#050A13]"
          allow="autoplay; clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : null}

      {showLoadingCover ? (
        <section className="absolute inset-0 z-10 overflow-hidden bg-[#060B14]">
          <img
            src="/banners/hero-welcome-dealer.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-[62%_center] opacity-70"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,8,18,0.94)_0%,rgba(3,8,18,0.74)_44%,rgba(3,8,18,0.28)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_28%,rgba(232,212,138,0.22),transparent_30%)]" />

          <div className="relative z-10 flex min-h-[100svh] items-center px-6 py-8 sm:px-10 lg:px-16">
            <div className="max-w-[520px]">
              <div className="inline-flex items-center rounded-full border border-[#E8D48A]/35 bg-[#E8D48A]/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#E8D48A]">
                Baccarat Hall
              </div>
              <h1 className="mt-5 text-[38px] font-black leading-tight sm:text-[54px]">
                進入遊戲中
              </h1>
              <p className="mt-4 max-w-[420px] text-[15px] leading-7 text-white/72">
                正在連接真人百家樂大廳，載入完成後將自動切換到全螢幕遊戲畫面。
              </p>

              <div className="mt-7 inline-flex items-center gap-3 rounded-[18px] border border-white/12 bg-white/[0.08] px-4 py-3 text-[14px] text-white/88 backdrop-blur">
                <Loader2 className="h-4 w-4 animate-spin text-[#E8D48A]" aria-hidden="true" />
                <span>{message}</span>
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                <Link
                  to="/lobby"
                  className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-black/25 px-4 py-2 text-[13px] font-semibold text-white/82 backdrop-blur transition hover:border-white/28 hover:bg-black/35 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  返回大廳
                </Link>
                <button
                  type="button"
                  onClick={handleReload}
                  className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-black/25 px-4 py-2 text-[13px] font-semibold text-white/82 backdrop-blur transition hover:border-white/28 hover:bg-black/35 hover:text-white"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  重新載入
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {status === 'error' ? (
        <section className="absolute inset-0 z-20 overflow-auto bg-[#060B14] px-4 py-8 sm:px-6">
          <div className="mx-auto max-w-3xl rounded-[24px] border border-[#E6C9C3]/35 bg-white/[0.94] p-6 text-[#0F172A] shadow-[0_24px_60px_rgba(0,0,0,0.36)]">
            <div className="rounded-[18px] border border-[#F3D3CF] bg-[#FFF7F6] px-4 py-4 text-[14px] text-[#9F3A2C]">
              {message}
            </div>

            {diagnostics ? (
              <div className="mt-4 rounded-[18px] border border-[#D9E3EA] bg-[#F8FAFB] px-4 py-4 text-[13px] text-[#334155]">
                <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#186073]">Launcher Debug</div>
                <div className="mt-3 grid gap-2 font-mono text-[12px]">
                  <div>currentUser: {diagnostics.currentUser}</div>
                  <div>currentRole: {diagnostics.currentRole}</div>
                  <div>serverUser: {diagnostics.serverUser}</div>
                  <div>serverRole: {diagnostics.serverRole}</div>
                  <div>statusCode: {diagnostics.statusCode}</div>
                  <div>errorCode: {diagnostics.errorCode}</div>
                  <div>rawMessage: {diagnostics.rawMessage}</div>
                  <div>apiBase: {diagnostics.apiBase}</div>
                  <div>baccaratUrl: {diagnostics.baccaratUrl}</div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={handleReload} className="btn-teal">
                再試一次
              </button>
              <Link to="/lobby" className="btn-teal-outline">
                返回大廳
              </Link>
              <a href={baccaratUrl} target="_blank" rel="noreferrer" className="btn-teal-outline">
                直接打開百家樂
                <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
