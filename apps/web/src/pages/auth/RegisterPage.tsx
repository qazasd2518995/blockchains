import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { AuthResponse } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/useTranslation';
import { LocaleToggle } from '@/components/layout/LocaleToggle';

const schema = z.object({
  email: z.string().email({ message: 'INVALID_EMAIL' }),
  password: z
    .string()
    .min(8, { message: 'MIN_CHARS' })
    .regex(/[A-Za-z]/, { message: 'NEED_LETTER' })
    .regex(/\d/, { message: 'NEED_DIGIT' }),
  displayName: z.string().min(1).max(40).optional().or(z.literal('')),
  agree: z.literal(true, {
    errorMap: () => ({ message: 'AGREE_REQUIRED' }),
  }),
});

type FormInput = z.infer<typeof schema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema) });

  const errMap = (k?: string) => {
    if (!k) return undefined;
    switch (k) {
      case 'INVALID_EMAIL':
        return t.auth.invalidEmail;
      case 'MIN_CHARS':
        return t.auth.minChars;
      case 'NEED_LETTER':
        return t.auth.needLetter;
      case 'NEED_DIGIT':
        return t.auth.needDigit;
      case 'AGREE_REQUIRED':
        return t.auth.agreementRequired;
      default:
        return k;
    }
  };

  const onSubmit = async (data: FormInput) => {
    setServerError(null);
    try {
      const payload = {
        email: data.email,
        password: data.password,
        ...(data.displayName ? { displayName: data.displayName } : {}),
      };
      const res = await api.post<AuthResponse>('/auth/register', payload);
      setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
      navigate('/lobby');
    } catch (err) {
      setServerError(extractApiError(err).message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-16">
      <div className="absolute top-0 left-0 right-0 z-10 border-b border-white/5 bg-ink-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-2 text-[10px] uppercase tracking-[0.25em] text-ink-400">
          <Link to="/" className="flex items-center gap-2 text-bone transition hover:text-neon-acid">
            <span className="text-neon-acid">◄</span>
            <span>{t.auth.returnTo}</span>
          </Link>
          <div className="flex items-center gap-4">
            <span>{t.auth.initSeq}</span>
            <LocaleToggle compact />
          </div>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-xl">
        <div className="label">§ {t.auth.newOperator}</div>
        <h1 className="mt-3 font-serif text-6xl font-black leading-none">
          <span className="text-bone">{t.auth.createAccount}</span>
        </h1>
        <p className="mt-4 font-mono text-[13px] text-ink-400">
          {t.auth.registerDesc}
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

          <Field
            label={t.auth.password}
            code="02"
            error={errMap(errors.password?.message)}
            hint={t.auth.passwordHint}
          >
            <input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••••••"
              className="term-input"
              {...register('password')}
            />
          </Field>

          <Field
            label={t.auth.callsignOptional}
            code="03"
            error={errMap(errors.displayName?.message)}
          >
            <input
              type="text"
              placeholder="GHOST_42"
              className="term-input"
              {...register('displayName')}
            />
          </Field>

          <label className="flex items-start gap-3 border border-white/10 bg-ink-900/40 p-4">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-neon-acid"
              {...register('agree')}
            />
            <div className="text-[12px] leading-relaxed text-ink-300">
              <div className="text-[10px] tracking-[0.25em] text-ink-500">
                {t.auth.acknowledgment}
              </div>
              <div className="mt-1">{t.auth.ackText}</div>
            </div>
          </label>
          {errors.agree && (
            <div className="text-[10px] tracking-[0.2em] text-neon-ember">
              ⚠ {errMap(errors.agree.message)}
            </div>
          )}

          {serverError && (
            <div className="border border-neon-ember/40 bg-neon-ember/5 p-3">
              <div className="flex items-start gap-2 text-[12px] text-neon-ember">
                <span className="font-bold">{t.common.error.toUpperCase()}:</span>
                <span className="uppercase tracking-wider">{serverError}</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button type="submit" disabled={isSubmitting} className="btn-acid">
              {isSubmitting ? (
                <span>
                  {t.auth.initializing}
                  <span className="animate-blink">_</span>
                </span>
              ) : (
                t.auth.createAndLogin
              )}
            </button>
            <Link to="/login" className="btn-ghost">
              [{t.auth.haveAccount}]
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  code,
  error,
  hint,
  children,
}: {
  label: string;
  code: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] text-ink-500">{code}</span>
          <span className="text-[11px] font-semibold tracking-[0.25em] text-ink-300">
            {label}
          </span>
          {hint && !error && (
            <span className="text-[9px] tracking-[0.2em] text-ink-500">{hint}</span>
          )}
        </div>
        {error && (
          <span className="text-[10px] tracking-[0.2em] text-neon-ember">⚠ {error}</span>
        )}
      </div>
      {children}
    </label>
  );
}
