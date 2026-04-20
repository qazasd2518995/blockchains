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
        className="absolute inset-0 bg-felt-900/70 backdrop-blur"
        onClick={onClose}
      />
      <div className={`relative w-full ${widthMap[width]} panel-salon scanlines p-0`}>
        <div className="flex items-center justify-between border-b border-brass-500/40 px-6 py-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-script text-base text-brass-700">{title}</span>
              <span className="text-brass-500 text-xs">◆</span>
            </div>
            {subtitle && (
              <div className="mt-1 font-serif text-2xl text-ivory-950">{subtitle}</div>
            )}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost text-[11px]">
            [ESC]
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="border-t border-brass-500/25 px-6 py-3">{footer}</div>}
      </div>
    </div>
  );
}
