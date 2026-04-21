import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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
    <div className="flex min-h-screen flex-col bg-[#ECECEC]">
      {/* 简易 TopBar */}
      <header className="h-16 bg-[#1A2530] text-white">
        <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between px-5">
          <Link
            to="/"
            className="flex items-center gap-2 text-[13px] text-white/75 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.auth.returnHome}
          </Link>
          <div className="flex items-center gap-2 text-[22px] font-extrabold tracking-[0.05em]">
            <span className="rounded-[6px] bg-gradient-to-br from-[#186073] to-[#0E4555] px-2 py-0.5 text-[20px] text-white">
              BG
            </span>
            <span className="hidden text-[16px] font-bold text-white/90 sm:inline">娱乐城</span>
          </div>
        </div>
      </header>

      {/* 居中登入卡片 */}
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[420px] rounded-[10px] border border-[#E5E7EB] bg-white p-8 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
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
                className="w-full rounded-[6px] border border-[#E5E7EB] px-3 py-2.5 text-[14px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25"
                {...register('username')}
              />
            </Field>

            <Field label={t.auth.password} error={errMap(errors.password?.message)}>
              <input
                type="password"
                autoComplete="current-password"
                placeholder={t.auth.passwordPlaceholder}
                className="w-full rounded-[6px] border border-[#E5E7EB] px-3 py-2.5 text-[14px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25"
                {...register('password')}
              />
            </Field>

            {serverError && (
              <div className="rounded-[6px] border border-[#D4574A]/40 bg-[#FDF0EE] px-3 py-2.5 text-[12px] text-[#B94538]">
                ⚠ {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-[6px] bg-[#186073] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#1E7A90] disabled:cursor-not-allowed disabled:opacity-60"
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
        {error && <span className="text-[11px] text-[#D4574A]">⚠ {error}</span>}
      </div>
      {children}
    </label>
  );
}
