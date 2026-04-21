interface Props {
  label: string;
  value: string;
  hint?: string;
  accent?: 'acid' | 'ember' | 'toxic' | 'amber' | 'ice';
}

const accentMap: Record<NonNullable<Props['accent']>, { text: string; border: string }> = {
  acid: { text: 'num text-[#C9A247]', border: 'border-l-brass-500' },
  ember: { text: 'num-wine', border: 'border-l-wine-500' },
  toxic: { text: 'num-win', border: 'border-l-win' },
  amber: { text: 'num text-[#C9A247]', border: 'border-l-brass-400' },
  ice: { text: 'text-[#186073]', border: 'border-l-[#266F85]' },
};

export function StatCard({ label, value, hint, accent = 'acid' }: Props): JSX.Element {
  const { text, border } = accentMap[accent];
  return (
    <div className={`card-base p-5 border-l-[3px] ${border}`}>
      <div className="label text-[#186073]">{label}</div>
      <div className={`mt-2 num text-4xl ${text}`}>{value}</div>
      {hint && <div className="mt-2 font-mono text-[10px] tracking-[0.2em] text-[#4A5568]">{hint}</div>}
    </div>
  );
}
