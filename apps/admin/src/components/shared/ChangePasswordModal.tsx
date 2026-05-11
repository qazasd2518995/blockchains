import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';
import { useTranslation } from '@/i18n/useTranslation';

const schema = z
  .object({
    currentPassword: z.string().min(1, { message: 'CURRENT_PASSWORD_REQUIRED' }),
    newPassword: z
      .string()
      .min(8, { message: 'NEW_PASSWORD_MIN' })
      .max(128, { message: 'NEW_PASSWORD_TOO_LONG' })
      .regex(/[A-Za-z]/, { message: 'NEW_PASSWORD_LETTER' })
      .regex(/\d/, { message: 'NEW_PASSWORD_DIGIT' }),
    confirmNewPassword: z.string().min(1, { message: 'CONFIRM_PASSWORD_REQUIRED' }),
  })
  .refine((v) => v.newPassword === v.confirmNewPassword, {
    message: 'NEW_PASSWORD_MISMATCH',
    path: ['confirmNewPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'NEW_PASSWORD_SAME',
    path: ['newPassword'],
  });

type FormInput = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: Props): JSX.Element {
  const { t } = useTranslation();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmNewPassword: '' },
  });

  const onSubmit = async (data: FormInput): Promise<void> => {
    setErr(null);
    setOk(false);
    try {
      await adminApi.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setOk(true);
      reset();
      window.setTimeout(() => {
        setOk(false);
        onClose();
      }, 1200);
    } catch (e) {
      setErr(extractApiError(e).message);
    }
  };

  const handleClose = (): void => {
    reset();
    setErr(null);
    setOk(false);
    onClose();
  };

  const fieldError = (message?: string): string | undefined => {
    if (!message) return undefined;
    const map: Record<string, string> = {
      CURRENT_PASSWORD_REQUIRED: t.auth.currentPasswordRequired,
      NEW_PASSWORD_MIN: t.auth.newPasswordMin,
      NEW_PASSWORD_TOO_LONG: t.auth.newPasswordTooLong,
      NEW_PASSWORD_LETTER: t.auth.newPasswordLetter,
      NEW_PASSWORD_DIGIT: t.auth.newPasswordDigit,
      CONFIRM_PASSWORD_REQUIRED: t.auth.confirmPasswordRequired,
      NEW_PASSWORD_MISMATCH: t.auth.newPasswordMismatch,
      NEW_PASSWORD_SAME: t.auth.newPasswordSame,
    };
    return map[message] ?? message;
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t.shell.changePassword}
      subtitle={t.auth.accountSecurity}
      width="sm"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <label className="block">
          <div className="label mb-2">{t.auth.currentPassword}</div>
          <input
            type="password"
            autoComplete="current-password"
            {...register('currentPassword')}
            className="term-input"
          />
          {errors.currentPassword && (
            <div className="mt-1 text-[10px] text-[#D4574A]">
              ⚠ {fieldError(errors.currentPassword.message)}
            </div>
          )}
        </label>

        <label className="block">
          <div className="label mb-2">{t.auth.newPasswordHint}</div>
          <input
            type="password"
            autoComplete="new-password"
            {...register('newPassword')}
            className="term-input"
          />
          {errors.newPassword && (
            <div className="mt-1 text-[10px] text-[#D4574A]">
              ⚠ {fieldError(errors.newPassword.message)}
            </div>
          )}
        </label>

        <label className="block">
          <div className="label mb-2">{t.auth.confirmNewPassword}</div>
          <input
            type="password"
            autoComplete="new-password"
            {...register('confirmNewPassword')}
            className="term-input"
          />
          {errors.confirmNewPassword && (
            <div className="mt-1 text-[10px] text-[#D4574A]">
              ⚠ {fieldError(errors.confirmNewPassword.message)}
            </div>
          )}
        </label>

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}
        {ok && (
          <div className="border border-[#6AA67C]/40 bg-[#ECF7EF] p-3 text-[12px] text-[#2E6E46]">
            ✓ {t.auth.passwordUpdated}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button type="submit" disabled={isSubmitting} className="btn-acid">
            → {t.auth.updatePassword}
          </button>
          <button type="button" onClick={handleClose} className="btn-teal-outline">
            [{t.common.cancel}]
          </button>
        </div>
      </form>
    </Modal>
  );
}
