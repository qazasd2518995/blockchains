import type { ReactNode } from 'react';

interface Props {
  section: string;
  breadcrumb: string;
  title: string;
  titleSuffix?: string;
  titleSuffixColor?: 'acid' | 'ember' | 'toxic' | 'amber';
  description?: string;
  rightSlot?: ReactNode;
}

const suffixMap: Record<NonNullable<Props['titleSuffixColor']>, string> = {
  acid: 'text-[#8FD0DF]',
  ember: 'text-[#F0A596]',
  toxic: 'text-win',
  amber: 'text-[#E8D48A]',
};

export function PageHeader({
  section,
  breadcrumb,
  title,
  titleSuffix,
  titleSuffixColor = 'acid',
  description,
  rightSlot,
}: Props): JSX.Element {
  return (
    <header className="admin-page-header relative mb-5 overflow-hidden rounded-[12px] border border-[#16324A]/12 bg-[#0B1827] px-4 py-5 shadow-[0_20px_48px_rgba(15,23,42,0.08)] sm:mb-7 sm:rounded-[14px] sm:px-6 sm:py-6">
      <img
        src="/backgrounds/admin-shell-host.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[72%_42%] opacity-24"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(6,16,30,0.94)_0%,rgba(6,16,30,0.9)_36%,rgba(6,16,30,0.58)_100%)]" />

      <div className="relative flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-white/58 sm:gap-3 sm:tracking-[0.3em]">
          <span className="font-semibold text-sm normal-case tracking-normal text-[#8FD0DF]">
            {section}
          </span>
          <span className="text-[#C9A247]">◆</span>
          <span className="text-white">{breadcrumb}</span>
        </div>
        {rightSlot}
      </div>
      <h1 className="relative mt-4 font-semibold text-[28px] leading-tight tracking-tight text-white sm:text-4xl sm:leading-[1.05]">
        {title}
        {titleSuffix && (
          <span className={`ml-3 italic ${suffixMap[titleSuffixColor]}`}>{titleSuffix}</span>
        )}
      </h1>
      {description && (
        <p className="relative mt-3 max-w-3xl text-[13px] leading-relaxed text-white/72">
          {description}
        </p>
      )}
    </header>
  );
}
