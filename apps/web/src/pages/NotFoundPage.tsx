import { Link } from 'react-router-dom';
import { useTranslation } from '@/i18n/useTranslation';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <div className="font-display text-[200px] leading-none text-ink-800">
          4<span className="text-neon-acid">0</span>4
        </div>
        <div className="label mt-4">{t.notFound.code}</div>
        <div className="mt-6 font-serif text-3xl italic text-bone">{t.notFound.msg}</div>
        <Link to="/" className="btn-acid mt-10 inline-flex">
          {t.notFound.backHome}
        </Link>
      </div>
    </div>
  );
}
