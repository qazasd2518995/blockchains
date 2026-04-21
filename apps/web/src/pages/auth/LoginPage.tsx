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
      <div className="relative z-10 border-b border-[#E5E7EB] bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-2.5 text-[10px] uppercase tracking-[0.3em] text-[#4A5568]">
          <Link to="/" className="flex items-center gap-2 text-[#0F172A] transition hover:text-[#186073]">
            <span className="text-[#AE8B35]">◄</span>
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
              <span className="font-semibold text-lg text-[#186073]">{t.auth.authenticate}</span>
              <span className="text-[#C9A247] text-sm">◆</span>
              <span className="label text-[#186073]">séance privée</span>
            </div>
            <h1 className="mt-5 font-semibold text-6xl leading-[0.95] text-[#0F172A]">
              {t.auth.identifyYourself}
            </h1>
            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-[#4A5568]">
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
                <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-4 rounded-sm">
                  <div className="flex items-start gap-2 text-[12px] text-[#B94538]">
                    <span className="font-semibold font-bold italic">{t.common.error}:</span>
                    <span className="tracking-wider">{serverError}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 pt-2">
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
                <span className="font-semibold text-[13px] text-[#186073]">{t.auth.pressEnter}</span>
              </div>
            </form>

            <div className="mt-12 border-t border-[#E5E7EB]"><span>♠ ◆ ♥</span></div>
            <div className="mt-5 text-center font-semibold text-[14px] text-[#186073]">
              {t.landing.accessManaged}
            </div>
          </div>

          {/* Right — felt protocol panel */}
          <div className="relative hidden lg:block">
            <div className="panel-felt scanlines h-full p-8">
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-lg text-[#DEBE66]">Protocole</span>
                  <span className="text-[#C9A247] text-xs">◆</span>
                  <span className="label text-[#D0AC4D]">{t.auth.systemProtocol}</span>
                </div>
                <div className="hidden !h-9 !w-9 !text-[8px]">LIVE</div>
              </div>

              <pre className="mt-8 font-mono text-[10.5px] leading-relaxed text-[#E8D48A]/85">
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

              <div className="mt-10 border-t border-[#E5E7EB] pt-5">
                <div className="font-semibold text-2xl italic leading-tight text-white">
                  {t.auth.trustButVerify}
                </div>
                <div className="mt-2 font-semibold text-sm text-[#DEBE66]">{t.auth.proverb}</div>
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
          <span className="font-semibold text-[14px] font-semibold tracking-[0.12em] text-[#0F172A]">
            {label}
          </span>
        </div>
        {error && (
          <span className="font-mono text-[10px] tracking-[0.15em] text-[#D4574A]">
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
    <div className="flex items-baseline justify-between border-b border-[#E5E7EB] pb-2">
      <span className="font-mono text-[10px] tracking-[0.25em] text-[#D0AC4D]">{k}</span>
      <span className="font-mono text-white data-num">{v}</span>
    </div>
  );
}
