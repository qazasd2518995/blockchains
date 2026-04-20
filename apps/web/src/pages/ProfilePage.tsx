import { useEffect, useState } from 'react';
import type { ActiveSeedsResponse, RotateSeedResponse } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

export function ProfilePage() {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [seeds, setSeeds] = useState<ActiveSeedsResponse['seeds']>([]);
  const [clientSeedInput, setClientSeedInput] = useState('');
  const [reveal, setReveal] = useState<RotateSeedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSeeds = async () => {
    try {
      const res = await api.get<ActiveSeedsResponse>('/pf/active');
      setSeeds(res.data.seeds);
    } catch (err) {
      setError(extractApiError(err).message);
    }
  };

  useEffect(() => {
    void loadSeeds();
  }, []);

  const handleRotate = async (gameCategory: string) => {
    try {
      const res = await api.post<RotateSeedResponse>('/pf/rotate', { gameCategory });
      setReveal(res.data);
      await loadSeeds();
    } catch (err) {
      setError(extractApiError(err).message);
    }
  };

  const handleUpdateClientSeed = async () => {
    if (clientSeedInput.length < 4) return;
    try {
      await api.post('/pf/client-seed', { seed: clientSeedInput });
      setClientSeedInput('');
      await loadSeeds();
    } catch (err) {
      setError(extractApiError(err).message);
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-10">
      <section className="border-b border-ink-200 pb-6">
        <div className="label">§ {t.profile.dossierHeader}</div>
        <h1 className="mt-2 font-serif text-6xl font-black italic">
          <span className="text-ink-900">{t.profile.your} </span>
          <span className="text-neon-acid not-italic">{t.profile.dossier}</span>
        </h1>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <InfoCard label={t.common.email.toUpperCase()} value={user?.email ?? '—'} />
        <InfoCard label={t.common.callsign.toUpperCase()} value={user?.displayName ?? '—'} />
        <InfoCard
          label={t.profile.sessionId}
          value={user?.id ? `0x${user.id.slice(-8).toUpperCase()}` : '—'}
        />
        <div className="crt-panel p-5">
          <div className="label">{t.common.credits}</div>
          <div className="mt-2 big-num text-5xl text-neon-acid">
            {formatAmount(user?.balance ?? '0')}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between border-b border-ink-200 pb-4">
          <div>
            <div className="label">§ {t.profile.cryptoSeeds}</div>
            <h2 className="mt-2 font-serif text-3xl italic">
              <span className="text-ink-900">{t.profile.provably} </span>
              <span className="text-neon-acid not-italic">{t.profile.fair}</span>
            </h2>
            <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-ink-600">
              {t.profile.seedsDesc}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {seeds.map((s) => (
            <div
              key={s.gameCategory}
              className="crt-panel scanlines grid gap-4 p-5 md:grid-cols-[auto_1fr_auto] md:items-center"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center border border-neon-acid/30 bg-neon-acid/5 font-display text-2xl text-neon-acid">
                  {s.gameCategory.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="label">{t.profile.category}</div>
                  <div className="mt-1 font-display text-2xl uppercase tracking-wider text-ink-900">
                    {s.gameCategory}
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-[11px]">
                <SeedRow
                  label={t.profile.serverHash}
                  value={s.serverSeedHash}
                  copyLabel={t.common.copy.toUpperCase()}
                  onCopy={() => copy(s.serverSeedHash)}
                />
                <SeedRow
                  label={t.profile.clientSeed}
                  value={s.clientSeed}
                  copyLabel={t.common.copy.toUpperCase()}
                  onCopy={() => copy(s.clientSeed)}
                />
                <div className="flex items-baseline justify-between">
                  <span className="label">{t.profile.nonce}</span>
                  <span className="data-num text-neon-acid">
                    #{s.nonce.toString().padStart(6, '0')}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRotate(s.gameCategory)}
                className="btn-ember text-[11px]"
              >
                ⟲ {t.profile.rotate}
              </button>
            </div>
          ))}
        </div>

        <div className="crt-panel mt-6 p-5">
          <div className="flex items-center justify-between border-b border-ink-200 pb-3">
            <div>
              <div className="label">{t.profile.clientSeedOverride}</div>
              <div className="mt-1 text-[11px] text-ink-600">
                {t.profile.clientSeedOverrideHint}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={clientSeedInput}
              onChange={(e) => setClientSeedInput(e.target.value)}
              placeholder="MIN 4 CHARS · EX: my_lucky_seed_42"
              className="term-input flex-1"
            />
            <button
              type="button"
              onClick={handleUpdateClientSeed}
              disabled={clientSeedInput.length < 4}
              className="btn-acid"
            >
              → {t.common.commit.toUpperCase()}
            </button>
          </div>
        </div>

        {reveal && (
          <div className="crt-panel mt-6 border-neon-toxic/50 p-5">
            <div className="flex items-center gap-3 border-b border-neon-toxic/20 pb-3">
              <span className="tag tag-toxic">
                <span className="status-dot status-dot-live" />
                {t.profile.revealed}
              </span>
              <div className="font-display text-xl tracking-wider text-neon-toxic">
                {t.profile.seedUnmasked}
              </div>
            </div>
            <div className="mt-4 space-y-3 text-[11px]">
              <SeedRow
                label={t.profile.revealedSeed}
                value={reveal.revealedServerSeed}
                copyLabel={t.common.copy.toUpperCase()}
                onCopy={() => copy(reveal.revealedServerSeed)}
              />
              <SeedRow
                label={t.profile.originalHash}
                value={reveal.revealedSeedHash}
                copyLabel={t.common.copy.toUpperCase()}
                onCopy={() => copy(reveal.revealedSeedHash)}
              />
              <SeedRow
                label={t.profile.newHash}
                value={reveal.newSeedHash}
                copyLabel={t.common.copy.toUpperCase()}
                onCopy={() => copy(reveal.newSeedHash)}
              />
              <div className="flex items-baseline justify-between">
                <span className="label">{t.profile.totalNonces}</span>
                <span className="data-num text-neon-toxic">{reveal.revealedNonce}</span>
              </div>
            </div>
            <pre className="mt-4 border border-neon-toxic/20 bg-ink-50 p-4 text-[10px] leading-relaxed text-ink-700">
{`${t.profile.verifyInNode}
const crypto = require('crypto');
const hash = crypto.createHash('sha256')
  .update('${reveal.revealedServerSeed.slice(0, 24)}...')
  .digest('hex');
console.log(hash === '${reveal.revealedSeedHash.slice(0, 24)}...');
// Expected: true`}
            </pre>
          </div>
        )}

        {error && (
          <div className="mt-4 border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
            {t.common.error.toUpperCase()}: {error.toUpperCase()}
          </div>
        )}
      </section>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink-200 bg-ink-100/40 p-5">
      <div className="label">{label}</div>
      <div className="mt-2 truncate font-mono text-sm text-ink-900">{value}</div>
    </div>
  );
}

function SeedRow({
  label,
  value,
  copyLabel,
  onCopy,
}: {
  label: string;
  value: string;
  copyLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-ink-200 pb-2 last:border-0 last:pb-0">
      <span className="label w-32 shrink-0">{label}</span>
      <span className="flex-1 truncate font-mono text-ink-800">{value}</span>
      <button
        type="button"
        onClick={onCopy}
        className="text-[10px] tracking-[0.2em] text-ink-500 transition hover:text-neon-acid"
      >
        [{copyLabel}]
      </button>
    </div>
  );
}
