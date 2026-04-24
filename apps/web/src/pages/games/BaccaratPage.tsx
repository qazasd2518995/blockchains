import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, History, LayoutGrid, Loader2, RefreshCw } from 'lucide-react';
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

        const res = await api.post<{ launchToken: string }>('/auth/baccarat-launch');
        if (cancelled) return;

        const target = new URL('/login', baccaratUrl);
        target.searchParams.set('launchToken', res.data.launchToken);
        setLaunchUrl(target.toString());
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

  return (
    <div className="-mx-4 space-y-4 sm:-mx-6 xl:-mx-8 2xl:-mx-12">
      <section className="overflow-hidden border-y border-[#162238] bg-[linear-gradient(180deg,rgba(8,15,27,0.98),rgba(15,23,42,0.96))] text-white shadow-[0_18px_40px_rgba(2,6,23,0.16)]">
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-4 px-4 py-4 sm:px-6 xl:px-8 2xl:px-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="label !text-white/45">Table Hall</div>
            <h1 className="mt-2 text-[30px] font-bold text-white">百家樂</h1>
            <p className="mt-2 max-w-[720px] text-[14px] leading-relaxed text-white/72">
              百家樂會直接內嵌在 BG 站內，外層保留大廳導覽、遊戲記錄與餘額列，切回其他電子遊戲不用重新登入。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/lobby"
              className="btn-chip border-white/12 bg-[#162338] text-white/82 hover:border-white/24 hover:bg-[#1A2A41] hover:text-white"
            >
              <LayoutGrid className="h-4 w-4" />
              大廳
            </Link>
            <Link
              to="/history"
              className="btn-chip border-white/12 bg-[#162338] text-white/82 hover:border-white/24 hover:bg-[#1A2A41] hover:text-white"
            >
              <History className="h-4 w-4" />
              遊戲記錄
            </Link>
            <button
              type="button"
              onClick={() => setIframeKey((k) => k + 1)}
              className="btn-chip border-white/12 bg-[#162338] text-white/82 hover:border-white/24 hover:bg-[#1A2A41] hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              重新載入百家樂
            </button>
            {launchUrl ? (
              <a
                href={launchUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-teal text-[13px]"
              >
                新視窗開啟
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1920px] px-4 pb-2 sm:px-6 xl:px-8 2xl:px-12">
        {status === 'loading' ? (
          <div className="flex min-h-[72vh] items-center justify-center rounded-[22px] border border-[#D9E3EA] bg-white/[0.94] px-6 py-8 shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-3 rounded-[18px] border border-[#D9E3EA] bg-[#F8FAFB] px-4 py-4 text-[14px] text-[#186073]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>{message}</span>
            </div>
          </div>
        ) : status === 'ready' && launchUrl ? (
          <div className="overflow-hidden rounded-[22px] border border-[#162238] bg-[#0B1220] shadow-[0_22px_48px_rgba(2,6,23,0.18)]">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3 text-[12px] text-white/65">
              <span className="label !text-white/45">Embedded Baccarat</span>
              <span className="font-mono text-[11px] text-white/45">{user?.username ?? 'guest'}</span>
            </div>
            <iframe
              key={iframeKey}
              title="BG Baccarat"
              src={launchUrl}
              className="h-[calc(100vh-220px)] min-h-[820px] w-full bg-[#0B1220]"
              allow="autoplay; clipboard-read; clipboard-write; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : (
          <div className="space-y-4 rounded-[22px] border border-[#E6C9C3] bg-white/[0.94] p-6 shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
            <div className="rounded-[18px] border border-[#F3D3CF] bg-[#FFF7F6] px-4 py-4 text-[14px] text-[#9F3A2C]">
              {message}
            </div>

            {diagnostics ? (
              <div className="rounded-[18px] border border-[#D9E3EA] bg-[#F8FAFB] px-4 py-4 text-[13px] text-[#334155]">
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

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setIframeKey((k) => k + 1)} className="btn-teal">
                再試一次
              </button>
              <a
                href={baccaratUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-teal-outline"
              >
                直接打開百家樂
                <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
