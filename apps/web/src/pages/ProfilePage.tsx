import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

export function ProfilePage() {
  const { user } = useAuthStore();
  const { t } = useTranslation();

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
