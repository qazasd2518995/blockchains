import type { ErrorCodeType } from '@bg/shared';

export class ApiError extends Error {
  public readonly code: ErrorCodeType;
  public readonly details?: unknown;

  constructor(code: ErrorCodeType, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
  }
}

export function errorCodeToStatus(code: ErrorCodeType): number {
  switch (code) {
    case 'UNAUTHORIZED':
      return 401;
    case 'INVALID_CREDENTIALS':
    case 'EMAIL_TAKEN':
      return 409;
    case 'USER_NOT_FOUND':
    case 'ROUND_NOT_FOUND':
      return 404;
    case 'INSUFFICIENT_FUNDS':
    case 'INVALID_BET':
    case 'BET_OUT_OF_RANGE':
    case 'INVALID_ACTION':
    case 'ROUND_NOT_ACTIVE':
    case 'SEED_NOT_REVEALED':
    case 'GAME_DISABLED':
      return 400;
    case 'RATE_LIMITED':
      return 429;
    case 'INTERNAL':
    default:
      return 500;
  }
}
