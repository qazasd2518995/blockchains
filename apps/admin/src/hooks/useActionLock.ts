import { useCallback, useRef, useState } from 'react';

/** A synchronous latch, plus render state: two clicks in one tick send only once. */
export function useActionLock(): readonly [boolean, () => boolean, () => void] {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const begin = useCallback(() => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    return true;
  }, []);
  const end = useCallback(() => {
    locked.current = false;
    setBusy(false);
  }, []);
  return [busy, begin, end] as const;
}
