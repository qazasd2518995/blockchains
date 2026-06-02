export function logTransferDebug(event: string, payload?: unknown): void {
  writeTransferDebug('info', event, payload);
}

export function warnTransferDebug(event: string, payload?: unknown): void {
  writeTransferDebug('warn', event, payload);
}

function writeTransferDebug(level: 'info' | 'warn', event: string, payload?: unknown): void {
  if (typeof window === 'undefined') return;

  const message = `[BG Admin Transfer Debug ${new Date().toISOString()}] ${event}`;
  if (payload === undefined) {
    if (level === 'warn') console.warn(message);
    else console.info(message);
    return;
  }

  if (level === 'warn') console.warn(message, payload);
  else console.info(message, payload);
}
