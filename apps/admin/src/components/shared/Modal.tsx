import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}

const widthMap = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-[95vw]' };

export function Modal({ open, onClose, title, subtitle, children, footer, width = 'md' }: Props): JSX.Element | null {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastActiveRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    return () => {
      window.removeEventListener('keydown', onKey);
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      lastActiveRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[5000] overflow-y-auto overscroll-contain">
      <div className="relative flex min-h-full items-start justify-center px-3 py-4 sm:px-4 sm:py-10">
        <button
          type="button"
          aria-label="关闭对话框"
          className="absolute inset-0 h-full w-full cursor-default bg-[#1A2530]/70 backdrop-blur"
          onClick={onClose}
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`relative z-[1] max-h-[calc(100svh-2rem)] w-full overflow-y-auto ${widthMap[width]} card-base scanlines p-0 focus:outline-none sm:max-h-[calc(100vh-5rem)]`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span id={titleId} className="font-semibold text-base text-[#186073]">{title}</span>
                <span className="text-xs text-[#C9A247]">◆</span>
              </div>
              {subtitle && (
                <div className="mt-1 break-words font-semibold text-xl text-[#0F172A] sm:text-2xl">{subtitle}</div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-teal-outline text-[11px]"
              aria-label="关闭对话框"
            >
              [ESC]
            </button>
          </div>
          <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
          {footer && <div className="border-t border-[#E5E7EB] px-4 py-3 sm:px-6">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
