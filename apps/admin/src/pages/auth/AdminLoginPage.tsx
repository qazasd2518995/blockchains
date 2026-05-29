import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const twoFactorQrCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
    renderAuthenticatorQrCode(twoFactorQrCanvasRef.current, twoFactorChallenge?.otpauthUrl ?? '');
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
                  {...register('username')}
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
                        <div className="mx-auto flex w-fit rounded-[12px] border border-[#C9A247]/35 bg-white p-3 shadow-sm">
                          <canvas
                            ref={twoFactorQrCanvasRef}
                            width={244}
                            height={244}
                            aria-label="Google Authenticator QR Code"
                            className="h-[244px] w-[244px]"
                          />
                        </div>
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

function renderAuthenticatorQrCode(canvas: HTMLCanvasElement | null, text: string): void {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!text) return;

  try {
    const matrix = createAuthenticatorQrMatrix(text);
    const quietZone = 4;
    const moduleCount = matrix.length + quietZone * 2;
    const moduleSize = Math.floor(Math.min(canvas.width, canvas.height) / moduleCount);
    const qrSize = moduleSize * moduleCount;
    const offsetX = Math.floor((canvas.width - qrSize) / 2);
    const offsetY = Math.floor((canvas.height - qrSize) / 2);

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#0F172A';

    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix.length; x += 1) {
        if (matrix[y]?.[x]) {
          context.fillRect(
            offsetX + (x + quietZone) * moduleSize,
            offsetY + (y + quietZone) * moduleSize,
            moduleSize,
            moduleSize,
          );
        }
      }
    }
  } catch {
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#B94538';
    context.font = '600 14px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('QR Code 無法產生', canvas.width / 2, canvas.height / 2);
  }
}

function createAuthenticatorQrMatrix(text: string): boolean[][] {
  const version = 10;
  const size = 17 + version * 4;
  const dataCodewordCount = 274;
  const errorCorrectionCodewordCount = 18;
  const blockLengths = [68, 68, 69, 69];
  const data = new TextEncoder().encode(text);
  if (data.length > 190) {
    throw new Error('QR payload is too large');
  }

  const bits: number[] = [];
  appendQrBits(bits, 0b0100, 4);
  appendQrBits(bits, data.length, 16);
  data.forEach((byte) => appendQrBits(bits, byte, 8));
  appendQrBits(bits, 0, Math.min(4, dataCodewordCount * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const dataCodewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    dataCodewords.push(Number.parseInt(bits.slice(index, index + 8).join(''), 2));
  }
  for (let pad = 0; dataCodewords.length < dataCodewordCount; pad += 1) {
    dataCodewords.push(pad % 2 === 0 ? 0xec : 0x11);
  }

  const blocks: number[][] = [];
  let cursor = 0;
  for (const length of blockLengths) {
    const block = dataCodewords.slice(cursor, cursor + length);
    cursor += length;
    blocks.push([...block, ...createQrErrorCorrection(block, errorCorrectionCodewordCount)]);
  }

  const interleaved: number[] = [];
  for (let index = 0; index < Math.max(...blockLengths); index += 1) {
    for (const blockIndex of [0, 1, 2, 3]) {
      const blockLength = blockLengths[blockIndex] ?? 0;
      const block = blocks[blockIndex];
      if (block && index < blockLength) interleaved.push(block[index] ?? 0);
    }
  }
  for (let index = 0; index < errorCorrectionCodewordCount; index += 1) {
    for (const block of blocks)
      interleaved.push(block[block.length - errorCorrectionCodewordCount + index] ?? 0);
  }

  const matrix = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const setModule = (x: number, y: number, value: boolean, isReserved = true) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    matrix[y]![x] = value;
    if (isReserved) reserved[y]![x] = true;
  };
  const reserveModule = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    reserved[y]![x] = true;
  };

  const addFinder = (left: number, top: number) => {
    for (let y = -1; y <= 7; y += 1) {
      for (let x = -1; x <= 7; x += 1) {
        const xx = left + x;
        const yy = top + y;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const dark =
          x >= 0 &&
          x <= 6 &&
          y >= 0 &&
          y <= 6 &&
          (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
        setModule(xx, yy, dark);
      }
    }
  };

  addFinder(0, 0);
  addFinder(size - 7, 0);
  addFinder(0, size - 7);

  for (let index = 8; index < size - 8; index += 1) {
    setModule(index, 6, index % 2 === 0);
    setModule(6, index, index % 2 === 0);
  }

  const addAlignment = (centerX: number, centerY: number) => {
    for (let y = -2; y <= 2; y += 1) {
      for (let x = -2; x <= 2; x += 1) {
        const dark = Math.max(Math.abs(x), Math.abs(y)) !== 1;
        setModule(centerX + x, centerY + y, dark);
      }
    }
  };
  for (const y of [6, 28, 50]) {
    for (const x of [6, 28, 50]) {
      if ((x === 6 && y === 6) || (x === 50 && y === 6) || (x === 6 && y === 50)) continue;
      addAlignment(x, y);
    }
  }

  setModule(8, size - 8, true);
  for (let i = 0; i < 9; i += 1) {
    reserveModule(8, i);
    reserveModule(i, 8);
    reserveModule(size - 1 - i, 8);
    reserveModule(8, size - 1 - i);
  }
  for (let i = 0; i < 18; i += 1) {
    const bit = ((getQrVersionBits(version) >> i) & 1) === 1;
    setModule(size - 11 + (i % 3), Math.floor(i / 3), bit);
    setModule(Math.floor(i / 3), size - 11 + (i % 3), bit);
  }

  const dataBits = interleaved.flatMap((byte) =>
    Array.from({ length: 8 }, (_, bit) => ((byte >> (7 - bit)) & 1) === 1),
  );
  let bitIndex = 0;
  let upward = true;
  for (let x = size - 1; x > 0; x -= 2) {
    if (x === 6) x -= 1;
    for (let row = 0; row < size; row += 1) {
      const y = upward ? size - 1 - row : row;
      for (let dx = 0; dx < 2; dx += 1) {
        const xx = x - dx;
        if (reserved[y]![xx]) continue;
        const mask = (xx + y) % 2 === 0;
        matrix[y]![xx] = (dataBits[bitIndex] ?? false) !== mask;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }

  const formatBits = getQrFormatBits(0);
  for (let i = 0; i < 15; i += 1) {
    const bit = ((formatBits >> i) & 1) === 1;
    const first =
      i < 6 ? ([8, i] as const) : i < 8 ? ([8, i + 1] as const) : ([14 - i, 8] as const);
    const second = i < 8 ? ([size - 1 - i, 8] as const) : ([8, size - 15 + i] as const);
    setModule(first[0], first[1], bit);
    setModule(second[0], second[1], bit);
  }

  return matrix;
}

function appendQrBits(bits: number[], value: number, length: number): void {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((value >> index) & 1);
  }
}

function createQrGaloisTables(): { exp: number[]; log: number[] } {
  const exp = Array<number>(512).fill(0);
  const log = Array<number>(256).fill(0);
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) exp[index] = exp[index - 255] ?? 0;
  return { exp, log };
}

