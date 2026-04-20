import type { ReactNode } from 'react';

interface Props {
  section: string;            // e.g. "§ OPS 01"
  breadcrumb: string;         // e.g. "DASHBOARD"
  title: string;
  titleSuffix?: string;
  titleSuffixColor?: 'acid' | 'ember' | 'toxic' | 'amber';
  description?: string;
  rightSlot?: ReactNode;
}

const suffixMap: Record<NonNullable<Props['titleSuffixColor']>, string> = {
  acid: 'text-neon-acid',
  ember: 'text-neon-ember',
  toxic: 'text-neon-toxic',
  amber: 'text-neon-amber',
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
    <header className="mb-6 border-b border-ink-200 pb-5">
      <div className="flex items-center justify-between text-[10px] tracking-[0.3em] text-ink-500">
        <div className="flex items-center gap-3">
          <span>{section}</span>
          <span>/</span>
          <span className="text-ink-700">{breadcrumb}</span>
        </div>
        {rightSlot}
      </div>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-wide text-ink-900">
        {title}
        {titleSuffix && <span className={`ml-3 ${suffixMap[titleSuffixColor]}`}>{titleSuffix}</span>}
      </h1>
      {description && (
        <p className="mt-2 max-w-3xl font-mono text-[12px] text-ink-600">{description}</p>
      )}
    </header>
  );
}
