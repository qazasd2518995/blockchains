import { cn } from '@/lib/utils';
import { getHotlineSymbolMeta, type HotlineSymbolKey } from '@/lib/hotlineSymbols';

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

      {meta.key.includes('gem') || meta.key === 'diamond' ? (
        <>
          <path
            d="M12 4.8L18 10.7L15.7 19.2H8.3L6 10.7L12 4.8Z"
            fill="currentColor"
            fillOpacity="0.12"
          />
          <path d="M12 4.8L18 10.7L15.7 19.2H8.3L6 10.7L12 4.8Z" />
          <path d="M6 10.7H18" />
          <path d="M9 10.7L12 19.2L15 10.7" />
          <path d="M9 10.7L12 4.8L15 10.7" />
        </>
      ) : null}

      {meta.key === 'star' ? (
        <>
          <path
            d="M12 4.7L13.9 9.3L18.9 9.7L15.1 13L16.2 17.9L12 15.3L7.8 17.9L8.9 13L5.1 9.7L10.1 9.3L12 4.7Z"
            fill="currentColor"
            fillOpacity="0.12"
          />
          <path d="M12 4.7L13.9 9.3L18.9 9.7L15.1 13L16.2 17.9L12 15.3L7.8 17.9L8.9 13L5.1 9.7L10.1 9.3L12 4.7Z" />
        </>
      ) : null}

      {meta.key === 'jackpot' ? (
        <>
          <circle cx="12" cy="12" r="6.2" fill="currentColor" fillOpacity="0.12" />
          <circle cx="12" cy="12" r="6.2" />
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 5.8V8.2" />
          <path d="M12 15.8V18.2" />
          <path d="M5.8 12H8.2" />
          <path d="M15.8 12H18.2" />
        </>
      ) : null}

      {meta.key === 'crown' ? (
        <>
          <path
            d="M6.2 16.9L7.4 9.3L10.4 12L12 7.8L13.6 12L16.6 9.3L17.8 16.9H6.2Z"
            fill="currentColor"
            fillOpacity="0.12"
          />
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
        <HotlineSymbolIcon
          symbol={symbol}
          className={cn('h-4 w-4', iconClassName)}
          title={meta.label}
        />
      </span>
      {showLabel ? <span className="tracking-[0.18em]">{label}</span> : null}
    </span>
  );
}
