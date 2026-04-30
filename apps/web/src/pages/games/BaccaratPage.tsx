import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import type { UserPublic } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { getBaccaratVariant, type BaccaratVariantId } from '@/lib/baccaratVariants';
import {
  buildBaccaratLaunchUrl,
  ensureBaccaratResourceHints,
  resolveApiBase,
  resolveBaccaratUrl,
} from '@/lib/baccaratWarmup';
import { useAuthStore } from '@/stores/authStore';

interface LauncherDiagnostics {
  currentUser: string;
  currentRole: string;
  serverUser: string;
  serverRole: string;
  apiBase: string;
  baccaratUrl: string;
  gameId: string;
  provider: string;
  skin: string;
  statusCode: string;
  errorCode: string;
  rawMessage: string;
}

interface BaccaratPageProps {
  variant?: BaccaratVariantId;
}

export function BaccaratPage({ variant = 'royal' }: BaccaratPageProps) {
  const user = useAuthStore((s) => s.user);
  const config = getBaccaratVariant(variant);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState(`正在建立${config.title}進場憑證...`);
  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<LauncherDiagnostics | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const baccaratUrl = useMemo(() => resolveBaccaratUrl(), []);
  const apiBase = useMemo(() => resolveApiBase(), []);
  const bgLobbyUrl = useMemo(() => new URL('/lobby', window.location.origin).toString(), []);

  useEffect(() => {
    ensureBaccaratResourceHints(baccaratUrl);
  }, [baccaratUrl]);

  useEffect(() => {
    let cancelled = false;

    async function launch() {
      try {
        setStatus('loading');
        setMessage(`正在建立${config.title}進場憑證...`);
        setDiagnostics(null);
        setLaunchUrl(null);

        const res = await api.post<{ launchToken: string }>('/auth/baccarat-launch', {
          gameId: config.gameId,
          provider: config.provider,
          skin: config.skin,
        });
        if (cancelled) return;

        setLaunchUrl(
          buildBaccaratLaunchUrl({
            baccaratUrl,
            launchToken: res.data.launchToken,
            config,
            returnUrl: bgLobbyUrl,
          }),
        );
        setMessage(`正在交接${config.title}遊戲大廳...`);
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
          gameId: config.gameId,
          provider: config.provider,
          skin: config.skin,
          statusCode: String(axiosError.response?.status ?? 'n/a'),
          errorCode: apiError.code ?? 'INTERNAL',
          rawMessage: axiosError.response?.data?.message ?? apiError.message ?? '未知錯誤',
        };

        console.error('[baccarat-launch] failed', nextDiagnostics, error);

        setStatus('error');
        setMessage(apiError.message || `無法進入${config.title}`);
        setDiagnostics(nextDiagnostics);
      }
    }

    void launch();
    return () => {
      cancelled = true;
    };
  }, [apiBase, baccaratUrl, bgLobbyUrl, config.gameId, config.provider, config.skin, config.title, iframeKey, user?.role, user?.username]);

  const handleReload = () => {
    setIframeKey((k) => k + 1);
  };

  const showLoadingCover = status === 'loading';

  return (
    <main className="fixed inset-0 z-[9999] overflow-hidden text-white" style={{ backgroundColor: config.screenBg }}>
      {status === 'ready' && launchUrl ? (
        <iframe
          key={iframeKey}
          title={`BG ${config.englishTitle}`}
          src={launchUrl}
          className="absolute inset-0 h-full w-full border-0"
          style={{ backgroundColor: config.screenBg }}
          allow="autoplay; clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="eager"
        />
      ) : null}

      {showLoadingCover ? (
        <section className="absolute inset-0 z-10 overflow-hidden" style={{ backgroundColor: config.screenBg }}>
          <img
            src={config.background}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-[62%_center] opacity-70"
            style={{ objectPosition: config.backgroundPosition }}
          />
          <div className={`absolute inset-0 ${config.overlayClassName}`} />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_28%,rgba(232,212,138,0.20),transparent_30%)]" />

          <div className="relative z-10 flex min-h-[100svh] items-center px-6 py-8 sm:px-10 lg:px-16">
            <div className="max-w-[520px]">
              <div className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] ${config.badgeClassName}`}>
                {config.eyebrow}
              </div>
              <h1 className="mt-5 text-[38px] font-black leading-tight sm:text-[54px]">
                {config.loadingTitle}
              </h1>
              <p className="mt-4 max-w-[420px] text-[15px] leading-7 text-white/72">
                {config.description}
              </p>

              <div className={`mt-7 inline-flex items-center gap-3 rounded-[18px] border px-4 py-3 text-[14px] text-white/88 backdrop-blur ${config.panelClassName}`}>
                <Loader2 className={`h-4 w-4 animate-spin ${config.spinnerClassName}`} aria-hidden="true" />
                <span>{message}</span>
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                <Link
                  to="/lobby"
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold backdrop-blur transition ${config.actionClassName}`}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  返回大廳
                </Link>
                <button
                  type="button"
                  onClick={handleReload}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold backdrop-blur transition ${config.actionClassName}`}
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
                <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#186073]">Launcher Error</div>
                <div className="mt-3 grid gap-2 font-mono text-[12px]">
                  <div>currentUser: {diagnostics.currentUser}</div>
                  <div>currentRole: {diagnostics.currentRole}</div>
                  <div>serverUser: {diagnostics.serverUser}</div>
                  <div>serverRole: {diagnostics.serverRole}</div>
                  <div>gameId: {diagnostics.gameId}</div>
                  <div>provider: {diagnostics.provider}</div>
                  <div>skin: {diagnostics.skin}</div>
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
