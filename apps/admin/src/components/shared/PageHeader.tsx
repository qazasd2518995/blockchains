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
  acid: 'text-[#186073]',
  ember: 'text-[#D4574A]',
  toxic: 'text-win',
  amber: 'text-[#AE8B35]',
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
    <header className="mb-7 border-b border-[#E5E7EB] pb-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.3em] text-[#4A5568]">
          <span className="font-semibold text-sm normal-case tracking-normal text-[#186073]">
            {section}
          </span>
          <span className="text-[#C9A247]">◆</span>
          <span className="text-[#0F172A]">{breadcrumb}</span>
        </div>
        {rightSlot}
      </div>
      <h1 className="mt-4 font-semibold text-4xl leading-[1.05] tracking-tight text-[#0F172A]">
        {title}
        {titleSuffix && (
          <span className={`ml-3 italic ${suffixMap[titleSuffixColor]}`}>{titleSuffix}</span>
        )}
      </h1>
      {description && (
        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-[#4A5568]">
          {description}
        </p>
      )}
    </header>
  );
}
