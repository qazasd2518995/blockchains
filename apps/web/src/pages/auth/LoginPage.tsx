import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import type { AuthResponse } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/useTranslation';

const schema = z.object({
  username: z
    .string()
    .min(3, { message: 'INVALID_USERNAME' })
    .max(40, { message: 'INVALID_USERNAME' })
    .regex(/^[a-zA-Z0-9._-]+$/, { message: 'INVALID_USERNAME' }),
  password: z.string().min(1, { message: 'PASSWORD_REQUIRED' }),
});

type FormInput = z.infer<typeof schema>;

function safeRedirectPath(raw: string | null): string {
  if (!raw) return '/lobby';
  // 防 open redirect：只允许 internal path，禁止 "//" 或 http(s):
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/lobby';
  if (/^\/+https?:/i.test(raw)) return '/lobby';
  return raw;
}

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

  const errMap = (k?: string): string | undefined => {
    if (k === 'INVALID_USERNAME') return t.auth.invalidUsername;
    if (k === 'PASSWORD_REQUIRED') return t.auth.pwdRequired;
    return k;
  };

  const onSubmit = async (data: FormInput) => {
    setServerError(null);
    try {
      const res = await api.post<AuthResponse>('/auth/login', data);
      setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
      const target = safeRedirectPath(params.get('from'));
      navigate(target);
    } catch (err) {
      setServerError(extractApiError(err).message);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#05121E]">
      <div className="pointer-events-none absolute inset-0">
        <img
          src="/backgrounds/member-login-dealer.png"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover object-[68%_center] opacity-90"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,11,22,0.9)_0%,rgba(5,18,34,0.72)_38%,rgba(5,18,34,0.38)_66%,rgba(5,18,34,0.2)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,11,22,0.18)_0%,rgba(3,11,22,0.08)_48%,rgba(3,11,22,0.28)_100%)]" />
      </div>

      <header className="relative z-10 h-16 border-b border-white/8 bg-black/12 text-white backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-[1680px] items-center justify-between px-5">
          <Link
            to="/"
            className="flex items-center gap-2 text-[13px] text-white/75 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.auth.returnHome}
          </Link>
          <div className="flex items-center gap-2 text-[22px] font-extrabold tracking-[0.05em]">
            <span className="rounded-[6px] bg-gradient-to-br from-[#186073] to-[#0E4555] px-2 py-0.5 text-[20px] text-white shadow-[0_10px_24px_rgba(24,96,115,0.3)]">
              BG
            </span>
            <span className="hidden text-[16px] font-bold text-white/90 sm:inline">娱乐城</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center px-5 py-10">
        <div className="mx-auto grid w-full max-w-[1680px] items-center gap-8 xl:grid-cols-[minmax(0,1fr)_440px]">
          <section className="hidden min-w-0 xl:block">
            <div className="max-w-[760px]">
              <span className="inline-flex items-center rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/78">
                Player Login
              </span>
              <h1 className="mt-6 text-[52px] font-bold leading-[1.04] text-white">
                熱門館別今晚全開，登入後直接進場。
              </h1>
              <p className="mt-5 max-w-[560px] text-[17px] leading-8 text-white/72">
                Crash、經典、策略三大館別已備好節奏。登入後直接挑你今晚要衝的主場，
                看準時機放大倍率，或回頭核對每一局結果。
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <span className="inline-flex items-center rounded-full border border-[#C9A247]/36 bg-[#132233]/75 px-4 py-2 text-[13px] font-semibold text-[#EFD886]">
                  18 款人氣玩法
                </span>
                <span className="inline-flex items-center rounded-full border border-white/12 bg-white/7 px-4 py-2 text-[13px] font-semibold text-white/80">
                  即時派彩到帳
                </span>
                <span className="inline-flex items-center rounded-full border border-white/12 bg-white/7 px-4 py-2 text-[13px] font-semibold text-white/80">
                  即時戰報更新
                </span>
              </div>
            </div>
          </section>

          <div className="w-full max-w-[440px] justify-self-center rounded-[18px] border border-white/12 bg-white/92 p-8 shadow-[0_30px_80px_rgba(2,6,23,0.32)] backdrop-blur-md">
            <div className="mb-6 text-center">
              <h1 className="text-[24px] font-bold text-[#0F172A]">{t.auth.identifyYourself}</h1>
              <p className="mt-2 text-[13px] text-[#4A5568]">{t.auth.loginDesc}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Field label={t.auth.usernameLabel} error={errMap(errors.username?.message)}>
                <input
                  type="text"
                  autoComplete="username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={t.auth.usernamePlaceholder}
                  className="w-full rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[14px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25"
                  {...register('username')}
                />
              </Field>

              <Field label={t.auth.password} error={errMap(errors.password?.message)}>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder={t.auth.passwordPlaceholder}
                  className="w-full rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[14px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25"
                  {...register('password')}
                />
              </Field>

              {serverError && (
                <div className="flex items-start gap-2 rounded-[8px] border border-[#D4574A]/40 bg-[#FDF0EE] px-3 py-2.5 text-[12px] text-[#B94538]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{serverError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-[8px] bg-[#186073] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#1E7A90] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? t.auth.authenticating : t.auth.authenticate}
              </button>
            </form>

            <div className="mt-6 border-t border-[#E5E7EB] pt-5 text-center">
              <p className="text-[12px] text-[#4A5568]">{t.landing.accessManaged}</p>
              <a
                href="https://line.me/ti/p/~@aaa1788"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[13px] font-semibold text-[#186073] hover:underline"
              >
                客服 LINE: @aaa1788
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-[#0F172A]">{label}</span>
        {error && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#D4574A]">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {error}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}
