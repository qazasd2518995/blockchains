interface Props {
  label: string;
  value: string;
  hint?: string;
  accent?: 'acid' | 'ember' | 'toxic' | 'amber' | 'ice';
}

const accentMap: Record<NonNullable<Props['accent']>, string> = {
  acid: 'text-neon-acid border-neon-acid/20',
  ember: 'text-neon-ember border-neon-ember/20',
  toxic: 'text-neon-toxic border-neon-toxic/20',
  amber: 'text-neon-amber border-neon-amber/20',
  ice: 'text-neon-ice border-neon-ice/20',
};

export function StatCard({ label, value, hint, accent = 'acid' }: Props): JSX.Element {
  const colorClass = accentMap[accent];
  return (
    <div className={`crt-panel p-5 border-l-4 ${colorClass.split(' ')[1]}`}>
      <div className="label">{label}</div>
      <div className={`mt-2 big-num text-4xl ${colorClass.split(' ')[0]}`}>{value}</div>
      {hint && <div className="mt-2 text-[10px] tracking-[0.2em] text-ink-500">{hint}</div>}
    </div>
  );
}
