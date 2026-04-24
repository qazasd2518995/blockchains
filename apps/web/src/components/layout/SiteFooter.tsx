import { Link } from 'react-router-dom';

interface Props {
  loggedIn?: boolean;
}

export function SiteFooter({ loggedIn = false }: Props): JSX.Element {
  const quickLinks = loggedIn
    ? [
        { label: '遊戲大廳', to: '/lobby' },
        { label: '遊戲說明', to: '/verify' },
        { label: '遊戲記錄', to: '/history' },
      ]
    : [
        { label: '會員登入', to: '/login' },
        { label: '平台首頁', to: '/' },
        { label: '遊戲說明', to: '/verify' },
        { label: '遊戲大廳', to: '/lobby' },
      ];

  return (
    <footer className="mt-16 border-t border-[#E5E7EB] bg-white/[0.85] backdrop-blur">
      <div className="mx-auto grid w-full max-w-[1920px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_240px] xl:px-8 2xl:px-12">
        <div className="min-w-0">
          <div className="label">BG GAMING</div>
          <h2 className="mt-3 text-[22px] font-bold text-[#0F172A]" translate="no">
            BG 娛樂城
          </h2>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-[#4A5568]">
            頂級遊戲體驗、即時派彩與穩定服務，為您打造專業電子遊戲娛樂平台。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="tag tag-gold">18+ Adults Only</span>
            <span className="tag tag-acid">VIP Service</span>
            <span className="tag tag-toxic">Instant Settlement</span>
          </div>
        </div>

        <div>
          <div className="label">快捷連結</div>
          <ul className="mt-4 space-y-2 text-[13px] text-[#4A5568]">
            {quickLinks.map((link) => (
              <li key={link.label}>
                <Link className="transition hover:text-[#186073]" to={link.to}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-[#E5E7EB]">
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-2 px-4 py-4 text-[11px] text-[#9CA3AF] sm:px-6 md:flex-row md:items-center md:justify-between xl:px-8 2xl:px-12">
          <span>Copyright © 2026 BG Gaming. All Rights Reserved.</span>
          <span translate="no">v1.0.1</span>
        </div>
      </div>
    </footer>
  );
}
