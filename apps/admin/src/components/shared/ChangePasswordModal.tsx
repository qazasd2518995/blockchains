import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';

const schema = z
  .object({
    currentPassword: z.string().min(1, { message: '请输入目前密码' }),
    newPassword: z
      .string()
      .min(8, { message: '新密码至少 8 字' })
      .max(128, { message: '新密码过长' })
      .regex(/[A-Za-z]/, { message: '新密码须包含英文字母' })
      .regex(/\d/, { message: '新密码须包含数字' }),
    confirmNewPassword: z.string().min(1, { message: '请再次输入新密码' }),
  })
  .refine((v) => v.newPassword === v.confirmNewPassword, {
    message: '两次输入的新密码不一致',
    path: ['confirmNewPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: '新密码不可与目前密码相同',
    path: ['newPassword'],
  });

type FormInput = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: Props): JSX.Element {
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
      // 顯示成功短暫即關閉
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

  return (
    <Modal open={open} onClose={handleClose} title="更改密码" subtitle="账户安全" width="sm">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <label className="block">
          <div className="label mb-2">目前密码</div>
          <input
            type="password"
            autoComplete="current-password"
            {...register('currentPassword')}
            className="term-input"
          />
          {errors.currentPassword && (
            <div className="mt-1 text-[10px] text-[#D4574A]">⚠ {errors.currentPassword.message}</div>
          )}
        </label>

        <label className="block">
          <div className="label mb-2">新密码（至少 8 字，须含英文与数字）</div>
          <input
            type="password"
            autoComplete="new-password"
            {...register('newPassword')}
            className="term-input"
          />
          {errors.newPassword && (
            <div className="mt-1 text-[10px] text-[#D4574A]">⚠ {errors.newPassword.message}</div>
          )}
        </label>

        <label className="block">
          <div className="label mb-2">确认新密码</div>
          <input
            type="password"
            autoComplete="new-password"
            {...register('confirmNewPassword')}
            className="term-input"
          />
          {errors.confirmNewPassword && (
            <div className="mt-1 text-[10px] text-[#D4574A]">⚠ {errors.confirmNewPassword.message}</div>
          )}
        </label>

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}
        {ok && (
          <div className="border border-[#6AA67C]/40 bg-[#ECF7EF] p-3 text-[12px] text-[#2E6E46]">
            ✓ 密码已更新
          </div>
        )}

        <div className="flex items-center gap-2">
          <button type="submit" disabled={isSubmitting} className="btn-acid">
            → 更新密码
          </button>
          <button type="button" onClick={handleClose} className="btn-teal-outline">
            [取消]
          </button>
        </div>
      </form>
    </Modal>
  );
}