const qrGalois = createQrGaloisTables();

function qrGaloisMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  return qrGalois.exp[(qrGalois.log[left] ?? 0) + (qrGalois.log[right] ?? 0)] ?? 0;
}

function createQrGeneratorPolynomial(degree: number): number[] {
  let polynomial = [1];
  for (let step = 0; step < degree; step += 1) {
    const next = Array<number>(polynomial.length + 1).fill(0);
    polynomial.forEach((coefficient, index) => {
      next[index] = (next[index] ?? 0) ^ qrGaloisMultiply(coefficient, qrGalois.exp[step] ?? 0);
      next[index + 1] = (next[index + 1] ?? 0) ^ coefficient;
    });
    polynomial = next;
  }
  return polynomial;
}

function createQrErrorCorrection(data: number[], degree: number): number[] {
  const generator = createQrGeneratorPolynomial(degree);
  const result = [...data, ...Array<number>(degree).fill(0)];
  for (let index = 0; index < data.length; index += 1) {
    const coefficient = result[index];
    if (coefficient === 0) continue;
    generator.forEach((generatorCoefficient, offset) => {
      result[index + offset] =
        (result[index + offset] ?? 0) ^ qrGaloisMultiply(generatorCoefficient, coefficient ?? 0);
    });
  }
  return result.slice(-degree);
}

function getQrFormatBits(mask: number): number {
  let data = (1 << 3) | mask;
  let bits = data << 10;
  const generator = 0b10100110111;
  for (let index = 14; index >= 10; index -= 1) {
    if (((bits >> index) & 1) === 1) bits ^= generator << (index - 10);
  }
  return ((data << 10) | bits) ^ 0b101010000010010;
}

function getQrVersionBits(version: number): number {
  let bits = version << 12;
  const generator = 0b1111100100101;
  for (let index = 17; index >= 12; index -= 1) {
    if (((bits >> index) & 1) === 1) bits ^= generator << (index - 12);
  }
  return (version << 12) | bits;
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
