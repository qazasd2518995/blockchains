import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#ECECEC] px-5">
      <div className="text-[120px] font-bold leading-none text-[#EA580C]/30">404</div>
      <h1 className="mb-2 mt-4 text-[24px] font-bold text-[#0F172A]">{t.notFound.title}</h1>
      <p className="mb-6 text-[14px] text-[#4A5568]">{t.notFound.desc}</p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-[6px] bg-[#EA580C] px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-[#F97316]"
      >
        <Home className="h-4 w-4" />
        {t.notFound.back}
      </Link>
    </div>
  );
}
