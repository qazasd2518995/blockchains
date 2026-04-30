import { useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { AccountSearchSelect, type AccountSearchOption } from './AccountSearchSelect';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function WinCapControlModal({ open, onClose, onDone }: Props): JSX.Element {
  const [member, setMember] = useState<AccountSearchOption | null>(null);
  const [winCapAmount, setWinCapAmount] = useState('10000');
  const [controlWinRate, setControlWinRate] = useState('0.30');
  const [triggerThreshold, setTriggerThreshold] = useState('0.80');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!member || !winCapAmount) {
      setErr('请先选择会员账号并填写封顶金额');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.post('/controls/win-cap', {
        memberId: member.id,
        memberUsername: member.username,
        winCapAmount,
        controlWinRate,
        triggerThreshold,
        notes: notes || undefined,
      });
      onDone();
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="新增会员封顶" subtitle="会员单日赢额封顶" width="md">
      <div className="space-y-4">
        <AccountSearchSelect
          kind="member"
          label="会员账号"
          value={member}
          onChange={setMember}
          placeholder="输入会员账号或全名"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="label mb-2">单日赢额封顶</div>
            <input
              type="text"
              value={winCapAmount}
              onChange={(e) => setWinCapAmount(e.target.value)}
              className="term-input font-mono"
              placeholder="10000"
            />
          </label>
          <label className="block">
            <div className="label mb-2">触发后控制胜率</div>
            <input
              type="text"
              value={controlWinRate}
              onChange={(e) => setControlWinRate(e.target.value)}
              className="term-input font-mono"
              placeholder="0.30"
            />
          </label>
        </div>
        <label className="block">
          <div className="label mb-2">触发比例（0-1）</div>
          <input
            type="text"
            value={triggerThreshold}
            onChange={(e) => setTriggerThreshold(e.target.value)}
            className="term-input font-mono"
            placeholder="0.80"
          />
        </label>
        <label className="block">
          <div className="label mb-2">备注</div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="term-input"
          />
        </label>

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={submit} disabled={busy} className="btn-acid">
            → 建立
          </button>
          <button type="button" onClick={onClose} className="btn-teal-outline">
            [取消]
          </button>
        </div>
      </div>
    </Modal>
  );
}
