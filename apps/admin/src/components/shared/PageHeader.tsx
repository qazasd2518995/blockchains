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
  acid: 'text-brass-700',
  ember: 'text-wine-500',
  toxic: 'text-win',
  amber: 'text-brass-600',
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
    <header className="mb-7 border-b border-brass-500/40 pb-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.3em] text-ivory-600">
          <span className="font-script text-sm normal-case tracking-normal text-brass-700">
            {section}
          </span>
          <span className="text-brass-500">◆</span>
          <span className="text-ivory-800">{breadcrumb}</span>
        </div>
        {rightSlot}
      </div>
      <h1 className="mt-4 font-serif text-4xl leading-[1.05] tracking-tight text-ivory-950">
        {title}
        {titleSuffix && (
          <span className={`ml-3 italic ${suffixMap[titleSuffixColor]}`}>{titleSuffix}</span>
        )}
      </h1>
      {description && (
        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ivory-700">
          {description}
        </p>
      )}
    </header>
  );
}
