import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { AdminCaptchaResponse, AdminLoginResponse } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
import { useTranslation } from '@/i18n/useTranslation';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';

const schema = z.object({
  username: z.string().min(1, { message: 'REQUIRED' }),
  password: z.string().min(1, { message: 'REQUIRED' }),
  captchaCode: z.string().regex(/^\d{4}$/, { message: 'CAPTCHA_DIGITS' }),
  twoFactorCode: z.string().optional(),
});

type FormInput = z.infer<typeof schema>;

export function AdminLoginPage(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setAuth = useAdminAuthStore((s) => s.setAuth);
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<AdminCaptchaResponse | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<AdminTwoFactorChallenge | null>(
    null,
  );
  const [twoFactorQrDataUrl, setTwoFactorQrDataUrl] = useState<string | null>(null);
  const [twoFactorQrError, setTwoFactorQrError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema) });

  const refreshCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      const res = await adminApi.get<AdminCaptchaResponse>('/auth/captcha');
      setCaptcha(res.data);
      setValue('captchaCode', '');
    } catch {
      setCaptcha(null);
      setServerError(t.auth.captchaLoadFailed);
    } finally {
      setCaptchaLoading(false);
    }
  }, [setValue, t.auth.captchaLoadFailed]);

  useEffect(() => {
    void refreshCaptcha();
  }, [refreshCaptcha]);

  useEffect(() => {
    let cancelled = false;
    const otpauthUrl = twoFactorChallenge?.otpauthUrl ?? '';
    setTwoFactorQrDataUrl(null);
    setTwoFactorQrError(null);
    if (!otpauthUrl) return;

    QRCode.toString(otpauthUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 244,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((svg) => {
        if (cancelled) return;
        setTwoFactorQrDataUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (cancelled) return;
        setTwoFactorQrError('QR Code 無法產生，請使用備用密鑰手動綁定。');
      });

    return () => {
      cancelled = true;
    };
  }, [twoFactorChallenge?.otpauthUrl]);

  const onSubmit = async (data: FormInput) => {
    setServerError(null);
    if (!captcha) {
      setServerError(t.auth.captchaRequired);
      await refreshCaptcha();
      return;
    }

    try {
      const res = await adminApi.post<AdminLoginResponse>('/auth/login', {
        ...data,
        twoFactorCode: twoFactorChallenge ? data.twoFactorCode : undefined,
        captchaToken: captcha.captchaToken,
      });
      if (isTwoFactorChallenge(res.data)) {
        setTwoFactorChallenge(res.data);
        setServerError(res.data.message);
        setValue('twoFactorCode', '');
        await refreshCaptcha();
        return;
      }

      setTwoFactorChallenge(null);
      setAuth(res.data.agent, res.data.accessToken, res.data.refreshToken);
      const from = params.get('from');
      navigate(from ? decodeURIComponent(from) : '/admin/dashboard');
    } catch (err) {
      const apiErr = extractApiError(err);
      setServerError(`${apiErr.code} · ${apiErr.message}`);
      await refreshCaptcha();
    }
  };
  const fieldError = (message?: string): string | undefined => {
    if (!message) return undefined;
    if (message === 'REQUIRED') return t.auth.required;
    if (message === 'CAPTCHA_DIGITS') return t.auth.captchaDigits;
    if (message === 'TOTP_DIGITS') return '請輸入 6 位 Google Authenticator 驗證碼';
    return message;
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
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[8px] border border-[#F59E0B]/35 bg-[#130C07]/72 shadow-[0_10px_24px_rgba(245,158,11,0.22)]">
              <img src="/brand/yachiyo-emblem.png" alt="" className="h-9 w-9 object-contain" />
            </span>
            <span className="hidden text-[16px] font-bold text-white/90 sm:inline">
              {t.shell.brand}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/62 sm:inline-flex">
              {t.auth.authorizedAgent}
            </span>
            <LanguageSwitcher compact />
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center px-4 py-6 sm:px-5 sm:py-10">
        <div className="mx-auto grid w-full max-w-[1680px] items-center gap-8 xl:grid-cols-[minmax(0,1fr)_440px]">
          <section className="hidden min-w-0 xl:block">
            <div className="max-w-[760px]">
              <span className="inline-flex items-center rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/78">
                {t.auth.heroEyebrow}
              </span>
              <h1 className="mt-6 text-[50px] font-bold leading-[1.04] text-white">
                {t.auth.heroTitle}
              </h1>
              <p className="mt-5 max-w-[580px] text-[17px] leading-8 text-white/72">
                {t.auth.heroDescription}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <span className="inline-flex items-center rounded-full border border-[#C9A247]/36 bg-[#132233]/75 px-4 py-2 text-[13px] font-semibold text-[#EFD886]">
                  {t.auth.heroChipHierarchy}
                </span>
                <span className="inline-flex items-center rounded-full border border-white/12 bg-white/7 px-4 py-2 text-[13px] font-semibold text-white/80">
                  {t.auth.heroChipMembers}
                </span>
                <span className="inline-flex items-center rounded-full border border-white/12 bg-white/7 px-4 py-2 text-[13px] font-semibold text-white/80">
                  {t.auth.heroChipReports}
                </span>
              </div>
            </div>
          </section>

          <div className="w-full max-w-[440px] justify-self-center rounded-[14px] border border-white/12 bg-white/92 p-5 shadow-[0_30px_80px_rgba(2,6,23,0.32)] backdrop-blur-md sm:rounded-[18px] sm:p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[16px] border border-[#F59E0B]/30 bg-[#130C07]/92 shadow-[0_14px_34px_rgba(245,158,11,0.24)]">
                <img
                  src="/brand/yachiyo-emblem.png"
                  alt=""
                  className="h-[72px] w-[72px] object-contain"
                  draggable={false}
                />
              </div>
              <div className="mb-2 text-[18px] font-black tracking-[0.06em] text-[#B45309]">
                {t.shell.brand}
              </div>
              <h1 className="text-[24px] font-bold text-[#0F172A]">{t.auth.title}</h1>
              <p className="mt-2 text-[13px] text-[#4A5568]">{t.auth.requiresAuth}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Field label={t.auth.username} error={fieldError(errors.username?.message)}>
                <input
                  type="text"
                  autoComplete="username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={t.auth.usernamePlaceholder}
                  className="w-full rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[16px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25 sm:text-[14px]"
                  {...register('username', {
                    setValueAs: (value) => (typeof value === 'string' ? value.trim() : value),
                  })}
                />
              </Field>

              <Field label={t.auth.password} error={fieldError(errors.password?.message)}>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  className="w-full rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[16px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25 sm:text-[14px]"
                  {...register('password')}
                />
              </Field>

              <Field label={t.auth.captcha} error={fieldError(errors.captchaCode?.message)}>
                <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={t.auth.captchaPlaceholder}
                    maxLength={4}
                    className="w-full rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[16px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25 sm:text-[14px]"
                    {...register('captchaCode')}
                    onInput={(event) => {
                      const next = event.currentTarget.value.replace(/\D/g, '').slice(0, 4);
                      event.currentTarget.value = next;
                      setValue('captchaCode', next, { shouldValidate: true });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void refreshCaptcha()}
                    disabled={captchaLoading}
                    className="rounded-[8px] border border-[#186073]/28 bg-[#F6FBFD] px-3 py-2.5 font-mono text-[18px] font-black tracking-[0.18em] text-[#186073] transition hover:bg-[#EAF6FA] disabled:cursor-wait disabled:opacity-60"
                    aria-label={t.auth.captchaReload}
                  >
                    {captchaLoading ? '----' : (captcha?.captchaCode ?? '----')}
                  </button>
                </div>
              </Field>

              {twoFactorChallenge && (
                <Field
                  label="Google Authenticator"
                  error={fieldError(errors.twoFactorCode?.message)}
                >
                  <div className="space-y-3 rounded-[10px] border border-[#C9A247]/35 bg-[#FFF8DF] p-3">
                    {twoFactorChallenge.setupRequired && twoFactorChallenge.otpauthUrl ? (
                      <div className="space-y-2 text-[12px] text-[#765709]">
                        <div className="font-semibold">
                          第一次登入需要綁定 Google Authenticator。請用 App 掃描 QR Code。
                        </div>
                        <div className="mx-auto flex min-h-[268px] w-fit min-w-[268px] items-center justify-center rounded-[12px] border border-[#C9A247]/35 bg-white p-3 shadow-sm">
                          {twoFactorQrDataUrl ? (
                            <img
                              src={twoFactorQrDataUrl}
                              alt="Google Authenticator QR Code"
                              className="h-[244px] w-[244px]"
                              draggable={false}
                            />
                          ) : (
                            <div className="flex h-[244px] w-[244px] items-center justify-center rounded-[8px] bg-[#F8FAFC] px-4 text-center text-[12px] font-semibold text-[#765709]">
                              {twoFactorQrError ?? 'QR Code 產生中...'}
                            </div>
                          )}
                        </div>
                        {twoFactorQrError ? (
                          <div className="rounded-[8px] border border-[#D4574A]/35 bg-[#FDF0EE] px-3 py-2 text-[11px] font-semibold text-[#B94538]">
                            {twoFactorQrError}
                          </div>
                        ) : null}
                        {twoFactorChallenge.otpauthUrl ? (
                          <a
                            href={twoFactorChallenge.otpauthUrl}
                            className="inline-flex rounded-[8px] border border-[#C9A247]/40 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#765709] hover:bg-[#FFF3C4]"
                          >
                            在驗證器 App 中開啟
                          </a>
                        ) : null}
                        {twoFactorChallenge.manualKey ? (
                          <details className="rounded-[8px] border border-[#C9A247]/25 bg-white/70 px-3 py-2 text-[11px]">
                            <summary className="cursor-pointer font-semibold">
                              無法掃描時顯示備用密鑰
                            </summary>
                            <div className="mt-2 break-all font-mono text-[#0F172A]">
                              {twoFactorChallenge.manualKey}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-[12px] font-semibold text-[#765709]">
                        請輸入 Google Authenticator 顯示的 6 位驗證碼。
                      </div>
                    )}
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6 位驗證碼"
                      maxLength={6}
                      className="w-full rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[16px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25 sm:text-[14px]"
                      {...register('twoFactorCode', {
                        validate: (value) =>
                          !twoFactorChallenge || /^\d{6}$/.test(value ?? '') || 'TOTP_DIGITS',
                      })}
                      onInput={(event) => {
                        const next = event.currentTarget.value.replace(/\D/g, '').slice(0, 6);
                        event.currentTarget.value = next;
                        setValue('twoFactorCode', next, { shouldValidate: true });
                      }}
                    />
                  </div>
                </Field>
              )}

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
                {isSubmitting
                  ? t.auth.authenticating
                  : twoFactorChallenge
                    ? '驗證並進入後台'
                    : t.auth.authenticate}
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

type AdminTwoFactorChallenge = Extract<AdminLoginResponse, { requiresTwoFactor: true }>;

function isTwoFactorChallenge(value: AdminLoginResponse): value is AdminTwoFactorChallenge {
  return 'requiresTwoFactor' in value && value.requiresTwoFactor === true;
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
