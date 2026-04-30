import { useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { AccountSearchSelect, type AccountSearchOption } from './AccountSearchSelect';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function AgentLineControlModal({ open, onClose, onDone }: Props): JSX.Element {
  const [agent, setAgent] = useState<AccountSearchOption | null>(null);
  const [dailyCap, setDailyCap] = useState('100000');
  const [controlWinRate, setControlWinRate] = useState('0.30');
  const [triggerThreshold, setTriggerThreshold] = useState('0.80');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!agent) {
      setErr('请先选择代理账号');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.post('/controls/agent-line', {
        agentId: agent.id,
        agentUsername: agent.username,
        dailyCap,
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
    <Modal open={open} onClose={onClose} title="新增代理线封顶" subtitle="代理线单日赢额封顶" width="md">
      <div className="space-y-4">
        <AccountSearchSelect
          kind="agent"
          label="代理账号"
          value={agent}
          onChange={setAgent}
          placeholder="输入代理账号或全名"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="label mb-2">单日线下赢额封顶</div>
            <input
              type="text"
              value={dailyCap}
              onChange={(e) => setDailyCap(e.target.value)}
              className="term-input font-mono"
            />
          </label>
          <label className="block">
            <div className="label mb-2">触发后控制胜率</div>
            <input
              type="text"
              value={controlWinRate}
              onChange={(e) => setControlWinRate(e.target.value)}
              className="term-input font-mono"
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
