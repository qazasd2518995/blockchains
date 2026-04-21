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
    <div className="flex min-h-screen flex-col bg-[#ECECEC]">
      <header className="h-16 bg-[#1A2530] text-white">
        <div className="mx-auto flex h-full max-w-[1280px] items-center justify-end px-5">
          <div className="flex items-center gap-2 text-[22px] font-extrabold tracking-[0.05em]">
            <span className="rounded-[6px] bg-gradient-to-br from-[#186073] to-[#0E4555] px-2 py-0.5 text-[20px] text-white">
              BG
            </span>
            <span className="hidden text-[16px] font-bold text-white/90 sm:inline">代理后台</span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[420px] rounded-[10px] border border-[#E5E7EB] bg-white p-8 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
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
                className="w-full rounded-[6px] border border-[#E5E7EB] px-3 py-2.5 text-[14px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25"
                {...register('username')}
              />
            </Field>

            <Field label={t.auth.password} error={errors.password?.message}>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
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
            <p className="text-[12px] text-[#4A5568]">{t.auth.subtitle}</p>
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
