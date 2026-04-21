import { useEffect } from 'react';
import { api } from '@/lib/api';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HallEntrances } from '@/components/home/HallEntrances';
import { TodayWinners } from '@/components/home/TodayWinners';
import { FeaturesStrip } from '@/components/home/FeaturesStrip';
import { PartnerLogos } from '@/components/home/PartnerLogos';

export function LobbyPage() {
  // warm server
  useEffect(() => {
    void api.get('/health').catch(() => undefined);
  }, []);

  return (
    <div className="space-y-8">
      <HeroBanner />
      <HallEntrances />
      <TodayWinners />
      <FeaturesStrip />
      <PartnerLogos />
    </div>
  );
}
