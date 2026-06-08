import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveBettingLimitRange } from '@bg/shared';
import { Modal } from './Modal';

type CreatedAccountKind = 'agent' | 'member';

export interface CreatedAccountShareInfo {
  kind: CreatedAccountKind;
  username: string;
  password?: string | null;
  bettingLimitLevel: string;
}

interface Props {
  info: CreatedAccountShareInfo | null;
  onClose: () => void;
}

const GAME_LOGIN_URLS = ['yachiyo777.com', 'yachiyo666.com'];
const AGENT_LOGIN_URLS = ['yachiyo168.com', 'yachiyo188.com'];

export function AccountCreationShareModal({ info, onClose }: Props): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [manualPassword, setManualPassword] = useState('');
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (info) {
      setCopied(false);
      setManualPassword(info.password ?? '');
    }
  }, [info]);

  const message = useMemo(
    () => (info ? buildShareMessage({ ...info, password: manualPassword || info.password }) : ''),
    [info, manualPassword],
  );
  const accountTypeLabel = info?.kind === 'agent' ? '代理' : '會員';
  const hasStoredPassword = Boolean(info?.password);

  const copyMessage = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      textAreaRef.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
  };

  return (
    <Modal
      open={Boolean(info)}
      onClose={onClose}
      title="推廣資訊"
      subtitle={`${accountTypeLabel}分享資訊`}
      width="md"
    >
      <div className="space-y-4">
        <div className="rounded-md border border-[#C9A247]/35 bg-[#FFF8DA] px-4 py-3">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-[#186073]">
            ACCOUNT SHARE
          </div>
          <div className="mt-1 text-[13px] font-semibold text-ink-800">
            {accountTypeLabel}分享資訊，可直接複製整段內容。
          </div>
        </div>

        {!hasStoredPassword && (
          <div className="rounded-md border border-ink-200 bg-ink-100/30 p-3">
            <label className="block">
              <div className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-ink-700">
                密碼
              </div>
              <input
                type="text"
                value={manualPassword}
                onChange={(event) => setManualPassword(event.target.value)}
                className="term-input font-mono"
                placeholder="系統不反查明文密碼，可在此填入後複製"
              />
            </label>
          </div>
        )}

        <textarea
          ref={textAreaRef}
          readOnly
          value={message}
          className="min-h-[360px] w-full resize-none rounded-md border border-ink-200 bg-white p-4 font-mono text-[13px] leading-6 text-ink-900 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#186073]/20"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copyMessage} className="btn-acid">
            {copied ? '已複製' : '複製整段'}
          </button>
          <button type="button" onClick={onClose} className="btn-teal-outline">
            [關閉]
          </button>
        </div>
      </div>
    </Modal>
  );
}

function buildShareMessage(info: CreatedAccountShareInfo): string {
  const accountLabel = info.kind === 'agent' ? '代理帳號' : '會員帳號';
  const passwordLabel = info.kind === 'agent' ? '代理密碼' : '會員密碼';
  const password = info.password?.trim() || '（未保存，請填入或重設密碼）';
  const limit = resolveBettingLimitRange(info.bettingLimitLevel).label.replace('基本款 ', '');
  const lines = [
    '———————————-',
    '八千代娛樂城推廣連結',
    '',
    `${accountLabel}:${info.username}`,
    `${passwordLabel}:${password}`,
    `限紅:${limit}`,
    '遊戲登入網址:',
    ...GAME_LOGIN_URLS,
    '(遊戲進入後建議按照步驟',
    '將網頁加到桌面,以提供更完整遊戲體驗)',
  ];

  if (info.kind === 'agent') {
    lines.push('', '代理登入網址:', ...AGENT_LOGIN_URLS);
  }

  return lines.join('\n');
}
