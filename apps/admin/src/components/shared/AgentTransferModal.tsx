import { useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  fromAgent: { id: string; username: string; balance: string };
  onDone: () => void;
}

export function AgentTransferModal({ open, onClose, fromAgent, onDone }: Props): JSX.Element {
  const [toUsername, setToUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!toUsername.trim() || !amount) {
      setErr('請填目標代理與金額');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const lookup = await adminApi.get<{ id: string; username: string }>('/agents/lookup', {
        params: { username: toUsername.trim() },
      });
      if (lookup.data.id === fromAgent.id) {
        setErr('不能轉給自己');
        return;
      }
      await adminApi.post('/transfers/agent-to-agent', {
        fromId: fromAgent.id,
        toId: lookup.data.id,
        amount,
        description: description || undefined,
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
    <Modal open={open} onClose={onClose} title="代理間轉帳" subtitle={`From · ${fromAgent.username}`} width="sm">
      <div className="mb-4 border border-ink-200 bg-ink-100/40 p-3 text-[11px]">
        <div className="flex items-baseline justify-between">
          <span className="text-ink-500">來源代理</span>
          <span className="font-mono">{fromAgent.username}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-ink-500">可用餘額</span>
          <span className="data-num text-[#186073]">{fromAgent.balance}</span>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <div className="label mb-2">目標代理帳號</div>
          <input
            type="text"
            value={toUsername}
            onChange={(e) => setToUsername(e.target.value)}
            className="term-input font-mono"
            placeholder="帳號"
          />
        </label>
        <label className="block">
          <div className="label mb-2">轉帳金額</div>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="term-input font-mono"
            placeholder="100.00"
          />
        </label>
        <label className="block">
          <div className="label mb-2">備註</div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
            → 確認轉帳
          </button>
          <button type="button" onClick={onClose} className="btn-teal-outline">
            [取消]
          </button>
        </div>
      </div>
    </Modal>
  );
}
