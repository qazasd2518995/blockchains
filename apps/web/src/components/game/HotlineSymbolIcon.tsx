import { cn } from '@/lib/utils';
import {
  getHotlineSymbolMeta,
  type HotlineSymbolKey,
} from '@/lib/hotlineSymbols';

interface HotlineSymbolIconProps {
  symbol: number | HotlineSymbolKey;
  className?: string;
  title?: string;
}

export function HotlineSymbolIcon({
  symbol,
  className,
  title,
}: HotlineSymbolIconProps): JSX.Element {
  const meta = getHotlineSymbolMeta(symbol);

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-5 w-5', className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.9}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}

      {meta.key === 'cherry' ? (
        <>
          <circle cx="9" cy="14.5" r="3.2" fill="currentColor" fillOpacity="0.14" />
          <circle cx="15" cy="14.5" r="3.2" fill="currentColor" fillOpacity="0.14" />
          <circle cx="9" cy="14.5" r="3.2" />
          <circle cx="15" cy="14.5" r="3.2" />
          <path d="M9.6 11.4C9.6 8.9 10.7 7.1 12 5.8" />
          <path d="M14.4 11.4C14.4 8.9 13.3 7.1 12 5.8" />
          <path d="M12.7 6.2C14.8 5.7 16 6.2 17.1 7.8C15 8.6 13.9 8.2 12.7 6.2Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M12.7 6.2C14.8 5.7 16 6.2 17.1 7.8C15 8.6 13.9 8.2 12.7 6.2Z" />
        </>
      ) : null}

      {meta.key === 'bell' ? (
        <>
          <path d="M12 6.2C14.6 6.2 16.1 7.9 16.1 10.6V12.2L17.4 15.2H6.6L7.9 12.2V10.6C7.9 7.9 9.4 6.2 12 6.2Z" fill="currentColor" fillOpacity="0.12" />
          <path d="M12 6.2C14.6 6.2 16.1 7.9 16.1 10.6V12.2L17.4 15.2H6.6L7.9 12.2V10.6C7.9 7.9 9.4 6.2 12 6.2Z" />
          <path d="M10.2 16.8H13.8" />
          <circle cx="12" cy="15.4" r="1" fill="currentColor" />
          <path d="M10.8 5H13.2" />
        </>
      ) : null}

      {meta.key === 'seven' ? (
        <>
          <path d="M6.4 6.7H17.5L11 17.4H8.1L13.7 9.3H7.6Z" fill="currentColor" fillOpacity="0.12" />
          <path d="M6.4 6.7H17.5L11 17.4H8.1L13.7 9.3H7.6Z" />
        </>
      ) : null}

      {meta.key === 'bar' ? (
        <>
          <rect x="5.7" y="6.4" width="12.6" height="11.2" rx="3.2" fill="currentColor" fillOpacity="0.12" />
          <rect x="5.7" y="6.4" width="12.6" height="11.2" rx="3.2" />
          <path d="M8.2 9.1H15.8" />
          <path d="M7.7 12H16.3" />
          <path d="M8.2 14.9H15.8" />
        </>
      ) : null}

      {meta.key === 'diamond' ? (
        <>
          <path d="M12 5.8L17.2 12L12 18.2L6.8 12L12 5.8Z" fill="currentColor" fillOpacity="0.12" />
          <path d="M12 5.8L17.2 12L12 18.2L6.8 12L12 5.8Z" />
          <path d="M9.2 9.1H14.8" />
          <path d="M12 5.8V18.2" />
          <path d="M6.8 12H17.2" />
        </>
      ) : null}

      {meta.key === 'jackpot' ? (
        <>
          <path d="M6.2 16.9L7.4 9.3L10.4 12L12 7.8L13.6 12L16.6 9.3L17.8 16.9H6.2Z" fill="currentColor" fillOpacity="0.12" />
          <path d="M6.2 16.9L7.4 9.3L10.4 12L12 7.8L13.6 12L16.6 9.3L17.8 16.9H6.2Z" />
          <path d="M7 18.7H17" />
          <circle cx="7.4" cy="8.6" r="0.9" fill="currentColor" />
          <circle cx="12" cy="7" r="0.9" fill="currentColor" />
          <circle cx="16.6" cy="8.6" r="0.9" fill="currentColor" />
        </>
      ) : null}
    </svg>
  );
}

interface HotlineSymbolBadgeProps {
  symbol: number | HotlineSymbolKey;
  className?: string;
  iconClassName?: string;
  showLabel?: boolean;
  useShortLabel?: boolean;
}

export function HotlineSymbolBadge({
  symbol,
  className,
  iconClassName,
  showLabel = false,
  useShortLabel = false,
}: HotlineSymbolBadgeProps): JSX.Element {
  const meta = getHotlineSymbolMeta(symbol);
  const label = useShortLabel ? meta.shortLabel : meta.label;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        className,
      )}
      style={{
        borderColor: `${meta.accentHex}33`,
        backgroundColor: `${meta.accentHex}14`,
        color: meta.accentHex,
      }}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full border bg-white/90"
        style={{ borderColor: `${meta.accentHex}30` }}
      >
        <HotlineSymbolIcon symbol={symbol} className={cn('h-4 w-4', iconClassName)} title={meta.label} />
      </span>
      {showLabel ? <span className="tracking-[0.18em]">{label}</span> : null}
    </span>
  );
}
