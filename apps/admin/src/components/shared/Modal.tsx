import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const widthMap = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] overflow-y-auto overscroll-contain">
      <div className="flex min-h-full items-center justify-center px-4 py-8">
        <div
          className="absolute inset-0 bg-[#1A2530]/70 backdrop-blur"
          onClick={onClose}
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`relative w-full ${widthMap[width]} card-base scanlines p-0 focus:outline-none`}
        >
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span id={titleId} className="font-semibold text-base text-[#186073]">{title}</span>
                <span className="text-xs text-[#C9A247]">◆</span>
              </div>
              {subtitle && (
                <div className="mt-1 font-semibold text-2xl text-[#0F172A]">{subtitle}</div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-teal-outline text-[11px]"
              aria-label="關閉對話框"
            >
              [ESC]
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
          {footer && <div className="border-t border-[#E5E7EB] px-6 py-3">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
