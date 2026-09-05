import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBlocker } from 'react-router-dom';
import { Layers3 } from 'lucide-react';
import { useGameReturnTarget } from '@/hooks/useGameReturnTarget';
import { useTranslation } from '@/i18n/useTranslation';
import type { Locale } from '@/i18n/types';
import './unfinished-round-exit.css';

const COPY: Record<
  Locale,
  {
    title: string;
    inactiveTitle: string;
    question: string;
    detail: string;
    stay: string;
    leave: string;
  }
> = {
  'zh-Hant': {
    title: '牌局尚未結束',
    inactiveTitle: '返回大廳確認',
    question: '確定要返回大廳嗎？',
    detail: '離開不會自動棄牌、領獎或取消下注。',
    stay: '繼續牌局',
    leave: '確定離開',
  },
  'zh-Hans': {
    title: '牌局尚未结束',
    inactiveTitle: '返回大厅确认',
    question: '确定要返回大厅吗？',
    detail: '离开不会自动弃牌、领奖或取消下注。',
    stay: '继续牌局',
    leave: '确定离开',
  },
  en: {
    title: 'Your round is still in progress',
    inactiveTitle: 'Return to lobby',
    question: 'Return to the lobby?',
    detail: 'Leaving does not automatically fold, cash out, or cancel your bet.',
    stay: 'Continue playing',
    leave: 'Leave table',
  },
  th: {
    title: 'รอบนี้ยังไม่จบ',
    inactiveTitle: 'ยืนยันกลับล็อบบี้',
    question: 'ต้องการกลับล็อบบี้หรือไม่?',
    detail: 'การออกจะไม่หมอบ รับรางวัล หรือยกเลิกเดิมพันโดยอัตโนมัติ',
    stay: 'เล่นต่อ',
    leave: 'ยืนยันออก',
  },
  vi: {
    title: 'Ván chơi chưa kết thúc',
    inactiveTitle: 'Xác nhận về sảnh',
    question: 'Bạn muốn về sảnh không?',
    detail: 'Rời bàn không tự động bỏ bài, nhận thưởng hoặc hủy cược.',
    stay: 'Tiếp tục chơi',
    leave: 'Rời bàn',
  },
};

/** Navigation only: never submit a game action or change the wallet on exit. */
export function UnfinishedRoundExitGuard({ active }: { active: boolean }) {
  const { locale } = useTranslation();
  const copy = COPY[locale];
  const returnTarget = useGameReturnTarget();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const leaveApprovedRef = useRef(false);
  const [documentExit, setDocumentExit] = useState(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  );
  const open = documentExit || blocker.state === 'blocked';

  useEffect(() => {
    if (!active) return;

    const confirmLobbyExit = (event: Event) => {
      if (leaveApprovedRef.current || event.defaultPrevented) return;
      event.preventDefault();
      setDocumentExit(true);
    };
    // Cross-document back/close/reload cannot use our custom dialog. The browser
    // supplies its own warning; an explicitly confirmed lobby exit bypasses it.
    const confirmDocumentUnload = (event: BeforeUnloadEvent) => {
      if (leaveApprovedRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('qmoney:before-game-exit', confirmLobbyExit);
    window.addEventListener('beforeunload', confirmDocumentUnload);
    return () => {
      window.removeEventListener('qmoney:before-game-exit', confirmLobbyExit);
      window.removeEventListener('beforeunload', confirmDocumentUnload);
    };
  }, [active]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [open]);

  const stay = () => {
    setDocumentExit(false);
    if (blocker.state === 'blocked') blocker.reset();
  };

  const leave = () => {
    if (leaveApprovedRef.current) return;
    leaveApprovedRef.current = true;
    if (blocker.state === 'blocked') {
      blocker.proceed();
      return;
    }

    // Re-check existing settlement guards. Approval only bypasses this prompt,
    // not another game's pending-settlement protection.
    if (!window.dispatchEvent(new Event('qmoney:before-game-exit', { cancelable: true }))) {
      leaveApprovedRef.current = false;
      setDocumentExit(false);
      return;
    }
    window.location.replace(returnTarget.to);
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="unfinished-round-exit"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-question ${id}-detail`}
      onCancel={(event) => {
        event.preventDefault();
        stay();
      }}
    >
      <div className="unfinished-round-exit__icon" aria-hidden="true">
        <Layers3 size={28} />
      </div>
      <h2 id={`${id}-title`}>{active ? copy.title : copy.inactiveTitle}</h2>
      <p id={`${id}-question`} className="unfinished-round-exit__question">
        {copy.question}
      </p>
      <p id={`${id}-detail`} className="unfinished-round-exit__detail">
        {copy.detail}
      </p>
      <div className="unfinished-round-exit__actions">
        <button type="button" className="unfinished-round-exit__stay" onClick={stay} autoFocus>
          {copy.stay}
        </button>
        <button type="button" className="unfinished-round-exit__leave" onClick={leave}>
          {copy.leave}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
