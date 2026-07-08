import { type FormEvent, useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { api, extractApiError } from '@/lib/api';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
    setSubmitting(false);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!PASSWORD_PATTERN.test(newPassword)) {
      setError('新密碼需為 8-128 碼，且包含英文與數字');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('兩次輸入的新密碼不一致');
      return;
    }
    if (currentPassword === newPassword) {
      setError('新密碼不能與目前密碼相同');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setSuccess('密碼已更新');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      window.setTimeout(onClose, 650);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] overflow-y-auto bg-black/62 px-4 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="關閉修改密碼"
        onClick={onClose}
      />
      <div className="relative z-10 flex min-h-[100svh] items-center justify-center py-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+16px)] sm:py-6">
        <form
          onSubmit={handleSubmit}
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-password-title"
          className="w-full max-w-[420px] overflow-y-auto rounded-[14px] border border-white/12 bg-[#0F172A] p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.46)]"
          style={{
            maxHeight:
              'calc(100svh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px)',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#C9A247]/35 bg-[#1A2538] text-[#E8D48A]">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 id="change-password-title" className="truncate text-[18px] font-black">
                修改密碼
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/72 transition hover:border-white/24 hover:bg-white/[0.1] hover:text-white"
              aria-label="關閉"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold text-white/66">目前密碼</span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="h-12 w-full rounded-[10px] border border-white/12 bg-white/[0.06] px-3 text-[16px] font-semibold text-white outline-none transition placeholder:text-white/28 focus:border-[#E8D48A]/70 focus:bg-white/[0.09]"
                required
                maxLength={128}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold text-white/66">新密碼</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="h-12 w-full rounded-[10px] border border-white/12 bg-white/[0.06] px-3 text-[16px] font-semibold text-white outline-none transition placeholder:text-white/28 focus:border-[#E8D48A]/70 focus:bg-white/[0.09]"
                required
                minLength={8}
                maxLength={128}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold text-white/66">確認新密碼</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-12 w-full rounded-[10px] border border-white/12 bg-white/[0.06] px-3 text-[16px] font-semibold text-white outline-none transition placeholder:text-white/28 focus:border-[#E8D48A]/70 focus:bg-white/[0.09]"
                required
                minLength={8}
                maxLength={128}
              />
            </label>
          </div>

          <div className="mt-3 min-h-5 text-[13px] font-semibold">
            {error ? <span className="text-[#FCA5A5]">{error}</span> : null}
            {success ? <span className="text-[#86EFAC]">{success}</span> : null}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-[#D97706] px-4 text-[15px] font-black text-white shadow-[0_10px_24px_rgba(217,119,6,0.28)] transition hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? '更新中...' : '更新密碼'}
          </button>
        </form>
      </div>
    </div>
  );
}
