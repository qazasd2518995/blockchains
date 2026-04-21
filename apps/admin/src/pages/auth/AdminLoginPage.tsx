import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import axios from 'axios';
import type { AdminAuthResponse } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
import { useTranslation } from '@/i18n/useTranslation';

const schema = z.object({
  username: z.string().min(1, { message: 'REQUIRED' }),
  password: z.string().min(1, { message: 'REQUIRED' }),
});

type FormInput = z.infer<typeof schema>;

export function AdminLoginPage(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setAuth = useAdminAuthStore((s) => s.setAuth);
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormInput) => {
    setServerError(null);

    const debugTag = '[AdminLogin]';
    const apiBase = import.meta.env.VITE_API_BASE ?? '(empty)';
    const fullUrl = `${import.meta.env.VITE_API_BASE ?? ''}/api/admin/auth/login`;

    console.groupCollapsed(`${debugTag} attempting login`);
    console.log('username:', data.username);
    console.log('password length:', data.password.length, 'chars');
    console.log('VITE_API_BASE:', apiBase);
    console.log('resolved URL:', fullUrl);
    console.log('timestamp:', new Date().toISOString());
    console.groupEnd();

    try {
      const res = await adminApi.post<AdminAuthResponse>('/auth/login', data);
      console.log(`${debugTag} ✓ success`, {
        status: res.status,
        agentId: res.data.agent?.id,
        role: res.data.agent?.role,
      });
      setAuth(res.data.agent, res.data.accessToken, res.data.refreshToken);
      const from = params.get('from');
      navigate(from ? decodeURIComponent(from) : '/admin/dashboard');
    } catch (err) {
      console.group(`${debugTag} ✗ FAILED`);
      if (axios.isAxiosError(err)) {
        console.error('axios error:', {
          status: err.response?.status,
          statusText: err.response?.statusText,
          responseData: err.response?.data,
          requestUrl: err.config?.url,
          requestBaseURL: err.config?.baseURL,
          fullURL: (err.config?.baseURL ?? '') + (err.config?.url ?? ''),
          requestMethod: err.config?.method,
          requestBody: err.config?.data,
          message: err.message,
          code: err.code,
        });
      } else {
        console.error('non-axios error:', err);
      }
      console.error('raw error object:', err);
      console.groupEnd();

      const apiErr = extractApiError(err);
      setServerError(`${apiErr.code} · ${apiErr.message}`);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="crystal-overlay" />

      <div className="relative z-10 grid w-full max-w-5xl gap-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg text-[#186073]">{t.auth.title}</span>
            <span className="text-[#C9A247]">◆</span>
            <span className="label text-[#186073]">salon privé</span>
          </div>
          <h1 className="mt-4 font-semibold text-6xl leading-[0.95] text-[#0F172A]">
            Agent<span className="italic text-[#186073]">.</span>Ops
          </h1>
          <p className="mt-3 font-semibold text-xl text-[#186073]">{t.auth.subtitle}</p>
          <p className="mt-6 max-w-md text-[13px] leading-relaxed text-[#4A5568]">
            {t.auth.requiresAuth}
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-10 space-y-6">
            <Field label={t.auth.username} suit="♠" error={errors.username?.message}>
              <input
                type="text"
                autoComplete="username"
                placeholder="superadmin"
                className="input-salon"
                {...register('username')}
              />
            </Field>
            <Field label={t.auth.password} suit="♦" error={errors.password?.message}>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                className="input-salon"
                {...register('password')}
              />
            </Field>

            {serverError && (
              <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-4 rounded-sm">
                <div className="flex items-start gap-2 text-[12px] text-[#B94538]">
                  <span className="font-semibold font-bold italic">{t.common.error}:</span>
                  <span className="tracking-wide">{serverError}</span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={isSubmitting} className="btn-teal">
                {isSubmitting ? (
                  <span>
                    {t.auth.authenticating}
                    <span className="animate-blink">_</span>
                  </span>
                ) : (
                  <>→ {t.auth.authenticate}</>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="relative hidden lg:block">
          <div className="panel-felt scanlines h-full p-8">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-4">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-lg text-[#DEBE66]">Protocole</span>
                <span className="text-[#C9A247] text-xs">◆</span>
                <span className="label text-[#D0AC4D]">{t.auth.protocol}</span>
              </div>
              <div className="hidden !h-9 !w-9 !text-[8px]">LIVE</div>
            </div>

            <pre className="mt-8 font-mono text-[10.5px] leading-relaxed text-[#E8D48A]/85">
{`┌────────────────────────────────┐
│  AGENT-OPS AUTH PROTOCOL       │
│                                │
│  [1] Username + Password       │
│  [2] Bcrypt verify (12 rounds) │
│  [3] JWT signed (aud=admin)    │
│  [4] Refresh token 7-day TTL   │
│  [5] All ops audited           │
│  [6] Serializable transactions │
│                                │
│  TRUST BUT VERIFY.             │
└────────────────────────────────┘`}
            </pre>

            <div className="mt-10 border-t border-[#E5E7EB] pt-5">
              <div className="font-semibold text-3xl italic text-white">Blockchain Ops</div>
              <div className="mt-2 font-semibold text-[13px] text-[#DEBE66]">
                不开放公开注册 · 仅限代理
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  suit,
  error,
  children,
}: {
  label: string;
  suit: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[#AE8B35] text-sm">{suit}</span>
          <span className="font-semibold text-[14px] font-semibold tracking-[0.1em] text-[#0F172A]">
            {label}
          </span>
        </div>
        {error && (
          <span className="font-mono text-[10px] tracking-[0.15em] text-[#D4574A]">⚠ {error}</span>
        )}
      </div>
      {children}
    </label>
  );
}
