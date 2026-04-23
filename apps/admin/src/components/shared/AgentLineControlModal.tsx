import { useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function AgentLineControlModal({ open, onClose, onDone }: Props): JSX.Element {
  const [agentUsername, setAgentUsername] = useState('');
  const [dailyCap, setDailyCap] = useState('100000');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!agentUsername.trim()) {
      setErr('请填代理账号');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const lookup = await adminApi.get<{ id: string; username: string }>('/agents/lookup', {
        params: { username: agentUsername.trim() },
      });
      await adminApi.post('/controls/agent-line', {
        agentId: lookup.data.id,
        agentUsername: lookup.data.username,
        dailyCap,
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
        <label className="block">
          <div className="label mb-2">代理账号</div>
          <input
            type="text"
            value={agentUsername}
            onChange={(e) => setAgentUsername(e.target.value)}
            className="term-input font-mono"
          />
        </label>
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
