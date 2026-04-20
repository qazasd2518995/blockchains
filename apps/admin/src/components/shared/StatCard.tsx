interface Props {
  label: string;
  value: string;
  hint?: string;
  accent?: 'acid' | 'ember' | 'toxic' | 'amber' | 'ice';
}

const accentMap: Record<NonNullable<Props['accent']>, { text: string; border: string }> = {
  acid: { text: 'big-num-brass', border: 'border-l-brass-500' },
  ember: { text: 'big-num-wine', border: 'border-l-wine-500' },
  toxic: { text: 'big-num-win', border: 'border-l-win' },
  amber: { text: 'big-num-brass', border: 'border-l-brass-400' },
  ice: { text: 'text-felt-500', border: 'border-l-felt-400' },
};

export function StatCard({ label, value, hint, accent = 'acid' }: Props): JSX.Element {
  const { text, border } = accentMap[accent];
  return (
    <div className={`panel-salon p-5 border-l-[3px] ${border}`}>
      <div className="label label-brass">{label}</div>
      <div className={`mt-2 big-num text-4xl ${text}`}>{value}</div>
      {hint && <div className="mt-2 font-mono text-[10px] tracking-[0.2em] text-ivory-600">{hint}</div>}
    </div>
  );
}
