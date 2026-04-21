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
  username: z
    .string()
    .min(3, { message: 'INVALID_USERNAME' })
    .max(40, { message: 'INVALID_USERNAME' })
    .regex(/^[a-zA-Z0-9._-]+$/, { message: 'INVALID_USERNAME' }),
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
    if (k === 'INVALID_USERNAME') return t.auth.invalidUsername;
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
    <div className="relative min-h-screen overflow-hidden">
      <div className="crystal-overlay" />

      {/* Top bar */}
      <div className="relative z-10 border-b border-brass-500/40 bg-ivory-100/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-2.5 text-[10px] uppercase tracking-[0.3em] text-ivory-700">
          <Link to="/" className="flex items-center gap-2 text-ivory-900 transition hover:text-brass-700">
            <span className="text-brass-600">◄</span>
            <span>{t.auth.returnHome}</span>
          </Link>
          <div className="flex items-center gap-4">
            <span>{t.auth.secureChannel}</span>
            <LocaleToggle compact />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-45px)] max-w-[1400px] items-center justify-center px-6 py-16">
        <div className="grid w-full gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Left — form */}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-script text-lg text-brass-700">{t.auth.authenticate}</span>
              <span className="text-brass-500 text-sm">◆</span>
              <span className="label label-brass">séance privée</span>
            </div>
            <h1 className="mt-5 font-serif text-6xl leading-[0.95] text-ivory-950">
              {t.auth.identifyYourself}
            </h1>
            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-ivory-700">
              {t.auth.loginDesc}
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-10 space-y-6">
              <Field label={t.auth.usernameLabel} suit="♠" error={errMap(errors.username?.message)}>
                <input
                  type="text"
                  autoComplete="username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={t.auth.usernamePlaceholder}
                  className="input-salon"
                  {...register('username')}
                />
              </Field>
              <Field label={t.auth.password} suit="♦" error={errMap(errors.password?.message)}>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder={t.auth.passwordPlaceholder}
                  className="input-salon"
                  {...register('password')}
                />
              </Field>

              {serverError && (
                <div className="border border-wine-400/50 bg-wine-50 p-4 rounded-sm">
                  <div className="flex items-start gap-2 text-[12px] text-wine-600">
                    <span className="font-serif font-bold italic">{t.common.error}:</span>
                    <span className="tracking-wider">{serverError}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 pt-2">
                <button type="submit" disabled={isSubmitting} className="btn-brass">
                  {isSubmitting ? (
                    <span>
                      {t.auth.authenticating}
                      <span className="animate-blink">_</span>
                    </span>
                  ) : (
                    <>→ {t.auth.authenticate}</>
                  )}
                </button>
                <span className="font-script text-[13px] text-brass-700">{t.auth.pressEnter}</span>
              </div>
            </form>

            <div className="mt-12 divider-suit"><span>♠ ◆ ♥</span></div>
            <div className="mt-5 text-center font-script text-[14px] text-brass-700">
              {t.landing.accessManaged}
            </div>
          </div>

          {/* Right — felt protocol panel */}
          <div className="relative hidden lg:block">
            <div className="panel-felt scanlines h-full p-8">
              <div className="flex items-center justify-between border-b border-brass-500/40 pb-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-script text-lg text-brass-300">Protocole</span>
                  <span className="text-brass-500 text-xs">◆</span>
                  <span className="label text-brass-400">{t.auth.systemProtocol}</span>
                </div>
                <div className="seal seal-live seal-breath !h-9 !w-9 !text-[8px]">LIVE</div>
              </div>

              <pre className="mt-8 font-mono text-[10.5px] leading-relaxed text-brass-200/85">
{`┌────────────────────────────────┐
│  ${t.auth.provablyFairProtocol.padEnd(28).slice(0, 28)}  │
│                                │
│  [1] Server generates seed S   │
│  [2] Publishes SHA256(S) = H   │
│  [3] Client provides seed C    │
│  [4] Nonce N increments /bet   │
│  [5] Result = HMAC(S, C:N)     │
│  [6] S revealed at rotate      │
│  [7] Verify: SHA256(S) === H ✓ │
│                                │
│  MATH GUARANTEES HONESTY.      │
└────────────────────────────────┘`}
              </pre>

              <div className="mt-8 space-y-3 text-[11px]">
                <Detail k="HASH" v="SHA-256" />
                <Detail k="HMAC" v="HMAC-SHA256" />
                <Detail k="SEED_ENTROPY" v="256 BITS" />
                <Detail k="SESSION_TTL" v="15 MINUTES" />
                <Detail k="PASSWORD_HASH" v="BCRYPT · 12 ROUNDS" />
              </div>

              <div className="mt-10 border-t border-brass-500/40 pt-5">
                <div className="font-serif text-2xl italic leading-tight text-ivory-100">
                  {t.auth.trustButVerify}
                </div>
                <div className="mt-2 font-script text-sm text-brass-300">{t.auth.proverb}</div>
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
          <span className="text-brass-600 text-sm">{suit}</span>
          <span className="font-serif text-[14px] font-semibold tracking-[0.12em] text-ivory-900">
            {label}
          </span>
        </div>
        {error && (
          <span className="font-mono text-[10px] tracking-[0.15em] text-wine-500">
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
    <div className="flex items-baseline justify-between border-b border-brass-500/25 pb-2">
      <span className="font-mono text-[10px] tracking-[0.25em] text-brass-400">{k}</span>
      <span className="font-mono text-ivory-100 data-num">{v}</span>
    </div>
  );
}
