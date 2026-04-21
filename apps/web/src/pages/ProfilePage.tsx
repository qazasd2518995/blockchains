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
      <section className="relative z-10 border-b border-[#E5E7EB] pb-6">
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold text-[#186073]">{t.profile.dossierHeader}</span>
        </div>
        <h1 className="mt-3 text-[32px] font-bold text-[#0F172A]">
          {t.profile.your}{t.profile.dossier}
        </h1>
      </section>

      <section className="relative z-10 grid gap-4 md:grid-cols-4">
        <InfoCard label={t.common.username} value={user?.username ?? '—'} />
        <InfoCard label={t.common.callsign} value={user?.displayName ?? '—'} />
        <InfoCard
          label={t.profile.sessionId}
          value={user?.id ? `0x${user.id.slice(-8).toUpperCase()}` : '—'}
        />
        <div className="card-base p-5">
          <div className="label text-[#186073]">{t.common.credits}</div>
          <div className="mt-2 num num text-[#C9A247] text-5xl">
            {formatAmount(user?.balance ?? '0')}
          </div>
        </div>
      </section>

      <section className="relative z-10">
        <div className="mb-6 flex items-end justify-between border-b border-[#E5E7EB] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-[#186073]">{t.profile.cryptoSeeds}</span>
            </div>
            <h2 className="mt-3 text-[28px] font-bold text-[#0F172A]">
              {t.profile.provably} {t.profile.fair}
            </h2>
            <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-[#4A5568]">
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
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#186073] bg-[#0E4555] shadow-lift">
                  <span className="font-semibold text-2xl italic text-[#DEBE66]">
                    {s.gameCategory.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="label text-[#D0AC4D]">{t.profile.category}</div>
                  <div className="mt-1 font-semibold text-2xl tracking-tight text-white">
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
                  <span className="label text-[#D0AC4D]">{t.profile.nonce}</span>
                  <span className="data-num text-[#DEBE66]">
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

        <div className="card-base mt-6 p-6">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
            <div>
              <div className="label text-[#186073]">{t.profile.clientSeedOverride}</div>
              <div className="mt-1 font-semibold text-sm text-[#4A5568]">
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
              className="btn-teal"
            >
              → {t.common.commit}
            </button>
          </div>
        </div>

        {reveal && (
          <div className="card-base mt-6 p-6" style={{ boxShadow: '0 0 0 1px #8A6B2A, 0 0 0 3px #FBF9F4, 0 0 0 4px #1E7A4F, 0 14px 30px -10px rgba(10,8,6,0.18)' }}>
            <div className="flex items-center gap-3 border-b border-win/30 pb-3">
              <span className="tag tag-felt">
                <span className="dot-online dot-online" />
                {t.profile.revealed}
              </span>
              <div className="font-semibold text-2xl italic text-win">
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
                <span className="label text-[#186073]">{t.profile.totalNonces}</span>
                <span className="data-num text-win">{reveal.revealedNonce}</span>
              </div>
            </div>
            <pre className="mt-5 rounded-sm border border-[#186073]/30 bg-[#F5F7FA]/60 p-4 font-mono text-[10px] leading-relaxed text-[#0F172A]">
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
          <div className="mt-5 border border-[#D4574A]/40 bg-[#FDF0EE] p-4 text-[12px] text-[#B94538]">
            <span className="font-semibold font-bold italic">{t.common.error}:</span> {error}
          </div>
        )}
      </section>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-base p-5">
      <div className="label text-[#186073]">{label}</div>
      <div className="mt-2 truncate font-mono text-sm text-[#0F172A]">{value}</div>
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
  const labelColor = dark ? 'text-[#D0AC4D]' : 'text-[#186073]';
  const valueColor = dark ? 'text-white' : 'text-[#0F172A]';
  const copyColor = dark
    ? 'text-[#DEBE66] hover:text-[#E8D48A]'
    : 'text-[#4A5568] hover:text-[#186073]';
  const borderColor = dark ? 'border-[#186073]/20' : 'border-[#E5E7EB]';
  return (
    <div className={`flex items-baseline gap-3 border-b ${borderColor} pb-2 last:border-0 last:pb-0`}>
      <span className={`label w-32 shrink-0 ${labelColor}`}>{label}</span>
      <span className={`flex-1 truncate font-mono ${valueColor}`}>{value}</span>
      <button
        type="button"
        onClick={onCopy}
        className={`font-semibold text-[10px] italic transition ${copyColor}`}
      >
        [{copyLabel}]
      </button>
    </div>
  );
}
