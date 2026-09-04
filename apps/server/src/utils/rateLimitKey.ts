import type { FastifyRequest } from 'fastify';

type JwtVerifier = (token: string) => unknown;

export function authenticatedRateLimitKey(
  request: Pick<FastifyRequest, 'headers' | 'ip'>,
  verify: JwtVerifier,
): string {
  const authorization = request.headers.authorization;
  const match = typeof authorization === 'string' ? /^Bearer\s+(.+)$/i.exec(authorization) : null;
  if (!match?.[1]) return `ip:${request.ip}`;

  try {
    const payload = verify(match[1]) as { sub?: unknown; aud?: unknown };
    if (typeof payload?.sub !== 'string' || payload.sub.length === 0) return `ip:${request.ip}`;
    const audience = payload.aud === 'admin' ? 'admin' : 'player';
    return `${audience}:${payload.sub}`;
  } catch {
    // Invalid or expired tokens stay on the IP bucket. Unverified JWT contents
    // must never be trusted, otherwise forged tokens could bypass throttling.
    return `ip:${request.ip}`;
  }
}
