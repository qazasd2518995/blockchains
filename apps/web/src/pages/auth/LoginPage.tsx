import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import type { AuthResponse } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/useTranslation';
import { LocaleToggle } from '@/components/layout/LocaleToggle';

const schema = z.object({
  email: z.string().email({ message: 'INVALID_EMAIL' }),
  password: z.string().min(1, { message: 'PASSWORD_REQUIRED' }),
});

type FormInput = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema) });

  const errMap = (k?: string) => {
    if (k === 'INVALID_EMAIL') return t.auth.invalidEmail;
    if (k === 'PASSWORD_REQUIRED') return t.auth.pwdRequired;
    return k;
  };

  const onSubmit = async (data: FormInput) => {
    setServerError(null);
    try {
      const res = await api.post<AuthResponse>('/auth/login', data);
      setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
      const from = params.get('from');
      navigate(from ?? '/lobby');
    } catch (err) {
      setServerError(extractApiError(err).message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-10">
      <div className="absolute top-0 left-0 right-0 z-10 border-b border-ink-200 bg-ink-50/60 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-2 text-[10px] uppercase tracking-[0.25em] text-ink-600">
          <Link to="/" className="flex items-center gap-2 text-ink-900 transition hover:text-neon-acid">
            <span className="text-neon-acid">◄</span>
            <span>{t.auth.returnHome}</span>
          </Link>
          <div className="flex items-center gap-4">
            <span>{t.auth.secureChannel}</span>
            <LocaleToggle compact />
          </div>
        </div>
      </div>

      <div className="relative z-10 grid w-full max-w-5xl gap-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <div className="label">§ {t.auth.authenticate}</div>
          <h1 className="mt-3 font-serif text-6xl font-black leading-none">
            <span className="text-ink-900">{t.auth.identifyYourself}</span>
          </h1>
          <p className="mt-4 font-mono text-[13px] text-ink-600">
            {t.auth.loginDesc}
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-10 space-y-5">
            <Field label={t.auth.emailLabel} code="01" error={errMap(errors.email?.message)}>
              <input
                type="email"
                autoComplete="email"
                placeholder="operator@blockchain.game"
                className="term-input"
                {...register('email')}
              />
            </Field>
            <Field label={t.auth.password} code="02" error={errMap(errors.password?.message)}>
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
              <span className="text-[10px] tracking-[0.3em] text-ink-500">{t.auth.pressEnter}</span>
            </div>
          </form>

          <div className="mt-10 border-t border-ink-200 pt-5 text-[10px] tracking-[0.3em] text-ink-500">
            § ACCESS MANAGED BY AGENTS · NO PUBLIC SIGNUP
          </div>
        </div>

        <div className="relative hidden lg:block">
          <div className="crt-panel scanlines h-full p-8">
            <div className="flex items-center justify-between border-b border-ink-200 pb-4">
              <div className="label">{t.auth.systemProtocol}</div>
              <span className="tag tag-toxic">
                <span className="status-dot status-dot-live" />
                {t.common.active.toUpperCase()}
              </span>
            </div>

            <pre className="mt-6 font-mono text-[10px] leading-relaxed text-ink-500">
{`┌─────────────────────────────────┐
│  ${t.auth.provablyFairProtocol.padEnd(30)} │
│                                 │
│  [1] Server generates seed S    │
│  [2] Publishes SHA256(S) = H    │
│  [3] Client provides seed C     │
│  [4] Nonce N increments /bet    │
│  [5] Result = HMAC(S, C:N)      │
│  [6] S revealed at rotate       │
│  [7] Verify: SHA256(S) === H ✓  │
│                                 │
│  MATH GUARANTEES HONESTY.       │
└─────────────────────────────────┘`}
            </pre>

            <div className="mt-8 space-y-3 text-[11px]">
              <Detail k="HASH" v="SHA-256" />
              <Detail k="HMAC" v="HMAC-SHA256" />
              <Detail k="SEED_ENTROPY" v="256 BITS" />
              <Detail k="SESSION_TTL" v="15 MINUTES" />
              <Detail k="PASSWORD_HASH" v="BCRYPT · 12 ROUNDS" />
            </div>

            <div className="mt-10 border-t border-ink-200 pt-4">
              <div className="font-serif text-xl italic leading-tight text-ink-900">
                {t.auth.trustButVerify}
              </div>
              <div className="mt-2 text-[10px] tracking-[0.3em] text-ink-500">
                {t.auth.proverb}
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
          <span className="text-[11px] font-semibold tracking-[0.25em] text-ink-700">
            {label}
          </span>
        </div>
        {error && (
          <span className="text-[10px] tracking-[0.2em] text-neon-ember">
            ⚠ {error}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-ink-200 pb-2">
      <span className="text-[10px] tracking-[0.25em] text-ink-500">{k}</span>
      <span className="text-ink-900 data-num">{v}</span>
    </div>
  );
}
