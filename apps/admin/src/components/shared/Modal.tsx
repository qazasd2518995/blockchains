import type { ReactNode } from 'react';
import { useEffect } from 'react';

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4 py-8">
      <div
        className="absolute inset-0 bg-[#1A2530]/70 backdrop-blur"
        onClick={onClose}
      />
      <div className={`relative w-full ${widthMap[width]} card-base scanlines p-0`}>
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-base text-[#186073]">{title}</span>
              <span className="text-[#C9A247] text-xs">◆</span>
            </div>
            {subtitle && (
              <div className="mt-1 font-semibold text-2xl text-[#0F172A]">{subtitle}</div>
            )}
          </div>
          <button type="button" onClick={onClose} className="btn-teal-outline text-[11px]">
            [ESC]
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="border-t border-[#E5E7EB] px-6 py-3">{footer}</div>}
      </div>
    </div>
  );
}
