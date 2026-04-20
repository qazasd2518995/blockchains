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
    <div className="relative space-y-12">
      <div className="crystal-overlay" />

      <section className="relative z-10 border-b border-brass-500/40 pb-6">
        <div className="flex items-center gap-3">
          <span className="font-script text-lg text-brass-700">{t.profile.dossierHeader}</span>
          <span className="text-brass-500">◆</span>
          <span className="label label-brass">membership</span>
        </div>
        <h1 className="mt-3 font-serif text-6xl leading-[0.95] text-ivory-950">
          <span>{t.profile.your} </span>
          <span className="italic text-brass-700">{t.profile.dossier}</span>
        </h1>
      </section>

      <section className="relative z-10 grid gap-4 md:grid-cols-4">
        <InfoCard label={t.common.email} value={user?.email ?? '—'} />
        <InfoCard label={t.common.callsign} value={user?.displayName ?? '—'} />
        <InfoCard
          label={t.profile.sessionId}
          value={user?.id ? `0x${user.id.slice(-8).toUpperCase()}` : '—'}
        />
        <div className="panel-salon p-5">
          <div className="label label-brass">{t.common.credits}</div>
          <div className="mt-2 big-num big-num-brass text-5xl">
            {formatAmount(user?.balance ?? '0')}
          </div>
        </div>
      </section>

      <section className="relative z-10">
        <div className="mb-6 flex items-end justify-between border-b border-brass-500/40 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-script text-lg text-brass-700">{t.profile.cryptoSeeds}</span>
              <span className="text-brass-500">◆</span>
              <span className="label label-brass">provably fair</span>
            </div>
            <h2 className="mt-3 font-serif text-4xl leading-tight text-ivory-950">
              <span>{t.profile.provably} </span>
              <span className="italic text-brass-700">{t.profile.fair}</span>
            </h2>
            <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-ivory-700">
              {t.profile.seedsDesc}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {seeds.map((s) => (
            <div
              key={s.gameCategory}
              className="panel-felt scanlines grid gap-4 p-6 md:grid-cols-[auto_1fr_auto] md:items-center"
            >
              <div className="flex items-center gap-4">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-brass-400 bg-felt-700 shadow-lift">
                  <span className="font-serif text-2xl italic text-brass-300">
                    {s.gameCategory.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="label text-brass-400">{t.profile.category}</div>
                  <div className="mt-1 font-serif text-2xl tracking-tight text-ivory-100">
                    {s.gameCategory.toUpperCase()}
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-[11px]">
                <SeedRow
                  label={t.profile.serverHash}
                  value={s.serverSeedHash}
                  copyLabel={t.common.copy}
                  onCopy={() => copy(s.serverSeedHash)}
                  dark
                />
                <SeedRow
                  label={t.profile.clientSeed}
                  value={s.clientSeed}
                  copyLabel={t.common.copy}
                  onCopy={() => copy(s.clientSeed)}
                  dark
                />
                <div className="flex items-baseline justify-between">
                  <span className="label text-brass-400">{t.profile.nonce}</span>
                  <span className="data-num text-brass-300">
                    #{s.nonce.toString().padStart(6, '0')}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRotate(s.gameCategory)}
                className="btn-wine text-[11px]"
              >
                ⟲ {t.profile.rotate}
              </button>
            </div>
          ))}
        </div>

        <div className="panel-salon mt-6 p-6">
          <div className="flex items-center justify-between border-b border-brass-500/40 pb-3">
            <div>
              <div className="label label-brass">{t.profile.clientSeedOverride}</div>
              <div className="mt-1 font-script text-sm text-ivory-700">
                {t.profile.clientSeedOverrideHint}
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <input
              type="text"
              value={clientSeedInput}
              onChange={(e) => setClientSeedInput(e.target.value)}
              placeholder={t.profile.clientSeedPlaceholder}
              className="input-salon flex-1"
            />
            <button
              type="button"
              onClick={handleUpdateClientSeed}
              disabled={clientSeedInput.length < 4}
              className="btn-brass"
            >
              → {t.common.commit}
            </button>
          </div>
        </div>

        {reveal && (
          <div className="panel-salon mt-6 p-6" style={{ boxShadow: '0 0 0 1px #8A6B2A, 0 0 0 3px #FBF9F4, 0 0 0 4px #1E7A4F, 0 14px 30px -10px rgba(10,8,6,0.18)' }}>
            <div className="flex items-center gap-3 border-b border-win/30 pb-3">
              <span className="tag tag-felt">
                <span className="status-dot status-dot-live" />
                {t.profile.revealed}
              </span>
              <div className="font-serif text-2xl italic text-win">
                {t.profile.seedUnmasked}
              </div>
            </div>
            <div className="mt-4 space-y-3 text-[11px]">
              <SeedRow
                label={t.profile.revealedSeed}
                value={reveal.revealedServerSeed}
                copyLabel={t.common.copy}
                onCopy={() => copy(reveal.revealedServerSeed)}
              />
              <SeedRow
                label={t.profile.originalHash}
                value={reveal.revealedSeedHash}
                copyLabel={t.common.copy}
                onCopy={() => copy(reveal.revealedSeedHash)}
              />
              <SeedRow
                label={t.profile.newHash}
                value={reveal.newSeedHash}
                copyLabel={t.common.copy}
                onCopy={() => copy(reveal.newSeedHash)}
              />
              <div className="flex items-baseline justify-between">
                <span className="label label-brass">{t.profile.totalNonces}</span>
                <span className="data-num text-win">{reveal.revealedNonce}</span>
              </div>
            </div>
            <pre className="mt-5 rounded-sm border border-brass-500/30 bg-ivory-200/60 p-4 font-mono text-[10px] leading-relaxed text-ivory-900">
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
          <div className="mt-5 border border-wine-400/50 bg-wine-50 p-4 text-[12px] text-wine-600">
            <span className="font-serif font-bold italic">{t.common.error}:</span> {error}
          </div>
        )}
      </section>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-salon-soft p-5">
      <div className="label label-brass">{label}</div>
      <div className="mt-2 truncate font-mono text-sm text-ivory-950">{value}</div>
    </div>
  );
}

function SeedRow({
  label,
  value,
  copyLabel,
  onCopy,
  dark = false,
}: {
  label: string;
  value: string;
  copyLabel: string;
  onCopy: () => void;
  dark?: boolean;
}) {
  const labelColor = dark ? 'text-brass-400' : 'label-brass';
  const valueColor = dark ? 'text-ivory-100' : 'text-ivory-950';
  const copyColor = dark
    ? 'text-brass-300 hover:text-brass-200'
    : 'text-ivory-600 hover:text-brass-700';
  const borderColor = dark ? 'border-brass-500/20' : 'border-brass-500/25';
  return (
    <div className={`flex items-baseline gap-3 border-b ${borderColor} pb-2 last:border-0 last:pb-0`}>
      <span className={`label w-32 shrink-0 ${labelColor}`}>{label}</span>
      <span className={`flex-1 truncate font-mono ${valueColor}`}>{value}</span>
      <button
        type="button"
        onClick={onCopy}
        className={`font-serif text-[10px] italic transition ${copyColor}`}
      >
        [{copyLabel}]
      </button>
    </div>
  );
}
