import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { api, extractApiError } from '@/lib/api';

const FALLBACK_BACCARAT_URL = 'http://localhost:5174';

export function BaccaratPage() {
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [message, setMessage] = useState('正在建立百家樂進場憑證...');

  const baccaratUrl = useMemo(() => {
    const raw = (import.meta.env.VITE_BACCARAT_URL as string | undefined)?.trim();
    return raw && /^https?:\/\//i.test(raw) ? raw : FALLBACK_BACCARAT_URL;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function launch() {
      try {
        const res = await api.post<{ launchToken: string }>('/auth/baccarat-launch');
        if (cancelled) return;
        const target = new URL('/login', baccaratUrl);
        target.searchParams.set('launchToken', res.data.launchToken);
        window.location.assign(target.toString());
      } catch (error) {
        if (cancelled) return;
        const apiError = extractApiError(error);
        setStatus('error');
        setMessage(apiError.message || '無法進入百家樂');
      }
    }

    void launch();
    return () => {
      cancelled = true;
    };
  }, [baccaratUrl]);

  return (
    <div className="mx-auto max-w-[720px] rounded-[24px] border border-white/[0.65] bg-white/[0.92] p-8 shadow-[0_18px_38px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="label">Baccarat Launcher</div>
      <h1 className="mt-3 text-[30px] font-bold text-[#0F172A]">百家樂</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-[#4A5568]">
        使用 BG 會員登入後，會直接帶你進入百家樂桌台，不再另外登入。
      </p>

      {status === 'loading' ? (
        <div className="mt-8 flex items-center gap-3 rounded-[18px] border border-[#D9E3EA] bg-[#F8FAFB] px-4 py-4 text-[14px] text-[#186073]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <div className="rounded-[18px] border border-[#F3D3CF] bg-[#FFF7F6] px-4 py-4 text-[14px] text-[#9F3A2C]">
            {message}
          </div>

          <a
            href={baccaratUrl}
            className="inline-flex items-center gap-2 rounded-[10px] bg-[#186073] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#1E7A90]"
          >
            直接打開百家樂
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}
