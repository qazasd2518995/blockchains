import type { FastifyReply, FastifyRequest } from 'fastify';

const SENSITIVE_KEY_RE =
  /(authorization|cookie|password|passcode|token|secret|seed|signature|salt|hash|jwt|credential|private|key)/i;
const MAX_STRING_LENGTH = 320;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 50;
const MAX_DEPTH = 5;

const requestStartTimes = new WeakMap<FastifyRequest, bigint>();
const requestsWithLoggedErrors = new WeakSet<FastifyRequest>();

function pathnameOf(request: FastifyRequest): string {
  return request.url.split('?')[0] ?? request.url;
}

function hasObjectContent(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated:${value.length}]`;
}

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return truncateString(value);
  if (value instanceof Date) return value.toISOString();

  if (depth >= MAX_DEPTH) return '[MaxDepth]';

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeForLog(item, depth + 1));
    if (value.length > MAX_ARRAY_LENGTH) {
      items.push(`[+${value.length - MAX_ARRAY_LENGTH} more]`);
    }
    return items;
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const entries = Object.entries(source);
    const output: Record<string, unknown> = {};

    for (const [key, item] of entries.slice(0, MAX_OBJECT_KEYS)) {
      output[key] = SENSITIVE_KEY_RE.test(key) ? '[Redacted]' : sanitizeForLog(item, depth + 1);
    }

    if (entries.length > MAX_OBJECT_KEYS) {
      output.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
    }
    return output;
  }

  return String(value);
}

export function markRequestStart(request: FastifyRequest): void {
  requestStartTimes.set(request, process.hrtime.bigint());
}

export function getRequestDurationMs(request: FastifyRequest): number | undefined {
  const start = requestStartTimes.get(request);
  if (!start) return undefined;
  const elapsedNs = process.hrtime.bigint() - start;
  return Number((Number(elapsedNs) / 1_000_000).toFixed(2));
}

export function markRequestErrorLogged(request: FastifyRequest): void {
  requestsWithLoggedErrors.add(request);
}

export function hasRequestErrorLogged(request: FastifyRequest): boolean {
  return requestsWithLoggedErrors.has(request);
}

export function shouldSkipRequestLog(request: FastifyRequest): boolean {
  const pathname = pathnameOf(request);
  return request.method === 'OPTIONS' || pathname === '/api/health' || pathname === '/';
}

export function shouldDebugRequest(request: FastifyRequest): boolean {
  if (shouldSkipRequestLog(request)) return false;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return true;

  const pathname = pathnameOf(request);
  return (
    pathname.startsWith('/api/games') ||
    pathname.startsWith('/api/wallet') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/integrations')
  );
}

export function getSafeRequestPayload(request: FastifyRequest): Record<string, unknown> | undefined {
  const payload: Record<string, unknown> = {};

  if (hasObjectContent(request.params)) {
    payload.params = sanitizeForLog(request.params);
  }
  if (hasObjectContent(request.query)) {
    payload.query = sanitizeForLog(request.query);
  }
  if (request.body !== undefined) {
    payload.body = sanitizeForLog(request.body);
  }

  return Object.keys(payload).length > 0 ? payload : undefined;
}

export function getRequestLogContext(
  request: FastifyRequest,
  reply?: FastifyReply,
): Record<string, unknown> {
  const auth = request as unknown as {
    userId?: string;
    admin?: {
      id?: string;
      username?: string;
      role?: string;
      level?: number;
      status?: string;
    };
  };

  const context: Record<string, unknown> = {
    reqId: request.id,
    method: request.method,
    url: request.url,
    route: request.routeOptions?.url,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  };

  const durationMs = getRequestDurationMs(request);
  if (durationMs !== undefined) context.durationMs = durationMs;
  if (reply) context.statusCode = reply.statusCode;

  if (auth.userId) {
    context.userId = auth.userId;
  }
  if (auth.admin) {
    context.adminId = auth.admin.id;
    context.adminUsername = auth.admin.username;
    context.adminRole = auth.admin.role;
    context.adminLevel = auth.admin.level;
  }

  return context;
}
