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
      const apiErr = extractApiError(err);
      setServerError(`${apiErr.code} · ${apiErr.message}`);
    }
  };

  return (
    <div className="relative flex min-h-[100svh] flex-col overflow-hidden bg-[#06111D]">
      <div className="pointer-events-none absolute inset-0">
        <img
          src="/backgrounds/admin-login.png"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover object-[68%_62%] opacity-90"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,11,20,0.9)_0%,rgba(6,16,30,0.72)_38%,rgba(6,16,30,0.38)_66%,rgba(6,16,30,0.2)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,11,20,0.18)_0%,rgba(4,11,20,0.08)_48%,rgba(4,11,20,0.28)_100%)]" />
      </div>

      <header className="relative z-10 h-16 border-b border-white/8 bg-black/12 text-white backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-[1680px] items-center justify-between px-5">
          <div className="flex items-center gap-2 text-[22px] font-extrabold tracking-[0.05em]">
            <span className="rounded-[6px] bg-gradient-to-br from-[#186073] to-[#0E4555] px-2 py-0.5 text-[20px] text-white shadow-[0_10px_24px_rgba(24,96,115,0.3)]">
              BG
            </span>
            <span className="hidden text-[16px] font-bold text-white/90 sm:inline">代理后台</span>
          </div>
          <span className="hidden rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/62 sm:inline-flex">
            授权代理
          </span>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center px-4 py-6 sm:px-5 sm:py-10">
        <div className="mx-auto grid w-full max-w-[1680px] items-center gap-8 xl:grid-cols-[minmax(0,1fr)_440px]">
          <section className="hidden min-w-0 xl:block">
            <div className="max-w-[760px]">
              <span className="inline-flex items-center rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/78">
                代理后台
              </span>
              <h1 className="mt-6 text-[50px] font-bold leading-[1.04] text-white">
                代理線、交收與風控，先在這裡收回主控權。
              </h1>
              <p className="mt-5 max-w-[580px] text-[17px] leading-8 text-white/72">
                後台專注在層級管理、餘額調整、報表追蹤與控制規則。登入後直接回到主控台，
                看今天哪條代理線需要處理、哪個帳戶需要調整。
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <span className="inline-flex items-center rounded-full border border-[#C9A247]/36 bg-[#132233]/75 px-4 py-2 text-[13px] font-semibold text-[#EFD886]">
                  层级管理
                </span>
                <span className="inline-flex items-center rounded-full border border-white/12 bg-white/7 px-4 py-2 text-[13px] font-semibold text-white/80">
                  审计追踪
                </span>
                <span className="inline-flex items-center rounded-full border border-white/12 bg-white/7 px-4 py-2 text-[13px] font-semibold text-white/80">
                  风控中心
                </span>
              </div>
            </div>
          </section>

          <div className="w-full max-w-[440px] justify-self-center rounded-[14px] border border-white/12 bg-white/92 p-5 shadow-[0_30px_80px_rgba(2,6,23,0.32)] backdrop-blur-md sm:rounded-[18px] sm:p-8">
            <div className="mb-6 text-center">
              <h1 className="text-[24px] font-bold text-[#0F172A]">{t.auth.title}</h1>
              <p className="mt-2 text-[13px] text-[#4A5568]">{t.auth.requiresAuth}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Field label={t.auth.username} error={errors.username?.message}>
                <input
                  type="text"
                  autoComplete="username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="superadmin"
                  className="w-full rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[16px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25 sm:text-[14px]"
                  {...register('username')}
                />
              </Field>

              <Field label={t.auth.password} error={errors.password?.message}>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  className="w-full rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[16px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25 sm:text-[14px]"
                  {...register('password')}
                />
              </Field>

              {serverError && (
                <div className="rounded-[8px] border border-[#D4574A]/40 bg-[#FDF0EE] px-3 py-2.5 text-[12px] text-[#B94538]">
                  ⚠ {serverError}
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
              <p className="text-[12px] text-[#4A5568]">{t.auth.subtitle}</p>
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
        {error && <span className="text-[11px] text-[#D4574A]">⚠ {error}</span>}
      </div>
      {children}
    </label>
  );
}
