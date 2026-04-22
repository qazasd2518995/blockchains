import type { ReactNode } from 'react';

interface Props {
  eyebrow: string;
  title: string;
  description?: string;
  rightSlot?: ReactNode;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  rightSlot,
}: Props): JSX.Element {
  return (
    <header className="flex flex-col gap-4 border-b border-[#E5E7EB] pb-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <div className="label">{eyebrow}</div>
        <h2 className="mt-3 text-[28px] font-bold tracking-tight text-[#0F172A] md:text-[34px]">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[#4A5568]">
            {description}
          </p>
        ) : null}
      </div>
      {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
    </header>
  );
}
