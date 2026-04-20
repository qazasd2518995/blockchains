import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
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
    try {
      const res = await adminApi.post<AdminAuthResponse>('/auth/login', data);
      setAuth(res.data.agent, res.data.accessToken, res.data.refreshToken);
      const from = params.get('from');
      navigate(from ? decodeURIComponent(from) : '/admin/dashboard');
    } catch (err) {
      setServerError(extractApiError(err).message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-10">
      <div className="absolute inset-0 bg-grad-mesh" />

      <div className="relative z-10 grid w-full max-w-5xl gap-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <div className="label">§ {t.auth.title}</div>
          <h1 className="mt-3 font-display text-6xl font-black leading-none text-ink-900">
            AGENT<span className="text-neon-acid">.</span>OPS
          </h1>
          <p className="mt-2 font-hud text-[14px] uppercase tracking-[0.25em] text-ink-600">
            {t.auth.subtitle}
          </p>
          <p className="mt-6 max-w-md font-mono text-[12px] leading-relaxed text-ink-600">
            {t.auth.requiresAuth}
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-10 space-y-5">
            <Field label={t.auth.username} code="01" error={errors.username?.message}>
              <input
                type="text"
                autoComplete="username"
                placeholder="superadmin"
                className="term-input"
                {...register('username')}
              />
            </Field>
            <Field label={t.auth.password} code="02" error={errors.password?.message}>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                className="term-input"
                {...register('password')}
              />
            </Field>

            {serverError && (
              <div className="border border-neon-ember/40 bg-neon-ember/5 p-3">
                <div className="flex items-start gap-2 text-[12px] text-neon-ember">
                  <span className="font-bold">{t.common.error.toUpperCase()}:</span>
                  <span className="uppercase tracking-wider">{serverError}</span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={isSubmitting} className="btn-acid">
                {isSubmitting ? (
                  <span>
                    {t.auth.authenticating}
                    <span className="animate-blink">_</span>
                  </span>
                ) : (
                  `→ ${t.auth.authenticate}`
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="relative hidden lg:block">
          <div className="crt-panel scanlines h-full p-8">
            <div className="flex items-center justify-between border-b border-ink-200 pb-4">
              <div className="label">{t.auth.protocol}</div>
              <span className="tag tag-toxic">
                <span className="status-dot status-dot-live" /> LIVE
              </span>
            </div>

            <pre className="mt-6 font-mono text-[10px] leading-relaxed text-ink-500">
{`┌─────────────────────────────────┐
│  AGENT-OPS AUTH PROTOCOL        │
│                                 │
│  [1] Username + Password        │
│  [2] Bcrypt verify (12 rounds)  │
│  [3] JWT signed (aud=admin)     │
│  [4] Refresh token 7-day TTL    │
│  [5] All ops audited            │
│  [6] Serializable transactions  │
│                                 │
│  TRUST BUT VERIFY.              │
└─────────────────────────────────┘`}
            </pre>

            <div className="mt-10 border-t border-ink-200 pt-4">
              <div className="font-display text-xl tracking-widest text-ink-900">
                BLOCKCHAIN OPS
              </div>
              <div className="mt-2 text-[10px] tracking-[0.3em] text-ink-500">
                NO PUBLIC SIGNUP · AGENTS ONLY
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
  code,
  error,
  children,
}: {
  label: string;
  code: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] text-ink-500">{code}</span>
          <span className="text-[11px] font-semibold tracking-[0.25em] text-ink-700">{label}</span>
        </div>
        {error && <span className="text-[10px] tracking-[0.2em] text-neon-ember">⚠ {error}</span>}
      </div>
      {children}
    </label>
  );
}
