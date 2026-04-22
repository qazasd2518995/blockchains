import { sha256 as nobleSha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { bytesToHex, randomBytes as nobleRandomBytes } from '@noble/hashes/utils';

const textEncoder = new TextEncoder();

export function sha256(input: string): string {
  return bytesToHex(nobleSha256(textEncoder.encode(input)));
}

export function hmacSha256(serverSeed: string, message: string): string {
  return bytesToHex(
    hmac(nobleSha256, textEncoder.encode(serverSeed), textEncoder.encode(message)),
  );
}

export function generateServerSeed(bytes = 32): string {
  return bytesToHex(nobleRandomBytes(bytes));
}

export function generateClientSeed(): string {
  return bytesToHex(nobleRandomBytes(16));
}

export function buildMessage(clientSeed: string, nonce: number, cursor = 0): string {
  return cursor > 0 ? `${clientSeed}:${nonce}:${cursor}` : `${clientSeed}:${nonce}`;
}

// Stream unsigned 32-bit integers from a hex HMAC output. When the bytes run
// out, extend with a new HMAC using an incrementing cursor.
export function* hmacIntStream(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Generator<number> {
  let cursor = 0;
  while (true) {
    const hex = hmacSha256(serverSeed, buildMessage(clientSeed, nonce, cursor));
    for (let i = 0; i + 8 <= hex.length; i += 8) {
      yield Number.parseInt(hex.slice(i, i + 8), 16);
    }
    cursor += 1;
  }
}

// Emit floats in [0, 1) derived from the same stream.
export function* hmacFloatStream(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Generator<number> {
  const ints = hmacIntStream(serverSeed, clientSeed, nonce);
  while (true) {
    const next = ints.next();
    if (next.done) return;
    yield next.value / 0x1_0000_0000;
  }
}
